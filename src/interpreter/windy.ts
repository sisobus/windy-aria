/**
 * windy-lang wasm interpreter integration.
 *
 * Drives the Session API step by step, converting each tick's opcode
 * into an InstructionEvent stream. This effectively externalizes the
 * SPEC v2.0 §3.6 main loop.
 *
 * v1 limitation: only the primary IP (the first when `ip_count > 0`)
 * is sonified. IPs spawned via SPLIT execute but don't produce a
 * separate voice. Multi-IP polyphony lands in v1.1 once windy-lang
 * exposes `current_op_for(ip_index)`.
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
 * Parse windy's `current_op()` string into our Opcode type.
 *
 * Format:
 * - "MOVE_E", "ADD", ... — passthrough
 * - "PUSH_DIGIT (5)" — extract the digit value
 * - "UNKNOWN" — return null (not a sonify target)
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
  /** Hard step cap — guards against programs that don't halt. */
  maxSteps?: bigint;
  /** Seed for TURBULENCE determinism. */
  seed?: bigint;
  /** Stream guard — maximum number of emitted events. */
  maxEvents?: number;
}

/**
 * Snapshot of the interpreter state at one point in time, surfaced
 * to the debug UI.
 */
export interface DebugSnapshot {
  /** Cumulative step count (= tick count). */
  stepCount: number;
  /** Opcode name at the cell under the IP ("MOVE_E", "PUSH_DIGIT (5)", ...). */
  currentOpName: string;
  /** Parsed opcode (null for UNKNOWN/space). */
  currentEvent: InstructionEvent | null;
  /** Primary IP position. */
  position: { x: number; y: number };
  /** Primary IP direction. */
  direction: { dx: number; dy: number };
  /** Primary IP stack (bottom → top). */
  stack: string[];
  /** Number of live IPs. */
  ipCount: number;
  halted: boolean;
  trapped: boolean;
  /** Cumulative stdout. */
  stdout: string;
  /** Cumulative stderr (sisobus banner + warnings). */
  stderr: string;
}

/**
 * traceProgram result. `capReached: true` means we cut the run short —
 * the caller should surface the non-halting case to the user.
 */
export interface TraceResult {
  events: InstructionEvent[];
  /** Natural termination via @ or IP collision merge. */
  halted: boolean;
  /** Runtime trap (e.g. ≪ at speed 1). Earlier events are valid; nothing after. */
  trapped: boolean;
  /** Cut by maxSteps or maxEvents — the program does not halt. */
  capReached: boolean;
  /** Tick count actually advanced. */
  stepCount: number;
}

/**
 * Execute a windy program and emit its InstructionEvent stream.
 * Play mode — one call produces one sonification sequence.
 *
 * Returns halted/trapped/capReached flags so the caller can tell whether
 * the cap truncated the run.
 */
export function traceProgram(source: string, options: RunOptions = {}): TraceResult {
  const dbg = new WindyDebugger(source, options);
  const events = dbg.collectRemaining(options.maxEvents);
  const halted = dbg.halted;
  const trapped = dbg.trapped;
  const stepCount = dbg.stepCount;
  dbg.free();
  return {
    events,
    halted,
    trapped,
    capReached: !halted && !trapped,
    stepCount,
  };
}

/**
 * Session wrapper for debug mode.
 *
 * Each step() exposes the current opcode as an InstructionEvent;
 * getSnapshot() returns the full state for the UI in one go. Resource
 * cleanup (free) is the caller's responsibility.
 */
export class WindyDebugger {
  private session: Session;
  private maxEvents: number;

  constructor(source: string, options: RunOptions = {}) {
    // Guard against infinite drift — an IP that walks off-grid never
    // traps because the SPEC grid is infinite. The 4000-step / 500-event
    // cap maps to roughly 60–90s of sonification at 360 BPM.
    const maxSteps = options.maxSteps ?? BigInt(4000);
    this.session = new Session(source, '', options.seed ?? null, maxSteps);
    this.maxEvents = options.maxEvents ?? 500;
  }

  get halted(): boolean {
    return this.session.halted;
  }

  get trapped(): boolean {
    return this.session.trapped;
  }

  /**
   * Convert the next instruction to be executed into an InstructionEvent.
   * Returns null for UNKNOWN cells or strmode-while-not-quote.
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

  /** Advance one tick. No-op if halted/trapped. */
  step(): void {
    if (this.session.halted || this.session.trapped) return;
    this.session.step();
  }

  /**
   * Run forward from the current position until halted/trapped or
   * maxEvents, collecting every InstructionEvent. The step counter is
   * cumulative, so tick values are returned absolute — engine.play
   * normalizes them.
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
      // already freed — ignore
    }
  }
}
