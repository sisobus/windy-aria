/**
 * Curated song gallery — windy-lang programs written for listening,
 * not as SPEC demos.
 *
 * Each `.wnd` file in this directory is a song with a frontmatter
 * block at the top:
 *
 *     title: Stair
 *     intent: Three eastbound steps, four southbound, simple resolve
 *     bpm: 240
 *     ---
 *     →→→↓
 *     ...
 *
 * Everything before the `---` line is `key: value` metadata. Everything
 * after is the actual windy source — that's what we feed to the
 * interpreter. The frontmatter never reaches windy, so a `:` inside
 * a key doesn't risk being parsed as DUP.
 */

const RAW = import.meta.glob('./*.wnd', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

export interface Song {
  /** Slug derived from the filename (no .wnd). */
  id: string;
  title: string;
  /** One-line composer note — what the listener should expect. */
  intent: string;
  /** Suggested BPM for the right groove. */
  bpm: number;
  /** Pure windy source — frontmatter already stripped. */
  source: string;
}

const SEPARATOR = '\n---\n';
const DEFAULT_BPM = 240;

function songIdFromPath(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.wnd$/, '');
}

function parseSong(id: string, raw: string): Song {
  const sep = raw.indexOf(SEPARATOR);
  if (sep < 0) {
    return { id, title: id, intent: '', bpm: DEFAULT_BPM, source: raw };
  }
  const head = raw.slice(0, sep);
  // Drop one trailing newline if the body starts with a blank line.
  const source = raw.slice(sep + SEPARATOR.length).replace(/^\s*\n/, '');
  const meta: Record<string, string> = {};
  for (const line of head.split('\n')) {
    const m = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (m) meta[m[1]!] = m[2]!.trim();
  }
  const bpmRaw = parseInt(meta['bpm'] ?? '', 10);
  return {
    id,
    title: meta['title'] ?? id,
    intent: meta['intent'] ?? '',
    bpm: Number.isFinite(bpmRaw) && bpmRaw > 0 ? bpmRaw : DEFAULT_BPM,
    source,
  };
}

export const SONGS: readonly Song[] = Object.entries(RAW)
  .map(([path, raw]) => parseSong(songIdFromPath(path), raw))
  .sort((a, b) => a.id.localeCompare(b.id));
