import type { SoundEvent, Timbre } from '../types.ts';

/**
 * 단순 Web Audio 합성기.
 *
 * - 오실레이터 4종 (sine/triangle/square/sawtooth) + noise (audio buffer)
 * - 짧은 ADSR (attack 5ms, decay→sustain none, release 변동)
 * - 글리산도(GUST/CALM)는 SoundEvent의 timbre가 'sine'이고
 *   주파수가 일반 풍향 영역 밖일 때 자동 처리 — v1은 단순화를 위해
 *   GUST/CALM만 frequency 200/800 매직 값으로 sweep 트리거.
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
   * 단일 SoundEvent를 정확한 시각에 예약 재생한다.
   * audioContext.currentTime을 기준으로 한 schedule.
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

    // 풍향 노이즈 — 약간의 밴드패스로 wind 느낌
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
      // 노이즈는 별도 처리되어야 하지만 fallback
      return 'sawtooth';
  }
}
