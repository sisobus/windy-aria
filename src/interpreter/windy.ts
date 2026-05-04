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
 * windy 프로그램을 실행하면서 InstructionEvent 스트림을 만든다.
 *
 * 동기 함수지만 정해진 maxSteps 안에서 끝나도록 보장. 1000+ tick 프로그램은
 * 사실상 음악으로 의미 없으니 default는 2000.
 */
export function traceProgram(source: string, options: RunOptions = {}): InstructionEvent[] {
  const maxSteps = options.maxSteps ?? BigInt(5000);
  const maxEvents = options.maxEvents ?? 2000;
  const session = new Session(source, '', options.seed ?? null, maxSteps);

  const events: InstructionEvent[] = [];
  let tick = 0;

  while (!session.halted && !session.trapped && events.length < maxEvents) {
    const opName = session.current_op();
    const x = Number(session.ip_x);
    const y = Number(session.ip_y);

    const parsed = parseOpName(opName);
    if (parsed) {
      events.push({
        opcode: parsed.opcode,
        digit: parsed.digit,
        position: { x, y },
        ipId: 0,
        tick,
      });
    }

    session.step();
    tick++;
  }

  // 자원 해제 — Symbol.dispose가 wasm-bindgen에서 노출됨
  try {
    session.free();
  } catch {
    // ignore
  }

  return events;
}
