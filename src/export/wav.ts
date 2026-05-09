/**
 * Offline WAV rendering.
 *
 * The same Synth that drives live playback runs against an
 * OfflineAudioContext, then we encode the resulting AudioBuffer as a
 * 16-bit PCM mono RIFF WAV. No external dependencies — Web Audio +
 * a 44-byte header is enough.
 */

import type { InstructionEvent } from '../types.ts';
import { mapInstruction, defaultDuration } from '../audio/mapping.ts';
import { Synth } from '../audio/synth.ts';

const SAMPLE_RATE = 44100;
const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
/** Tail in seconds added after the last note ends, so HALT fades aren't clipped. */
const TAIL_SEC = 0.6;

export interface RenderOptions {
  bpm: number;
}

/**
 * Render an InstructionEvent stream to a WAV `Blob`. Throws if events
 * is empty — callers should refuse upstream.
 */
export async function renderEventsToWav(
  events: InstructionEvent[],
  options: RenderOptions,
): Promise<Blob> {
  if (events.length === 0) {
    throw new Error('No events to render — check the program halts and emits sound.');
  }

  const tickDur = 60 / options.bpm;
  const baseTick = events[0]!.tick;
  const last = events[events.length - 1]!;
  const lastDur = defaultDuration(last.opcode);
  // Buffer length covers from t=0 through the last scheduled note's
  // tail, plus the global TAIL_SEC fade allowance.
  const totalSec = (last.tick - baseTick) * tickDur + lastDur + TAIL_SEC;
  const length = Math.ceil(totalSec * SAMPLE_RATE);

  const ctx = new OfflineAudioContext(NUM_CHANNELS, length, SAMPLE_RATE);
  const synth = new Synth(ctx);

  // Mirrors SequenceEngine.play with startAt = 0 — there's no live
  // resume gesture in the offline path, so we don't need the +0.1
  // padding live audio uses.
  for (const event of events) {
    const when = (event.tick - baseTick) * tickDur;
    for (const sound of mapInstruction(event, when)) {
      synth.schedule(sound);
    }
  }

  const buffer = await ctx.startRendering();
  return new Blob([audioBufferToWav(buffer)], { type: 'audio/wav' });
}

/**
 * RIFF WAV encoder — 16-bit signed PCM, little-endian, mono.
 * Reads channel 0 of `buffer`; ignores any additional channels.
 */
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numSamples = buffer.length;
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const dataSize = numSamples * NUM_CHANNELS * bytesPerSample;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  let p = 0;

  // RIFF chunk descriptor
  writeString(view, p, 'RIFF');
  p += 4;
  view.setUint32(p, 36 + dataSize, true);
  p += 4;
  writeString(view, p, 'WAVE');
  p += 4;

  // fmt sub-chunk
  writeString(view, p, 'fmt ');
  p += 4;
  view.setUint32(p, 16, true); // PCM fmt chunk size
  p += 4;
  view.setUint16(p, 1, true); // 1 = PCM
  p += 2;
  view.setUint16(p, NUM_CHANNELS, true);
  p += 2;
  view.setUint32(p, SAMPLE_RATE, true);
  p += 4;
  view.setUint32(p, SAMPLE_RATE * NUM_CHANNELS * bytesPerSample, true); // byte rate
  p += 4;
  view.setUint16(p, NUM_CHANNELS * bytesPerSample, true); // block align
  p += 2;
  view.setUint16(p, BITS_PER_SAMPLE, true);
  p += 2;

  // data sub-chunk
  writeString(view, p, 'data');
  p += 4;
  view.setUint32(p, dataSize, true);
  p += 4;

  const samples = buffer.getChannelData(0);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    // Use 0x7FFF for positives, -0x8000 for negatives — matches the
    // canonical 16-bit PCM range exactly and avoids the subtle bias
    // some encoders introduce by always multiplying by 0x8000.
    view.setInt16(p, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
    p += 2;
  }

  return out;
}

function writeString(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) {
    view.setUint8(offset + i, s.charCodeAt(i));
  }
}

/**
 * Trigger a browser download for `blob` under `filename`. Pure DOM,
 * no library needed.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // The browser may still be reading from the object URL during the
  // click. setTimeout lets the download stream open before we revoke.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
