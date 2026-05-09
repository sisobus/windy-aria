# windy-aria

> A sonification of [windy-lang](https://github.com/sisobus/windy) — the wind is the melody.

[![Deploy](https://github.com/sisobus/windy-aria/actions/workflows/deploy.yml/badge.svg)](https://github.com/sisobus/windy-aria/actions/workflows/deploy.yml)
[![npm: windy-lang](https://img.shields.io/npm/v/windy-lang.svg)](https://www.npmjs.com/package/windy-lang)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Listen in your browser:** **[windy.sisobus.com/aria](https://windy.sisobus.com/aria)**

```
           ↘
        →→→↘→↘
    ~ →↗    " →·↘
 ~~  ↗sisobusY   ↓ ~*
  ↗ ↗ →:#,_↘  D  ·  ↙
    ↑  ↖  →t←  " ↓
 ~* ↑←  ↖←"WIN"←←↙
      ↖·←     ↙·← ~↙
         ↖←←·←
```

The same program, played as music: the IP traces a wind-tunnel path
through the grid; every wind glyph it visits sounds a pentatonic note;
digits land an octave up; arithmetic and stack ops thicken the texture
underneath. Run `examples/main.wnd` and you hear the path the IP takes.

## What it is

windy-aria turns running a [windy](https://github.com/sisobus/windy)
program into playing a piece of music. The same WebAssembly interpreter
that powers [windy.sisobus.com](https://windy.sisobus.com) drives a
Web Audio synth in this page — every tick of the windy main loop emits
an `InstructionEvent`, the engine maps it to a sound, and the
sequencer schedules it at the BPM you've dialed in.

This is **not a tracker** and **not a DAW** — there's no separate
score. The score *is* the windy source. Edit the `.wnd`, hear the
edit. Closer in spirit to [ORCA](https://100r.co/site/orca.html) than
to [Sonic Pi](https://sonic-pi.net/), but with one twist: ORCA's
glyphs are arbitrary by design; windy's glyphs already mean something
about flow, and that meaning is what becomes the melody.

## Try it

```
windy.sisobus.com/aria
```

Pick an example, hit ▶ Play. The default tempo is 360 BPM (one tick
≈ 167 ms); slow it to 120 if you want to hear individual digits.
Press ⏸ Debug instead to step through one instruction at a time and
hear each opcode in isolation — the same panel surfaces the IP's
position, direction, stack, and live IP count.

## How the sonification works

The 35-opcode windy SPEC partitions cleanly into voices:

| Group | Opcodes | Sound |
|---|---|---|
| **Eight winds** | `→ ↗ ↑ ↖ ← ↙ ↓ ↘` | C major pentatonic, C4–E5 (sine, ~180 ms). The IP's path *is* the melody. |
| **Digits 0–9** | `0` … `9` | Pentatonic an octave up, C5–A6 (triangle, ~120 ms). Data lights up as a separate layer. |
| **Wind speed** | `≫` `≪` | Glissando 200→800 / 800→200 Hz (sine sweep). Acceleration becomes pitch sweep. |
| **Turbulence** | `~` | Bandpass noise (~150 ms). |
| **Halt / split / trampoline** | `@` `t` `#` | Low sine fade, octave-up sine, square blip. |
| **Arithmetic & stack** | `+ - * / % ! \` ` ` ` `: $ \` | Square bursts, ~80 ms. |
| **I/O & branches & grid** | `. , & ? _ \| g p` | Sawtooth bursts, ~100–200 ms. |
| **String mode** | `"` | Sawtooth pluck. |
| **NOP** | (space) | Silence — breathing room. |

Frequencies, durations, and the design rationale live in
[`docs/MAPPING.md`](docs/MAPPING.md).

### Why C major pentatonic

The wind glyphs cycle clockwise (N → NE → E → SE → S → SW → W → NW),
and the pentatonic scale never produces a dissonant interval against
itself. Any path through the grid is listenable; spirals sound like
spirals; a head-on collision halt drops cleanly to silence.

## Run locally

```bash
git clone https://github.com/sisobus/windy-aria.git
cd windy-aria
pnpm install
pnpm dev          # http://localhost:5173
```

That's it — windy-lang is pulled from npm, no Rust toolchain
required. Node ≥ 20.19 (or ≥ 22.12) is the only host requirement
(Vite 8).

```bash
pnpm build        # static bundle → dist/ (~250 KB JS + 125 KB wasm gzipped)
pnpm typecheck    # tsc -b --noEmit
pnpm preview      # serve dist/ locally
```

## Examples

`src/examples/` ships the same `.wnd` programs as
[`sisobus/windy`](https://github.com/sisobus/windy/tree/main/examples) —
they're synced via `pnpm sync:examples` from the sibling repo when
new examples land. A few highlights:

- **`hello.wnd`** — a single row, 28 cells. Pushes "Hello, World!"
  in reverse, prints, halts. The shortest first listen.
- **`anthem.wnd`** — clockwise diagonal-cornered spiral, prints
  "code flows like wind", then SPLITs and halts via head-on
  collision merge. No `@` in the source.
- **`gust.wnd`** — `≫` doubles the IP speed and the layout becomes
  a `$/,` obstacle course — the speed-2 IP threads the print cells
  to spell "WINDY". Wind speed is the audible mechanic.
- **`storm.wnd`** — pure collision-merge demo: two IPs traverse the
  same row in opposite directions and cancel head-on at column 4.
- **`stars.wnd`** — counter-loop drawing a 5-row star triangle via
  grid memory (`g` / `p`).
- **`puzzle.wnd`** / **`puzzle_hard.wnd`** — multi-IP password
  puzzles. Two/four IPs print interleaved digits as they cross the
  same row, then merge head-on. v2 of `puzzle_hard` runs four IPs
  simultaneously with asymmetric timing.

You can also click 🎲 random — a bounded self-avoiding walk
generator drops a fresh terminating program with deterministic halt
guarantees. Useful for ear-training the mapping.

## Architecture

```
windy-lang (npm: windy-lang@^2.1.0)
  └─ Session API ──── tick by tick ───→ InstructionEvent stream
                                              │
                          ┌───────────────────┴───────────────────┐
                          ▼                                       ▼
              src/audio/mapping.ts                         src/interpreter/windy.ts
              opcode → SoundEvent                          drives Session.step()
                          │
                          ▼
              src/audio/synth.ts
              Web Audio (osc + ADSR + noise + glissando)
                          │
                          ▼
              src/audio/engine.ts
              BPM-paced scheduling
```

- **windy-lang** is consumed as a regular npm dependency;
  `wasm-pack build --target web` artifacts ship inside the package.
  No `wasm-pack` or Rust required to develop windy-aria.
- **Frontend-only.** No server. No external API. No model download.
  Vite SPA, Web Audio API, ~80 KB JS gzipped. Same thesis as
  [pokemon-ai.com](https://pokemon-ai.com).
- **Cap-protected playback.** Programs that don't halt within
  4000 steps / 500 events are refused — the engine surfaces a
  "code does not halt" error instead of scheduling minutes of
  silent NOP audio.

## Documentation

- **[`docs/MAPPING.md`](docs/MAPPING.md)** — complete opcode →
  sound table with frequencies, durations, and design rationale.
- **[`CLAUDE.md`](CLAUDE.md)** — development context for AI
  pair-programming.
- **[`SPEC.md` over in `sisobus/windy`](https://github.com/sisobus/windy/blob/main/SPEC.md)**
  — the windy language specification. windy-aria's mapping is
  organized around §4's opcode taxonomy.

## Author

Crafted by **Kim Sangkeun** ([@sisobus](https://github.com/sisobus)).
