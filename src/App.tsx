import { useEffect, useRef, useState } from 'react';
import { SequenceEngine } from './audio/engine.ts';
import { generateRandomProgram } from './generator/random.ts';
import {
  WindyDebugger,
  ensureWindyInitialized,
  traceProgram,
  type DebugSnapshot,
  type IpState,
  type TickFrame,
} from './interpreter/windy.ts';
import { Grid } from './visualizer/Grid.tsx';
import { SONGS, type Song } from './songs/index.ts';
import { decodeShareHash, encodeShareHash } from './share/url.ts';
import { downloadBlob, renderEventsToWav } from './export/wav.ts';
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
const DEFAULT_BPM = 360;

// Read the initial source/BPM from the URL hash once, at module load.
// Hash format documented in src/share/url.ts.
const INITIAL_FROM_HASH =
  typeof window === 'undefined' ? {} : decodeShareHash(window.location.hash);

type Mode = 'play' | 'debug';

function App() {
  const [bpm, setBpm] = useState(INITIAL_FROM_HASH.bpm ?? DEFAULT_BPM);
  const [code, setCode] = useState(INITIAL_FROM_HASH.source ?? DEFAULT_PROGRAM);
  const [mode, setMode] = useState<Mode>('play');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [wavStatus, setWavStatus] = useState<'idle' | 'rendering' | 'error'>('idle');

  // play-mode state
  const [playStatus, setPlayStatus] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const [playInfo, setPlayInfo] = useState<{
    events: number;
    durationSec: number;
    trapped: boolean;
    stepCount: number;
    stdout: string;
    stderr: string;
  } | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);

  // debug-mode state
  const debuggerRef = useRef<WindyDebugger | null>(null);
  const [snapshot, setSnapshot] = useState<DebugSnapshot | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);

  // visualizer state — drives the IP highlights on the grid below the editor.
  // Play mode fills this from the trace's TickFrames via rAF; debug mode
  // mirrors snapshot.ips on every step.
  const [visIps, setVisIps] = useState<IpState[]>([]);
  const rafRef = useRef<number | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<SequenceEngine | null>(null);

  useEffect(() => {
    void ensureWindyInitialized();
    return () => {
      debuggerRef.current?.free();
      debuggerRef.current = null;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function stopVisualizer() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  // Invalidate the debug session AND any running play-mode animation
  // whenever code or mode changes — old IP positions don't apply to a
  // new program, and the audio is only scheduled once.
  useEffect(() => {
    if (debuggerRef.current) {
      debuggerRef.current.free();
      debuggerRef.current = null;
      setSnapshot(null);
      setDebugError(null);
    }
    stopVisualizer();
    setVisIps([]);
  }, [code, mode]);

  // Mirror the current source + BPM into the URL hash. Debounced so a
  // user typing in the editor doesn't churn history entries.
  // history.replaceState (not pushState) keeps the back button useful.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const hash = code ? encodeShareHash(code, bpm, DEFAULT_BPM) : '';
      const next = window.location.pathname + window.location.search + hash;
      window.history.replaceState(null, '', next);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [code, bpm]);

  /**
   * Render the current code at the current BPM into a 16-bit mono WAV
   * and trigger a browser download. Reuses the same Synth that drives
   * live playback against an OfflineAudioContext, so what you hear is
   * what you save.
   */
  async function downloadWav() {
    setPlayError(null);
    setWavStatus('rendering');
    try {
      await ensureWindyInitialized();
      const result = traceProgram(code);
      if (result.capReached) {
        setPlayError(
          `Code does not halt (cap reached at ${result.stepCount} steps). ` +
            `Make sure the IP can reach an @ or end via IP collision merge.`,
        );
        setWavStatus('error');
        window.setTimeout(() => setWavStatus('idle'), 1800);
        return;
      }
      if (result.events.length === 0) {
        setPlayError('No executable instructions — check your code.');
        setWavStatus('error');
        window.setTimeout(() => setWavStatus('idle'), 1800);
        return;
      }
      const blob = await renderEventsToWav(result.events, { bpm });
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadBlob(blob, `windy-aria-${bpm}bpm-${ts}.wav`);
      setWavStatus('idle');
    } catch (e) {
      setPlayError(e instanceof Error ? e.message : String(e));
      setWavStatus('error');
      window.setTimeout(() => setWavStatus('idle'), 1800);
    }
  }

  async function copyShareLink() {
    try {
      const hash = encodeShareHash(code, bpm, DEFAULT_BPM);
      const url = window.location.origin + window.location.pathname + window.location.search + hash;
      await navigator.clipboard.writeText(url);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
    window.setTimeout(() => setCopyStatus('idle'), 1800);
  }

  function ensureEngine(): SequenceEngine {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
      engineRef.current = new SequenceEngine(ctxRef.current);
    }
    return engineRef.current!;
  }

  // ---------------------------------------------------------------- play

  async function handlePlay() {
    await playSource(code, bpm);
  }

  /**
   * Trace + schedule one program. Pulled out of handlePlay so the
   * gallery can play a song without round-tripping through React
   * state — setCode/setBpm batch and we'd otherwise read stale values.
   */
  async function playSource(src: string, atBpm: number) {
    setPlayError(null);
    setPlayStatus('loading');
    try {
      await ensureWindyInitialized();
      const result = traceProgram(src);
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
      engine.setBpm(atBpm);
      await engine.resume();

      // Mirror the engine's startAt offset (engine.play uses
      // ctx.currentTime + 0.1 internally). The microsecond drift between
      // the two reads is below visual resolution.
      const ctx = ctxRef.current!;
      const startAt = ctx.currentTime + 0.1;
      engine.play(result.events);

      startPlayVisualizer(result.frames, startAt, result.events[0]!.tick, atBpm);

      const totalSec = result.events.length * (60 / atBpm) + 0.5;
      setPlayInfo({
        events: result.events.length,
        durationSec: totalSec,
        trapped: result.trapped,
        stepCount: result.stepCount,
        stdout: result.stdout,
        stderr: result.stderr,
      });
      setPlayStatus('playing');
      window.setTimeout(() => setPlayStatus('idle'), totalSec * 1000);
    } catch (e) {
      setPlayError(e instanceof Error ? e.message : String(e));
      setPlayStatus('error');
    }
  }

  /**
   * Drive the visualizer from the audio clock. We poll
   * ctx.currentTime inside requestAnimationFrame and pick the frame
   * whose tick window contains it, so highlight movement stays locked
   * to actual playback even if the rAF cadence stutters.
   */
  /**
   * @param audioBaseTick The tick value the engine is treating as its
   *   t=0 (= `events[0].tick`). Frames whose tick is before this run
   *   during the engine's leading silence; we still display them so the
   *   IP visibly walks through pre-sound cells.
   * @param atBpm Passed explicitly because callers (gallery loadSong)
   *   may set BPM via setBpm just before, and React state isn't yet
   *   reflected in the closure.
   */
  function startPlayVisualizer(
    frames: TickFrame[],
    startAt: number,
    audioBaseTick: number,
    atBpm: number,
  ) {
    stopVisualizer();
    if (frames.length === 0) {
      setVisIps([]);
      return;
    }
    const tickDur = 60 / atBpm;
    const offset = audioBaseTick - frames[0]!.tick; // frames per leading silence
    setVisIps(frames[0]!.ips);
    let lastIdx = 0;

    const tick = () => {
      const ctx = ctxRef.current;
      if (!ctx) {
        rafRef.current = null;
        return;
      }
      const elapsed = ctx.currentTime - startAt;
      const rawIdx = Math.floor(elapsed / tickDur);
      const idx = Math.min(Math.max(0, offset + rawIdx), frames.length - 1);
      // Only re-render when the frame actually moves — rAF fires ~60 Hz
      // but ticks at BPM 360 fire only ~6 Hz, so most rAF cycles don't
      // have new state to commit.
      if (idx !== lastIdx) {
        lastIdx = idx;
        setVisIps(frames[idx]!.ips);
      }
      if (idx >= frames.length - 1) {
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
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
      const snap = dbg.getSnapshot();
      setSnapshot(snap);
      setVisIps(snap.ips);
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
    const snap = dbg.getSnapshot();
    setSnapshot(snap);
    setVisIps(snap.ips);
  }

  async function continueRun() {
    const dbg = debuggerRef.current;
    if (!dbg) return;
    const engine = ensureEngine();
    engine.setBpm(bpm);
    await engine.resume();

    // Capture frames so we can animate the highlight through the
    // remaining run, identically to handlePlay.
    const ctx = ctxRef.current!;
    const startAt = ctx.currentTime + 0.1;
    const { events, frames } = dbg.collectRemainingWithFrames();
    if (events.length > 0) {
      engine.play(events);
    }
    if (frames.length > 0) {
      // Audio base = first event's tick (engine.play normalizes to it),
      // or fall back to the first frame's tick if no events fire.
      const audioBaseTick = events[0]?.tick ?? frames[0]!.tick;
      startPlayVisualizer(frames, startAt, audioBaseTick, bpm);
    }
    setSnapshot(dbg.getSnapshot());
  }

  function resetDebug() {
    debuggerRef.current?.free();
    debuggerRef.current = null;
    setSnapshot(null);
    setDebugError(null);
    stopVisualizer();
    setVisIps([]);
  }

  /**
   * Keyboard shortcuts active while in debug mode. Mirrors the bindings
   * on windy.sisobus.com (`s`/Enter step, `c` continue, `r` restart,
   * `q`/Escape exit) so users moving between the two pages share one
   * mental model. We skip when a textarea/input has focus so typing
   * `c`/`r`/`q` into the editor doesn't trigger debug actions.
   */
  useEffect(() => {
    if (mode !== 'debug') return;

    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;

      const dbg = debuggerRef.current;
      const dbgDone = snapshot !== null && (snapshot.halted || snapshot.trapped);

      if (e.key === 'Enter' || e.key === 's') {
        e.preventDefault();
        if (!dbg) {
          void startDebug();
        } else if (!dbgDone) {
          void stepOnce();
        }
      } else if (e.key === 'c') {
        e.preventDefault();
        if (dbg && !dbgDone) void continueRun();
      } else if (e.key === 'r') {
        e.preventDefault();
        // restart = reset then start fresh, in one keypress.
        resetDebug();
        void startDebug();
      } else if (e.key === 'q' || e.key === 'Escape') {
        e.preventDefault();
        setMode('play');
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [mode, snapshot]);

  function loadExample(key: string) {
    const program = EXAMPLES[key];
    if (program) setCode(program);
  }

  function rollRandom() {
    setCode(generateRandomProgram());
  }

  /**
   * Gallery click — switch to play mode, load the song's source and
   * recommended BPM, and start playback in the same gesture. The
   * source/BPM are passed to playSource explicitly because React
   * hasn't flushed the setState calls yet.
   */
  async function loadSong(song: Song) {
    if (mode !== 'play') setMode('play');
    setCode(song.source);
    setBpm(song.bpm);
    await playSource(song.source, song.bpm);
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
            <button
              className="link-btn share-btn"
              onClick={copyShareLink}
              title="Copy a permalink (code + BPM) to the clipboard"
            >
              {copyStatus === 'copied'
                ? '✓ link copied'
                : copyStatus === 'error'
                  ? '⚠ copy failed'
                  : '🔗 copy share link'}
            </button>
          </div>

          <textarea
            className="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            rows={10}
          />

          <Grid source={code} ips={visIps} />

          {mode === 'play' && (
            <>
              <div className="row" style={{ marginTop: '0.6rem' }}>
                <button onClick={handlePlay} disabled={loading || playing}>
                  {playing ? '▶ Playing' : loading ? 'Loading…' : '▶ Play'}
                </button>
                <button
                  className="secondary"
                  onClick={downloadWav}
                  disabled={loading || playing || wavStatus === 'rendering'}
                  title="Render the current code to a WAV file and download"
                >
                  {wavStatus === 'rendering' ? 'Rendering…' : '⬇ Download WAV'}
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
              {playInfo && (playInfo.stdout || playInfo.stderr) && (
                <div className="play-output">
                  {playInfo.stdout && (
                    <Field label="stdout">
                      <pre className="output">{playInfo.stdout}</pre>
                    </Field>
                  )}
                  {playInfo.stderr && (
                    <Field label="stderr">
                      <pre className="output dim">{playInfo.stderr}</pre>
                    </Field>
                  )}
                </div>
              )}
            </>
          )}

          {mode === 'debug' && (
            <>
              <div className="row" style={{ marginTop: '0.6rem' }}>
                {!debugStarted && (
                  <button onClick={startDebug} title="Start debug session (s / Enter)">
                    ⏵ Start debugging
                  </button>
                )}
                {debugStarted && (
                  <>
                    <button onClick={stepOnce} disabled={debugDone} title="Step (s / Enter)">
                      ▷ Step <kbd className="key-hint">s</kbd>
                    </button>
                    <button onClick={continueRun} disabled={debugDone} title="Run to halt (c)">
                      ▶▶ Continue <kbd className="key-hint">c</kbd>
                    </button>
                    <button
                      onClick={() => {
                        resetDebug();
                        void startDebug();
                      }}
                      className="secondary"
                      title="Restart from the beginning (r)"
                    >
                      ↺ Restart <kbd className="key-hint">r</kbd>
                    </button>
                  </>
                )}
              </div>
              <div className="status">
                {debugError && <span className="error">Error: {debugError}</span>}
                {!debugError && !debugStarted && (
                  <span className="hint">
                    Start debugging to step through one instruction at a time and hear each one as
                    it executes. Shortcuts: <kbd>s</kbd>/<kbd>Enter</kbd> step, <kbd>c</kbd>{' '}
                    continue, <kbd>r</kbd> restart, <kbd>Esc</kbd> exit.
                  </span>
                )}
                {!debugError && debugDone && (
                  <span>
                    {snapshot.halted ? '✓ Halted cleanly' : '⚠ Trapped'} · {snapshot.stepCount}{' '}
                    steps · press <kbd>r</kbd> to restart
                  </span>
                )}
                {!debugError && debugStarted && !debugDone && (
                  <span className="hint">
                    <kbd>s</kbd>/<kbd>Enter</kbd> step · <kbd>c</kbd> continue ·{' '}
                    <kbd>r</kbd> restart · <kbd>Esc</kbd> exit
                  </span>
                )}
              </div>

              {debugStarted && <DebugPanel snap={snapshot} />}
            </>
          )}
        </section>

        <section className="panel">
          <h2>Gallery</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            Curated windy programs written for listening. Click any to load and play.
          </p>
          <ul className="gallery">
            {SONGS.map((song) => (
              <li key={song.id}>
                <button
                  className="gallery-item"
                  onClick={() => loadSong(song)}
                  disabled={loading || playing}
                >
                  <span className="gallery-title">{song.title}</span>
                  <span className="gallery-bpm">{song.bpm} bpm</span>
                  {song.intent && <span className="gallery-intent">{song.intent}</span>}
                </button>
              </li>
            ))}
          </ul>
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
