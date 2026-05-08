import type { InstructionEvent } from '../types.ts';
import { Synth } from './synth.ts';
import { mapInstruction } from './mapping.ts';

/**
 * Sequence engine.
 *
 * Converts the InstructionEvent stream from the windy-lang interpreter
 * into Web Audio scheduling, paced by BPM.
 *
 * BPM model: one tick = (60 / bpm) seconds. 1:1 with the main-loop tick
 * in SPEC §3.6. When multiple IPs share a tick, multiple SoundEvents
 * land on the same `when` and synthesize as natural polyphony (v1.1
 * multi-IP integration).
 */
export class SequenceEngine {
  private ctx: AudioContext;
  private synth: Synth;
  private bpm = 240;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.synth = new Synth(ctx);
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  get tickDuration(): number {
    return 60 / this.bpm;
  }

  /**
   * Start the sequence immediately — from audioContext.currentTime + 100ms.
   * The first event's tick is normalized to t=0, so absolute tick values
   * don't matter.
   */
  play(events: InstructionEvent[]): void {
    if (events.length === 0) return;
    const tickDur = this.tickDuration;
    const startAt = this.ctx.currentTime + 0.1;
    const baseTick = events[0]!.tick;

    for (const event of events) {
      const when = startAt + (event.tick - baseTick) * tickDur;
      const sounds = mapInstruction(event, when);
      for (const sound of sounds) {
        this.synth.schedule(sound);
      }
    }
  }

  /**
   * Play a single event immediately — for the debug step button.
   */
  playImmediate(event: InstructionEvent): void {
    const when = this.ctx.currentTime + 0.005;
    const sounds = mapInstruction(event, when);
    for (const sound of sounds) {
      this.synth.schedule(sound);
    }
  }

  /**
   * The context can only resume after a user gesture — call this right
   * before play.
   */
  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') {
      await this.ctx.resume();
    }
  }
}

