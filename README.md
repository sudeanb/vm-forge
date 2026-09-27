# ⚙ VM Forge

**A 39-instruction virtual machine with its own assembly language — two-pass
assembler, disassembler, trace mode, benchmark suite and a visual in-browser
debugger. Zero dependencies.**

[![CI](https://github.com/sudeanb/vm-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/sudeanb/vm-forge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-green)](package.json)

▶ **[Open the visual debugger →](https://sudeanb.github.io/vm-forge/)**
(write assembly, assemble it, set breakpoints by clicking, watch registers
and memory update per step)

## The ISA

VFA-16 is a teaching architecture: 8 registers, 64 KB memory, a
downward-growing stack, two flags, and **fixed 4-byte instructions** —
flat to assemble, disassemble and debug. It has enough to write real
programs: call/ret with stack discipline, register-indirect addressing for
arrays, multiplication, shifts, and a console.

Full opcode table with encodings and semantics:
[docs/ISA.md](docs/ISA.md).

```asm
; recursive fibonacci, in vm-forge assembly
fib:    CMPI R0, 2
        JN base
        PUSH R4
        DEC R0
        MOV R4, R0
        CALL fib
        PUSH R0        ; carry fib(n-1) across the second CALL
        DEC R4
        MOV R0, R4
        CALL fib
        POP R4
        ADD R0, R4
        POP R4
        RET
base:   RET
```

## Quick start

```bash
git clone https://github.com/sudeanb/vm-forge.git
cd vm-forge

node --test                        # 30 tests, zero dependencies
node bin/vmforge.js run programs/fib.vfa
# → 0 1 1 2 3 5 8 13 21 34 55 89 144
node bin/vmforge.js bench          # ISA benchmark suite
node bin/vmforge.js disasm programs/hello.vfa
```

`programs/` ships four annotated programs: `hello.vfa`, `countdown.vfa`
(digit printing via DIV/MOD), `fib.vfa` (recursive, stack-carrying) and
`sort.vfa` (bubble sort with `LDX`/`STX` indirect addressing).

## Benchmarks

```
benchmark                    steps       ms      Msteps/s
-------------------------  -------  -------  ----------
count 1→20000                60003      3.1       19.11
fib(18) recursive            71066      2.5       28.14
bubble sort 32 words ×4      40944      2.1       19.35
```

Measured on the development machine (Apple Silicon, Node 26); the numbers
scale with hardware but the step counts are exact and machine-independent.

## The debugger

The browser playground runs the same assembler the CLI uses. Features:

- **Breakpoints by clicking** a disassembly line — the VM pauses *before*
  the instruction executes
- **Step / Run / Pause / Reset** with live register, flag and memory views
- **Console pane** fed by `OUT`/`OUTI`
- Assembler errors with **source line numbers**, reported inline

## Design decisions worth reading about

- [docs/ISA.md](docs/ISA.md) explains the fixed-width encoding, the
  two-flag unsigned comparison model, and why indirect addressing is two
  instructions instead of address modes
- **The counter-reset trap**: the benchmark suite shipped with an infinite
  loop because a conditional jump landed *above* a counter's
  initialisation, re-arming it forever. The bug, its anatomy and the
  corrected pattern are documented in
  [ISA.md § The counter-reset trap](docs/ISA.md#the-counter-reset-trap-documented-by-a-real-bug)
  — written down exactly because this project is a teaching ISA

## Limitations (honest list)

- unsigned only — no signed comparisons or carries into multi-word maths
- no interrupts/IO beyond the byte console (`TIM` is a step counter)
- the debugger highlights by address; self-modifying code confuses the
  listing (which is, arguably, a feature for teaching)

## License

[MIT](LICENSE)
