/**
 * Random windy program generator.
 *
 * Invariants (no input, no cycles, halts):
 * 1. The IP starts at (0, 0) heading east.
 * 2. The path is self-avoiding — never revisits a cell. (Two visits
 *    would conflict at write time: a cell can only carry one glyph.)
 * 3. The path stays in the non-negative quadrant (x ≥ 0, y ≥ 0) so that
 *    (0, 0) lands at the top-left of the rendered grid where the IP
 *    actually enters the source.
 * 4. Corner cells (direction changes) are forced to the wind opcode for
 *    the new direction. Straight cells take any direction-preserving
 *    opcode.
 * 5. An `@` is placed at the end of the path — halt is guaranteed.
 *
 * Opcodes intentionally excluded:
 * - `≫` `≪` (GUST/CALM): speed changes skip cells, so our simulated
 *   path drifts from the real IP's path.
 * - `#` (TRAMPOLINE): same — skips the next cell.
 * - `t` (SPLIT): the new IP would wander into territory we haven't laid out.
 * - `_` `|` (branches): direction depends on the stack — unpredictable.
 * - `"` (STR_MODE): once string mode opens, subsequent cells just push.
 * - `&` `?` (input): no stdin → pushes -1, no musical signal.
 * - `g` `p` (grid memory): can mutate the cells underfoot.
 * - `@`: placed by us at the end.
 *
 * Straight-cell pool:
 * - Digits 0–9 (most common, the musical spine)
 * - Arithmetic + - * / % ! `
 * - Stack : $ \
 * - Output . , (an empty stack still emits 0 — produces a note)
 * - TURBULENCE ~ (random direction; our generator can't simulate it
 *   → unsuitable for straights. Exclude or restrict to corners.)
 * - NOP (space)
 *
 * TURBULENCE breaks determinism, so it stays out of the pool.
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

// Glyph pool used for straight cells. Weights tune the musical balance —
// digits are the melodic spine (heaviest), textures stay light.
const STRAIGHT_POOL: { glyph: string; weight: number }[] = [
  // Digits (pentatonic C5–A6) — 50%
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
  // Arithmetic — 20%
  { glyph: '+', weight: 3 },
  { glyph: '-', weight: 3 },
  { glyph: '*', weight: 2 },
  { glyph: '/', weight: 2 },
  { glyph: '%', weight: 2 },
  { glyph: '!', weight: 2 },
  { glyph: '`', weight: 2 },
  // Stack — 8%
  { glyph: ':', weight: 2 },
  { glyph: '$', weight: 2 },
  { glyph: '\\', weight: 2 },
  // Output — 7%
  { glyph: '.', weight: 2 },
  { glyph: ',', weight: 1 },
  // NOP (breathing room) — 15%
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
  /** Minimum path length (HALT excluded). */
  minLength?: number;
  /** Maximum path length. */
  maxLength?: number;
  /** Grid bounds (both inclusive). */
  maxX?: number;
  maxY?: number;
  /** Straight-keeping probability — higher means simpler paths. */
  straightBias?: number;
}

/**
 * Self-avoiding 2D walk + opcode placement + terminating HALT.
 * Different result every call (Math.random based).
 */
export function generateRandomProgram(options: GenerateOptions = {}): string {
  const minLen = options.minLength ?? 16;
  const maxLen = options.maxLength ?? 48;
  const maxX = options.maxX ?? 18;
  const maxY = options.maxY ?? 12;
  const straightBias = options.straightBias ?? 0.55;

  const targetLen = minLen + Math.floor(Math.random() * (maxLen - minLen + 1));

  // === 1. Build the path ===
  const path: Pos[] = [{ x: 0, y: 0 }];
  const visited = new Set<string>(['0,0']);
  const dirsAfter: Dir[] = []; // dirsAfter[i] = direction from cell i to i+1
  let lastDir: Dir = { dx: 1, dy: 0 }; // initial east

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
    if (candidates.length === 0) break; // dead end — stop

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

  // === 2. Fill the cells ===
  // dirIn[i] = direction entering cell i (initial east, or dirsAfter[i-1])
  // dirOut[i] = direction leaving cell i (dirsAfter[i]) — undefined for the last cell
  const cells = new Map<string, string>();
  const initialDir: Dir = { dx: 1, dy: 0 };

  for (let i = 0; i < path.length; i++) {
    const pos = path[i]!;
    const dirIn = i === 0 ? initialDir : dirsAfter[i - 1]!;
    const dirOut = dirsAfter[i]; // undefined for last cell

    let glyph: string;
    if (dirOut !== undefined && !dirEqual(dirIn, dirOut)) {
      // Corner — force the wind opcode for the outgoing direction.
      glyph = dirGlyph(dirOut);
    } else {
      // Straight — pick freely from the pool.
      glyph = weightedPick(STRAIGHT_POOL).glyph;
    }
    cells.set(`${pos.x},${pos.y}`, glyph);
  }

  // === 3. Place HALT ===
  // The IP's next cell after the last path cell is off our path. We
  // could place `@` there and let the IP step into it, except that off
  // the path (or off the grid) the cell may not appear in our rendered
  // string at all.
  //
  // Simpler: overwrite the path's last cell with `@`. That cell would
  // sound only once anyway, and HALT replacing it sounds natural — a
  // low fade-out is a fine final note.
  const last = path[path.length - 1]!;
  cells.set(`${last.x},${last.y}`, '@');

  // === 4. Render the grid ===
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
    // Strip trailing whitespace — same meaning (NOP), but tidier output.
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines.join('\n') + '\n';
}
