import { useRef, useState } from 'react';
import { SequenceEngine, demoSequence } from './audio/engine.ts';
import './App.css';

function App() {
  const [bpm, setBpm] = useState(240);
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<SequenceEngine | null>(null);

  function ensureEngine(): SequenceEngine {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
      engineRef.current = new SequenceEngine(ctxRef.current);
    }
    return engineRef.current!;
  }

  async function handlePlay() {
    const engine = ensureEngine();
    engine.setBpm(bpm);
    await engine.resume();
    const events = demoSequence();
    engine.play(events);

    setPlaying(true);
    // 시퀀스 길이 만큼 후에 playing 해제 (시각적 피드백)
    const totalSec = events.length * (60 / bpm) + 0.5;
    window.setTimeout(() => setPlaying(false), totalSec * 1000);
  }

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
          <div className="row">
            <label>
              BPM
              <input
                type="number"
                min={60}
                max={600}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
              />
            </label>
            <button onClick={handlePlay} disabled={playing}>
              {playing ? '▶ 재생 중' : '▶ 데모 시퀀스 재생'}
            </button>
          </div>
          <p className="hint">
            v1 — windy-lang 인터프리터 통합 전. 35 opcode 매핑 검증용 합성 시퀀스.
          </p>
        </section>

        <section className="panel">
          <h2>다음 마일스톤</h2>
          <ol>
            <li>
              <s>풍향 → 사운드 매핑 + Web Audio 신디 + 합성 시퀀스 재생</s>{' '}
              <span className="check">✓ done</span>
            </li>
            <li>windy-lang 인터프리터 실시간 통합 (이벤트 구독)</li>
            <li>2D 커서 시각화 + 코드 에디터 + 트랜스포트</li>
            <li>WAV export + 공유 URL + 갤러리 + 배포</li>
          </ol>
        </section>
      </main>

      <footer>
        <a href="https://github.com/sisobus/windy-aria" target="_blank" rel="noreferrer">
          github.com/sisobus/windy-aria
        </a>
      </footer>
    </div>
  );
}

export default App;
