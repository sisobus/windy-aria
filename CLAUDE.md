# windy-aria

windy-lang으로 작성된 코드를 음악으로 출력하는 sonification 도구.

## 개요

[windy-lang](https://github.com/sisobus/windy)은 2D 풍향 기호 기반 esolang이다. windy-aria은 그 코드를 그대로 들리게 한다 — 풍향이 음정·리듬·강세로 매핑되어, **windy 코드를 실행하는 것이 곧 곡을 재생하는 것**이 된다.

위치 짓기: ORCA(2D 라이브 코딩 음악 언어, by Hundred Rabbits) 옆 자리. 차이점은 windy의 풍향 시맨틱이 그대로 음악적 의미가 된다는 것 — 임의 기호의 박자 짜기가 아니라 의미 보존 sonification.

자매 repo: [sisobus/windy](https://github.com/sisobus/windy)

## 핵심 thesis

**Frontend-only.** 100% 브라우저, 서버 없음, 모델 다운로드 없음. windy-lang WASM 인터프리터 + Web Audio API만으로 동작. 같은 thesis: pokemon-ai.com.

이 thesis는 절대 깨지 않는다. 외부 API 호출, 서버 사이드 처리, 모델 다운로드는 모두 금지.

## Scope

### In scope (v1)

- windy-lang 프로그램의 sonification (실행 = 재생)
- 풍향 기호 → 사운드 매핑 정의
- 브라우저 라이브 재생 + 2D 커서 시각화
- WAV export (오프라인 렌더)
- 공유 URL (코드 + 설정 인코딩)
- 큐레이션된 windy 곡 갤러리

### Out of scope

- AI/SLM 기반 작곡 (분리 가능성: 추후 별도 windy-composer)
- 트래커식 셀 기반 작곡 UI (작곡은 windy-lang 자체로 함)
- 풀 DAW 기능
- 모바일 앱, 네이티브 빌드 (브라우저 우선)

## 아키텍처

```
windy-lang (별도 repo)               windy-aria (이 repo)
─────────                            ─────────
  WASM 인터프리터                       사운드 매핑 (풍향 → 음)
  + instruction 실행 이벤트 hook ──→   Web Audio 합성기
                                       2D 커서 시각화
                                       WAV export, 공유, 갤러리
```

windy-lang core에 instruction 실행 이벤트 hook을 추가해야 한다. 이는 sonifier 전용 기능이 아니라 **generic event API** — 추후 디버거·시각화·프로파일러 등 다른 lens도 같은 hook을 재사용한다. 변경은 windy-lang 별도 PR로, 핵심 코드를 이 repo에 복사하지 않는다.

## 기술 스택

모든 의존성은 **최신 버전** 사용 정책. lockfile에 메이저 버전 고정, 마이너·패치는 dependabot 또는 수동 업데이트로 따라간다.

- **패키지 매니저**: pnpm (최신)
- **런타임**: Node.js 최신 LTS
- **언어**: TypeScript (최신)
- **번들러**: Vite (최신)
- **UI 프레임워크**: React 19 (최신)
- **오디오**: Web Audio API (사인/사각/삼각/톱니파 + ADSR + 단순 필터). 외부 오디오 라이브러리 최소화
- **windy-lang 의존**: npm 패키지 또는 git submodule 형태로 wasm artifact 참조
- **배포**: GitHub Pages 또는 windy.sisobus.com 하위 경로

### 프레임워크 결정 기록

**Next.js 검토 후 Vite + React SPA 채택**. 이유:

- Frontend-only thesis상 SSR/서버 라우팅 불필요
- 단일 페이지 앱에 가까움 (에디터·플레이어·갤러리 모두 한 화면 또는 단순 라우팅)
- 정적 export로 GitHub Pages 직배포 가능
- 번들 크기 우선 (1MB 미만 목표 + windy-lang wasm)

향후 SSR이 필요한 시점이 오면 (예: 갤러리 SEO 강화) Next.js로 마이그레이션 검토.

## 풍향 → 사운드 매핑 (초안)

| 기호 | windy-lang 의미 | 음악적 매핑 |
|---|---|---|
| ↑ 북풍 | 위로 흐름 | 음정 상승 / 높은 음 |
| ↓ 남풍 | 아래로 흐름 | 음정 하강 / 낮은 음 |
| → 동풍 | 오른쪽 흐름 | 음정 유지 |
| ← 서풍 | 왼쪽 흐름 | 음정 -1 |
| ↗ ↘ ↖ ↙ | 대각 흐름 | 글리산도 |
| ↺ 회오리 | 루프 | 아르페지오 |
| ~ 잔잔 | 정지/대기 | 쉼표 |
| ≈ 강풍 | 가속 | 스타카토 버스트 |

위는 임의 초안. v1 구현 시 windy-lang `SPEC.md`의 실제 instruction set을 정독한 뒤 매핑을 정밀화한다. 매핑은 별도 `docs/MAPPING.md` 문서로 분리해 버전 관리한다.

## 프로젝트 구조

```
windy-aria/
├── src/
│   ├── interpreter/
│   │   └── windy.ts       # Session API step-by-step → InstructionEvent
│   ├── audio/
│   │   ├── synth.ts       # Web Audio 합성기 (osc + ADSR + noise + gliss)
│   │   ├── mapping.ts     # Opcode → SoundEvent
│   │   └── engine.ts      # 시퀀스 스케줄러 (BPM 기반)
│   ├── types.ts           # 35 opcode 타입 + 이벤트 타입
│   ├── App.tsx            # 메인 UI (코드 에디터 + Play)
│   └── main.tsx
├── docs/
│   └── MAPPING.md         # 풍향 → 사운드 매핑 v1 명세
├── index.html
├── package.json
├── tsconfig*.json
└── vite.config.ts
```

향후 추가 예정: `src/visualizer/` (2D 커서 애니메이션), `src/export/` (WAV/공유 URL), `public/songs/` (갤러리), `tests/`.

## 개발 규칙

- **Frontend-only thesis 절대 깨지 않음**: 서버 추가 금지, 외부 API 호출 금지, 모델 다운로드 금지
- **번들 크기 모니터링**: 초기 로드 1MB 미만 목표 (windy-lang wasm 포함)
- **windy-lang core 최소 침습**: 필요한 변경은 명세화해서 windy-lang 별도 PR로. 핵심 인터프리터 코드를 이 repo로 복사 금지
- **첫 사용자는 본인**: 갤러리에 본인이 작성한 windy 곡 ~30개 깔고 출시. 악기는 만든 사람이 먼저 써봐야 함
- **차별화 한 줄**: "ORCA는 임의 기호로 박자 짜는 도구, windy-aria은 바람의 흐름이 곧 음악이 되는 언어." 이 라인이 모든 외부 커뮤니케이션의 기준

## 빌드 및 실행

### 사전 조건

- Node.js ≥ 20.19 또는 ≥ 22.12 (Vite 8 요구사항), pnpm
- 그 외 도구 불필요 — windy-lang은 npm registry의 정식 패키지로 받는다

### 첫 셋업

```bash
pnpm install     # windy-lang 포함 모든 의존성 설치
pnpm dev         # 개발 서버 (http://localhost:5173)
```

windy-aria는 자매 `../windy` 디렉토리 없이도 단독 클론으로 빌드된다. wasm-pack/Rust는 이 repo에서 필요 없다.

### 일상 명령

```bash
pnpm dev               # Vite dev (HMR)
pnpm build             # 정적 빌드 → dist/
pnpm preview           # 빌드 결과 로컬 서빙
pnpm typecheck         # tsc -b --noEmit
pnpm sync:examples     # ../windy/examples/*.wnd → src/examples/ (워크스페이스에서만)
```

### windy-lang 의존성 모델

`package.json`의 `windy-lang`은 npmjs.com에 publish된 정식 패키지 (`^2.1.0`)를 받는다. wasm-pack 산출물(`web/pkg`)이 그대로 npm 패키지로 발행되므로 추가 변환 없음.

windy SPEC을 만지면서 windy-aria로 즉시 검증해야 할 때:

1. `cd ../windy && wasm-pack build --target web --release --out-dir web/pkg`
2. windy-aria의 `package.json`에 일시적으로 `pnpm.overrides` 추가 — 또는 `pnpm link --global`
   ```json
   "pnpm": { "overrides": { "windy-lang": "file:../windy/web/pkg" } }
   ```
3. `pnpm install` 후 dev 검증
4. PR이 merge + 새 v태그 push되어 npm publish 완료되면 override 제거하고 `windy-lang` 버전을 새 버전으로 올리고 `pnpm install`

매번 windy SPEC을 만지지 않는다면 그냥 npm publish 흐름을 기다리면 된다.

### examples 동기화

`src/examples/*.wnd`은 windy repo의 `examples/`에서 카피된다. windy 측에 새 예제가 추가되면 `pnpm sync:examples`로 동기화 후 commit. 워크스페이스 (`../windy` 존재) 환경에서만 동작.

## 배포

- 1차 운영 중: **windy.sisobus.com/aria** (S3 + CloudFront, windy 본 페이지와 같은 distribution)
- windy-aria 자체 GitHub Actions 워크플로우 (`.github/workflows/deploy.yml`) 가 master push 시 `s3://windy-language-web/aria/` 로 sync + `/aria/*` invalidation
- CloudFront `rewrite-html` 함수가 `/aria` → 301 `/aria/`, `/aria/` → `/aria/index.html` 처리
- windy 본 deploy.yml 은 `--exclude "aria/*"` 로 이 prefix 보존

## 현재 상태 (2026-05-09 기준)

### 완료 (v1 in-scope 중)

- ✅ **windy-lang sonification** — Session API 를 step-by-step 으로 driving 하며 35 opcode → SoundEvent 매핑
- ✅ **풍향 → 사운드 매핑 v1** (`docs/MAPPING.md`, `src/audio/mapping.ts`)
- ✅ **브라우저 라이브 재생** + Play / Debug 모드, BPM 조절, 무한루프 cap 가드
- ✅ **Random 프로그램 생성기** (self-avoiding 2D walk + 종료 보장 HALT)
- ✅ **windy-lang npm 의존** — workspace 가정 제거, 단독 클론 + `pnpm install` 로 동작
- ✅ **examples 17개 번들** (windy/examples 와 sync, `pnpm sync:examples`)
- ✅ **배포** + windy ↔ windy-aria 양방향 cross-link
- ✅ **영문 surface** (UI / README / repo description)

### v1 in-scope 중 미완

| 영역 | 위치 / 비고 |
|---|---|
| 2D 커서 시각화 | `src/visualizer/` (디렉토리 아직 없음). 현재는 Debug 패널의 텍스트 좌표 |
| WAV export (오프라인 렌더) | `src/export/wav.ts` 예정. `OfflineAudioContext` 사용 |
| 공유 URL (코드 + BPM 인코딩) | `src/share/url.ts` 예정. windy 본 페이지의 `#s=...` 컨벤션 정렬 |
| 큐레이션된 windy 곡 갤러리 (~30곡) | `public/songs/` 또는 `src/songs/`. 현재 examples 17개는 SPEC 데모용 |

### v1.1 후속

| 영역 | 비고 |
|---|---|
| 다중 IP polyphony | windy-lang 에 `current_op_for(ip_index)` API 추가 필요 (cross-repo). 현재 primary IP 만 sonify |
| `docs/MAPPING.md` 영문화 | 프로젝트 외부 surface 는 모두 영문이지만 이 문서만 한국어 |

## 다음 세션 프롬프트

각 항목은 **이 windy-aria 디렉토리에서 새 Claude Code 세션을 열고** 그대로 붙여넣으면 됩니다. 권장 진행 순서: 1 → 2 → 3 → 4 → 5 → 6.

### 1. 2D 커서 시각화 (가장 효과 큰 작업)

```
windy-aria 의 v1 in-scope 중 "2D 커서 시각화" 를 구현해줘. 현재는 Debug
패널이 IP 위치를 텍스트로만 보여주는데, 같은 코드 옆에 grid 뷰를 붙여서
재생 중에 IP가 어느 셀에 있는지 실시간 하이라이트가 따라가야 한다.

요구사항:
- Play 모드: BPM 에 맞춰 audio 재생과 sync 된 하이라이트가 grid 위를 움직임
- Debug 모드: Step 누를 때마다 하이라이트가 다음 셀로 이동
- 살아있는 IP 가 여러 개일 때 각각 다른 색 (현재는 primary IP 만 사
  onify 되더라도 시각화는 모든 IP 보여줄 것 — 실행 자체는 multi-IP 됨)
- monospace 폰트, 코드 에디터와 같은 그리드 정렬
- 다크 / 라이트 모두 가독성 OK

새 디렉토리: src/visualizer/. 기존 src/interpreter/windy.ts 의
WindyDebugger 가 이미 ip_x/ip_y/dx/dy/ip_count 를 노출하므로 그걸 구독.
src/App.tsx 의 패널 옆에 시각화 컴포넌트 추가. CLAUDE.md 의 "남은 v1
in-scope 항목" 표에서 이 항목 완료 처리.

frontend-only thesis 절대 깨지 않음 (서버 추가 X, 외부 호출 X). 번들
크기 1MB 미만 유지. UI 텍스트 모두 영문. 작업 끝나면 pnpm build / pnpm
typecheck 통과 + 로컬 dev 서버에서 examples/anthem.wnd 와 storm.wnd
재생하며 동작 확인 후 commit + push.
```

### 2. 큐레이션된 곡 갤러리 (사용자 본인이 첫 작곡가)

```
windy-aria 의 v1 마지막 in-scope 항목 "큐레이션된 windy 곡 갤러리" 를
시작하자. 현재 src/examples/ 에 있는 17개는 windy SPEC 데모용 (hello,
factorial, anthem 등) 이라 음악적으로 들으려고 만든 것이 아니다. 음악
청취 목적의 곡 30개 정도를 별도 갤러리로 만들고 싶다.

이 작업은 두 단계로 나눈다:

(a) 인프라
- 새 디렉토리: src/songs/*.wnd
- src/App.tsx 에 갤러리 panel 추가 — 곡 이름 + 짧은 설명 + 재생 버튼
- import.meta.glob 으로 빌드 타임 번들 (examples 와 같은 패턴)
- 메타데이터: 각 곡에 title / 작곡 의도 한 줄 / 권장 BPM 을 frontmatter
  주석으로

(b) 첫 5–10곡 시드
- CLAUDE.md "첫 사용자는 본인" 원칙 — 메인테이너가 직접 작곡할 곡들이지만,
  세션에서는 "음악적으로 들리는 windy 패턴" 5–10개 시드를 만들어 줘 (예:
  spiral with diagonal corners, descending pentatonic via clockwise wind
  rotation, call-and-response via t SPLIT, etc.). 각 곡은 4000 step cap
  안에 halt 해야 함.

frontend-only thesis 유지, 영문 메타데이터, build/typecheck 통과 후 commit
+ push. CLAUDE.md 의 진행 상태 업데이트.
```

### 3. 공유 URL

```
windy-aria 에 "공유 URL" 기능을 추가하자. 사용자가 작성한 코드와 BPM 을
URL hash 로 인코딩해서 링크 한 번으로 같은 청취 상태를 재현할 수 있어야 함.

요구사항:
- URL 포맷: #s=<base64url(deflate(source))>&bpm=<n>
- CompressionStream API 로 deflate (Web 표준, 외부 라이브러리 0)
- "Copy share link" 버튼 — 클릭 시 navigator.clipboard.writeText + 토스트
- 페이지 로드 시 hash 가 있으면 에디터 자동 채움
- hash 가 없거나 디코드 실패 시 graceful fallback (default hello.wnd)
- URL 길이 8KB 미만 유지 (CloudFront / 브라우저 한계)

windy 본 페이지가 이미 #s=... 컨벤션을 쓰는지 확인하고 (web/main.js 보거나
URL 구조 비교) 같은 인코딩이면 호환되게 정렬할 것.

새 모듈: src/share/url.ts. App.tsx 에 버튼 추가. UI 텍스트 영문.
frontend-only thesis 유지. build/typecheck 통과 후 commit + push.
CLAUDE.md 의 "남은 v1 in-scope 항목" 에서 이 항목 완료 처리.
```

### 4. WAV export

```
windy-aria 에 WAV export 기능을 추가하자. 현재 코드를 오프라인으로 렌더해서
.wav 파일로 다운로드.

구현 방향:
- src/export/wav.ts (신규)
- OfflineAudioContext (sampleRate 44100, mono 또는 stereo) 로 렌더
- 기존 src/audio/synth.ts / src/audio/engine.ts 가 받는 ctx 를 추상화해서
  AudioContext 와 OfflineAudioContext 모두 받도록 (이미 되어 있을 가능성
  높음 — synth 가 그냥 BaseAudioContext 면 ok)
- AudioBuffer → WAV 인코딩 (44바이트 RIFF 헤더 직접 작성, 외부 의존성 0)
- App.tsx 에 "Download WAV" 버튼 — 파일명 `windy-aria-${bpm}bpm-${ts}.wav`

frontend-only thesis 유지, 외부 라이브러리 추가 금지, 번들 크기 1MB 미만.
영문 UI. build/typecheck 통과 + 실제로 hello.wnd 와 anthem.wnd 의 wav
받아서 재생 가능 확인 후 commit + push. CLAUDE.md 진행 상태 업데이트.
```

### 5. docs/MAPPING.md 영문화

```
windy-aria 의 docs/MAPPING.md 가 한국어로 남아있는데, 프로젝트의 다른 모든
external surface (README, UI, source comments, repo description) 는 영문이라
일관성이 깨진다. 이 문서를 영문으로 옮겨줘.

- 코드 변경 0 — 순수 문서 작업
- 톤은 windy/SPEC.md 와 windy-aria/README.md 에 맞춤 (technical, 직설적)
- 표 / 주파수 / 매핑 명세는 그대로 보존, 한국어 산문만 번역
- 번역 끝나면 README.md 에 있는 "*(Currently in Korean — English
  translation pending.)*" 주석 제거
- CLAUDE.md "v1.1 후속" 에서 이 항목 완료 처리

commit + push.
```

### 6. 다중 IP polyphony (cross-repo, v1.1)

```
windy-aria 가 SPLIT 으로 분기된 IP 들을 별도 voice 로 합성하도록 만들고 싶다.
현재는 primary IP 만 sonify 됨 (src/interpreter/windy.ts 의 `currentEvent()`
가 session.current_op() 만 호출 → ip 0 의 opcode만 반환).

이 작업은 windy 와 windy-aria 양쪽 변경이 필요한 cross-repo 작업이다:

1) windy 쪽 (별도 세션, windy 디렉토리에서 진행 권장)
   - src/web/session.rs 에 `current_op_for(&self, ip_index: usize) -> String` 추가
   - 기존 current_op() 는 current_op_for(0) 으로 위임
   - tests + conformance 통과
   - 패치 + Cargo.toml minor bump (2.1.0 → 2.2.0) + tag push → cargo + npm publish 자동화

2) windy-aria 쪽 (이 세션 / 새 세션 어느 쪽이든)
   - package.json: windy-lang ^2.2.0 으로 bump
   - src/interpreter/windy.ts 의 collectRemaining() 이 모든 ip_index 를 순회하며
     각 IP 의 InstructionEvent 를 voiceId = ip_index 로 emit
   - src/audio/mapping.ts 와 synth.ts 는 이미 voiceId 를 받음 — 큰 변경 없음
   - src/App.tsx 의 Debug 패널은 이미 ipCount 표시 중

CLAUDE.md 의 "v1.1 후속" 에서 이 항목 완료 처리. examples/winds.wnd (5 IPs)
와 anthem.wnd (collision merge) 로 청취 검증.
```

## 참고

- [ORCA](https://100r.co/site/orca.html) — 가장 가까운 선례. 2D 라이브 코딩 음악 언어
- TidalCycles, Strudel, Sonic Pi — 1D 라이브 코딩 비교군
- [Web Audio API MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [windy-lang repo](https://github.com/sisobus/windy)
