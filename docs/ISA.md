# VFA-16 — The VM Forge Instruction Set

VFA-16 ("Virtual Forge Architecture, 16-bit") is the instruction set this
repository defines, assembles and executes. It is a teaching ISA: small
enough to hold in your head, complete enough to write real programs
(recursion, sorting, formatted output) against.

## Machine model

| Component | Spec |
|---|---|
| Registers | `R0`–`R7`, 16-bit each |
| Memory | 64 KB, byte-addressable, big-endian words |
| PC | 16-bit, starts at `0x0000` |
| Stack | grows **down** from `0xFFFE`, 2 bytes per word |
| Flags | `Z` (result zero), `N` (unsigned *a < b*, set by CMP/CMPI) |
| Instructions | fixed **4 bytes**: `[opcode, a, b, c]` |
| Console | `OUT`/`OUTI` append bytes to an output stream |

Arithmetic and logic instructions set `Z` from their result. Branches never
set flags. `CMP a, b` sets `Z = (a == b)` and `N = (a < b)` (unsigned).

## Opcode table

| Op | Mnemonic | Operands | Flags | Semantics |
|-----|-----------|------------------|:-:|-----------|
| 00 | `NOP`  | — | – | no operation |
| 01 | `HLT`  | — | – | halt the machine |
| 02 | `LD`   | r, imm16 | – | `Rd = imm16` |
| 03 | `MOV`  | rd, rs | – | `Rd = Rs` |
| 04 | `LDM`  | rd, addr | – | `Rd = word[addr]` |
| 05 | `STM`  | rs, addr | – | `word[addr] = Rs` |
| 06 | `PUSH` | rs | – | push `Rs` (SP -= 2) |
| 07 | `POP`  | rd | – | pop into `Rd` (SP += 2) |
| 08 | `ADD`  | rd, rs | Z | `Rd += Rs` |
| 09 | `SUB`  | rd, rs | Z | `Rd -= Rs` |
| 0A | `MUL`  | rd, rs | Z | `Rd *= Rs` (low 16 bits) |
| 0B | `DIV`  | rd, rs | Z | `Rd /= Rs`, traps on zero |
| 0C | `MOD`  | rd, rs | Z | `Rd %= Rs`, traps on zero |
| 0D | `INC`  | rd | Z | `Rd += 1` |
| 0E | `DEC`  | rd | Z | `Rd -= 1` |
| 0F | `ADDI` | rd, imm8 | Z | `Rd += imm8` |
| 10 | `AND`  | rd, rs | Z | bitwise and |
| 11 | `OR`   | rd, rs | Z | bitwise or |
| 12 | `XOR`  | rd, rs | Z | bitwise xor |
| 13 | `NOT`  | rd | Z | bitwise not |
| 14 | `SHL`  | rd, rs | Z | `Rd <<= (Rs & 15)` |
| 15 | `SHR`  | rd, rs | Z | `Rd >>= (Rs & 15)` |
| 16 | `CMP`  | rd, rs | ZN | `Z = eq`, `N = a < b` |
| 17 | `NEG`  | rd | Z | `Rd = -Rd` |
| 18 | `SWAP` | rd, rs | – | exchange registers |
| 19 | `JMP`  | addr | – | `PC = addr` |
| 1A | `JZ`   | addr | – | jump if `Z` |
| 1B | `JNZ`  | addr | – | jump if `!Z` |
| 1C | `JN`   | addr | – | jump if `N` |
| 1D | `JNN`  | addr | – | jump if `!N` |
| 1E | `CALL` | addr | – | push PC, jump |
| 1F | `RET`  | — | – | pop PC |
| 20 | `OUT`  | rs | – | console byte from `Rs` |
| 21 | `OUTI` | imm8 | – | console byte `imm8` |
| 22 | `RND`  | rd | – | `Rd = random16` |
| 23 | `TIM`  | rd | – | `Rd = steps & 0xFFFF` |
| 24 | `CMPI` | rd, imm8 | ZN | compare against immediate |
| 25 | `MULI` | rd, imm8 | Z | `Rd *= imm8` |
| 26 | `LDX`  | rd, rs | – | `Rd = word[Rs]` (indirect) |
| 27 | `STX`  | rd, rs | – | `word[Rd] = Rs` (indirect) |

## Assembly syntax

```asm
; comment until end of line
start:  LD R0, 10         ; labels bind to the next emitted address
loop:   OUT R0            ; registers are R0..R7
        DEC R0
        CMPI R0, 0
        JNZ loop          ; labels resolve wherever an address is expected
        HLT
table:  .word 3, 0x1F, loop   ; 2 bytes per value, labels allowed
```

- Numbers are decimal or `0x`-hexadecimal.
- Every instruction occupies exactly 4 bytes; each `.word` item 2 bytes.
- Errors (unknown mnemonic, wrong operand count, bad register, 8-bit
  overflow, duplicate labels) report the source line.

## Design notes

- **Fixed-width encoding** keeps the assembler, disassembler and debugger
  trivially in sync — no length tables, `PC + 4` always.
- **Two flags instead of four**: VFA-16 is unsigned. `Z` handles loops,
  `N` (strictly below) handles comparisons; equal is `Z`, greater-or-equal
  is `!N`.
- **Indirect addressing lives in two instructions** (`LDX`/`STX`) instead of
  address modes: the ISA table, the assembler's operand validation and the
  debugger all stay flat.
- **The stack is byte-addressed and grows down** from `0xFFFE`; overflow and
  underflow are hard errors, not silent corruption — this is a teaching
  machine, it should tell you when a program is wrong.

## The counter-reset trap (documented by a real bug)

During development, the benchmark suite shipped an infinite loop with a
deceptively simple cause:

```asm
        LD R6, 32
passes: LD R0, 31        ; ← label ABOVE the inner init...
        ...
        DEC R6
        JNZ passes        ; ← jumps back and RE-ARMS R6 = 32. Forever.
```

`JNZ passes` lands **above** `R6`'s initialisation, so the pass counter is
reset every round and can never reach zero. `DEC` also wraps `0 → 0xFFFF`,
so "until zero" loops must never re-enter a counter's initialisation line.
The corrected pattern (see `programs/bench-sort.vfa`) re-arms the pass
counter **explicitly between rounds**, after testing the round counter with
`JZ`.
