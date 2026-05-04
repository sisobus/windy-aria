# 풍향 → 사운드 매핑 (v1)

이 문서는 windy-lang 35 opcode를 어떻게 소리로 옮기는지 정의한다. SPEC v2.0 §4의 opcode 분류를 그대로 따른다.

## 설계 원칙

1. **풍향이 멜로디의 척추**. 8 wind directions에 음정을 배정하고 IP 경로가 곧 멜로디가 된다.
2. **숫자가 데이터 음**. 디지트 0-9는 다른 음정 그룹으로 분리해 "데이터" 라는 의미를 청각화한다.
3. **나머지는 텍스처**. 산술·스택·브랜치·I/O는 음정보다 음색·짧은 burst로 차별화하여 멜로디를 방해하지 않는다.
4. **C major 펜타토닉 기반**. 어떤 조합이 와도 불협 없음. 단순한 음으로도 들을 만하다.
5. **방향 회전 = 음정 상승**. 시계방향(N → NE → E → SE → S → SW → W → NW)으로 회전시 음정이 한 방향으로 흐르도록 — 단조 회전이 단조 상승/하강이 됨.

## 풍향 (Wind, 9개)

C major 펜타토닉 (C, D, E, G, A) 두 옥타브 분포. 시계방향 8 wind는 C4부터 G5까지 한 칸씩 상승.

| Glyph | Opcode | MIDI | Hz | 음 | Timbre |
|-------|--------|------|------|------|--------|
| ↓ | MOVE_S | 60 | 261.63 | C4 | sine |
| ↙ | MOVE_SW | 62 | 293.66 | D4 | sine |
| ← | MOVE_W | 64 | 329.63 | E4 | sine |
| ↖ | MOVE_NW | 67 | 392.00 | G4 | sine |
| ↑ | MOVE_N | 69 | 440.00 | A4 | sine |
| ↗ | MOVE_NE | 72 | 523.25 | C5 | sine |
| → | MOVE_E | 74 | 587.33 | D5 | sine |
| ↘ | MOVE_SE | 76 | 659.25 | E5 | sine |
| ~ | TURBULENCE | — | — | (white noise) | noise |

ASCII alias (`>`, `^`, `<`, `v`)는 같은 매핑.

지속시간: 풍향은 **0.18초**(짧은 sustained note). IP의 진행 흐름을 따라 흐른다.

## 디지트 (Literal, 10개)

`0`-`9` PUSH_DIGIT은 펜타토닉 위 옥타브 + triangle 음색으로 풍향과 분리. 디지트가 등장 = 데이터가 push되는 순간이라 청각적으로 "다른 layer"여야 한다.

| 디지트 | MIDI | Hz | 음 |
|--------|------|------|------|
| 0 | 72 | 523.25 | C5 |
| 1 | 74 | 587.33 | D5 |
| 2 | 76 | 659.25 | E5 |
| 3 | 79 | 783.99 | G5 |
| 4 | 81 | 880.00 | A5 |
| 5 | 84 | 1046.50 | C6 |
| 6 | 86 | 1174.66 | D6 |
| 7 | 88 | 1318.51 | E6 |
| 8 | 91 | 1567.98 | G6 |
| 9 | 93 | 1760.00 | A6 |

지속시간: **0.12초** (짧고 또렷한 핑).

## 흐름 (Flow, 4개)

| Glyph | Opcode | 사운드 | 의미 |
|-------|--------|--------|------|
| (space)·`·` | NOP | 무음 (0.10초 쉼) | 정적 — IP가 빈 셀 통과 |
| `@` | HALT | C3 sine, 0.40초, 페이드 아웃 | 종지 — IP 한 명이 사라짐 |
| `#` | TRAMPOLINE | 짧은 사각파 blip, 800Hz, 0.05초 | "건너뛰기" — 톤이 짧음 |
| `t` | SPLIT | 옥타브 위 sine, 0.20초, 새 voiceId 시작 | 폴리포니 분기 — IP가 갈라짐 |

## 속도 (Speed, 2개)

GUST/CALM은 음정보다 **글리산도**(주파수 sweep)로 표현. 가속/감속이 청각적으로 직관적.

| Glyph | Opcode | 사운드 |
|-------|--------|--------|
| `≫` | GUST | 200Hz → 800Hz 상승 sweep, sine, 0.18초 |
| `≪` | CALM | 800Hz → 200Hz 하강 sweep, sine, 0.18초 |

## 산술 (Arithmetic, 7개)

산술은 **square wave 단발 burst**로 단단한 텍스처. pitch는 연산 의미에 약하게 매칭.

| Glyph | Opcode | Hz | 길이 | Timbre |
|-------|--------|------|------|--------|
| `+` | ADD | 392 (G4) | 0.08 | square |
| `-` | SUB | 349 (F4) | 0.08 | square |
| `*` | MUL | 523 (C5) | 0.08 | square |
| `/` | DIV | 466 (Bb4) | 0.08 | square |
| `%` | MOD | 311 (Eb4) | 0.08 | square |
| `!` | NOT | 880 (A5) | 0.06 | square |
| `` ` `` | GT | 988 (B5) | 0.06 | square |

## 스택 (Stack, 3개)

스택은 **square wave + 짧은 burst**. 산술과 같은 timbre 패밀리지만 더 짧음.

| Glyph | Opcode | Hz | 길이 |
|-------|--------|------|------|
| `:` | DUP | 698 (F5) | 0.06 |
| `$` | DROP | 220 (A3) | 0.06 |
| `\` | SWAP | 587 (D5) | 0.06 |

## 브랜치 (Branch, 2개)

| Glyph | Opcode | 사운드 |
|-------|--------|--------|
| `_` | IF_H | dual-tone — 200Hz + 400Hz square, 0.10초 |
| `\|` | IF_V | dual-tone — 300Hz + 600Hz square, 0.10초 |

## I/O (4개)

I/O는 sawtooth 음색으로 멜로디와 가장 차별화. 프로그램이 outside world와 상호작용하는 순간이라 청각적 마커.

| Glyph | Opcode | 사운드 |
|-------|--------|--------|
| `.` | PUT_NUM | C5 sawtooth, 0.15초 — bell 느낌 |
| `,` | PUT_CHR | A5 sawtooth, 0.10초 — chime |
| `&` | GET_NUM | C3 sawtooth, 0.20초 — 낮은 rumble |
| `?` | GET_CHR | E5 sawtooth, 0.05초 — click |

## 그리드 메모리 (2개)

| Glyph | Opcode | 사운드 |
|-------|--------|--------|
| `g` | GRID_GET | 사이드 글리산도 G4 → C5, sawtooth, 0.10초 |
| `p` | GRID_PUT | 사이드 글리산도 C5 → G4, sawtooth, 0.10초 |

## 향후 확장

- **다중 IP 폴리포니**: SPLIT으로 분기된 IP는 별도 voice channel(다른 timbre layer). 현재는 voiceId만 분리.
- **위치 modulation**: 그리드 (x, y) 좌표가 pan / detune / 필터 cutoff를 변조. 같은 opcode라도 그리드 위치에 따라 음색이 미세하게 달라져 sonification 풍부해짐.
- **속도 modulation**: IP의 wind speed가 BPM이나 envelope decay를 바꿈.
- **충돌 merge 효과**: IP 두 개가 합쳐질 때 두 음의 chord 또는 크로스페이드.
- **사용자 커스텀 매핑**: 매핑 테이블을 JSON으로 export/import.

## 버전 히스토리

- **v1 (2026-05-04)**: 초안. 35 opcode 모두 매핑. C major 펜타토닉 기반. windy-lang 통합 전 하드코딩 시퀀스 검증용.
