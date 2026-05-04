// Generator 검증 — 30번 생성해서 windy WASI로 실행. exit code 0이어야 함 (= 정상 halt).
// Node 22+ + windy.wasm + wasmtime 같은 WASI runtime 필요... 인데 환경 의존 줄이려고
// windy-lang의 wasm32-unknown-unknown 빌드(브라우저용)를 직접 import해서 run() 호출.

import init, { run } from 'windy-lang';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const wasmPath = resolve(
  here,
  '../node_modules/.pnpm/windy-lang@file+..+windy+web+pkg/node_modules/windy-lang/windy_bg.wasm',
);
const wasmBytes = readFileSync(wasmPath);

await init({ module_or_path: wasmBytes });

// generator를 import 위해 TS 그대로 — Node 22+ --experimental-strip-types 또는
// 빌드된 dist를 import. 여기선 인라인으로 재구현하지 않고, 빌드된 결과를 사용.
// 간단히: src/generator/random.ts를 직접 import (Node 24가 자동 stripping).
const { generateRandomProgram } = await import('../src/generator/random.ts');

let total = 0;
let halted = 0;
let trapped = 0;
let stepCap = 0;
let other = 0;
const failures = [];

const N = 30;
for (let i = 0; i < N; i++) {
  total++;
  const code = generateRandomProgram();
  const result = run(code, '', undefined, BigInt(10000));
  if (result.exit === 0) halted++;
  else if (result.exit === 134) trapped++;
  else if (result.exit === 124) {
    stepCap++;
    failures.push({ i, exit: result.exit, code });
  } else {
    other++;
    failures.push({ i, exit: result.exit, code });
  }
}

console.log(`tested: ${total}`);
console.log(`  halted (0):      ${halted}`);
console.log(`  trapped (134):   ${trapped}`);
console.log(`  step cap (124):  ${stepCap}`);
console.log(`  other:           ${other}`);

if (failures.length > 0) {
  console.log('\n--- failures ---');
  for (const f of failures.slice(0, 3)) {
    console.log(`#${f.i} exit=${f.exit}`);
    console.log(f.code);
    console.log('---');
  }
}

// 성공 = 모두 정상 halt (exit 0). trap이나 step cap이 있으면 제너레이터 버그.
process.exit(halted === total ? 0 : 1);
