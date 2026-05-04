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

## 프로젝트 구조 (계획)

```
windy-aria/
├── src/
│   ├── interpreter/      # windy-lang 통합 (이벤트 구독)
│   ├── audio/            # 사운드 매핑 + Web Audio 합성기
│   ├── visualizer/       # 2D 커서 애니메이션
│   ├── export/           # WAV 인코딩, 공유 URL
│   └── ui/               # 에디터·트랜스포트·갤러리
├── public/
│   └── songs/            # 큐레이션 .wnd 곡 모음
├── docs/
│   ├── MAPPING.md        # 풍향 → 사운드 매핑 명세
│   └── ARCHITECTURE.md   # 인터프리터 통합 상세
├── tests/
└── README.md
```

## 개발 규칙

- **Frontend-only thesis 절대 깨지 않음**: 서버 추가 금지, 외부 API 호출 금지, 모델 다운로드 금지
- **번들 크기 모니터링**: 초기 로드 1MB 미만 목표 (windy-lang wasm 포함)
- **windy-lang core 최소 침습**: 필요한 변경은 명세화해서 windy-lang 별도 PR로. 핵심 인터프리터 코드를 이 repo로 복사 금지
- **첫 사용자는 본인**: 갤러리에 본인이 작성한 windy 곡 ~30개 깔고 출시. 악기는 만든 사람이 먼저 써봐야 함
- **차별화 한 줄**: "ORCA는 임의 기호로 박자 짜는 도구, windy-aria은 바람의 흐름이 곧 음악이 되는 언어." 이 라인이 모든 외부 커뮤니케이션의 기준

## 빌드 및 실행

(v1 셋업 후 작성)

## 배포

- 1차: GitHub Pages (windy-aria.sisobus.com 또는 windy.sisobus.com/music)
- 2차: 도메인 결정 후 마이그레이션

## 로드맵

| 주 | 마일스톤 |
|---|---|
| 1 | 풍향 → 사운드 매핑 v1 + Web Audio 신디 + 정적 .wnd 파일 재생 |
| 2 | windy-lang 인터프리터 실시간 통합 (이벤트 구독) |
| 3 | 2D 커서 시각화 + 에디터 UI + 트랜스포트 |
| 4 | WAV export + 공유 URL + 갤러리 + 배포 |
| 5+ | 커뮤니티 곡 받기, 매핑 정교화, 라이브 코딩 모드 |

v1 = 4주 후 windy 곡을 브라우저에서 작성·재생·공유 가능한 상태.

## 참고

- [ORCA](https://100r.co/site/orca.html) — 가장 가까운 선례. 2D 라이브 코딩 음악 언어
- TidalCycles, Strudel, Sonic Pi — 1D 라이브 코딩 비교군
- [Web Audio API MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [windy-lang repo](https://github.com/sisobus/windy)
