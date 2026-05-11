/* ===================================================================
   DNA# Web 解释器 — 纯静态版
   将所有常量、解析器、解释器、UI 逻辑合并为单文件
   =================================================================== */

// ════════════════════════════════════════════════════════════
//  常  量
// ════════════════════════════════════════════════════════════

const SYMBOL_MAP = Object.freeze({
  ATAT: ">", ATGC: "<", ATTA: "+", ATCG: "-",
  GCAT: ".", GCGC: ",", GCTA: "[", GCCG: "]",
  TAAT: ":=", TAGC: "+=", TATA: "-=", TACG: "*=",
  CGAT: "/=", CGGC: "~", CGTA: "?", CGCG: "X",
});

const REVERSE_MAP = Object.freeze(
  Object.fromEntries(Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]))
);

const MULTI_CHAR_SYMBOLS = new Set([":=", "+=", "-=", "*=", "/="]);
const SINGLE_CHAR_SYMBOLS = new Set([">", "<", "+", "-", ".", ",", "[", "]", "~", "?", "X"]);
const SYMBOL_FIRST_CHARS = new Set([...MULTI_CHAR_SYMBOLS].map(s => s[0]));
for (const c of SINGLE_CHAR_SYMBOLS) SYMBOL_FIRST_CHARS.add(c);

const QUINE_TOKEN = "X";
const QUINE_LENGTH = 3;
const MEMORY_SIZE = 30000;

// ════════════════════════════════════════════════════════════
//  解  析  器
// ════════════════════════════════════════════════════════════

function skipComment(s, i) {
  while (i + 1 < s.length && s.substring(i, i + 2) !== "*/") i++;
  if (i + 1 >= s.length) throw new Error("注释未结束，缺少 */");
  return i + 2;
}

function parseSymbol(raw) {
  const out = [];
  let i = 0;
  while (i < raw.length) {
    if (raw.substring(i, i + 2) === "/*") { i = skipComment(raw, i); continue; }
    const ch = raw[i];
    if (!SYMBOL_FIRST_CHARS.has(ch)) throw new Error(`未知字符 '${ch}'（位置 ${i}）`);
    const two = raw.substring(i, i + 2);
    if (MULTI_CHAR_SYMBOLS.has(two)) { out.push(two); i += 2; }
    else if (SINGLE_CHAR_SYMBOLS.has(ch)) { out.push(ch); i++; }
    else throw new Error(`未知符号 '${ch}'（位置 ${i}）`);
  }
  return { instructions: out, lineFormSource: out.map(c => REVERSE_MAP[c]).join("") };
}

function parseLine(raw) {
  const out = [];
  let i = 0, kw = "";
  while (i < raw.length) {
    if (raw.substring(i, i + 2) === "/*") { i = skipComment(raw, i); continue; }
    const ch = raw[i];
    if (!"ATGC".includes(ch)) throw new Error(`未知字符 '${ch}'（位置 ${i}）`);
    kw += ch;
    if (kw.length === 4) {
      if (!(kw in SYMBOL_MAP)) throw new Error(`未知 DNA 序列 "${kw}"（位置 ${i - 3}）`);
      out.push(SYMBOL_MAP[kw]);
      kw = "";
    }
    i++;
  }
  if (kw) throw new Error(`不完整的 DNA 序列 "${kw}"（文件末尾）`);
  return { instructions: out, lineFormSource: raw };
}

function parseHelix(raw) {
  const s = raw.replace(/-/g, "");
  const out = [];
  let i = 0, kw = "", lineBuf = "";
  while (i < s.length) {
    if (s.substring(i, i + 2) === "/*") { i = skipComment(s, i); continue; }
    const ch = s[i];
    if (!"ATGC".includes(ch)) throw new Error(`未知字符 '${ch}'（位置 ${i}）`);
    kw += ch; lineBuf += ch;
    if (kw.length === 4) {
      if (!(kw in SYMBOL_MAP)) throw new Error(`未知 DNA 序列 "${kw}"（位置 ${i - 3}）`);
      out.push(SYMBOL_MAP[kw]);
      kw = "";
    }
    i++;
  }
  if (kw) throw new Error(`不完整的 DNA 序列 "${kw}"（文件末尾）`);
  return { instructions: out, lineFormSource: lineBuf };
}

function parseDNA(source, mode) {
  const raw = source.replace(/\s+/g, "");
  switch (mode) {
    case "symbol": return parseSymbol(raw);
    case "line":   return parseLine(raw);
    case "helix":  return parseHelix(raw);
    default: throw new Error(`未知模式 "${mode}"`);
  }
}

// ════════════════════════════════════════════════════════════
//  解  释  器
// ════════════════════════════════════════════════════════════

function runDNA(code, lineFormSource, inputData) {
  const memory = new Uint8Array(MEMORY_SIZE);
  let ptr = 0, pc = 0;

  // 括号跳转表
  const fwd = new Map(), bwd = new Map();
  {
    const stack = [];
    for (let p = 0; p < code.length; p++) {
      if (code[p] === "[") stack.push(p);
      else if (code[p] === "]") {
        if (!stack.length) return { output: "", error: `多余的 ']'（位置 ${p}）` };
        const s = stack.pop();
        fwd.set(s, p); bwd.set(p, s);
      }
    }
    if (stack.length) return { output: "", error: `未闭合的 '['（位置 ${stack[0]}）` };
  }

  // 输入
  const chars = [...(inputData || "")];
  let inpIdx = 0;
  const readChar = () => (inpIdx >= chars.length ? "" : chars[inpIdx++]);
  const readInt = () => {
    while (inpIdx < chars.length && /\s/.test(chars[inpIdx])) inpIdx++;
    if (inpIdx >= chars.length) return NaN;
    let s = "";
    if (chars[inpIdx] === "-") { s = "-"; inpIdx++; }
    while (inpIdx < chars.length && /[0-9]/.test(chars[inpIdx])) s += chars[inpIdx++];
    return (s === "" || s === "-") ? NaN : parseInt(s, 10);
  };

  let output = "";

  // newpointer 解析
  function parseNewPtr() {
    pc++;
    let np = ptr;
    while (pc < code.length && (code[pc] === ">" || code[pc] === "<")) {
      np += code[pc] === ">" ? 1 : -1;
      pc++;
    }
    if (np < 0 || np >= MEMORY_SIZE) throw new Error(`newpointer 越界：${np}`);
    return np;
  }

  try {
    while (pc < code.length) {
      const inst = code[pc];

      if (inst === ">") { ptr++; if (ptr >= MEMORY_SIZE) throw new Error("指针越界（右）"); pc++; }
      else if (inst === "<") { ptr--; if (ptr < 0) throw new Error("指针越界（左）"); pc++; }
      else if (inst === "+") { memory[ptr] = (memory[ptr] + 1) % 256; pc++; }
      else if (inst === "-") { memory[ptr] = (memory[ptr] - 1 + 256) % 256; pc++; }
      else if (inst === ".") { output += String.fromCharCode(memory[ptr]); pc++; }
      else if (inst === ",") { const ch = readChar(); memory[ptr] = ch ? ch.charCodeAt(0) % 256 : 0; pc++; }
      else if (inst === "[") { pc = memory[ptr] === 0 ? fwd.get(pc) + 1 : pc + 1; }
      else if (inst === "]") { pc = memory[ptr] !== 0 ? bwd.get(pc) : pc + 1; }
      else if (inst === ":=") { const np = parseNewPtr(); memory[ptr] = memory[np]; }
      else if (inst === "+=") { const np = parseNewPtr(); memory[ptr] = (memory[ptr] + memory[np]) % 256; }
      else if (inst === "-=") { const np = parseNewPtr(); memory[ptr] = (memory[ptr] - memory[np] + 256) % 256; }
      else if (inst === "*=") { const np = parseNewPtr(); memory[ptr] = (memory[ptr] * memory[np]) % 256; }
      else if (inst === "/=") {
        const np = parseNewPtr();
        if (memory[np] === 0) throw new Error(`除零错误（位置 ${pc}）`);
        memory[ptr] = Math.floor(memory[ptr] / memory[np]) % 256;
      }
      else if (inst === "~") { output += String(memory[ptr]); pc++; }
      else if (inst === "?") { const v = readInt(); memory[ptr] = isNaN(v) ? 0 : ((v % 256) + 256) % 256; pc++; }
      else if (inst === QUINE_TOKEN) {
        if (pc + QUINE_LENGTH - 1 < code.length && code.slice(pc, pc + QUINE_LENGTH).every(c => c === QUINE_TOKEN)) {
          output += lineFormSource; pc += QUINE_LENGTH;
        } else pc++;
      }
      else throw new Error(`未知指令 "${inst}"（位置 ${pc}）`);
    }
  } catch (e) {
    return { output, error: e.message };
  }
  return { output, error: null };
}

// ════════════════════════════════════════════════════════════
//  示  例
// ════════════════════════════════════════════════════════════

const EXAMPLES = {
  helloWorld: {
    name: "Hello World",
    symbol: "+++=+=X>:=<-*=+=X>:=<<+=+=X<+=<--.---.+=<-..+++.>.<+=<.-=<.+++.-=<++.-=<.>+.",
  },
  fibonacci: {
    name: "Fibonacci Numbers",
    symbol: "+++++*=X>>+>>:=<<<<+++++++<<<<[>>>:=<+=<<X<<:=>X>:=>X>~><<<<-]",
  },
  quine: {
    name: "Quine",
    symbol: "XXX",
  },
};

// ════════════════════════════════════════════════════════════
//  UI
// ════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  const modeSelect   = document.getElementById("mode-select");
  const exampleSel   = document.getElementById("example-select");
  const sourceEditor = document.getElementById("source-editor");
  const inputEditor  = document.getElementById("input-editor");
  const runBtn       = document.getElementById("run-btn");
  const clearBtn     = document.getElementById("clear-btn");
  const outputArea   = document.getElementById("output-area");
  const errorArea    = document.getElementById("error-area");

  // 加载示例下拉
  for (const [key, ex] of Object.entries(EXAMPLES)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = ex.name;
    exampleSel.appendChild(opt);
  }

  // 选择示例
  exampleSel.addEventListener("change", () => {
    const ex = EXAMPLES[exampleSel.value];
    if (!ex) return;
    sourceEditor.value = ex.symbol || "";
    modeSelect.value = "symbol";
  });

  function showError(msg) {
    errorArea.textContent = msg;
    errorArea.style.display = "block";
    outputArea.textContent = "";
  }
  function clearError() {
    errorArea.textContent = "";
    errorArea.style.display = "none";
  }

  // 运行
  function runCode() {
    const source = sourceEditor.value.trim();
    if (!source) { showError("请输入 DNA# 源码"); return; }

    clearError();
    outputArea.textContent = "运行中…";
    runBtn.disabled = true;

    // 使用 setTimeout 避免阻塞 UI
    setTimeout(() => {
      try {
        let parseResult;
        try {
          parseResult = parseDNA(source, modeSelect.value);
        } catch (e) {
          showError(e.message);
          outputArea.textContent = "";
          runBtn.disabled = false;
          return;
        }

        const result = runDNA(parseResult.instructions, parseResult.lineFormSource, inputEditor.value);
        if (result.error) {
          showError(result.error);
          outputArea.textContent = result.output || "";
        } else {
          clearError();
          outputArea.textContent = result.output || "（无输出）";
        }
      } catch (e) {
        showError(e.message);
      }
      runBtn.disabled = false;
    }, 10);
  }

  function clearAll() {
    sourceEditor.value = "";
    inputEditor.value = "";
    outputArea.textContent = "";
    clearError();
  }

  // 快捷键
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runCode();
    }
  });

  runBtn.addEventListener("click", runCode);
  clearBtn.addEventListener("click", clearAll);
});
