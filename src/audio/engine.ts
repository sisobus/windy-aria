import type { InstructionEvent } from '../types.ts';
import { Synth } from './synth.ts';
import { mapInstruction } from './mapping.ts';

/**
 * Sequence engine.
 *
 * v1은 windy-lang 인터프리터 통합 전. 이 엔진은 InstructionEvent의
 * 시퀀스를 받아서 정해진 BPM에 맞춰 예약 재생한다.
 *
 * BPM 모델: 한 tick = (60 / bpm) 초. 각 instruction은 한 tick 차지.
 * 단, opcode 종류별로 자연 길이가 다르다 (defaultDuration 참조). v1은
 * "한 instruction = 한 tick" 그리드에 sound가 그 안에서 끝나도록 한다.
 *
 * 추후(week 2) 인터프리터와 통합되면 InstructionEvent.tick이 IP의 실제
 * tick을 반영하게 되어 동시 IP가 자연스럽게 폴리포니로 합성된다.
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

/**
 * 데모용 하드코딩 시퀀스 — 'WINDY' 글자를 그리드 위에서 동풍으로 흐르며
 * 출력하는 가상의 windy 프로그램을 모사. 실제 windy 프로그램의 IP 트레이스가
 * 아니라, sound mapping이 들리는지 확인하기 위한 합성 시퀀스.
 *
 * 'W' 'I' 'N' 'D' 'Y'를 아스키로 push → PUT_CHR 다섯 번. 각 아스키 코드는
 * 디지트가 아니므로 실제 windy 프로그램은 그리드 산술로 만들지만, v1
 * 데모는 단순히 풍향 + 디지트 + I/O를 골고루 들려준다.
 */
export function demoSequence(): InstructionEvent[] {
  const events: InstructionEvent[] = [];
  let tick = 0;
  const at = (e: Omit<InstructionEvent, 'tick'>) => {
    events.push({ ...e, tick: tick++ });
  };

  // 1. 동풍으로 시작 (오른쪽으로 흐름)
  at({ opcode: 'MOVE_E', position: { x: 0, y: 0 }, ipId: 0 });

  // 2. 디지트 4개 push — 펜타토닉 상승
  at({ opcode: 'PUSH_DIGIT', digit: 0, position: { x: 1, y: 0 }, ipId: 0 });
  at({ opcode: 'PUSH_DIGIT', digit: 2, position: { x: 2, y: 0 }, ipId: 0 });
  at({ opcode: 'PUSH_DIGIT', digit: 4, position: { x: 3, y: 0 }, ipId: 0 });
  at({ opcode: 'PUSH_DIGIT', digit: 7, position: { x: 4, y: 0 }, ipId: 0 });

  // 3. 산술 한 번 — 짧은 square burst
  at({ opcode: 'ADD', position: { x: 5, y: 0 }, ipId: 0 });

  // 4. 북동풍으로 회전 (clockwise) — 음정 한 단계 상승
  at({ opcode: 'MOVE_NE', position: { x: 6, y: 0 }, ipId: 0 });

  // 5. NOP 하나로 호흡
  at({ opcode: 'NOP', position: { x: 7, y: -1 }, ipId: 0 });

  // 6. GUST — 가속 글리산도
  at({ opcode: 'GUST', position: { x: 8, y: -2 }, ipId: 0 });

  // 7. 풍향 회전 — N → NW → W → SW → S → SE
  at({ opcode: 'MOVE_N', position: { x: 9, y: -3 }, ipId: 0 });
  at({ opcode: 'MOVE_NW', position: { x: 9, y: -4 }, ipId: 0 });
  at({ opcode: 'MOVE_W', position: { x: 8, y: -5 }, ipId: 0 });
  at({ opcode: 'MOVE_SW', position: { x: 7, y: -5 }, ipId: 0 });
  at({ opcode: 'MOVE_S', position: { x: 6, y: -4 }, ipId: 0 });
  at({ opcode: 'MOVE_SE', position: { x: 6, y: -3 }, ipId: 0 });

  // 8. SPLIT — 폴리포니 신호
  at({ opcode: 'SPLIT', position: { x: 7, y: -2 }, ipId: 0 });

  // 9. TURBULENCE — 노이즈 burst
  at({ opcode: 'TURBULENCE', position: { x: 8, y: -1 }, ipId: 0 });

  // 10. 출력 — sawtooth chime
  at({ opcode: 'PUT_CHR', position: { x: 9, y: 0 }, ipId: 0 });
  at({ opcode: 'PUT_NUM', position: { x: 10, y: 0 }, ipId: 0 });

  // 11. CALM — 감속 글리산도
  at({ opcode: 'CALM', position: { x: 11, y: 0 }, ipId: 0 });

  // 12. HALT — 종지
  at({ opcode: 'HALT', position: { x: 12, y: 0 }, ipId: 0 });

  return events;
}
