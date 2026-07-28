/* ===================================================================
   Codon — Parser & Interpreter (VM-based)
   =================================================================== */

const CODON_MAP = {
  GCU: "0", GCC: "0", GCA: "0", GCG: "0",
  CGU: "1", CGC: "1", CGA: "1", CGG: "1", AGA: "1", AGG: "1",
  AAU: "2", AAC: "2",
  GAU: "3", GAC: "3",
  UGU: "4", UGC: "4",
  CAA: "5", CAG: "5",
  GAA: "6", GAG: "6",
  GGU: "7", GGC: "7", GGA: "7", GGG: "7",
  CAU: "8", CAC: "8",
  AUU: "9", AUC: "9", AUA: "9",
  UUA: "A", UUG: "A", CUU: "A", CUC: "A", CUA: "A", CUG: "A",
  AAA: "B", AAG: "B",
  AUG: "C",
  UUU: "D", UUC: "D",
  CCU: "E", CCC: "E", CCA: "E", CCG: "E",
  UCU: "F", UCC: "F", UCA: "F", UCG: "F", AGU: "F", AGC: "F",
  ACU: "G", ACC: "G", ACA: "G", ACG: "G",
  UGG: "H",
  UAU: "I", UAC: "I",
  GUU: "J", GUC: "J", GUA: "J", GUG: "J",
  UAA: "X", UAG: "X", UGA: "X",
};

function parseCodon(source) {
  let cleaned = source.replace(/#.*/gm, "");
  cleaned = cleaned.toUpperCase().replace(/[^UCAG]/g, "");

  if (cleaned.length === 0) {
    throw new Error("No valid codons found in source");
  }
  if (cleaned.length % 3 !== 0) {
    throw new Error("Source length after stripping is not a multiple of 3 (incomplete codon)");
  }

  let compiled = "";
  const allCodons = [];
  for (let i = 0; i < cleaned.length; i += 3) {
    const codon = cleaned.substring(i, i + 3);
    const amino = CODON_MAP[codon];
    if (amino === undefined) {
      throw new Error(`Invalid codon "${codon}" at position ${i / 3}`);
    }
    compiled += amino;
    allCodons.push(codon);
  }

  const start = compiled.indexOf("C");
  if (start === -1) {
    throw new Error("No start codon (AUG) found");
  }
  const stop = compiled.indexOf("X", start + 1);
  if (stop === -1) {
    throw new Error("No stop codon (UAA/UAG/UGA) found after start");
  }

  return {
    compiled: compiled.slice(start, stop),
    codons: allCodons.slice(start, stop),
  };
}

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

// ── Codon VM (supports step-by-step execution) ───────────────────

function createCodonVM(compiled, inputStr) {
  let output = "";
  let a = 0;
  let b = 0;
  let flag = false;
  const mem = [];
  let inpIdx = 0;
  let pc = 1;
  let terminate = false;

  const floor = Math.floor;
  const getMem = (x) => mem[floor(x)] ?? 0;
  const setMem = (x, v) => { mem[floor(x)] = v; };

  function step() {
    if (terminate) return { done: true, output, pc, error: null };
    if (pc >= compiled.length) return { done: true, output, pc, error: null };

    const currentPc = pc;
    const inst = compiled[pc];

    try {
      switch (inst) {
        case "0":
          [a, b] = [b, a];
          break;
        case "1":
          b = a;
          break;
        case "2":
          a = getMem(a);
          break;
        case "3":
          setMem(b, a);
          break;
        case "4":
          flag = !flag;
          break;
        case "5":
          if (pc + 2 >= compiled.length) throw new Error("Unexpected end of program in 2-codon immediate load");
          a = parseInt(compiled.substring(pc + 1, pc + 3), 20);
          pc += 2;
          break;
        case "6":
          if (pc + 4 >= compiled.length) throw new Error("Unexpected end of program in 4-codon immediate load");
          a = parseInt(compiled.substring(pc + 1, pc + 5), 20);
          pc += 4;
          break;
        case "7":
          if (flag) {
            pc += floor(a) - 1;
            if (pc < 0) pc = 0;
            if (pc >= compiled.length) pc = compiled.length - 1;
          }
          break;
        case "8":
          if (inputStr && inpIdx < inputStr.length) {
            a = inputStr.charCodeAt(inpIdx++);
          } else {
            a = 0;
          }
          break;
        case "9":
          output += String.fromCodePoint(floor(a));
          break;
        case "A":
          a += b;
          break;
        case "B":
          a -= b;
          break;
        case "C":
          terminate = true;
          break;
        case "D":
          a *= b;
          break;
        case "E":
          if (b === 0) throw new Error("Division by zero");
          a /= b;
          break;
        case "F":
          a = Math.round(a);
          break;
        case "G":
          a = -a;
          break;
        case "H":
          flag = a > b;
          break;
        case "I":
          flag = a < b;
          break;
        case "J":
          flag = a === b;
          break;
        default:
          throw new Error(`Unknown opcode "${inst}" at compiled position ${pc}`);
      }
    } catch (e) {
      return { done: true, output, pc: currentPc, error: e.message };
    }

    pc++;

    if (terminate) {
      return { done: true, output, pc: currentPc, error: null };
    }

    return { done: false, output, pc: currentPc, error: null };
  }

  return { step, getState: () => ({ pc, output, a, b, flag, terminate }) };
}

// ── Direct runner (synchronous) ──────────────────────────────────

function runCodon(compiled, inputStr) {
  const vm = createCodonVM(compiled, inputStr);
  let result;
  while (!(result = vm.step()).done) {}
  return { output: result.output, error: result.error };
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

async function runCodonVisual(compiled, inputStr, delayMs, onStep, control) {
  const vm = createCodonVM(compiled, inputStr);

  try {
    while (true) {
      if (control.aborted) return { output: vm.getState().output, error: "Execution stopped" };
      await control.waitForResume();
      if (control.aborted) return { output: vm.getState().output, error: "Execution stopped" };

      const result = vm.step();
      if (result.error) {
        onStep(result.pc, result.output);
        return { output: result.output, error: result.error };
      }

      onStep(result.pc, result.output);

      if (result.done) return { output: result.output, error: null };

      await delayStep(delayMs, control);
    }
  } catch (e) {
    return { output: vm.getState().output, error: e.message };
  }
}
