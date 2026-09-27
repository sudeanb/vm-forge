// VM Forge assembler — two-pass, label-capable, line-precise errors.
//
// Syntax:
//   label:  MNEMONIC operands    ; comment
//   label:  .word 1, 0xFF, other ; data words (2 bytes each)
// Numbers are decimal or 0x-hex. Labels resolve wherever a 16-bit immediate
// or address is expected. Every instruction is 4 bytes; each .word item 2.

import { BY_NAME, operandSlots, PROGRAM_START, WORD_SIZE } from './isa.js';

export class AsmError extends Error {
  constructor(message, line) {
    super(line ? `${message} (line ${line})` : message);
    this.line = line;
  }
}

const REG = /^R([0-7])$/i;
const NUM = /^(0x[0-9a-f]+|\d+)$/i;

function parseNumber(token, line) {
  if (!NUM.test(token)) throw new AsmError(`'${token}' is not a number`, line);
  return Number(token) & 0xFFFF;
}

function tokenizeLine(raw) {
  // strip comments and commas, split label from the rest
  let line = raw.replace(/;.*$/, '').replace(/,/g, ' ').trim();
  let label = null;
  const labelMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*/);
  if (labelMatch) {
    label = labelMatch[1];
    line = line.slice(labelMatch[0].length).trim();
  }
  const parts = line.length ? line.split(/\s+/) : [];
  return { label, parts, line: raw, text: line };
}

export function assemble(source) {
  const lines = source.split('\n');
  const statements = [];   // {mnemonic|'.word', operands, lineNo, addr}
  const labels = new Map();

  // ---- pass 1: layout & labels ----
  let addr = PROGRAM_START;
  for (let i = 0; i < lines.length; i++) {
    const { label, parts } = tokenizeLine(lines[i]);
    if (label) {
      if (labels.has(label)) throw new AsmError(`duplicate label '${label}'`, i + 1);
      labels.set(label, addr);
    }
    if (!parts.length) continue;

    const head = parts[0].toUpperCase();
    if (head === '.WORD') {
      if (parts.length < 2) throw new AsmError('.word needs at least one value', i + 1);
      statements.push({ kind: 'words', tokens: parts.slice(1), lineNo: i + 1, addr });
      addr += (parts.length - 1) * 2;
      continue;
    }
    const def = BY_NAME.get(head);
    if (!def) throw new AsmError(`unknown instruction '${parts[0]}'`, i + 1);
    statements.push({ kind: 'instr', def, tokens: parts.slice(1), lineNo: i + 1, addr });
    addr += WORD_SIZE;
  }

  // ---- pass 2: emit ----
  const image = new Uint8Array(Math.max(addr, 4));
  const listing = [];

  const resolve16 = (token, lineNo) => {
    if (labels.has(token)) return labels.get(token);
    return parseNumber(token, lineNo);
  };
  const regNum = (token, lineNo) => {
    const m = token.match(REG);
    if (!m) throw new AsmError(`'${token}' is not a register (R0-R7)`, lineNo);
    return Number(m[1]);
  };
  const imm8 = (token, lineNo) => {
    const v = labels.has(token) ? labels.get(token) : parseNumber(token, lineNo);
    if (v > 0xFF) throw new AsmError(`'${token}' does not fit in 8 bits`, lineNo);
    return v;
  };

  for (const st of statements) {
    if (st.kind === 'words') {
      st.tokens.forEach((tok, k) => {
        const v = resolve16(tok, st.lineNo);
        image[st.addr + k * 2] = (v >> 8) & 0xFF;
        image[st.addr + k * 2 + 1] = v & 0xFF;
      });
      listing.push({ addr: st.addr, text: st.tokens.map((t) => resolve16(t, st.lineNo)).join(', '), words: true });
      continue;
    }

    const { mnemonic, opcode } = st.def;
    const slots = operandSlots(mnemonic);
    const args = st.tokens;
    const need = (slots.a ? 1 : 0) + (slots.b ? 1 : 0) + (slots.bc ? 1 : 0);
    if (args.length !== need) {
      throw new AsmError(`${mnemonic} expects ${need} operand(s), got ${args.length}`, st.lineNo);
    }

    let a = 0, b = 0, c = 0, textParts = [mnemonic];
    let argIdx = 0;

    if (slots.a === 'reg') {
      a = regNum(args[argIdx++], st.lineNo);
      textParts.push('R' + a);
    } else if (slots.a === 'imm8') {
      a = imm8(args[argIdx++], st.lineNo);
      textParts.push(args[argIdx - 1]);
    }
    if (slots.b === 'reg') {
      b = regNum(args[argIdx++], st.lineNo);
      textParts.push('R' + b);
    } else if (slots.b === 'imm8') {
      b = imm8(args[argIdx++], st.lineNo);
      textParts.push(args[argIdx - 1]);
    }
    if (slots.bc === 'imm16') {
      const v = resolve16(args[argIdx++], st.lineNo);
      b = (v >> 8) & 0xFF;
      c = v & 0xFF;
      textParts.push('0x' + v.toString(16).toUpperCase().padStart(4, '0'));
    }

    image[st.addr] = opcode;
    image[st.addr + 1] = a;
    image[st.addr + 2] = b;
    image[st.addr + 3] = c;
    listing.push({ addr: st.addr, text: textParts.join(' ') });
  }

  return { image, labels, listing, size: addr - PROGRAM_START };
}
