# Wind → Sound mapping (v1)

This document defines how each of windy-lang's 35 opcodes is rendered to sound. Section structure follows SPEC v2.0 §4's opcode taxonomy verbatim.

## Design principles

1. **Winds carry the melody.** The eight wind directions own pitch, and the IP's path through them is the tune.
2. **Digits are data tones.** The 0–9 PUSH_DIGITs sit on a separate pitch group so the ear hears "data being pushed" as a distinct layer.
3. **Everything else is texture.** Arithmetic, stack, branch, and I/O ops differ by timbre and short bursts rather than by pitch — they don't compete with the melody.
4. **C major pentatonic baseline.** No combination produces dissonance. Even simple programs are listenable.
5. **Direction rotation = pitch motion.** Clockwise rotation (N → NE → E → SE → S → SW → W → NW) maps to monotonic pitch motion, so a clean rotation reads as a clean ascent or descent.

## Winds (9)

C major pentatonic (C, D, E, G, A) spread over two octaves. The eight clockwise winds climb one step at a time from C4 to G5.

| Glyph | Opcode | MIDI | Hz | Note | Timbre |
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

ASCII aliases (`>`, `^`, `<`, `v`) share the same mapping as their Unicode counterparts.

Duration: winds are **0.18 s** — short sustained notes that flow with the IP's progress.

## Digits (literal, 10)

`0`–`9` PUSH_DIGITs sit one octave above the winds, on a triangle timbre, so the digit layer is clearly separable. A digit firing means data was just pushed — that should feel like a different audible layer.

| Digit | MIDI | Hz | Note |
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

Duration: **0.12 s** — short, defined ping.

## Flow (4)

| Glyph | Opcode | Sound | Meaning |
|-------|--------|--------|------|
| (space)·`·` | NOP | silence (0.10 s rest) | static — IP traversing an empty cell |
| `@` | HALT | C3 sine, 0.40 s, fade out | termination — one IP retires |
| `#` | TRAMPOLINE | short square blip, 800 Hz, 0.05 s | "skip" — the tone is brief on purpose |
| `t` | SPLIT | sine an octave up, 0.20 s, new voiceId | polyphony fork — IP branches |

## Speed (2)

GUST and CALM are rendered as **glissandi** (frequency sweeps) rather than fixed pitches. Acceleration and deceleration come through aurally as motion.

| Glyph | Opcode | Sound |
|-------|--------|--------|
| `≫` | GUST | 200 Hz → 800 Hz rising sweep, sine, 0.18 s |
| `≪` | CALM | 800 Hz → 200 Hz falling sweep, sine, 0.18 s |

## Arithmetic (7)

Arithmetic is **a square-wave one-shot burst** — a hard, defined texture. Pitch is loosely matched to the operation, but timbre carries the identity.

| Glyph | Opcode | Hz | Length | Timbre |
|-------|--------|------|------|--------|
| `+` | ADD | 392 (G4) | 0.08 | square |
| `-` | SUB | 349 (F4) | 0.08 | square |
| `*` | MUL | 523 (C5) | 0.08 | square |
| `/` | DIV | 466 (Bb4) | 0.08 | square |
| `%` | MOD | 311 (Eb4) | 0.08 | square |
| `!` | NOT | 880 (A5) | 0.06 | square |
| `` ` `` | GT | 988 (B5) | 0.06 | square |

## Stack (3)

Stack ops are **square-wave short bursts** — same timbre family as arithmetic, even shorter.

| Glyph | Opcode | Hz | Length |
|-------|--------|------|------|
| `:` | DUP | 698 (F5) | 0.06 |
| `$` | DROP | 220 (A3) | 0.06 |
| `\` | SWAP | 587 (D5) | 0.06 |

## Branch (2)

| Glyph | Opcode | Sound |
|-------|--------|--------|
| `_` | IF_H | dual-tone — 200 Hz + 400 Hz square, 0.10 s |
| `\|` | IF_V | dual-tone — 300 Hz + 600 Hz square, 0.10 s |

## I/O (4)

I/O uses a sawtooth timbre — the most distinct family in the palette. These are the moments the program touches the outside world, so they get an audible marker.

| Glyph | Opcode | Sound |
|-------|--------|--------|
| `.` | PUT_NUM | C5 sawtooth, 0.15 s — bell-like |
| `,` | PUT_CHR | A5 sawtooth, 0.10 s — chime |
| `&` | GET_NUM | C3 sawtooth, 0.20 s — low rumble |
| `?` | GET_CHR | E5 sawtooth, 0.05 s — click |

## Grid memory (2)

| Glyph | Opcode | Sound |
|-------|--------|--------|
| `g` | GRID_GET | side-glissando G4 → C5, sawtooth, 0.10 s |
| `p` | GRID_PUT | side-glissando C5 → G4, sawtooth, 0.10 s |

## Future extensions

- **Multi-IP polyphony.** IPs spawned by SPLIT play on a separate voice channel (a distinct timbre layer). At v1 only `voiceId` is separated; live polyphony lands once windy-lang exposes `current_op_for(ip_index)`.
- **Position modulation.** Grid `(x, y)` modulates pan, detune, or filter cutoff, so the same opcode at different cells colors slightly differently — richer sonification.
- **Speed modulation.** Per-IP wind speed shifts BPM or envelope decay locally.
- **Collision-merge effect.** When two IPs merge, the merge tick plays both notes as a chord or a crossfade.
- **User-custom mappings.** Export/import the mapping table as JSON.

## Version history

- **v1 (2026-05-04).** Initial table. All 35 opcodes mapped. C major pentatonic baseline. Used to validate hardcoded sequences before the windy-lang interpreter integration landed.
