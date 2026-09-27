import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assemble, AsmError } from '../src/assembler.js';
import { INSTRUCTIONS, operandSlots } from '../src/isa.js';

const asm = (src) => assemble(src).image;

test('assembles every instruction in the ISA without error', () => {
  // derive one canonical line per mnemonic from the ISA's own slot table —
  // adding an instruction to isa.js automatically extends this test
  const lines = INSTRUCTIONS.map((i) => {
    const slots = operandSlots(i.mnemonic);
    const args = [];
    if (slots.a === 'reg') args.push('R1');
    if (slots.a === 'imm8') args.push('5');
    if (slots.b === 'reg') args.push('R2');
    if (slots.b === 'imm8') args.push('5');
    if (slots.bc === 'imm16') args.push('0x0100');
    return [i.mnemonic, ...args].join(' ');
  });
  const image = asm(lines.join('\n'));
  assert.equal(image.length, INSTRUCTIONS.length * 4);
});

test('fixed 4-byte encoding with big-endian immediates', () => {
  const image = asm('LD R3, 0xABCD');
  assert.deepEqual([...image.slice(0, 4)], [0x02, 0x03, 0xAB, 0xCD]);
});

test('labels resolve forward and backward', () => {
  const image = asm(`
        JMP end
mid:    INC R0
        JMP mid
end:    HLT
  `);
  // JMP end -> 0x000C
  assert.deepEqual([...image.slice(0, 4)], [0x19, 0x00, 0x00, 0x0C]);
  // JMP mid -> 0x0004
  assert.deepEqual([...image.slice(8, 12)], [0x19, 0x00, 0x00, 0x04]);
});

test('.word emits 2-byte big-endian data and advances addresses', () => {
  const image = asm(`
        JMP data
data:   .word 0x1234, 0x00FF, 7
  `);
  assert.deepEqual([...image.slice(4, 10)], [0x12, 0x34, 0x00, 0xFF, 0x00, 0x07]);
});

test('.word accepts labels as values', () => {
  const { image } = assemble(`
        JMP start
ptr:    .word start
start:  HLT
  `);
  assert.deepEqual([...image.slice(4, 6)], [0x00, 0x06]);
});

test('errors carry line numbers', () => {
  assert.throws(() => asm('LD R1, 5\nBOGUS R1'), (e) => e instanceof AsmError && e.line === 2);
});

test('rejects bad register, duplicate label, 8-bit overflow, wrong arity', () => {
  assert.throws(() => asm('ADD R9, R1'), /not a register/);
  assert.throws(() => asm('x: NOP\nx: NOP'), /duplicate label/);
  assert.throws(() => asm('ADDI R1, 0x1FF'), /8 bits/);
  assert.throws(() => asm('INC R1, R2'), /expects 1 operand/);
});
