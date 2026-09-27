// VM Forge virtual machine — executes VFA-16 images.
//
// The step()/run() split keeps the core host-agnostic: the web debugger
// steps and inspects, the CLI runs flat out with a step budget, and the
// test suite drives both. Trace mode records every executed instruction
// with its disassembly for post-mortem viewing.

import { REGISTERS, MEM_SIZE, STACK_TOP, BY_OPCODE, operandSlots } from './isa.js';

export class VmError extends Error {
  constructor(message, pc) {
    super(pc !== undefined ? `${message} (at 0x${pc.toString(16).padStart(4, '0')})` : message);
    this.pc = pc;
  }
}

export class VM {
  constructor() {
    this.reset();
  }

  reset() {
    this.memory = new Uint8Array(MEM_SIZE);
    this.reg = new Uint16Array(REGISTERS);
    this.pc = 0;
    this.sp = STACK_TOP;
    this.z = false;      // zero flag
    this.n = false;      // "below" flag (unsigned a < b)
    this.halted = false;
    this.steps = 0;
    this.output = [];    // bytes written by OUT/OUTI
  }

  load(image) {
    this.reset();
    if (image.length > MEM_SIZE) throw new VmError('image larger than memory');
    this.memory.set(image);
  }

  setFlagFrom(value) {
    this.z = value === 0;
    this.n = false;
  }

  setCompareFlags(a, b) {
    this.z = a === b;
    this.n = a < b;
  }

  /** Execute one instruction. Returns { pc, opcode, text } for trace mode. */
  step() {
    if (this.halted) throw new VmError('machine is halted');
    const pc = this.pc;
    if (pc + 3 >= MEM_SIZE) throw new VmError('PC ran off memory', pc);

    const opcode = this.memory[pc];
    const a = this.memory[pc + 1];
    const b = this.memory[pc + 2];
    const c = this.memory[pc + 3];
    const def = BY_OPCODE.get(opcode);
    if (!def) throw new VmError(`unknown opcode 0x${opcode.toString(16)}`, pc);

    const next = (pc + 4) & 0xFFFF;
    const imm16 = (b << 8) | c;
    const reg = this.reg;
    this.pc = next;
    this.steps++;

    const binop = (fn) => {
      const r = fn(reg[a], reg[b]) & 0xFFFF;
      reg[a] = r;
      this.setFlagFrom(r);
    };

    switch (def.mnemonic) {
      case 'NOP': break;
      case 'HLT': this.halted = true; break;
      case 'LD': reg[a] = imm16; break;
      case 'MOV': reg[a] = reg[b]; break;
      case 'LDM': reg[a] = (this.memory[imm16] << 8) | this.memory[imm16 + 1]; break;
      case 'STM': this.memory[imm16] = (reg[a] >> 8) & 0xFF; this.memory[imm16 + 1] = reg[a] & 0xFF; break;
      case 'PUSH':
        this.sp -= 2;
        if (this.sp < 0) throw new VmError('stack overflow', pc);
        this.memory[this.sp] = (reg[a] >> 8) & 0xFF;
        this.memory[this.sp + 1] = reg[a] & 0xFF;
        break;
      case 'POP':
        if (this.sp >= STACK_TOP) throw new VmError('stack underflow', pc);
        reg[a] = (this.memory[this.sp] << 8) | this.memory[this.sp + 1];
        this.sp += 2;
        break;
      case 'ADD': binop((x, y) => x + y); break;
      case 'SUB': binop((x, y) => x - y); break;
      case 'MUL': binop((x, y) => x * y); break;
      case 'DIV':
        if (reg[b] === 0) throw new VmError('division by zero', pc);
        binop((x, y) => Math.floor(x / y));
        break;
      case 'MOD':
        if (reg[b] === 0) throw new VmError('modulo by zero', pc);
        binop((x, y) => x % y);
        break;
      case 'INC': reg[a] = (reg[a] + 1) & 0xFFFF; this.setFlagFrom(reg[a]); break;
      case 'DEC': reg[a] = (reg[a] - 1) & 0xFFFF; this.setFlagFrom(reg[a]); break;
      case 'ADDI': reg[a] = (reg[a] + b) & 0xFFFF; this.setFlagFrom(reg[a]); break;
      case 'AND': binop((x, y) => x & y); break;
      case 'OR': binop((x, y) => x | y); break;
      case 'XOR': binop((x, y) => x ^ y); break;
      case 'NOT': reg[a] = ~reg[a] & 0xFFFF; this.setFlagFrom(reg[a]); break;
      case 'SHL': binop((x, y) => x << (y & 15)); break;
      case 'SHR': binop((x, y) => x >>> (y & 15)); break;
      case 'CMP': this.setCompareFlags(reg[a], reg[b]); break;
      case 'CMPI': this.setCompareFlags(reg[a], b); break;
      case 'MULI': reg[a] = (reg[a] * b) & 0xFFFF; this.setFlagFrom(reg[a]); break;
      case 'NEG': reg[a] = (-reg[a]) & 0xFFFF; this.setFlagFrom(reg[a]); break;
      case 'SWAP': { const t = reg[a]; reg[a] = reg[b]; reg[b] = t; break; }
      case 'LDX': reg[a] = (this.memory[reg[b]] << 8) | this.memory[reg[b] + 1]; break;
      case 'STX': this.memory[reg[a]] = (reg[b] >> 8) & 0xFF; this.memory[reg[a] + 1] = reg[b] & 0xFF; break;
      case 'JMP': this.pc = imm16; break;
      case 'JZ': if (this.z) this.pc = imm16; break;
      case 'JNZ': if (!this.z) this.pc = imm16; break;
      case 'JN': if (this.n) this.pc = imm16; break;
      case 'JNN': if (!this.n) this.pc = imm16; break;
      case 'CALL':
        this.sp -= 2;
        if (this.sp < 0) throw new VmError('stack overflow', pc);
        this.memory[this.sp] = (next >> 8) & 0xFF;
        this.memory[this.sp + 1] = next & 0xFF;
        this.pc = imm16;
        break;
      case 'RET':
        if (this.sp >= STACK_TOP) throw new VmError('stack underflow', pc);
        this.pc = (this.memory[this.sp] << 8) | this.memory[this.sp + 1];
        this.sp += 2;
        break;
      case 'OUT': this.output.push(reg[a] & 0xFF); break;
      case 'OUTI': this.output.push(a & 0xFF); break;
      case 'RND': reg[a] = Math.floor(Math.random() * 0x10000); break;
      case 'TIM': reg[a] = this.steps & 0xFFFF; break;
      default: throw new VmError(`unhandled mnemonic ${def.mnemonic}`, pc);
    }

    return { pc, opcode, mnemonic: def.mnemonic, text: null };
  }

  /**
   * Run until HLT, a breakpoint, the step budget, or an error.
   * Returns { halted, pausedAt, steps, output }.
   */
  run({ maxSteps = 5_000_000, breakpoints = null, trace = false } = {}) {
    const traceLog = trace ? [] : null;
    while (!this.halted) {
      if (breakpoints && breakpoints.has(this.pc)) {
        return { halted: false, pausedAt: this.pc, steps: this.steps, output: this.output, trace: traceLog, budgetHit: false };
      }
      if (this.steps >= maxSteps) return { halted: false, pausedAt: this.pc, steps: this.steps, output: this.output, trace: traceLog, budgetHit: true };
      const entry = this.step();
      if (traceLog) traceLog.push(entry);
    }
    return { halted: true, pausedAt: null, steps: this.steps, output: this.output, trace: traceLog, budgetHit: false };
  }
}
