// VM Forge playground — in-browser assembler + visual debugger.

import { assemble } from '../src/assembler.js';
import { VM } from '../src/vm.js';

// Curated single-screen examples; the full programs ship in programs/.
const SOURCES = {
  hello: `; print a string with OUTI
        OUTI 72   ; H
        OUTI 101  ; e
        OUTI 108  ; l
        OUTI 108  ; l
        OUTI 111  ; o
        OUTI 10
        HLT`,
  countdown: `; print 5 down to 1
        LD R0, 5
loop:   LD R2, 10
        MOV R1, R0
        DIV R1, R2      ; tens
        MOV R3, R0
        MOD R3, R2      ; ones
        ADDI R1, 48
        OUT R1
        ADDI R3, 48
        OUT R3
        OUTI 10
        DEC R0
        CMPI R0, 0
        JNZ loop
        HLT`,
  fib: `; recursive fib(8) -> prints 21
        LD R0, 8
        CALL fib
        MOV R1, R0
        CALL printnum
        OUTI 10
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
printnum:
        PUSH R4
        MOV R2, R1
        LD R5, 10
        LD R4, 0
pd:     MOV R0, R2
        DIV R0, R5
        MOV R1, R2
        MOD R1, R5
        ADDI R1, 48
        PUSH R1
        INC R4
        MOV R2, R0
        CMPI R2, 0
        JNZ pd
pl:     POP R0
        OUT R0
        DEC R4
        JNZ pl
        POP R4
        RET`,
};

// ---------- state ----------

const srcEl = document.getElementById('src');
const msgEl = document.getElementById('asmmsg');
const disEl = document.getElementById('dis');
const regsEl = document.getElementById('regs');
const flagsEl = document.getElementById('flags');
const consoleEl = document.getElementById('console');
const memEl = document.getElementById('mem');
const memAddrEl = document.getElementById('memaddr');

let vm = new VM();
let listing = [];          // [{addr, text}] from assembler listing
let breakpoints = new Set();
let running = false;
let viewBase = 0x0000;
let raf = null;

// ---------- assembly ----------

function assembleSource() {
  msgEl.className = '';
  msgEl.textContent = '';
  try {
    const { image, listing: lst } = assemble(srcEl.value);
    listing = lst;
    breakpoints.clear();
    vm.load(image);
    renderDisassembly();
    renderCpu();
    msgEl.className = 'ok';
    msgEl.textContent = `assembled: ${image.length} bytes, ${lst.length} lines`;
    return true;
  } catch (err) {
    msgEl.className = 'err';
    msgEl.textContent = err.message;
    return false;
  }
}

// ---------- rendering ----------

function renderDisassembly() {
  if (!listing.length) { disEl.innerHTML = ''; return; }
  const maxAddr = listing[listing.length - 1].addr;
  disEl.innerHTML = listing.map(({ addr, text }) => {
    const cls = [addr === vm.pc ? 'pc' : '', breakpoints.has(addr) ? 'bp' : ''].join(' ');
    const state = addr === vm.pc && !vm.halted ? ' ◀' : vm.halted && addr === vm.pc ? ' ⏹' : '';
    return `<div data-addr="${addr}" class="${cls}">${addr.toString(16).padStart(4, '0')}  ${text}${state}</div>`;
  }).join('');
  const pcEl = disEl.querySelector('.pc');
  if (pcEl) pcEl.scrollIntoView({ block: 'nearest' });
}

function renderCpu() {
  let html = '';
  for (let i = 0; i < 8; i++) html += `<div><b>R${i}</b> ${vm.reg[i]} <span style="color:var(--muted)">0x${vm.reg[i].toString(16).padStart(4, '0')}</span></div>`;
  html += `<div><b>PC</b> 0x${vm.pc.toString(16).padStart(4, '0')}</div>`;
  html += `<div><b>SP</b> 0x${vm.sp.toString(16).padStart(4, '0')}</div>`;
  html += `<div><b>steps</b> ${vm.steps}</div>`;
  regsEl.innerHTML = html;
  flagsEl.innerHTML =
    `<span>Z <b>${vm.z ? 1 : 0}</b></span><span>N <b>${vm.n ? 1 : 0}</b></span>` +
    `<span>halted <b>${vm.halted ? 'yes' : 'no'}</b></span>` +
    `<span>output <b>${vm.output.length}B</b></span>`;
}

function renderMemory() {
  memAddrEl.textContent = `(0x${viewBase.toString(16).padStart(4, '0')} … +0x80)`;
  let html = '';
  for (let row = 0; row < 8; row++) {
    const base = viewBase + row * 16;
    let hex = '', asc = '';
    for (let k = 0; k < 16; k++) {
      const b = vm.memory[base + k];
      hex += b.toString(16).padStart(2, '0') + ' ';
      asc += b >= 32 && b < 127 ? String.fromCharCode(b) : '·';
    }
    html += `${base.toString(16).padStart(4, '0')}  ${hex} ${asc}\n`;
  }
  memEl.textContent = html;
}

function renderConsole() {
  consoleEl.textContent = vm.output.map((b) => String.fromCharCode(b)).join('');
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function renderAll() {
  renderDisassembly();
  renderCpu();
  renderMemory();
  renderConsole();
}

// ---------- execution ----------

function tick() {
  try {
    for (let i = 0; i < 200 && !vm.halted; i++) {
      if (breakpoints.has(vm.pc)) { running = false; setRunLabel(); break; }
      vm.step();
    }
  } catch (err) {
    running = false;
    setRunLabel();
    msgEl.className = 'err';
    msgEl.textContent = err.message;
  }
  renderAll();
  if (running) raf = requestAnimationFrame(tick);
}

function setRunLabel() {
  document.getElementById('run').textContent = running ? '⟳ Running…' : '▶ Run';
}

function start() {
  if (!assembleSource()) return;
  running = true;
  setRunLabel();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

function pause() {
  running = false;
  setRunLabel();
  renderAll();
}

function stepOnce() {
  running = false;
  setRunLabel();
  try { vm.step(); } catch (err) { msgEl.className = 'err'; msgEl.textContent = err.message; }
  renderAll();
}

function reset() {
  running = false;
  setRunLabel();
  assembleSource();
}

// ---------- wiring ----------

document.getElementById('run').addEventListener('click', start);
document.getElementById('pause').addEventListener('click', pause);
document.getElementById('step').addEventListener('click', stepOnce);
document.getElementById('reset').addEventListener('click', reset);

disEl.addEventListener('click', (e) => {
  const div = e.target.closest('div[data-addr]');
  if (!div) return;
  const addr = Number(div.dataset.addr);
  if (breakpoints.has(addr)) breakpoints.delete(addr);
  else breakpoints.add(addr);
  renderDisassembly();
});

// ---------- examples ----------

const sel = document.getElementById('example');
for (const name of Object.keys(SOURCES)) {
  const opt = document.createElement('option');
  opt.value = name;
  opt.textContent = name;
  sel.appendChild(opt);
}
document.getElementById('load').addEventListener('click', () => {
  srcEl.value = SOURCES[sel.value];
  reset();
});

srcEl.value = SOURCES.countdown;
assembleSource();
renderAll();
