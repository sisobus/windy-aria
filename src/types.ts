/**
 * windy-lang opcode taxonomy — reflects SPEC v2.0 §4.
 *
 * Glyph 식별자는 SPEC의 primary Unicode glyph만 사용한다.
 * ASCII alias(>, ^, <, v)는 같은 Opcode로 매핑.
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
 * 인터프리터에서 발생하는 instruction 실행 이벤트.
 * windy-lang core가 추후 노출할 hook의 추상 표현.
 *
 * v1에서는 windy-lang 통합 전에 하드코딩된 시퀀스로 동작한다.
 */
export interface InstructionEvent {
  opcode: Opcode;
  /** PUSH_DIGIT의 경우 0-9 값 */
  digit?: number;
  /** 그리드 좌표 (x, y) */
  position: { x: number; y: number };
  /** IP 식별자 — SPLIT으로 다중 IP가 생기면 폴리포니에 사용 */
  ipId: number;
  /** 발생 tick (시간축의 정수 인덱스) */
  tick: number;
}

/**
 * 합성기 한 발(note/burst)의 파라미터.
 */
export interface SoundEvent {
  /** Hz. noise burst인 경우 0. */
  frequency: number;
  /** 초 단위 지속시간 */
  duration: number;
  /** 0..1 */
  velocity: number;
  /** 음색 */
  timbre: Timbre;
  /** 시작 시각 (audioContext.currentTime 기준) */
  when: number;
  /** 폴리포니용 채널 ID */
  voiceId: number;
}

export type Timbre =
  | 'sine' // 부드러운 본체 — 풍향
  | 'triangle' // 차분한 음 — 디지트
  | 'square' // 단단한 음 — 산술/스택
  | 'sawtooth' // 거친 음 — 브랜치/I/O
  | 'noise'; // 노이즈 버스트 — TURBULENCE
