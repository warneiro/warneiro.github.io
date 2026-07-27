/* ===================================================================
   DNA# — Source parser (Symbol / Line / Helix modes)
   =================================================================== */

function skipComment(s, i) {
  while (i + 1 < s.length && s.substring(i, i + 2) !== "*/") i++;
  if (i + 1 >= s.length) throw new Error("Unterminated comment, missing */");
  return i + 2;
}

function parseSymbol(raw) {
  const out = [];
  let i = 0;
  while (i < raw.length) {
    if (raw.substring(i, i + 2) === "/*") { i = skipComment(raw, i); continue; }
    const ch = raw[i];
    if (!SYMBOL_FIRST_CHARS.has(ch)) throw new Error(`Unknown character '${ch}' (position ${i})`);
    const two = raw.substring(i, i + 2);
    if (MULTI_CHAR_SYMBOLS.has(two)) { out.push(two); i += 2; }
    else if (SINGLE_CHAR_SYMBOLS.has(ch)) { out.push(ch); i++; }
    else throw new Error(`Unknown symbol '${ch}' (position ${i})`);
  }
  return { instructions: out, lineFormSource: out.map(c => REVERSE_MAP[c]).join("") };
}

function parseLine(raw) {
  const out = [];
  let i = 0, kw = "";
  while (i < raw.length) {
    if (raw.substring(i, i + 2) === "/*") { i = skipComment(raw, i); continue; }
    const ch = raw[i];
    if (!"ATGC".includes(ch)) throw new Error(`Unknown character '${ch}' (position ${i})`);
    kw += ch;
    if (kw.length === 4) {
      if (!(kw in SYMBOL_MAP)) throw new Error(`Unknown DNA sequence "${kw}" (position ${i - 3})`);
      out.push(SYMBOL_MAP[kw]);
      kw = "";
    }
    i++;
  }
  if (kw) throw new Error(`Incomplete DNA sequence "${kw}" (end of file)`);
  return { instructions: out, lineFormSource: raw };
}

function parseHelix(raw) {
  const s = raw.replace(/-/g, "");
  const out = [];
  let i = 0, kw = "", lineBuf = "";
  while (i < s.length) {
    if (s.substring(i, i + 2) === "/*") { i = skipComment(s, i); continue; }
    const ch = s[i];
    if (!"ATGC".includes(ch)) throw new Error(`Unknown character '${ch}' (position ${i})`);
    kw += ch; lineBuf += ch;
    if (kw.length === 4) {
      if (!(kw in SYMBOL_MAP)) throw new Error(`Unknown DNA sequence "${kw}" (position ${i - 3})`);
      out.push(SYMBOL_MAP[kw]);
      kw = "";
    }
    i++;
  }
  if (kw) throw new Error(`Incomplete DNA sequence "${kw}" (end of file)`);
  return { instructions: out, lineFormSource: lineBuf };
}

function parseDNA(source, mode) {
  const raw = source.replace(/\s+/g, "");
  switch (mode) {
    case "symbol": return parseSymbol(raw);
    case "line":   return parseLine(raw);
    case "helix":  return parseHelix(raw);
    default: throw new Error(`Unknown mode "${mode}"`);
  }
}
