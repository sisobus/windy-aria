import type { InstructionEvent, SoundEvent, Opcode, Timbre } from '../types.ts';

/**
 * windy-lang opcode → sound parameters.
 *
 * docs/MAPPING.md is the source of truth; this file is that table
 * transcribed into code.
 */

interface SoundParams {
  frequency: number;
  duration: number;
  velocity: number;
  timbre: Timbre;
  /** End frequency, if this opcode glissandos. */
  endFrequency?: number;
}

const WIND_PARAMS: Record<
  Extract<
    Opcode,
    | 'MOVE_S'
    | 'MOVE_SW'
    | 'MOVE_W'
    | 'MOVE_NW'
    | 'MOVE_N'
    | 'MOVE_NE'
    | 'MOVE_E'
    | 'MOVE_SE'
  >,
  SoundParams
> = {
  MOVE_S: { frequency: 261.63, duration: 0.18, velocity: 0.5, timbre: 'sine' },
  MOVE_SW: { frequency: 293.66, duration: 0.18, velocity: 0.5, timbre: 'sine' },
  MOVE_W: { frequency: 329.63, duration: 0.18, velocity: 0.5, timbre: 'sine' },
  MOVE_NW: { frequency: 392.0, duration: 0.18, velocity: 0.5, timbre: 'sine' },
  MOVE_N: { frequency: 440.0, duration: 0.18, velocity: 0.5, timbre: 'sine' },
  MOVE_NE: { frequency: 523.25, duration: 0.18, velocity: 0.5, timbre: 'sine' },
  MOVE_E: { frequency: 587.33, duration: 0.18, velocity: 0.5, timbre: 'sine' },
  MOVE_SE: { frequency: 659.25, duration: 0.18, velocity: 0.5, timbre: 'sine' },
};

const DIGIT_FREQUENCIES = [
  523.25, // 0  C5
  587.33, // 1  D5
  659.25, // 2  E5
  783.99, // 3  G5
  880.0, // 4  A5
  1046.5, // 5  C6
  1174.66, // 6  D6
  1318.51, // 7  E6
  1567.98, // 8  G6
  1760.0, // 9  A6
];

const ARITH_PARAMS: Record<
  Extract<Opcode, 'ADD' | 'SUB' | 'MUL' | 'DIV' | 'MOD' | 'NOT' | 'GT'>,
  SoundParams
> = {
  ADD: { frequency: 392.0, duration: 0.08, velocity: 0.4, timbre: 'square' },
  SUB: { frequency: 349.23, duration: 0.08, velocity: 0.4, timbre: 'square' },
  MUL: { frequency: 523.25, duration: 0.08, velocity: 0.4, timbre: 'square' },
  DIV: { frequency: 466.16, duration: 0.08, velocity: 0.4, timbre: 'square' },
  MOD: { frequency: 311.13, duration: 0.08, velocity: 0.4, timbre: 'square' },
  NOT: { frequency: 880.0, duration: 0.06, velocity: 0.35, timbre: 'square' },
  GT: { frequency: 987.77, duration: 0.06, velocity: 0.35, timbre: 'square' },
};

const STACK_PARAMS: Record<Extract<Opcode, 'DUP' | 'DROP' | 'SWAP'>, SoundParams> = {
  DUP: { frequency: 698.46, duration: 0.06, velocity: 0.4, timbre: 'square' },
  DROP: { frequency: 220.0, duration: 0.06, velocity: 0.35, timbre: 'square' },
  SWAP: { frequency: 587.33, duration: 0.06, velocity: 0.4, timbre: 'square' },
};

const IO_PARAMS: Record<Extract<Opcode, 'PUT_NUM' | 'PUT_CHR' | 'GET_NUM' | 'GET_CHR'>, SoundParams> =
  {
    PUT_NUM: { frequency: 523.25, duration: 0.15, velocity: 0.45, timbre: 'sawtooth' },
    PUT_CHR: { frequency: 880.0, duration: 0.1, velocity: 0.4, timbre: 'sawtooth' },
    GET_NUM: { frequency: 130.81, duration: 0.2, velocity: 0.5, timbre: 'sawtooth' },
    GET_CHR: { frequency: 659.25, duration: 0.05, velocity: 0.4, timbre: 'sawtooth' },
  };

/**
 * Translate one instruction into one (or a few) SoundEvents.
 *
 * Some opcodes need two voices (glissando, dual-tone). v1 keeps it
 * simple: a single SoundEvent represents the glissando and the synth
 * handles it via the endFrequency hint.
 */
export function mapInstruction(event: InstructionEvent, when: number): SoundEvent[] {
  const { opcode, digit, ipId } = event;
  const voiceId = ipId;

  switch (opcode) {
    case 'NOP':
      // Silence — produces no event at all.
      return [];

    case 'HALT':
      return [
        {
          frequency: 130.81, // C3
          duration: 0.4,
          velocity: 0.6,
          timbre: 'sine',
          when,
          voiceId,
        },
      ];

    case 'TRAMPOLINE':
      return [{ frequency: 800, duration: 0.05, velocity: 0.3, timbre: 'square', when, voiceId }];

    case 'SPLIT':
      // Sine an octave up — signals the polyphony fork.
      return [{ frequency: 880, duration: 0.2, velocity: 0.5, timbre: 'sine', when, voiceId }];

    case 'MOVE_S':
    case 'MOVE_SW':
    case 'MOVE_W':
    case 'MOVE_NW':
    case 'MOVE_N':
    case 'MOVE_NE':
    case 'MOVE_E':
    case 'MOVE_SE':
      return [{ ...WIND_PARAMS[opcode], when, voiceId }];

    case 'TURBULENCE':
      return [{ frequency: 0, duration: 0.15, velocity: 0.4, timbre: 'noise', when, voiceId }];

    case 'GUST':
      // Glissando 200 → 800; synth handles the sweep via endFrequency.
      return [
        {
          frequency: 200,
          duration: 0.18,
          velocity: 0.5,
          timbre: 'sine',
          when,
          voiceId,
        },
      ];

    case 'CALM':
      // Glissando 800 → 200.
      return [
        {
          frequency: 800,
          duration: 0.18,
          velocity: 0.5,
          timbre: 'sine',
          when,
          voiceId,
        },
      ];

    case 'PUSH_DIGIT': {
      const idx = digit ?? 0;
      const freq = DIGIT_FREQUENCIES[idx] ?? DIGIT_FREQUENCIES[0]!;
      return [{ frequency: freq, duration: 0.12, velocity: 0.45, timbre: 'triangle', when, voiceId }];
    }

    case 'STR_MODE':
      // String-mode toggle — short pluck.
      return [{ frequency: 440, duration: 0.06, velocity: 0.3, timbre: 'sawtooth', when, voiceId }];

    case 'ADD':
    case 'SUB':
    case 'MUL':
    case 'DIV':
    case 'MOD':
    case 'NOT':
    case 'GT':
      return [{ ...ARITH_PARAMS[opcode], when, voiceId }];

    case 'DUP':
    case 'DROP':
    case 'SWAP':
      return [{ ...STACK_PARAMS[opcode], when, voiceId }];

    case 'IF_H':
      // dual-tone 200 + 400
      return [
        { frequency: 200, duration: 0.1, velocity: 0.35, timbre: 'square', when, voiceId },
        { frequency: 400, duration: 0.1, velocity: 0.35, timbre: 'square', when, voiceId },
      ];

    case 'IF_V':
      // dual-tone 300 + 600
      return [
        { frequency: 300, duration: 0.1, velocity: 0.35, timbre: 'square', when, voiceId },
        { frequency: 600, duration: 0.1, velocity: 0.35, timbre: 'square', when, voiceId },
      ];

    case 'PUT_NUM':
    case 'PUT_CHR':
    case 'GET_NUM':
    case 'GET_CHR':
      return [{ ...IO_PARAMS[opcode], when, voiceId }];

    case 'GRID_GET':
      return [{ frequency: 392, duration: 0.1, velocity: 0.4, timbre: 'sawtooth', when, voiceId }];

    case 'GRID_PUT':
      return [{ frequency: 523, duration: 0.1, velocity: 0.4, timbre: 'sawtooth', when, voiceId }];
  }
}

/**
 * Default per-opcode duration — referenced by the sequencer when it
 * decides the `when` of the next event.
 */
export function defaultDuration(opcode: Opcode): number {
  // NOP is a short rest, not zero — gives the melody room to breathe.
  if (opcode === 'NOP') return 0.1;
  if (opcode === 'HALT') return 0.4;

  // Winds 0.18, digits 0.12, arithmetic/stack 0.08, everything else ~0.1.
  const winds: Opcode[] = [
    'MOVE_S',
    'MOVE_SW',
    'MOVE_W',
    'MOVE_NW',
    'MOVE_N',
    'MOVE_NE',
    'MOVE_E',
    'MOVE_SE',
    'TURBULENCE',
    'GUST',
    'CALM',
  ];
  if (winds.includes(opcode)) return 0.18;
  if (opcode === 'PUSH_DIGIT') return 0.12;
  if (opcode === 'SPLIT') return 0.2;

  const short: Opcode[] = ['ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'NOT', 'GT', 'DUP', 'DROP', 'SWAP'];
  if (short.includes(opcode)) return 0.08;

  if (opcode === 'TRAMPOLINE') return 0.06;

  return 0.1;
}
