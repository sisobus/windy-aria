//! Opcode → SoundParams lookup.
//!
//! Direct port of `src/audio/mapping.ts` from the parent web app —
//! same frequencies, durations, velocities, timbres. The web version
//! is the canonical reference; the CLI tracks it on a per-release
//! basis (no shared spec file yet).

use windy::opcodes::Op;

use crate::trace::InstructionEvent;

#[derive(Clone, Copy, Debug)]
pub enum Timbre {
    Sine,
    Triangle,
    Square,
    Sawtooth,
    Noise,
}

#[derive(Clone, Copy, Debug)]
pub struct SoundEvent {
    pub when: f32,      // seconds from render start
    pub frequency: f32, // Hz (start freq for glissando)
    pub end_frequency: Option<f32>, // Hz (end freq for glissando)
    pub duration: f32,  // seconds
    pub velocity: f32,  // 0..1
    pub timbre: Timbre,
    /// Which IP this event belongs to. Held for future panning / channel
    /// routing — v0.1 renders mono so it's not read yet.
    #[allow(dead_code)]
    pub voice_id: u32,
}

/// PushDigit lands on one of these — mirrors the TS DIGIT_FREQUENCIES table.
const DIGIT_FREQ: [f32; 10] = [
    523.25,  // 0  C5
    587.33,  // 1  D5
    659.25,  // 2  E5
    783.99,  // 3  G5
    880.00,  // 4  A5
    1046.50, // 5  C6
    1174.66, // 6  D6
    1318.51, // 7  E6
    1567.98, // 8  G6
    1760.00, // 9  A6
];

/// Map a single VM event into zero or one rendered sound. `when` is
/// the seconds-offset from the start of the rendered audio.
pub fn map_instruction(event: &InstructionEvent, when: f32) -> Option<SoundEvent> {
    let voice_id = event.ip_id;

    // String mode: every character pushes its codepoint silently. The
    // web app v1 also stays silent here — sonification of in-string
    // text is out of scope.
    if event.strmode {
        return None;
    }

    let params = match event.opcode {
        Op::Nop | Op::Unknown => return None,

        Op::Halt => fixed(130.81, 0.4, 0.6, Timbre::Sine),
        Op::Trampoline => fixed(800.0, 0.05, 0.3, Timbre::Square),
        Op::Split => fixed(880.0, 0.2, 0.5, Timbre::Sine),
        Op::Turbulence => fixed(660.0, 0.08, 0.4, Timbre::Noise),

        Op::MoveS => fixed(261.63, 0.18, 0.5, Timbre::Sine),
        Op::MoveSw => fixed(293.66, 0.18, 0.5, Timbre::Sine),
        Op::MoveW => fixed(329.63, 0.18, 0.5, Timbre::Sine),
        Op::MoveNw => fixed(392.00, 0.18, 0.5, Timbre::Sine),
        Op::MoveN => fixed(440.00, 0.18, 0.5, Timbre::Sine),
        Op::MoveNe => fixed(523.25, 0.18, 0.5, Timbre::Sine),
        Op::MoveE => fixed(587.33, 0.18, 0.5, Timbre::Sine),
        Op::MoveSe => fixed(659.25, 0.18, 0.5, Timbre::Sine),

        Op::PushDigit => {
            let d = event.digit.unwrap_or(0).min(9) as usize;
            fixed(DIGIT_FREQ[d], 0.10, 0.45, Timbre::Triangle)
        }

        Op::StrMode => fixed(220.0, 0.04, 0.25, Timbre::Square),

        Op::Add => fixed(392.00, 0.08, 0.40, Timbre::Square),
        Op::Sub => fixed(349.23, 0.08, 0.40, Timbre::Square),
        Op::Mul => fixed(523.25, 0.08, 0.40, Timbre::Square),
        Op::Div => fixed(466.16, 0.08, 0.40, Timbre::Square),
        Op::Mod => fixed(311.13, 0.08, 0.40, Timbre::Square),
        Op::Not => fixed(880.00, 0.06, 0.35, Timbre::Square),
        Op::Gt => fixed(987.77, 0.06, 0.35, Timbre::Square),

        Op::Dup => fixed(698.46, 0.06, 0.40, Timbre::Square),
        Op::Drop => fixed(220.00, 0.06, 0.35, Timbre::Square),
        Op::Swap => fixed(587.33, 0.06, 0.40, Timbre::Square),

        Op::IfH => fixed(440.00, 0.08, 0.45, Timbre::Triangle),
        Op::IfV => fixed(660.00, 0.08, 0.45, Timbre::Triangle),

        Op::PutNum => fixed(523.25, 0.15, 0.45, Timbre::Sawtooth),
        Op::PutChr => fixed(880.00, 0.10, 0.40, Timbre::Sawtooth),
        Op::GetNum => fixed(130.81, 0.20, 0.50, Timbre::Sawtooth),
        Op::GetChr => fixed(659.25, 0.05, 0.40, Timbre::Sawtooth),

        Op::GridGet => fixed(196.00, 0.10, 0.45, Timbre::Triangle),
        Op::GridPut => fixed(247.00, 0.10, 0.45, Timbre::Triangle),

        // GUST/CALM are magic-frequency markers that the synth layer
        // turns into glissandos. Encode as start/end pair here.
        Op::Gust => gliss(200.0, 800.0, 0.25, 0.55, Timbre::Sine),
        Op::Calm => gliss(800.0, 200.0, 0.25, 0.55, Timbre::Sine),
    };

    Some(SoundEvent {
        when,
        frequency: params.frequency,
        end_frequency: params.end_frequency,
        duration: params.duration,
        velocity: params.velocity,
        timbre: params.timbre,
        voice_id,
    })
}

// Small intermediate builder so the match arms read clean.
struct Params {
    frequency: f32,
    end_frequency: Option<f32>,
    duration: f32,
    velocity: f32,
    timbre: Timbre,
}

fn fixed(frequency: f32, duration: f32, velocity: f32, timbre: Timbre) -> Params {
    Params {
        frequency,
        end_frequency: None,
        duration,
        velocity,
        timbre,
    }
}

fn gliss(from: f32, to: f32, duration: f32, velocity: f32, timbre: Timbre) -> Params {
    Params {
        frequency: from,
        end_frequency: Some(to),
        duration,
        velocity,
        timbre,
    }
}
