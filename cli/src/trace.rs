//! Walk the windy-lang VM step-by-step and emit an `InstructionEvent`
//! for every live IP × tick. Mirrors the JS interpreter wrapper in
//! `src/interpreter/` from the parent web app — same event stream
//! shape, just produced offline from native Rust.

use windy::opcodes::{decode_cell, Op};
use windy::parser;
use windy::vm::Vm;

#[derive(Clone, Copy, Debug)]
pub struct InstructionEvent {
    /// The VM tick on which this opcode was about to execute.
    pub tick: u64,
    /// The opcode at the IP's current cell, BEFORE the step that
    /// consumes it.
    pub opcode: Op,
    /// For `PushDigit`, the decimal digit 0..=9. None otherwise.
    pub digit: Option<u8>,
    /// Index of the IP this event belongs to within `vm.ips` at the
    /// start of the tick. Used by the mapping layer as a voice id so
    /// concurrent IPs map to different timbres.
    pub ip_id: u32,
    /// True if the IP is in string mode — we still record an event
    /// (the synth can render string chars distinctly), but the mapping
    /// layer treats it as a separate axis.
    pub strmode: bool,
}

/// Run `source` to completion (or `max_steps`) and return the full
/// event stream. Side effects of the program (stdout/stderr/stdin)
/// are discarded — sonification cares only about which opcodes ran
/// and when.
pub fn trace_program(source: &str, seed: Option<u64>, max_steps: u64) -> Vec<InstructionEvent> {
    let (grid, _signature) = parser::parse(source);
    let mut vm = Vm::new(grid, seed, Some(max_steps));

    let mut events: Vec<InstructionEvent> = Vec::new();

    // Discard I/O — windy_lang::Vm::step requires &mut dyn Read/Write
    // for all three streams, so plug them with empty/null impls.
    let mut stdin = std::io::empty();
    let mut stdout = std::io::sink();
    let mut stderr = std::io::sink();

    let mut tick: u64 = 0;
    loop {
        if vm.halted || vm.trapped {
            break;
        }
        if let Some(cap) = vm.max_steps {
            if vm.steps >= cap {
                break;
            }
        }

        // Snapshot every live IP's about-to-execute opcode for this
        // tick BEFORE calling step (step mutates positions).
        for (idx, ipctx) in vm.ips.iter().enumerate() {
            if ipctx.halted {
                continue;
            }
            let cell = vm.grid.get(ipctx.ip.x, ipctx.ip.y);
            let (op, value) = decode_cell(&cell);
            let digit = if matches!(op, Op::PushDigit) {
                // PushDigit's `value` is the codepoint of the digit,
                // e.g. b'0'..=b'9'. Subtract '0' for the numeric value.
                if (b'0' as u32..=b'9' as u32).contains(&value) {
                    Some((value - b'0' as u32) as u8)
                } else {
                    None
                }
            } else {
                None
            };
            events.push(InstructionEvent {
                tick,
                opcode: op,
                digit,
                ip_id: idx as u32,
                strmode: ipctx.strmode,
            });
        }

        vm.step(&mut stdin, &mut stdout, &mut stderr);
        tick += 1;
    }

    events
}
