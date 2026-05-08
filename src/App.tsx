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

// Bundle windy/examples/*.wnd as raw strings at build time. Run
// `pnpm sync:examples` to refresh src/examples/ from ../windy/examples/.
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

// hello.wnd is the shortest, clearest first impression — use it as the default.
const DEFAULT_PROGRAM = EXAMPLES['hello'] ?? Object.values(EXAMPLES)[0] ?? '';

type Mode = 'play' | 'debug';

function App() {
  const [bpm, setBpm] = useState(360);
  const [code, setCode] = useState(DEFAULT_PROGRAM);
  const [mode, setMode] = useState<Mode>('play');

  // play-mode state
  const [playStatus, setPlayStatus] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const [playInfo, setPlayInfo] = useState<{
    events: number;
    durationSec: number;
    trapped: boolean;
    stepCount: number;
  } | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);

  // debug-mode state
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

  // Invalidate the debug session whenever code or mode changes.
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
        // Infinite drift / loop — refuse to schedule 5 minutes of NOP audio.
        // Trapped runs are SPEC-defined terminations, so we still play those.
        setPlayError(
          `Code does not halt (cap reached at ${result.stepCount} steps). ` +
            `Make sure the IP can reach an @ or end via IP collision merge.`,
        );
        setPlayStatus('error');
        return;
      }
      if (result.events.length === 0) {
        setPlayError('No executable instructions — check your code.');
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
      ensureEngine(); // ensure the audio context exists; resume happens on step
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

    // Sonify the opcode under the cursor, then advance one step.
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
        <p className="tagline">A sonification of windy-lang — the wind is the melody.</p>
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
              Examples:{' '}
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
                title="Generate a random 2D windy program"
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
                  {playing ? '▶ Playing' : loading ? 'Loading…' : '▶ Play'}
                </button>
              </div>
              <div className="status">
                {playError && <span className="error">Error: {playError}</span>}
                {!playError && playInfo && (
                  <span>
                    {playInfo.trapped && '⚠ trapped — '}
                    {playInfo.events} instructions · {playInfo.stepCount} steps ·{' '}
                    {playInfo.durationSec.toFixed(1)}s
                  </span>
                )}
                {!playError && !playInfo && (
                  <span className="hint">Enter windy-lang code and press Play.</span>
                )}
              </div>
            </>
          )}

          {mode === 'debug' && (
            <>
              <div className="row" style={{ marginTop: '0.6rem' }}>
                {!debugStarted && (
                  <button onClick={startDebug}>⏵ Start debugging</button>
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
                {debugError && <span className="error">Error: {debugError}</span>}
                {!debugError && !debugStarted && (
                  <span className="hint">
                    Start debugging to step through one instruction at a time and hear each one as
                    it executes.
                  </span>
                )}
                {!debugError && debugDone && (
                  <span>
                    {snapshot.halted ? '✓ Halted cleanly' : '⚠ Trapped'} · {snapshot.stepCount}{' '}
                    steps
                  </span>
                )}
              </div>

              {debugStarted && <DebugPanel snap={snapshot} />}
            </>
          )}
        </section>

        <section className="panel">
          <h2>Sound mapping</h2>
          <p className="hint">
            Eight winds → C major pentatonic (C4–G5) · digits 0–9 → C5–A6 · arithmetic & stack
            → square burst · I/O → sawtooth · TURBULENCE → noise · GUST/CALM → glissando ·
            HALT → low sine fade. Full spec in{' '}
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
        <a href="https://windy.sisobus.com/">windy.sisobus.com</a>
        <span className="sep"> · </span>
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
