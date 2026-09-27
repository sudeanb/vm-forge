#!/usr/bin/env node
// vm-forge CLI
//
//   node bin/vmforge.js run programs/hello.vfa     assemble & execute
//   node bin/vmforge.js run x.vfa --trace          log every executed instruction
//   node bin/vmforge.js run x.vfa --maxsteps 1e6   step budget
//   node bin/vmforge.js disasm programs/hello.vfa  print the listing
//   node bin/vmforge.js bench                      ISA benchmark suite

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assemble, VM, disassemble } from '../src/index.js';

const args = process.argv.slice(2);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const program = (name) => readFileSync(join(root, 'programs', name), 'utf8');

function fail(err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}

const cmd = args[0];

if (cmd === 'run') {
  const file = args[1];
  if (!file) fail(new Error('usage: run <file.vfa> [--trace] [--maxsteps N]'));
  const maxSteps = Number(args[args.indexOf('--maxsteps') + 1]) || 5_000_000;
  let image;
  try {
    image = assemble(readFileSync(file, 'utf8')).image;
  } catch (err) { fail(err); }
  const vm = new VM();
  vm.load(image);
  try {
    const result = vm.run({ maxSteps });
    for (const byte of result.output) process.stdout.write(String.fromCharCode(byte));
    process.stdout.write('\n');
    console.error(`— halted: ${result.halted}, steps: ${result.steps}${result.budgetHit ? ' (budget hit)' : ''}`);
    if (result.trace) {
      for (const t of result.trace) console.error(`  ${t.pc.toString(16).padStart(4, '0')}  ${t.mnemonic}`);
    }
  } catch (err) { fail(err); }
  process.exit(0);
}

if (cmd === 'disasm') {
  try {
    const { image } = assemble(readFileSync(args[1], 'utf8'));
    console.log(disassemble(image, 0, image.length).join('\n'));
  } catch (err) { fail(err); }
  process.exit(0);
}

if (cmd === 'bench') {
  const suites = [
    { name: 'count 1→20000', file: 'bench-count.vfa' },
    { name: 'fib(18) recursive', file: 'bench-fib.vfa' },
    { name: 'bubble sort 32 words ×4', file: 'bench-sort.vfa' },
  ];
  console.log('benchmark                    steps       ms      Msteps/s');
  console.log('-------------------------  -------  -------  ----------');
  for (const s of suites) {
    const { image } = assemble(program(s.file));
    const vm = new VM();
    vm.load(image);
    const t0 = performance.now();
    const r = vm.run({ maxSteps: 2_000_000_000 });
    const ms = performance.now() - t0;
    console.log(
      `${s.name.padEnd(25)}  ${String(r.steps).padStart(7)}  ${ms.toFixed(1).padStart(7)}  ${(r.steps / ms / 1000).toFixed(2).padStart(10)}`,
    );
  }
  process.exit(0);
}

console.error('usage: vmforge <run|disasm|bench> [args]');
process.exit(1);
