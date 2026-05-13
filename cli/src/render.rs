//! Offline audio renderer.
//!
//! Walks the InstructionEvent stream, maps each event to a SoundEvent
//! via `mapping`, and synthesizes each SoundEvent into a shared mono
//! sample buffer using simple oscillators + a short ADSR envelope.
//! Mirrors the structure of `src/audio/synth.ts` in the parent web
//! app but renders to PCM samples instead of Web Audio nodes.

use std::f32::consts::PI;

use crate::mapping::{map_instruction, SoundEvent, Timbre};
use crate::trace::InstructionEvent;

/// Tail seconds appended after the last event's `when + duration` so
/// release envelopes have room to decay without being chopped.
const TAIL_SEC: f32 = 0.5;

/// Render every event into a single mono f32 PCM buffer. Polyphony is
/// just additive mixing — concurrent events from different IPs sum
/// into the same samples. The final buffer is master-gained but NOT
/// pre-clipped; `main` clamps to [-1, 1] at i16 quantization time.
pub fn render(
    events: &[InstructionEvent],
    bpm: u32,
    sample_rate: u32,
    master_gain: f32,
) -> Vec<f32> {
    if events.is_empty() {
        return Vec::new();
    }

    let tick_dur_sec = 60.0 / bpm as f32;
    let base_tick = events[0].tick;

    // First pass: convert each VM event to a positioned SoundEvent.
    let mut sounds: Vec<SoundEvent> = Vec::with_capacity(events.len());
    let mut latest_end: f32 = 0.0;
    for ev in events {
        let when = ((ev.tick - base_tick) as f32) * tick_dur_sec;
        if let Some(sound) = map_instruction(ev, when) {
            let end = sound.when + sound.duration;
            if end > latest_end {
                latest_end = end;
            }
            sounds.push(sound);
        }
    }

    if sounds.is_empty() {
        return Vec::new();
    }

    // Allocate the output buffer with a release tail.
    let total_sec = latest_end + TAIL_SEC;
    let total_samples = ((total_sec * sample_rate as f32).ceil() as usize).max(1);
    let mut buf = vec![0.0_f32; total_samples];

    for sound in &sounds {
        synth_into(sound, &mut buf, sample_rate);
    }

    // Apply master gain.
    if (master_gain - 1.0).abs() > f32::EPSILON {
        for sample in buf.iter_mut() {
            *sample *= master_gain;
        }
    }

    buf
}

/// Render one SoundEvent additively into `buf`. Out-of-range writes
/// (e.g. release tail extending past `buf.len()`) are clipped.
fn synth_into(event: &SoundEvent, buf: &mut [f32], sample_rate: u32) {
    let sr_f = sample_rate as f32;
    let start_sample = (event.when * sr_f) as usize;
    let dur_samples = (event.duration * sr_f).max(1.0) as usize;
    let end_sample = (start_sample + dur_samples).min(buf.len());

    let attack = (0.005 * sr_f) as usize;
    let release = ((event.duration * 0.3).min(0.05) * sr_f) as usize;
    let release_start = dur_samples.saturating_sub(release);

    let peak = event.velocity * 0.5;

    for i in start_sample..end_sample {
        let local = i - start_sample;
        let t = local as f32 / sr_f;

        // ADSR envelope (just A + sustain + R, no decay).
        let env = if local < attack {
            (local as f32) / (attack as f32).max(1.0)
        } else if local >= release_start {
            let rel_pos = (dur_samples - local) as f32 / (release as f32).max(1.0);
            rel_pos.max(0.0)
        } else {
            1.0
        };

        // Frequency: linear sweep for glissando, constant otherwise.
        let freq = match event.end_frequency {
            Some(end_freq) => {
                let frac = local as f32 / dur_samples as f32;
                event.frequency * (end_freq / event.frequency).powf(frac)
            }
            None => event.frequency,
        };

        let phase = freq * t * 2.0 * PI;
        let sample = match event.timbre {
            Timbre::Sine => phase.sin(),
            Timbre::Triangle => triangle(freq * t),
            Timbre::Square => if phase.sin() >= 0.0 { 1.0 } else { -1.0 },
            Timbre::Sawtooth => sawtooth(freq * t),
            Timbre::Noise => noise(i),
        };

        buf[i] += sample * peak * env;
    }
}

/// Non-band-limited triangle. Good enough for sonification at the
/// frequencies the mapping uses; if aliasing ever shows up at very
/// high digits, swap in a polyBLEP variant.
fn triangle(phase_cycles: f32) -> f32 {
    let p = phase_cycles - phase_cycles.floor(); // [0, 1)
    4.0 * (p - (p + 0.5).floor()).abs() - 1.0
}

fn sawtooth(phase_cycles: f32) -> f32 {
    let p = phase_cycles - phase_cycles.floor(); // [0, 1)
    2.0 * p - 1.0
}

/// Deterministic per-sample noise — same sequence regardless of when
/// the event lands. Uses a cheap xorshift hash of the absolute sample
/// index so two TURBULENCE events at different times don't share
/// audible periodicity.
fn noise(i: usize) -> f32 {
    let mut x = (i as u32).wrapping_mul(2_654_435_761) ^ 0x9E37_79B9;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    // Map u32 to [-1, 1].
    (x as f32 / u32::MAX as f32) * 2.0 - 1.0
}
