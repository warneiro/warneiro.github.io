/* ===================================================================
   DNA# — Interpreter (direct + visual with pause support)
   =================================================================== */

// ── Execution control (abort / pause / resume) ────────────────────

function createControl() {
  let _onResume = null;

  return {
    aborted: false,
    paused: false,

    waitForResume() {
      if (!this.paused) return Promise.resolve();
      return new Promise(resolve => { _onResume = resolve; });
    },

    resume() {
      this.paused = false;
      if (_onResume) { _onResume(); _onResume = null; }
    },

    pause() { this.paused = true; },

    abort() {
      this.aborted = true;
      this.resume();
    },

    reset() {
      this.aborted = false;
      this.paused = false;
      if (_onResume) { _onResume(); _onResume = null; }
    },
  };
}

// ── Jump-table helpers ────────────────────────────────────────────

function buildJumpTable(code) {
  const fwd = new Map(), bwd = new Map();
  const stack = [];
  for (let p = 0; p < code.length; p++) {
    if (code[p] === "[") stack.push(p);
    else if (code[p] === "]") {
      if (!stack.length) return { error: `Unmatched ']' (position ${p})` };
      const s = stack.pop();
      fwd.set(s, p); bwd.set(p, s);
    }
  }
  if (stack.length) return { error: `Unclosed '[' (position ${stack[0]})` };
  return { fwd, bwd, error: null };
}

function buildInput(inputData) {
  const chars = [...(inputData || "")];
  let inpIdx = 0;
  return {
    readChar() { return (inpIdx >= chars.length ? "" : chars[inpIdx++]); },
    readInt() {
      while (inpIdx < chars.length && /\s/.test(chars[inpIdx])) inpIdx++;
      if (inpIdx >= chars.length) return NaN;
      let s = "";
      if (chars[inpIdx] === "-") { s = "-"; inpIdx++; }
      while (inpIdx < chars.length && /[0-9]/.test(chars[inpIdx])) s += chars[inpIdx++];
      return (s === "" || s === "-") ? NaN : parseInt(s, 10);
    },
  };
}

// ── Shared instruction executor ───────────────────────────────────

function executeInstruction({ code, memory, ptr, pc, fwd, bwd, input, output, lineFormSource }) {
  let o = output;
  let p = pc;
  let r = ptr;

  const inst = code[p];
  const parseNewPtr = () => {
    p++;
    let np = r;
    while (p < code.length && (code[p] === ">" || code[p] === "<")) {
      np += code[p] === ">" ? 1 : -1;
      p++;
    }
    if (np < 0 || np >= MEMORY_SIZE) throw new Error(`newpointer out of bounds: ${np}`);
    return np;
  };

  if (inst === ">") { r++; if (r >= MEMORY_SIZE) throw new Error("Pointer out of bounds (right)"); p++; }
  else if (inst === "<") { r--; if (r < 0) throw new Error("Pointer out of bounds (left)"); p++; }
  else if (inst === "+") { memory[r] = (memory[r] + 1) % 256; p++; }
  else if (inst === "-") { memory[r] = (memory[r] - 1 + 256) % 256; p++; }
  else if (inst === ".") { o += String.fromCharCode(memory[r]); p++; }
  else if (inst === ",") { const ch = input.readChar(); memory[r] = ch ? ch.charCodeAt(0) % 256 : 0; p++; }
  else if (inst === "[") { p = memory[r] === 0 ? fwd.get(p) + 1 : p + 1; }
  else if (inst === "]") { p = memory[r] !== 0 ? bwd.get(p) : p + 1; }
  else if (inst === ":=") { const np = parseNewPtr(); memory[r] = memory[np]; }
  else if (inst === "+=") { const np = parseNewPtr(); memory[r] = (memory[r] + memory[np]) % 256; }
  else if (inst === "-=") { const np = parseNewPtr(); memory[r] = (memory[r] - memory[np] + 256) % 256; }
  else if (inst === "*=") { const np = parseNewPtr(); memory[r] = (memory[r] * memory[np]) % 256; }
  else if (inst === "/=") {
    const np = parseNewPtr();
    if (memory[np] === 0) throw new Error(`Division by zero (position ${pc})`);
    memory[r] = Math.floor(memory[r] / memory[np]) % 256;
  }
  else if (inst === "~") { o += String(memory[r]); p++; }
  else if (inst === "?") { const v = input.readInt(); memory[r] = isNaN(v) ? 0 : ((v % 256) + 256) % 256; p++; }
  else if (inst === QUINE_TOKEN) {
    if (p + QUINE_LENGTH - 1 < code.length && code.slice(p, p + QUINE_LENGTH).every(c => c === QUINE_TOKEN)) {
      o += lineFormSource; p += QUINE_LENGTH;
    } else p++;
  }
  else throw new Error(`Unknown instruction "${inst}" (position ${pc})`);

  return { output: o, ptr: r, pc: p };
}

// ── Direct runner (synchronous) ──────────────────────────────────

function runDNA(code, lineFormSource, inputData) {
  const jump = buildJumpTable(code);
  if (jump.error) return { output: "", error: jump.error };

  const memory = new Uint8Array(MEMORY_SIZE);
  const input = buildInput(inputData);
  let ptr = 0, pc = 0, output = "";

  try {
    while (pc < code.length) {
      const result = executeInstruction({
        code, memory, ptr, pc,
        fwd: jump.fwd, bwd: jump.bwd,
        input, output, lineFormSource,
      });
      ptr = result.ptr;
      pc = result.pc;
      output = result.output;
    }
  } catch (e) {
    return { output, error: e.message };
  }
  return { output, error: null };
}

// ── Delay helper (pause-aware, abort-aware) ──────────────────────

async function delayStep(ms, control) {
  if (ms <= 0) return;
  for (let elapsed = 0; elapsed < ms; elapsed += 25) {
    if (control.aborted) return;
    await control.waitForResume();
    if (control.aborted) return;
    await new Promise(r => setTimeout(r, Math.min(25, ms - elapsed)));
  }
}

// ── Visual runner (async, with pause / abort) ────────────────────

async function runDNAVisual(code, lineFormSource, inputData, delayMs, onStep, control) {
  const jump = buildJumpTable(code);
  if (jump.error) return { output: "", error: jump.error };

  const memory = new Uint8Array(MEMORY_SIZE);
  const input = buildInput(inputData);
  let ptr = 0, pc = 0, output = "";

  try {
    while (pc < code.length) {
      if (control.aborted) return { output, error: "Execution stopped" };
      await control.waitForResume();
      if (control.aborted) return { output, error: "Execution stopped" };

      const currentPc = pc;

      const result = executeInstruction({
        code, memory, ptr, pc,
        fwd: jump.fwd, bwd: jump.bwd,
        input, output, lineFormSource,
      });
      ptr = result.ptr;
      pc = result.pc;
      output = result.output;

      onStep(currentPc, output);

      await delayStep(delayMs, control);
    }
  } catch (e) {
    return { output, error: e.message };
  }
  return { output, error: null };
}
