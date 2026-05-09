#!/usr/bin/env node
/**
 * Sanity check for src/songs/*.wnd — confirms each one halts cleanly
 * within the 4000-step cap and emits at least one sonifiable event.
 * Throwaway script; not wired into the package.
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import init, { Session } from 'windy-lang';

const here = dirname(fileURLToPath(import.meta.url));
const songsDir = join(here, '..', 'src', 'songs');
const wasmPath = join(here, '..', 'node_modules', 'windy-lang', 'windy_bg.wasm');

const wasm = await readFile(wasmPath);
await init({ module_or_path: wasm });

const files = (await readdir(songsDir)).filter((f) => f.endsWith('.wnd')).sort();

const SEPARATOR = '\n---\n';
let failed = 0;

for (const file of files) {
  const raw = await readFile(join(songsDir, file), 'utf8');
  const sep = raw.indexOf(SEPARATOR);
  const source = sep < 0 ? raw : raw.slice(sep + SEPARATOR.length).replace(/^\s*\n/, '');

  const session = new Session(source, '', null, 4000n);
  let sonifiable = 0;
  const ops = [];
  while (!session.halted && !session.trapped) {
    const op = session.current_op();
    if (op !== 'UNKNOWN' && op !== '') {
      sonifiable++;
      if (ops.length < 30) ops.push(op);
    }
    session.step();
    if (session.steps > 4000n) break;
  }
  const ok = session.halted && !session.trapped;
  if (!ok) failed++;
  const status = ok ? 'OK ' : 'BAD';
  console.log(
    `${status} ${file.padEnd(20)} steps=${String(session.steps).padStart(4)} ` +
      `events=${String(sonifiable).padStart(3)} ` +
      `halted=${session.halted} trapped=${session.trapped}`,
  );
  if (ops.length > 0) console.log(`     ops: ${ops.join(' ')}`);
  session.free();
}

if (failed > 0) {
  console.error(`\n${failed} song(s) failed to halt cleanly.`);
  process.exit(1);
}
console.log('\nAll songs halt cleanly.');
