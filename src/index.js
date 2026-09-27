// vm-forge — public API.

export {
  INSTRUCTIONS, BY_OPCODE, BY_NAME, operandSlots,
  REGISTERS, MEM_SIZE, WORD_SIZE, STACK_TOP, PROGRAM_START,
} from './isa.js';
export { assemble, AsmError } from './assembler.js';
export { disassemble, disassembleAt } from './disassembler.js';
export { VM, VmError } from './vm.js';

export const VERSION = '0.1.0';
