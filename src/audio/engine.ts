import type { InstructionEvent } from '../types.ts';
import { Synth } from './synth.ts';
import { mapInstruction } from './mapping.ts';

/**
 * Sequence engine.
 *
 * windy-lang 인터프리터에서 흘러나온 InstructionEvent 스트림을 BPM에 맞춰
 * Web Audio 시각으로 옮긴다.
 *
 * BPM 모델: 한 tick = (60 / bpm) 초. SPEC §3.6의 main-loop tick과 1:1.
 * 한 tick 안에 다중 IP가 있으면 같은 when에 여러 SoundEvent가 예약되어
 * 자연스럽게 폴리포니로 합성된다 (v1.1 multi-IP 통합 시).
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
   * 시퀀스를 즉시 시작 — 현재 audioContext.currentTime + 100ms부터.
   */
  play(events: InstructionEvent[]): void {
    if (events.length === 0) return;
    const tickDur = this.tickDuration;
    const startAt = this.ctx.currentTime + 0.1;

    for (const event of events) {
      const when = startAt + event.tick * tickDur;
      const sounds = mapInstruction(event, when);
      for (const sound of sounds) {
        this.synth.schedule(sound);
      }
    }
  }

  /**
   * 컨텍스트가 user gesture 후에야 resume 가능하므로, play 직전에 호출.
   */
  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') {
      await this.ctx.resume();
    }
  }
}

