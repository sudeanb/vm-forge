// VM Forge disassembler — decodes 4-byte instructions back to text.
// The round trip assembler → image → disassembler is part of the test suite.

import { BY_OPCODE } from './isa.js';

export function disassembleAt(memory, addr) {
  const opcode = memory[addr];
  const a = memory[addr + 1];
  const b = memory[addr + 2];
  const c = memory[addr + 3];
  const def = BY_OPCODE.get(opcode);
  if (!def) return `DW 0x${opcode.toString(16).toUpperCase().padStart(2, '0')}`;

  const imm16 = (b << 8) | c;
  const hex = imm16.toString(16).toUpperCase().padStart(4, '0');
  const { mnemonic } = def;

  switch (mnemonic) {
    case 'LD': return `LD R${a}, 0x${hex}`;
    case 'LDM': return `LDM R${a}, 0x${hex}`;
    case 'STM': return `STM R${a}, 0x${hex}`;
    case 'MOV': case 'ADD': case 'SUB': case 'MUL': case 'DIV': case 'MOD':
    case 'AND': case 'OR': case 'XOR': case 'SHL': case 'SHR': case 'CMP':
    case 'SWAP': case 'LDX': case 'STX':
      return `${mnemonic} R${a}, R${b}`;
    case 'ADDI': case 'CMPI': case 'MULI':
      return `${mnemonic} R${a}, ${b}`;
    case 'JMP': case 'JZ': case 'JNZ': case 'JN': case 'JNN': case 'CALL':
      return `${mnemonic} 0x${hex}`;
    case 'PUSH': case 'POP': case 'INC': case 'DEC': case 'NOT':
    case 'OUT': case 'RND': case 'TIM':
      return `${mnemonic} R${a}`;
    case 'OUTI':
      return `OUTI ${a}`;
    default:
      return mnemonic; // NOP, HLT, RET
  }
}

export function disassemble(memory, start = 0, length = 0x100) {
  const lines = [];
  for (let addr = start; addr < Math.min(start + length, memory.length); addr += 4) {
    lines.push(`${addr.toString(16).padStart(4, '0')}  ${disassembleAt(memory, addr)}`);
  }
  return lines;
}
