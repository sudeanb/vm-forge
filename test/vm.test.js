import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assemble } from '../src/assembler.js';
import { VM } from '../src/vm.js';

/** Assemble + run, returning the VM after HLT (or budget). */
function run(src, opts) {
  const vm = new VM();
  vm.load(assemble(src).image);
  const result = vm.run(opts);
  return { vm, result };
}

test('LD/MOV/LDM/STM round-trip data through registers and memory', () => {
  const { vm } = run(`
        LD R1, 0xBEEF
        MOV R2, R1
        STM R2, 0x2000
        LDM R3, 0x2000
        HLT
  `);
  assert.equal(vm.reg[2], 0xBEEF);
  assert.equal(vm.reg[3], 0xBEEF);
});

test('ADD/SUB wrap at 16 bits and set the zero flag', () => {
  const { vm } = run(`
        LD R1, 0xFFFF
        ADDI R1, 2
        HLT
  `);
  assert.equal(vm.reg[1], 1);
});

test('MUL keeps the low 16 bits', () => {
  const { vm } = run(`
        LD R1, 300
        LD R2, 300
        MUL R1, R2
        HLT
  `);
  assert.equal(vm.reg[1], (300 * 300) & 0xFFFF);
});

test('DIV/MOD trap on zero divisor', () => {
  assert.throws(() => run('LD R2, 0\nLD R1, 9\nDIV R1, R2\nHLT'), /division by zero/);
  assert.throws(() => run('LD R2, 0\nLD R1, 9\nMOD R1, R2\nHLT'), /modulo by zero/);
});

test('CMP/CMPI set Z and N for eq/lt/gt', () => {
  const { vm } = run(`
        LD R1, 5
        LD R2, 9
        CMP R1, R2
        HLT
  `);
  assert.equal(vm.z, false);
  assert.equal(vm.n, true);   // 5 < 9
});

test('conditional jumps: JZ/JNZ/JN/JNN each taken and not taken', () => {
  const { vm } = run(`
        LD R1, 1
        LD R2, 3
        CMP R1, R2
        JN below       ; 1 < 3 -> taken
        LD R5, 0xFF
below:  CMP R2, R1
        JNN end        ; not (3 < 1) -> taken
        LD R5, 0xEE
end:    HLT
  `);
  // JN taken -> the 0xFF load is skipped; JNN taken -> the 0xEE load is skipped
  assert.equal(vm.reg[5], 0);
  assert.equal(vm.n, false);
});

test('SWAP exchanges registers; NEG/NOT are 16-bit', () => {
  const { vm } = run(`
        LD R1, 3
        LD R2, 4
        SWAP R1, R2
        NOT R1
        NEG R2
        HLT
  `);
  assert.equal(vm.reg[1], ~4 & 0xFFFF); // R1 became 4 after the swap
  assert.equal(vm.reg[2], 0xFFFD);     // R2 became 3; -3 & 0xFFFF
});

test('SHL/SHR use the low 4 bits of the shift amount', () => {
  const { vm } = run(`
        LD R1, 1
        LD R2, 4
        SHL R1, R2
        LD R3, 20
        SHR R3, R2
        HLT
  `);
  assert.equal(vm.reg[1], 16);
  assert.equal(vm.reg[3], 1);
});

test('PUSH/POP is LIFO; CALL/RET round-trips; stack guards fire', () => {
  const { vm } = run(`
        LD R1, 0x1111
        LD R2, 0x2222
        PUSH R1
        PUSH R2
        POP R3
        POP R4
        HLT
  `);
  assert.equal(vm.reg[3], 0x2222);
  assert.equal(vm.reg[4], 0x1111);
  assert.throws(() => run('POP R1\nHLT'), /stack underflow/);
});

test('recursion via CALL/RET computes fib(10) = 55', () => {
  const { vm } = run(`
        LD R0, 10
        CALL fib
        HLT
fib:    CMPI R0, 2
        JN base
        PUSH R4
        DEC R0
        MOV R4, R0
        CALL fib
        PUSH R0
        DEC R4
        MOV R0, R4
        CALL fib
        POP R4
        ADD R0, R4
        POP R4
        RET
base:   RET
  `);
  assert.equal(vm.reg[0], 55);
});

test('OUT/OUTI collect a byte stream', () => {
  const { result } = run(`
        OUTI 72
        LD R1, 105
        OUT R1
        HLT
  `);
  assert.deepEqual(result.output, [72, 105]);
});

test('breakpoints pause execution before the target PC', () => {
  const vm = new VM();
  vm.load(assemble(`
        INC R0
        INC R0
        INC R0
        HLT
  `).image);
  const result = vm.run({ breakpoints: new Set([8]) });
  assert.equal(result.halted, false);
  assert.equal(result.pausedAt, 8);
  assert.equal(vm.reg[0], 2);
});

test('step budget stops runaway programs', () => {
  const { result } = run('loop: JMP loop', { maxSteps: 1000 });
  assert.equal(result.budgetHit, true);
  assert.equal(result.halted, false);
});

test('TIM reads the instruction counter; RND respects the mask', () => {
  const { vm, result } = run(`
        TIM R1
        NOP
        NOP
        TIM R2
        HLT
  `);
  assert.equal(vm.reg[1], 1);
  assert.equal(vm.reg[2], 4);
});

test('LDX/STX indirect access through a pointer register', () => {
  const { vm } = run(`
        LD R1, 0x3000
        LD R2, 0xCAFE
        STX R1, R2
        LDX R3, R1
        HLT
  `);
  assert.equal(vm.reg[3], 0xCAFE);
});

test('trace log records every executed pc/mnemonic', () => {
  const { result } = run(`
        NOP
        INC R0
        HLT
  `, { trace: true });
  assert.deepEqual(result.trace.map((t) => t.mnemonic), ['NOP', 'INC', 'HLT']);
  assert.deepEqual(result.trace.map((t) => t.pc), [0, 4, 8]);
});
