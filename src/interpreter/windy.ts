/**
 * windy-lang wasm 인터프리터 통합.
 *
 * Session API를 step-by-step으로 돌리며 매 tick의 opcode를 InstructionEvent
 * 스트림으로 변환한다. SPEC v2.0 §3.6의 main-loop를 외부에서 driving하는 형태.
 *
 * v1 한계: primary IP(`ip_count > 0`일 때 첫 번째)만 sonify한다. SPLIT으로
 * 분기된 IP는 실행은 되지만 별도 voice로 합성되진 않음. 다중 IP polyphony는
 * windy-lang 쪽에 `current_op_for(ip_index)` 추가 후 v1.1.
 */

import init, { Session } from 'windy-lang';
import type { InstructionEvent, Opcode } from '../types.ts';

let initPromise: Promise<unknown> | null = null;

export async function ensureWindyInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = init();
  }
  await initPromise;
}

const OPCODE_NAMES = new Set<Opcode>([
  'NOP',
  'HALT',
  'TRAMPOLINE',
  'SPLIT',
  'MOVE_E',
  'MOVE_NE',
  'MOVE_N',
  'MOVE_NW',
  'MOVE_W',
  'MOVE_SW',
  'MOVE_S',
  'MOVE_SE',
  'TURBULENCE',
  'GUST',
  'CALM',
  'PUSH_DIGIT',
  'STR_MODE',
  'ADD',
  'SUB',
  'MUL',
  'DIV',
  'MOD',
  'NOT',
  'GT',
  'DUP',
  'DROP',
  'SWAP',
  'IF_H',
  'IF_V',
  'PUT_NUM',
  'PUT_CHR',
  'GET_NUM',
  'GET_CHR',
  'GRID_GET',
  'GRID_PUT',
]);

/**
 * windy의 `current_op()` 출력을 우리의 Opcode 타입으로 파싱.
 *
 * 형식:
 * - "MOVE_E", "ADD", ... — 그대로
 * - "PUSH_DIGIT (5)" — 디지트 값 추출
 * - "UNKNOWN" — null 반환 (sonify 대상 아님)
 */
function parseOpName(raw: string): { opcode: Opcode; digit?: number } | null {
  const match = raw.match(/^([A-Z_]+)(?:\s*\((\d+)\))?$/);
  if (!match) return null;
  const name = match[1]!;
  const digitStr = match[2];

  if (name === 'UNKNOWN') return null;
  if (!OPCODE_NAMES.has(name as Opcode)) return null;

  const opcode = name as Opcode;
  if (opcode === 'PUSH_DIGIT' && digitStr !== undefined) {
    return { opcode, digit: parseInt(digitStr, 10) };
  }
  return { opcode };
}

export interface RunOptions {
  /** 실행 안전 한도 — IP가 무한 루프 도는 프로그램 보호 */
  maxSteps?: bigint;
  /** TURBULENCE 결정성 */
  seed?: bigint;
  /** 스트림 가드 — 최대 emit 이벤트 수 */
  maxEvents?: number;
}

/**
 * 디버거에서 사용하는, 현재 시점의 인터프리터 상태 스냅샷.
 */
export interface DebugSnapshot {
  /** 누적 step 수 (= tick 수) */
  stepCount: number;
  /** 현재 IP가 가리키는 셀의 opcode 이름 ("MOVE_E", "PUSH_DIGIT (5)" 등) */
  currentOpName: string;
  /** 파싱된 opcode (UNKNOWN/공백이면 null) */
  currentEvent: InstructionEvent | null;
  /** primary IP 위치 */
  position: { x: number; y: number };
  /** primary IP 진행방향 */
  direction: { dx: number; dy: number };
  /** primary IP 스택 (bottom → top) */
  stack: string[];
  /** 살아있는 IP 수 */
  ipCount: number;
  halted: boolean;
  trapped: boolean;
  /** 누적 stdout */
  stdout: string;
  /** 누적 stderr (sisobus 배너 + warning) */
  stderr: string;
}

/**
 * windy 프로그램을 실행하면서 InstructionEvent 스트림을 만든다.
 * Play 모드용. 한 번 호출에 한 번 sonification 시퀀스 생성.
 */
export function traceProgram(source: string, options: RunOptions = {}): InstructionEvent[] {
  const dbg = new WindyDebugger(source, options);
  const events = dbg.collectRemaining(options.maxEvents);
  dbg.free();
  return events;
}

/**
 * 디버그 모드용 Session 래퍼.
 *
 * step()마다 현재 opcode를 InstructionEvent로 노출하고, getSnapshot()으로
 * UI에 보여줄 전체 상태를 한 번에 가져온다. 자원 관리(free)는 호출자 책임.
 */
export class WindyDebugger {
  private session: Session;
  private maxEvents: number;

  constructor(source: string, options: RunOptions = {}) {
    const maxSteps = options.maxSteps ?? BigInt(5000);
    this.session = new Session(source, '', options.seed ?? null, maxSteps);
    this.maxEvents = options.maxEvents ?? 2000;
  }

  /**
   * 다음에 실행될 instruction을 InstructionEvent로 변환해서 돌려준다.
   * UNKNOWN/strmode-while-not-quote의 경우 null.
   */
  currentEvent(): InstructionEvent | null {
    const opName = this.session.current_op();
    const parsed = parseOpName(opName);
    if (!parsed) return null;
    return {
      opcode: parsed.opcode,
      digit: parsed.digit,
      position: {
        x: Number(this.session.ip_x),
        y: Number(this.session.ip_y),
      },
      ipId: 0,
      tick: this.stepCount,
    };
  }

  /** 한 tick 진행. halted/trapped면 무시. */
  step(): void {
    if (this.session.halted || this.session.trapped) return;
    this.session.step();
  }

  /**
   * 현재 위치부터 halted/trapped 또는 maxEvents까지 진행하며 모든
   * InstructionEvent를 수집. step counter는 누적되므로 tick 값은
   * 절대값으로 반환된다 (engine.play가 알아서 정규화).
   */
  collectRemaining(maxEvents?: number): InstructionEvent[] {
    const cap = maxEvents ?? this.maxEvents;
    const out: InstructionEvent[] = [];
    while (!this.session.halted && !this.session.trapped && out.length < cap) {
      const ev = this.currentEvent();
      if (ev) out.push(ev);
      this.session.step();
    }
    return out;
  }

  getSnapshot(): DebugSnapshot {
    return {
      stepCount: this.stepCount,
      currentOpName: this.session.current_op(),
      currentEvent: this.currentEvent(),
      position: {
        x: Number(this.session.ip_x),
        y: Number(this.session.ip_y),
      },
      direction: {
        dx: Number(this.session.dx),
        dy: Number(this.session.dy),
      },
      stack: this.session.stack(),
      ipCount: this.session.ip_count,
      halted: this.session.halted,
      trapped: this.session.trapped,
      stdout: this.session.stdout(),
      stderr: this.session.stderr(),
    };
  }

  get stepCount(): number {
    return Number(this.session.steps);
  }

  free(): void {
    try {
      this.session.free();
    } catch {
      // ignore
    }
  }
}
