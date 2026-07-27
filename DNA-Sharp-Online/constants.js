/* ===================================================================
   DNA# — Constants & symbol tables
   =================================================================== */

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
