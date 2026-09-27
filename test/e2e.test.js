import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assemble } from '../src/assembler.js';
import { disassemble, disassembleAt } from '../src/disassembler.js';
import { VM } from '../src/vm.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const program = (name) => readFileSync(join(root, 'programs', name), 'utf8');

const runProgram = (name, opts) => {
  const vm = new VM();
  vm.load(assemble(program(name)).image);
  return { vm, result: vm.run(opts) };
};

const text = (result) => result.output.map((b) => String.fromCharCode(b)).join('');

test('hello.vfa prints VM-FORGE', () => {
  const { result } = runProgram('hello.vfa');
  assert.equal(text(result), 'VM-FORGE\n');
});

test('countdown.vfa prints 10 down to 01', () => {
  const { result } = runProgram('countdown.vfa');
  assert.equal(text(result), '10\n09\n08\n07\n06\n05\n04\n03\n02\n01\n');
});

test('fib.vfa prints the first 13 fibonacci numbers', () => {
  const { result } = runProgram('fib.vfa');
  assert.equal(text(result), '0 1 1 2 3 5 8 13 21 34 55 89 144 \n');
});

test('sort.vfa prints the sorted table', () => {
  const { result } = runProgram('sort.vfa');
  assert.equal(text(result), '1 3 5 7 12 32 34 45 64 77 99 100 128 233 250 620 \n');
});

test('bench programs terminate within sane budgets', () => {
  for (const name of ['bench-count.vfa', 'bench-fib.vfa', 'bench-sort.vfa']) {
    const { vm, result } = runProgram(name, { maxSteps: 2_000_000 });
    assert.equal(result.halted, true, `${name} must halt`);
    assert.ok(result.steps < 200_000, `${name} should stay under 200k steps, got ${result.steps}`);
  }
});

test('every assembled program disassembles back to valid mnemonics', () => {
  for (const name of ['hello.vfa', 'countdown.vfa', 'fib.vfa', 'sort.vfa']) {
    const { image, size } = assemble(program(name));
    const lines = disassemble(image, 0, size);
    for (const line of lines) {
      assert.ok(!/DW 0x/.test(line), `${name}: raw DW in disassembly at ${line}`);
    }
  }
});

test('disassembler round-trips a known encoding', () => {
  const { image } = assemble('LD R3, 0xABCD');
  assert.equal(disassembleAt(image, 0), 'LD R3, 0xABCD');
});
