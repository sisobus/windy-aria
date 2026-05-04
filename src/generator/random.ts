/**
 * 랜덤 windy 프로그램 생성기.
 *
 * 규칙 (입력 없음, 사이클 없음, 종료 보장):
 * 1. IP는 (0, 0)에서 east로 출발한다.
 * 2. 경로는 self-avoiding — 이미 방문한 셀로 되돌아가지 않는다.
 *    같은 셀에 두 번 다른 의도를 적을 수 없으므로 (덮어쓰기 모순).
 * 3. 비음수 사분면 (x ≥ 0, y ≥ 0) 안에서만 진행. (0, 0)이 렌더링된 그리드의 좌상단이
 *    되어야 IP가 우리 코드에 진입하기 때문.
 * 4. 코너(방향 전환) 셀은 그 방향의 wind opcode로 강제. 직선 셀은 방향 보존하는
 *    임의 opcode로 자유롭게 채움.
 * 5. 경로 끝에 `@` 배치 — 종료 보장.
 *
 * 의도적으로 제외하는 opcode:
 * - `≫` `≪` (GUST/CALM): 속도 변경이 중간 셀 스킵을 만들어 우리 시뮬레이션과
 *   실제 IP 경로가 어긋남.
 * - `#` (TRAMPOLINE): 다음 셀 스킵 — 마찬가지로 경로 시뮬레이션 깨짐.
 * - `t` (SPLIT): 새 IP가 우리가 의도하지 않은 영역으로 감.
 * - `_` `|` (분기): 스택 값에 따라 방향 결정 — 예측 불가.
 * - `"` (STR_MODE): 문자열 모드 진입 시 후속 셀이 push로만 처리.
 * - `&` `?` (입력): stdin 없으니 -1 push, 음악적으로 의미 없음.
 * - `g` `p` (그리드 메모리): 셀 자체를 변조해 경로 깨질 수 있음.
 * - `@`: 우리가 끝에서 직접 배치.
 *
 * 직선 셀 선택지:
 * - 디지트 0–9 (가장 흔함, 음악의 척추)
 * - 산술 + - * / % ! `
 * - 스택 : $ \
 * - 출력 . , (스택이 비어도 0 출력 — 음 발생)
 * - TURBULENCE ~ (방향을 무작위로 바꾸지만 우리 generator는 시뮬할 수 없음
 *   → 직선용으로 부적합. 제외하거나 코너용으로만 한정)
 * - NOP (공백)
 *
 * TURBULENCE는 결정성이 깨지므로 generator에서 제외.
 */

import type { Opcode } from '../types.ts';

interface Pos {
  x: number;
  y: number;
}

interface Dir {
  dx: number;
  dy: number;
}

const ALL_DIRECTIONS: { dir: Dir; opcode: Opcode; glyph: string }[] = [
  { dir: { dx: 1, dy: 0 }, opcode: 'MOVE_E', glyph: '→' },
  { dir: { dx: 1, dy: -1 }, opcode: 'MOVE_NE', glyph: '↗' },
  { dir: { dx: 0, dy: -1 }, opcode: 'MOVE_N', glyph: '↑' },
  { dir: { dx: -1, dy: -1 }, opcode: 'MOVE_NW', glyph: '↖' },
  { dir: { dx: -1, dy: 0 }, opcode: 'MOVE_W', glyph: '←' },
  { dir: { dx: -1, dy: 1 }, opcode: 'MOVE_SW', glyph: '↙' },
  { dir: { dx: 0, dy: 1 }, opcode: 'MOVE_S', glyph: '↓' },
  { dir: { dx: 1, dy: 1 }, opcode: 'MOVE_SE', glyph: '↘' },
];

function dirGlyph(dir: Dir): string {
  const found = ALL_DIRECTIONS.find((d) => d.dir.dx === dir.dx && d.dir.dy === dir.dy);
  return found?.glyph ?? '→';
}

function dirEqual(a: Dir, b: Dir): boolean {
  return a.dx === b.dx && a.dy === b.dy;
}

// 직선 셀에서 사용 가능한 글리프 풀. 가중치는 음악적 균형 — 디지트가 멜로디
// 척추라 가장 무겁게, 텍스처는 가볍게.
const STRAIGHT_POOL: { glyph: string; weight: number }[] = [
  // 디지트 (펜타토닉 C5–A6) — 50%
  { glyph: '0', weight: 5 },
  { glyph: '1', weight: 5 },
  { glyph: '2', weight: 5 },
  { glyph: '3', weight: 5 },
  { glyph: '4', weight: 5 },
  { glyph: '5', weight: 5 },
  { glyph: '6', weight: 5 },
  { glyph: '7', weight: 5 },
  { glyph: '8', weight: 5 },
  { glyph: '9', weight: 5 },
  // 산술 — 20%
  { glyph: '+', weight: 3 },
  { glyph: '-', weight: 3 },
  { glyph: '*', weight: 2 },
  { glyph: '/', weight: 2 },
  { glyph: '%', weight: 2 },
  { glyph: '!', weight: 2 },
  { glyph: '`', weight: 2 },
  // 스택 — 8%
  { glyph: ':', weight: 2 },
  { glyph: '$', weight: 2 },
  { glyph: '\\', weight: 2 },
  // 출력 — 7%
  { glyph: '.', weight: 2 },
  { glyph: ',', weight: 1 },
  // NOP (호흡) — 15%
  { glyph: ' ', weight: 8 },
];

function weightedPick<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1]!;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export interface GenerateOptions {
  /** 최소 경로 길이 (HALT 제외) */
  minLength?: number;
  /** 최대 경로 길이 */
  maxLength?: number;
  /** 그리드 경계 (양쪽 정수 inclusive) */
  maxX?: number;
  maxY?: number;
  /** 직선 유지 확률 — 높을수록 단순한 경로 */
  straightBias?: number;
}

/**
 * self-avoiding 2D walk + opcode 매칭 + HALT 종료.
 * 매번 다른 결과 (Math.random 기반).
 */
export function generateRandomProgram(options: GenerateOptions = {}): string {
  const minLen = options.minLength ?? 16;
  const maxLen = options.maxLength ?? 48;
  const maxX = options.maxX ?? 18;
  const maxY = options.maxY ?? 12;
  const straightBias = options.straightBias ?? 0.55;

  const targetLen = minLen + Math.floor(Math.random() * (maxLen - minLen + 1));

  // === 1. 경로 생성 ===
  const path: Pos[] = [{ x: 0, y: 0 }];
  const visited = new Set<string>(['0,0']);
  const dirsAfter: Dir[] = []; // dirsAfter[i] = 셀 i에서 i+1로 가는 방향
  let lastDir: Dir = { dx: 1, dy: 0 }; // 시작 east

  while (path.length < targetLen) {
    const last = path[path.length - 1]!;
    const candidates: Dir[] = [];
    for (const { dir } of ALL_DIRECTIONS) {
      const next = { x: last.x + dir.dx, y: last.y + dir.dy };
      if (next.x < 0 || next.x > maxX) continue;
      if (next.y < 0 || next.y > maxY) continue;
      if (visited.has(`${next.x},${next.y}`)) continue;
      candidates.push(dir);
    }
    if (candidates.length === 0) break; // 데드엔드 — 종료

    let chosen: Dir;
    const canGoStraight = candidates.some((d) => dirEqual(d, lastDir));
    if (canGoStraight && Math.random() < straightBias) {
      chosen = lastDir;
    } else {
      chosen = pickRandom(candidates);
    }

    const next = { x: last.x + chosen.dx, y: last.y + chosen.dy };
    visited.add(`${next.x},${next.y}`);
    path.push(next);
    dirsAfter.push(chosen);
    lastDir = chosen;
  }

  // === 2. 셀 채우기 ===
  // dirIn[i] = 셀 i에 진입하는 방향 (initial east, 또는 dirsAfter[i-1])
  // dirOut[i] = 셀 i에서 나가는 방향 (dirsAfter[i]) — 마지막 셀은 없음
  const cells = new Map<string, string>();
  const initialDir: Dir = { dx: 1, dy: 0 };

  for (let i = 0; i < path.length; i++) {
    const pos = path[i]!;
    const dirIn = i === 0 ? initialDir : dirsAfter[i - 1]!;
    const dirOut = dirsAfter[i]; // undefined for last cell

    let glyph: string;
    if (dirOut !== undefined && !dirEqual(dirIn, dirOut)) {
      // 코너 — wind opcode 강제
      glyph = dirGlyph(dirOut);
    } else {
      // 직선 — 자유 선택
      glyph = weightedPick(STRAIGHT_POOL).glyph;
    }
    cells.set(`${pos.x},${pos.y}`, glyph);
  }

  // === 3. HALT 배치 ===
  // 마지막 셀에서 IP가 다음에 갈 셀이 우리 path 밖. 거기에 @를 두면 IP가 도달해서 종료.
  // 단, 그 다음 셀이 이미 visited면 path가 자기 자신을 만나지 않으므로 자유. 다만
  // 그 셀이 그리드 경계 밖이면 path string 안에 안 담길 수도 있어 약간 곤란.
  //
  // 간단하게: path의 마지막 셀 자체를 @로 덮어쓴다. 마지막 셀은 어차피 sound 한 번
  // 내고 끝나는 자리니까 HALT로 대체해도 음악적으로 자연 (저음 페이드).
  const last = path[path.length - 1]!;
  cells.set(`${last.x},${last.y}`, '@');

  // === 4. 그리드 렌더 ===
  let boundX = 0;
  let boundY = 0;
  for (const pos of path) {
    if (pos.x > boundX) boundX = pos.x;
    if (pos.y > boundY) boundY = pos.y;
  }

  const lines: string[] = [];
  for (let y = 0; y <= boundY; y++) {
    let line = '';
    for (let x = 0; x <= boundX; x++) {
      line += cells.get(`${x},${y}`) ?? ' ';
    }
    // trailing 공백 제거 — NOP이라 의미 같지만 깔끔하게
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines.join('\n') + '\n';
}
