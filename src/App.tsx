import { useEffect, useRef, useState } from 'react';
import { SequenceEngine } from './audio/engine.ts';
import { ensureWindyInitialized, traceProgram } from './interpreter/windy.ts';
import './App.css';

const DEFAULT_PROGRAM = `→ 1 2 + . @
`;

const EXAMPLES: Record<string, string> = {
  'east-add': '→ 1 2 + . @\n',
  'spiral': `→ 7 0 g . v
^         <
@ . g 0 0 ←
`,
  'gust-rotate': `→ 4 ≫ ↘ ↙ ↖ ↗ @
`,
  'storm': `→ t @
   ↑
   <
`,
};

function App() {
  const [bpm, setBpm] = useState(360);
  const [code, setCode] = useState(DEFAULT_PROGRAM);
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const [info, setInfo] = useState<{ events: number; durationSec: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<SequenceEngine | null>(null);

  useEffect(() => {
    void ensureWindyInitialized();
  }, []);

  function ensureEngine(): SequenceEngine {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
      engineRef.current = new SequenceEngine(ctxRef.current);
    }
    return engineRef.current!;
  }

  async function handlePlay() {
    setError(null);
    setStatus('loading');
    try {
      await ensureWindyInitialized();
      const events = traceProgram(code);
      if (events.length === 0) {
        setError('실행 가능한 instruction이 없습니다 — 코드를 확인하세요.');
        setStatus('error');
        return;
      }
      const engine = ensureEngine();
      engine.setBpm(bpm);
      await engine.resume();
      engine.play(events);

      const totalSec = events.length * (60 / bpm) + 0.5;
      setInfo({ events: events.length, durationSec: totalSec });
      setStatus('playing');
      window.setTimeout(() => setStatus('idle'), totalSec * 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }

  function loadExample(key: string) {
    const program = EXAMPLES[key];
    if (program) setCode(program);
  }

  const playing = status === 'playing';
  const loading = status === 'loading';

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
            <button onClick={handlePlay} disabled={loading || playing}>
              {playing ? '▶ 재생 중' : loading ? '준비 중…' : '▶ 재생'}
            </button>
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
            </span>
          </div>
          <textarea
            className="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            rows={10}
          />
          <div className="status">
            {error && <span className="error">에러: {error}</span>}
            {!error && info && (
              <span>
                {info.events} instruction · {info.durationSec.toFixed(1)}초
              </span>
            )}
            {!error && !info && (
              <span className="hint">
                windy-lang 코드를 입력하고 재생을 누르세요. 예제를 선택해도 됩니다.
              </span>
            )}
          </div>
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

export default App;
