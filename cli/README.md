# windy-aria

Offline sonification CLI for [windy-lang](https://github.com/sisobus/windy-lang). Renders a `.wnd` source file to a `.wav` audio file by mapping each opcode the VM executes to a short oscillator hit shaped by ADSR.

```bash
cargo install windy-aria

windy-aria programs/hi_windy.wnd                       # writes programs/hi_windy.wav
windy-aria programs/hi_windy.wnd -o my.wav             # custom output path
windy-aria programs/hi_windy.wnd --bpm 120             # slower tempo
windy-aria programs/hi_windy.wnd --sample-rate 48000   # studio sample rate
windy-aria programs/hi_windy.wnd --seed 42             # deterministic `~` (turbulence) runs
windy-aria programs/hi_windy.wnd --gain 0.6            # quieter master mix
```

Also works as a plugin for the [`windy`](https://crates.io/crates/windy-lang) CLI ≥ v2.3.0:

```bash
windy aria programs/hi_windy.wnd        # forwards to `windy-aria` in PATH
```

## What it does

1. Parses the `.wnd` source into a grid via the windy-lang library.
2. Walks every VM tick, snapshotting the opcode each live IP is about to execute. Multi-IP programs produce concurrent events that mix into one polyphonic timeline.
3. Maps each opcode through a lookup table (mirrors `src/audio/mapping.ts` in the parent web app) into `(frequency, duration, velocity, timbre)`.
4. Synthesizes each event with simple sine / triangle / square / sawtooth / noise oscillators + a short ADSR envelope, additively mixed into one mono PCM buffer.
5. Writes the buffer as 16-bit PCM WAV via [`hound`](https://crates.io/crates/hound).

No external services. No Docker. No browser. Just a Rust binary that reads `.wnd` and writes `.wav`.

## Mapping (v0.1)

| Opcode family | Sound character |
|---|---|
| `MOVE_*` (eight winds) | Sine notes on a circle-of-fifths-ish layout |
| Digits `0..9` | Triangle, pentatonic-ish over C5–A6 |
| Arithmetic (`+ - * / % ! >`) | Short square clicks |
| Stack (`: $ \`) | Short square clicks (different pitches) |
| Conditional (`_` `\|`) | Triangle |
| Grid (`g p`) | Triangle |
| I/O (`& , % .`) | Sawtooth |
| `t` SPLIT | High sine note (polyphony cue) |
| `@` HALT | Low sine note |
| `~` TURBULENCE | Filtered noise |
| `≫` GUST | Glissando 200 → 800 Hz |
| `≪` CALM | Glissando 800 → 200 Hz |

The frequencies, durations, velocities, and timbres are direct ports of the canonical table in the [windy-aria web app](https://github.com/sisobus/windy-aria) (`src/audio/mapping.ts`). The CLI tracks that table on a per-release basis.

## Flags

| Flag | Default | Meaning |
|---|---|---|
| `<PROGRAM>` | required | Path to `.wnd` source |
| `-o, --output` | `<program>.wav` | WAV output path |
| `--bpm` | `240` | Beats per minute; each VM tick = `60/bpm` seconds |
| `--sample-rate` | `44100` | PCM sample rate in Hz |
| `--seed` | (random) | VM PRNG seed for the `~` opcode |
| `--max-steps` | `100000` | Hard cap on VM ticks |
| `--gain` | `0.8` | Master gain before quantization |

## Status

v0.1 — single mono channel, no stereo placement per IP. Multi-IP polyphony works (concurrent events sum into the same samples) but every voice goes to the same channel; future versions may pan by `voice_id`. Glissando is implemented for GUST/CALM; non-band-limited oscillators may alias at the high-digit frequencies (≥ A6, 1760 Hz). None of this affects whether the file plays — just the audio quality ceiling.

The thesis of [windy-aria](https://github.com/sisobus/windy-aria) (the web app) is "frontend-only, serverless" — this CLI is a sister project that respects that thesis (no servers, no external services) while offering offline rendering for environments without a browser.

## License

MIT.
