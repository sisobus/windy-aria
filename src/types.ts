/**
 * windy-lang opcode taxonomy — reflects SPEC v2.0 §4.
 *
 * Identifiers track the SPEC's primary Unicode glyphs only.
 * ASCII aliases (`>`, `^`, `<`, `v`) map to the same Opcode.
 */

export type Opcode =
  // Flow
  | 'NOP'
  | 'HALT'
  | 'TRAMPOLINE'
  | 'SPLIT'
  // Wind (8 directions)
  | 'MOVE_E'
  | 'MOVE_NE'
  | 'MOVE_N'
  | 'MOVE_NW'
  | 'MOVE_W'
  | 'MOVE_SW'
  | 'MOVE_S'
  | 'MOVE_SE'
  | 'TURBULENCE'
  // Speed
  | 'GUST'
  | 'CALM'
  // Literal
  | 'PUSH_DIGIT'
  | 'STR_MODE'
  // Arithmetic
  | 'ADD'
  | 'SUB'
  | 'MUL'
  | 'DIV'
  | 'MOD'
  | 'NOT'
  | 'GT'
  // Stack
  | 'DUP'
  | 'DROP'
  | 'SWAP'
  // Branch
  | 'IF_H'
  | 'IF_V'
  // I/O
  | 'PUT_NUM'
  | 'PUT_CHR'
  | 'GET_NUM'
  | 'GET_CHR'
  // Grid memory
  | 'GRID_GET'
  | 'GRID_PUT';

/**
 * One instruction execution event observed from the interpreter.
 * Abstracts the hook that windy-lang exposes from its main loop.
 */
export interface InstructionEvent {
  opcode: Opcode;
  /** Digit value 0-9 when opcode is PUSH_DIGIT. */
  digit?: number;
  /** Grid coordinate (x, y). */
  position: { x: number; y: number };
  /** IP identifier — used for polyphony when SPLIT spawns multiple IPs. */
  ipId: number;
  /** Tick index when this event fired (integer time axis). */
  tick: number;
}

/**
 * One synth note/burst.
 */
export interface SoundEvent {
  /** Hz. Zero for noise bursts. */
  frequency: number;
  /** Duration in seconds. */
  duration: number;
  /** 0..1 */
  velocity: number;
  /** Timbre. */
  timbre: Timbre;
  /** Start time (audioContext.currentTime basis). */
  when: number;
  /** Channel id for polyphony. */
  voiceId: number;
}

export type Timbre =
  | 'sine' // soft body — winds
  | 'triangle' // calm tone — digits
  | 'square' // hard tone — arithmetic/stack
  | 'sawtooth' // gritty tone — branch/I/O
  | 'noise'; // noise burst — TURBULENCE
