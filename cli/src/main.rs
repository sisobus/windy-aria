//! `windy-aria` — offline sonification CLI.
//!
//! Walks a windy-lang program one tick at a time, maps each live IP's
//! current opcode to a `SoundEvent` (frequency / duration / velocity /
//! timbre), renders the events into a PCM sample buffer with simple
//! ADSR-shaped oscillators, and writes a 16-bit mono WAV.
//!
//! The mapping table mirrors `src/audio/mapping.ts` in the parent
//! windy-aria web app — same opcode→note relationships, but rendered
//! offline so a `.wnd` source becomes a `.wav` file in one shot
//! without needing the browser. Designed to also work as a windy-lang
//! CLI plugin: `windy aria foo.wnd` execs `windy-aria foo.wnd`.

mod mapping;
mod render;
mod trace;

use std::path::PathBuf;
use std::process::ExitCode;

use anyhow::{Context, Result};
use clap::Parser;

#[derive(Parser)]
#[command(
    name = "windy-aria",
    version,
    about = "Render a windy-lang program to a WAV file via opcode→sound mapping."
)]
struct Cli {
    /// `.wnd` source file.
    program: PathBuf,

    /// Output WAV path (default: same path with `.wav` extension).
    #[arg(short, long)]
    output: Option<PathBuf>,

    /// Beats per minute — controls how fast ticks elapse in the rendered audio.
    #[arg(long, default_value_t = 240)]
    bpm: u32,

    /// PCM sample rate (Hz).
    #[arg(long, default_value_t = 44100)]
    sample_rate: u32,

    /// VM PRNG seed for the `~` (turbulence) opcode. Without it the run uses
    /// a non-deterministic system seed.
    #[arg(long)]
    seed: Option<u64>,

    /// Hard cap on VM ticks. Programs that exceed the cap are still rendered
    /// up to the cap and the render keeps going.
    #[arg(long, default_value_t = 100_000)]
    max_steps: u64,

    /// Master output gain, applied to the final mixed buffer before
    /// 16-bit quantization. `1.0` is unity; lower to avoid clipping on
    /// dense polyphonic runs.
    #[arg(long, default_value_t = 0.8)]
    gain: f32,
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e:#}");
            ExitCode::from(1)
        }
    }
}

fn run() -> Result<()> {
    let cli = Cli::parse();

    let source = std::fs::read_to_string(&cli.program)
        .with_context(|| format!("failed to read {}", cli.program.display()))?;

    let output = cli.output.unwrap_or_else(|| cli.program.with_extension("wav"));

    eprintln!("windy-aria {} → {}", cli.program.display(), output.display());

    let events = trace::trace_program(&source, cli.seed, cli.max_steps);
    eprintln!("  ticks:     {}", events.last().map(|e| e.tick + 1).unwrap_or(0));
    eprintln!("  events:    {}", events.len());

    let samples = render::render(&events, cli.bpm, cli.sample_rate, cli.gain);
    let duration_sec = samples.len() as f32 / cli.sample_rate as f32;
    eprintln!("  duration:  {duration_sec:.2}s ({} samples @ {}Hz)", samples.len(), cli.sample_rate);

    write_wav(&output, &samples, cli.sample_rate)
        .with_context(|| format!("failed to write {}", output.display()))?;
    eprintln!("✓ wrote {}", output.display());

    Ok(())
}

fn write_wav(path: &std::path::Path, samples: &[f32], sample_rate: u32) -> Result<()> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(path, spec)?;
    for &s in samples {
        // Quantize f32 [-1, 1] to i16 with hard clip.
        let clipped = s.clamp(-1.0, 1.0);
        let q = (clipped * 32767.0).round() as i16;
        writer.write_sample(q)?;
    }
    writer.finalize()?;
    Ok(())
}
