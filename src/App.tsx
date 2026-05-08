import { useEffect, useRef, useState } from 'react';
import { SequenceEngine } from './audio/engine.ts';
import { generateRandomProgram } from './generator/random.ts';
import {
  WindyDebugger,
  ensureWindyInitialized,
  traceProgram,
  type DebugSnapshot,
} from './interpreter/windy.ts';
import './App.css';

// windy/examples/*.wnd 를 빌드 타임에 raw string 으로 번들. `pnpm sync:examples`
// 로 ../windy/examples/ 에서 src/examples/ 로 동기화한다.
const EXAMPLES_RAW = import.meta.glob('./examples/*.wnd', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

function exampleKey(path: string): string {
  // './examples/hello.wnd' → 'hello'
  return path.replace(/^.*\//, '').replace(/\.wnd$/, '');
}

const EXAMPLES: Record<string, string> = Object.fromEntries(
  Object.entries(EXAMPLES_RAW)
    .map(([path, src]) => [exampleKey(path), src] as const)
    .sort(([a], [b]) => a.localeCompare(b)),
);

// hello.wnd 가 가장 짧고 명확한 첫 인상이라 기본값으로 사용.
const DEFAULT_PROGRAM = EXAMPLES['hello'] ?? Object.values(EXAMPLES)[0] ?? '';

type Mode = 'play' | 'debug';

function App() {
  const [bpm, setBpm] = useState(360);
  const [code, setCode] = useState(DEFAULT_PROGRAM);
  const [mode, setMode] = useState<Mode>('play');

  // play 모드 상태
  const [playStatus, setPlayStatus] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const [playInfo, setPlayInfo] = useState<{
    events: number;
    durationSec: number;
    trapped: boolean;
    stepCount: number;
  } | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);

  // debug 모드 상태
  const debuggerRef = useRef<WindyDebugger | null>(null);
  const [snapshot, setSnapshot] = useState<DebugSnapshot | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<SequenceEngine | null>(null);

  useEffect(() => {
    void ensureWindyInitialized();
    return () => {
      debuggerRef.current?.free();
      debuggerRef.current = null;
    };
  }, []);

  // 코드/모드 변경 시 디버그 세션 무효화
  useEffect(() => {
    if (debuggerRef.current) {
      debuggerRef.current.free();
      debuggerRef.current = null;
      setSnapshot(null);
      setDebugError(null);
    }
  }, [code, mode]);

  function ensureEngine(): SequenceEngine {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
      engineRef.current = new SequenceEngine(ctxRef.current);
    }
    return engineRef.current!;
  }

  // ---------------------------------------------------------------- play

  async function handlePlay() {
    setPlayError(null);
    setPlayStatus('loading');
    try {
      await ensureWindyInitialized();
      const result = traceProgram(code);
      if (result.capReached) {
        // 무한 드리프트/루프 — 5분짜리 NOP 음악이 나가는 걸 막는다. 사용자에게
        // 코드를 고치라고 안내. trapped 는 SPEC상 의미있는 종료라 재생 허용.
        setPlayError(
          `종료하지 않는 코드입니다 (${result.stepCount} step 캡 도달). ` +
            `IP가 @ 또는 IP collision merge로 도달 가능한지 확인하세요.`,
        );
        setPlayStatus('error');
        return;
      }
      if (result.events.length === 0) {
        setPlayError('실행 가능한 instruction이 없습니다 — 코드를 확인하세요.');
        setPlayStatus('error');
        return;
      }
      const engine = ensureEngine();
      engine.setBpm(bpm);
      await engine.resume();
      engine.play(result.events);

      const totalSec = result.events.length * (60 / bpm) + 0.5;
      setPlayInfo({
        events: result.events.length,
        durationSec: totalSec,
        trapped: result.trapped,
        stepCount: result.stepCount,
      });
      setPlayStatus('playing');
      window.setTimeout(() => setPlayStatus('idle'), totalSec * 1000);
    } catch (e) {
      setPlayError(e instanceof Error ? e.message : String(e));
      setPlayStatus('error');
    }
  }

  // --------------------------------------------------------------- debug

  async function startDebug() {
    setDebugError(null);
    try {
      await ensureWindyInitialized();
      ensureEngine(); // audio 컨텍스트만 보장 (resume은 step에서)
      debuggerRef.current?.free();
      const dbg = new WindyDebugger(code);
      debuggerRef.current = dbg;
      setSnapshot(dbg.getSnapshot());
    } catch (e) {
      setDebugError(e instanceof Error ? e.message : String(e));
    }
  }

  async function stepOnce() {
    const dbg = debuggerRef.current;
    if (!dbg) return;
    const engine = ensureEngine();
    await engine.resume();

    // 현재 보이는 opcode를 sonify → 그 다음 step
    const ev = dbg.currentEvent();
    if (ev) engine.playImmediate(ev);
    dbg.step();
    setSnapshot(dbg.getSnapshot());
  }

  async function continueRun() {
    const dbg = debuggerRef.current;
    if (!dbg) return;
    const engine = ensureEngine();
    engine.setBpm(bpm);
    await engine.resume();

    const remaining = dbg.collectRemaining();
    if (remaining.length > 0) {
      engine.play(remaining);
    }
    setSnapshot(dbg.getSnapshot());
  }

  function resetDebug() {
    debuggerRef.current?.free();
    debuggerRef.current = null;
    setSnapshot(null);
    setDebugError(null);
  }

  function loadExample(key: string) {
    const program = EXAMPLES[key];
    if (program) setCode(program);
  }

  function rollRandom() {
    setCode(generateRandomProgram());
  }

  const playing = playStatus === 'playing';
  const loading = playStatus === 'loading';
  const debugStarted = snapshot !== null;
  const debugDone = snapshot !== null && (snapshot.halted || snapshot.trapped);

  return (
    <div className="app">
      <header>
        <h1>
          windy-<span className="accent">aria</span>
        </h1>
        <p className="tagline">바람의 흐름이 곧 음악이 되는 언어</p>
      </header>

      <main>
        <section className="panel">
          <div className="row toolbar">
            <div className="mode-toggle" role="tablist">
              <button
                role="tab"
                aria-selected={mode === 'play'}
                className={mode === 'play' ? 'active' : ''}
                onClick={() => setMode('play')}
              >
                ▶ Play
              </button>
              <button
                role="tab"
                aria-selected={mode === 'debug'}
                className={mode === 'debug' ? 'active' : ''}
                onClick={() => setMode('debug')}
              >
                ⏸ Debug
              </button>
            </div>
            <label>
              BPM
              <input
                type="number"
                min={60}
                max={600}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                disabled={loading || playing}
              />
            </label>
            <span className="example-list">
              예제:{' '}
              {Object.keys(EXAMPLES).map((key) => (
                <button
                  key={key}
                  className="link-btn"
                  onClick={() => loadExample(key)}
                  disabled={loading || playing}
                >
                  {key}
                </button>
              ))}
              <button
                className="link-btn dice"
                onClick={rollRandom}
                disabled={loading || playing}
                title="2D 랜덤 windy 프로그램 생성"
              >
                🎲 random
              </button>
            </span>
          </div>

          <textarea
            className="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            rows={10}
          />

          {mode === 'play' && (
            <>
              <div className="row" style={{ marginTop: '0.6rem' }}>
                <button onClick={handlePlay} disabled={loading || playing}>
                  {playing ? '▶ 재생 중' : loading ? '준비 중…' : '▶ 재생'}
                </button>
              </div>
              <div className="status">
                {playError && <span className="error">에러: {playError}</span>}
                {!playError && playInfo && (
                  <span>
                    {playInfo.trapped && '⚠ trapped — '}
                    {playInfo.events} instruction · {playInfo.stepCount} step ·{' '}
                    {playInfo.durationSec.toFixed(1)}초
                  </span>
                )}
                {!playError && !playInfo && (
                  <span className="hint">windy-lang 코드를 입력하고 재생을 누르세요.</span>
                )}
              </div>
            </>
          )}

          {mode === 'debug' && (
            <>
              <div className="row" style={{ marginTop: '0.6rem' }}>
                {!debugStarted && (
                  <button onClick={startDebug}>⏵ 디버그 시작</button>
                )}
                {debugStarted && (
                  <>
                    <button onClick={stepOnce} disabled={debugDone}>
                      ▷ Step
                    </button>
                    <button onClick={continueRun} disabled={debugDone}>
                      ▶▶ Continue
                    </button>
                    <button onClick={resetDebug} className="secondary">
                      ↺ Reset
                    </button>
                  </>
                )}
              </div>
              <div className="status">
                {debugError && <span className="error">에러: {debugError}</span>}
                {!debugError && !debugStarted && (
                  <span className="hint">
                    "디버그 시작"으로 세션을 만들면 한 step씩 진행하며 매 instruction의 소리를 들을 수
                    있습니다.
                  </span>
                )}
                {!debugError && debugDone && (
                  <span>
                    {snapshot.halted ? '✓ 정상 종료 (halted)' : '⚠ 트랩 (trapped)'} · 총{' '}
                    {snapshot.stepCount} step
                  </span>
                )}
              </div>

              {debugStarted && <DebugPanel snap={snapshot} />}
            </>
          )}
        </section>

        <section className="panel">
          <h2>매핑 요약</h2>
          <p className="hint">
            8 풍향 → C 펜타토닉 (C4–G5) · 디지트 0–9 → C5–A6 · 산술/스택 → square burst ·
            I/O → sawtooth · TURBULENCE → 노이즈 · GUST/CALM → 글리산도 · HALT → 저음 페이드.
            전체 명세는{' '}
            <a
              href="https://github.com/sisobus/windy-aria/blob/master/docs/MAPPING.md"
              target="_blank"
              rel="noreferrer"
            >
              docs/MAPPING.md
            </a>
            .
          </p>
        </section>
      </main>

      <footer>
        <a href="https://github.com/sisobus/windy-aria" target="_blank" rel="noreferrer">
          github.com/sisobus/windy-aria
        </a>
        <span className="sep"> · </span>
        <a href="https://github.com/sisobus/windy" target="_blank" rel="noreferrer">
          windy-lang
        </a>
      </footer>
    </div>
  );
}

function DebugPanel({ snap }: { snap: DebugSnapshot }) {
  const dirArrow = arrowFor(snap.direction.dx, snap.direction.dy);
  return (
    <div className="debug-panel">
      <div className="debug-grid">
        <Field label="step">{snap.stepCount}</Field>
        <Field label="op">
          <code>{snap.currentOpName}</code>
        </Field>
        <Field label="pos">
          ({snap.position.x}, {snap.position.y})
        </Field>
        <Field label="dir">
          {dirArrow} ({snap.direction.dx}, {snap.direction.dy})
        </Field>
        <Field label="ips">{snap.ipCount}</Field>
        <Field label="state">
          {snap.halted ? 'halted' : snap.trapped ? 'trapped' : 'running'}
        </Field>
      </div>
      <Field label="stack (bottom → top)">
        <code>{snap.stack.length === 0 ? '∅' : snap.stack.join(' · ')}</code>
      </Field>
      {snap.stdout && (
        <Field label="stdout">
          <pre className="output">{snap.stdout}</pre>
        </Field>
      )}
      {snap.stderr && (
        <Field label="stderr">
          <pre className="output dim">{snap.stderr}</pre>
        </Field>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <span className="field-value">{children}</span>
    </div>
  );
}

function arrowFor(dx: number, dy: number): string {
  // dy: +1 = south, -1 = north (SPEC §3.1)
  if (dx === 1 && dy === 0) return '→';
  if (dx === 1 && dy === -1) return '↗';
  if (dx === 0 && dy === -1) return '↑';
  if (dx === -1 && dy === -1) return '↖';
  if (dx === -1 && dy === 0) return '←';
  if (dx === -1 && dy === 1) return '↙';
  if (dx === 0 && dy === 1) return '↓';
  if (dx === 1 && dy === 1) return '↘';
  return '·';
}

export default App;
