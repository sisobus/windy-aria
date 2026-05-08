import type { SoundEvent, Timbre } from '../types.ts';

/**
 * Minimal Web Audio synth.
 *
 * - 4 oscillator types (sine/triangle/square/sawtooth) + noise (audio buffer)
 * - Short ADSR (5ms attack, no decay→sustain, variable release)
 * - Glissando (GUST/CALM) is auto-detected when a SoundEvent has timbre
 *   `sine` and a frequency outside the normal wind range. v1 keeps it
 *   simple: only GUST/CALM use the magic 200/800 Hz values to trigger
 *   sweeps.
 */

let noiseBuffer: AudioBuffer | null = null;

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) {
    return noiseBuffer;
  }
  const length = ctx.sampleRate * 0.5;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

function isGlissando(event: SoundEvent): { from: number; to: number } | null {
  // GUST: 200 → 800 (rising)
  // CALM: 800 → 200 (falling)
  if (event.timbre !== 'sine') return null;
  if (event.frequency === 200 && event.duration > 0.15) return { from: 200, to: 800 };
  if (event.frequency === 800 && event.duration > 0.15) return { from: 800, to: 200 };
  return null;
}

export class Synth {
  private ctx: AudioContext;
  private master: GainNode;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(ctx.destination);
  }

  /**
   * Schedule a single SoundEvent at the precise time on the audio
   * context's clock.
   */
  schedule(event: SoundEvent): void {
    const { ctx } = this;
    const { when, duration, velocity, timbre } = event;

    if (duration <= 0 || velocity <= 0) return;

    if (timbre === 'noise') {
      this.scheduleNoise(event);
      return;
    }

    const gliss = isGlissando(event);
    const osc = ctx.createOscillator();
    osc.type = oscType(timbre);

    if (gliss) {
      osc.frequency.setValueAtTime(gliss.from, when);
      osc.frequency.exponentialRampToValueAtTime(gliss.to, when + duration);
    } else {
      osc.frequency.setValueAtTime(event.frequency, when);
    }

    const gain = ctx.createGain();
    const peak = velocity * 0.5;
    const attack = 0.005;
    const release = Math.min(0.05, duration * 0.3);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when + attack);
    gain.gain.setValueAtTime(peak, when + duration - release);
    gain.gain.linearRampToValueAtTime(0, when + duration);

    osc.connect(gain).connect(this.master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  private scheduleNoise(event: SoundEvent): void {
    const { ctx } = this;
    const { when, duration, velocity } = event;

    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    src.loop = true;

    // Wind noise — a gentle bandpass shapes it into something wind-like.
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, when);
    filter.Q.value = 1.2;

    const gain = ctx.createGain();
    const peak = velocity * 0.45;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when + 0.02);
    gain.gain.linearRampToValueAtTime(0, when + duration);

    src.connect(filter).connect(gain).connect(this.master);
    src.start(when);
    src.stop(when + duration + 0.02);
  }

  setMasterGain(value: number): void {
    this.master.gain.value = value;
  }
}

function oscType(timbre: Timbre): OscillatorType {
  switch (timbre) {
    case 'sine':
      return 'sine';
    case 'triangle':
      return 'triangle';
    case 'square':
      return 'square';
    case 'sawtooth':
      return 'sawtooth';
    case 'noise':
      // Noise has its own scheduling path; this is just a fallback.
      return 'sawtooth';
  }
}
