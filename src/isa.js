// VM Forge ISA — the VFA-16 instruction set architecture.
//
// 16-bit words, 64 KB byte-addressable memory, 8 registers (R0-R7), a
// downward-growing stack, and two flags (Z = zero, N = below, set by CMP
// and by every arithmetic/logic operation on its result).
//
// Every instruction is FIXED 4 bytes: [opcode, a, b, c]. Simple to assemble,
// disassemble, and step through. Operand slots carry register numbers,
// 8-bit immediates, or the halves of a 16-bit immediate/address (b = high
// byte, c = low byte).

export const REGISTERS = 8;
export const MEM_SIZE = 65536;
export const WORD_SIZE = 4;
export const STACK_TOP = 0xFFFE; // first push lands at 0xFFFC-0xFFFD

// Operand kinds per mnemonic, used by the assembler to validate syntax:
//   r  = register          i16 = 16-bit immediate/address (label ok)
//   i8 = 8-bit immediate   n   = no operand
const DEFS = [
  // [mnemonic, opcode, operands, setsFlags, description]
  ['NOP',   0x00, 'n',  false, 'do nothing'],
  ['HLT',   0x01, 'n',  false, 'halt the machine'],
  ['LD',    0x02, 'r i16', false, 'load 16-bit immediate'],
  ['MOV',   0x03, 'r r', false, 'copy register'],
  ['LDM',   0x04, 'r i16', false, 'load from memory[addr]'],
  ['STM',   0x05, 'r i16', false, 'store register to memory[addr]'],
  ['PUSH',  0x06, 'r',  false, 'push register (stack grows down)'],
  ['POP',   0x07, 'r',  false, 'pop into register'],
  ['ADD',   0x08, 'r r', true,  'rd += rs'],
  ['SUB',   0x09, 'r r', true,  'rd -= rs'],
  ['MUL',   0x0A, 'r r', true,  'rd *= rs (low 16 bits)'],
  ['DIV',   0x0B, 'r r', true,  'rd /= rs (unsigned, traps on zero)'],
  ['MOD',   0x0C, 'r r', true,  'rd %= rs (unsigned, traps on zero)'],
  ['INC',   0x0D, 'r',  true,  'rd += 1'],
  ['DEC',   0x0E, 'r',  true,  'rd -= 1'],
  ['ADDI',  0x0F, 'r i8', true, 'rd += imm8'],
  ['AND',   0x10, 'r r', true,  'bitwise and'],
  ['OR',    0x11, 'r r', true,  'bitwise or'],
  ['XOR',   0x12, 'r r', true,  'bitwise xor'],
  ['NOT',   0x13, 'r',  true,  'bitwise not'],
  ['SHL',   0x14, 'r r', true,  'rd <<= (rs & 15)'],
  ['SHR',   0x15, 'r r', true,  'rd >>= (rs & 15)'],
  ['CMP',   0x16, 'r r', true,  'flags only: Z = eq, N = a < b'],
  ['NEG',   0x17, 'r',  true,  'rd = -rd'],
  ['SWAP',  0x18, 'r r', false, 'exchange two registers'],
  ['JMP',   0x19, 'i16', false, 'unconditional jump'],
  ['JZ',    0x1A, 'i16', false, 'jump if Z'],
  ['JNZ',   0x1B, 'i16', false, 'jump if not Z'],
  ['JN',    0x1C, 'i16', false, 'jump if N (a < b)'],
  ['JNN',   0x1D, 'i16', false, 'jump if not N'],
  ['CALL',  0x1E, 'i16', false, 'push PC, jump'],
  ['RET',   0x1F, 'n',  false, 'pop PC'],
  ['OUT',   0x20, 'r',  false, 'write register byte to console'],
  ['OUTI',  0x21, 'i8', false, 'write immediate byte to console'],
  ['RND',   0x22, 'r',  false, 'rd = random 16-bit'],
  ['TIM',   0x23, 'r',  false, 'rd = instruction counter (low 16 bits)'],
  ['CMPI',  0x24, 'r i8', true, 'flags only against immediate'],
  ['MULI',  0x25, 'r i8', true, 'rd *= imm8'],
  ['LDX',   0x26, 'r r', false, 'rd = word at memory[rs] (indirect)'],
  ['STX',   0x27, 'r r', false, 'store rs to word at memory[rd] (indirect)'],
];

export const INSTRUCTIONS = DEFS.map(([mnemonic, opcode, operands, setsFlags, description]) => ({
  mnemonic, opcode, operands, setsFlags, description,
}));

export const BY_OPCODE = new Map(INSTRUCTIONS.map((i) => [i.opcode, i]));
export const BY_NAME = new Map(INSTRUCTIONS.map((i) => [i.mnemonic, i]));

/** Operand slot layout for a mnemonic, e.g. LD -> ['reg', 'hiLo'] in slots b/c. */
export function operandSlots(mnemonic) {
  switch (mnemonic) {
    case 'LD': case 'LDM': case 'STM':
      return { a: 'reg', bc: 'imm16' };           // [op, reg, hi, lo]
    case 'MOV': case 'ADD': case 'SUB': case 'MUL': case 'DIV': case 'MOD':
    case 'AND': case 'OR': case 'XOR': case 'SHL': case 'SHR': case 'CMP':
    case 'SWAP': case 'LDX': case 'STX':
      return { a: 'reg', b: 'reg' };              // [op, rd, rs, 0]
    case 'ADDI': case 'CMPI': case 'MULI':
      return { a: 'reg', b: 'imm8' };             // [op, rd, imm, 0]
    case 'JMP': case 'JZ': case 'JNZ': case 'JN': case 'JNN': case 'CALL':
      return { bc: 'imm16' };                     // [op, 0, hi, lo]
    case 'PUSH': case 'POP': case 'INC': case 'DEC': case 'NOT': case 'NEG':
    case 'OUT': case 'RND': case 'TIM':
      return { a: 'reg' };                        // [op, reg, 0, 0]
    case 'OUTI':
      return { a: 'imm8' };                       // [op, imm, 0, 0]
    case 'NOP': case 'HLT': case 'RET':
      return {};                                  // [op, 0, 0, 0]
    default:
      throw new Error(`unknown mnemonic ${mnemonic}`);
  }
}

export const PROGRAM_START = 0x0000; // VFA-16 loads at zero — simpler for an ISA toy
