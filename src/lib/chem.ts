/**
 * 化学式 / 化学符号解析
 * 把 H2SO4、Fe3+、Ca(OH)2、CuSO4·5H2O、\ce{2H2 + O2 -> 2H2O} 这类写法
 * 拆成「普通文字 / 下标 / 上标(电荷)」片段，供 Word 输出真实上下标。
 */

export type ChemPartType = "text" | "sub" | "sup";

export interface ChemPart {
  t: ChemPartType;
  v: string;
}

export interface ChemResult {
  parts: ChemPart[];
  /** 出现过的元素符号，用于判定是否真的像化学式 */
  elements: string[];
  /** 是否带有下标数字 */
  hasSubscript: boolean;
  /** 是否带有电荷 */
  hasCharge: boolean;
}

const ELEMENT_SOURCE =
  "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr " +
  "Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu " +
  "Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr " +
  "Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og";

const ELEMENTS = new Set(ELEMENT_SOURCE.split(" "));

/** 常见元素：用于过滤 “USB3”“A4” 这类非化学串 */
const CORE_ELEMENTS = new Set([
  "H", "O", "C", "N", "F", "Cl", "Br", "I", "Na", "K", "Ca", "Mg", "Al",
  "Fe", "Cu", "Zn", "Ag", "Ba", "Mn", "P", "Cr", "Pb", "Hg", "Sn", "Ni",
]);

const ARROWS: { src: string; out: string }[] = [
  { src: "<=>", out: "⇌" },
  { src: "<->", out: "⇌" },
  { src: "->", out: "→" },
  { src: "-->", out: "→" },
  { src: "=>", out: "⇒" },
  { src: "→", out: "→" },
  { src: "←", out: "←" },
  { src: "⇌", out: "⇌" },
  { src: "↑", out: "↑" },
  { src: "↓", out: "↓" },
];

const STATES = new Set(["aq", "s", "l", "g"]);

const BRACKET_PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

/**
 * 解析一段化学表达式（可以是单个式子，也可以是 \ce{...} 里的整条反应式）
 * 严格模式：遇到无法识别的内容返回 null
 */
export function parseChem(src: string): ChemResult | null {
  const parts: ChemPart[] = [];
  const elements: string[] = [];
  let hasSubscript = false;
  let hasCharge = false;
  let i = 0;

  const push = (t: ChemPartType, v: string) => {
    if (v) parts.push({ t, v });
  };

  const readDigits = (): string => {
    let d = "";
    while (i < src.length && /\d/.test(src[i])) {
      d += src[i];
      i++;
    }
    return d;
  };

  while (i < src.length) {
    const ch = src[i];
    const rest = src.slice(i);

    // 空白
    if (/\s/.test(ch)) {
      while (i < src.length && /\s/.test(src[i])) i++;
      push("text", " ");
      continue;
    }

    // 箭头
    const arrow = ARROWS.find((a) => rest.startsWith(a.src));
    if (arrow) {
      i += arrow.src.length;
      // 跳过箭头上的条件 \ce{->[\Delta]}
      if (src[i] === "[") {
        const end = src.indexOf("]", i);
        i = end === -1 ? src.length : end + 1;
      }
      push("text", ` ${arrow.out} `);
      continue;
    }

    // \Delta / \triangle（加热符号）
    if (/^\\?(Delta|triangle)/.test(rest)) {
      i += rest.match(/^\\?(Delta|triangle)/)![0].length;
      push("text", "Δ");
      continue;
    }

    // 反应分隔符
    if (ch === "+") {
      i++;
      push("text", " + ");
      continue;
    }
    if (ch === "=") {
      i++;
      push("text", " = ");
      continue;
    }
    if (ch === "·" || ch === "•" || (ch === "\\" && rest.startsWith("\\cdot"))) {
      if (ch === "\\") i += 5;
      else i++;
      push("text", "·");
      continue;
    }

    // 括号组（含结晶水、状态标记）
    const openBracket = BRACKET_PAIRS[ch];
    if (openBracket) {
      const close = openBracket;
      const end = findMatching(src, i, ch, close);
      if (end === -1) return null;
      const inner = src.slice(i + 1, end);
      if (STATES.has(inner.trim().toLowerCase())) {
        push("text", `(${inner})`);
        i = end + 1;
      } else if (inner === "") {
        push("text", ch + close);
        i = end + 1;
      } else {
        // 括号内是另一个化学基团，递归解析
        const sub = parseChem(inner);
        if (!sub) return null;
        push("text", ch);
        parts.push(...sub.parts);
        push("text", close);
        elements.push(...sub.elements);
        hasSubscript = hasSubscript || sub.hasSubscript;
        hasCharge = hasCharge || sub.hasCharge;
        i = end + 1;
      }
      const digits = readDigits();
      if (digits) {
        hasSubscript = true;
        push("sub", digits);
      }
      continue;
    }

    // 电荷：^ 形式 或尾部 +/-
    if (ch === "^") {
      i++;
      let charge = "";
      if (src[i] === "{") {
        const end = src.indexOf("}", i);
        charge = src.slice(i + 1, end === -1 ? src.length : end);
        i = end === -1 ? src.length : end + 1;
      } else {
        while (i < src.length && /[0-9+\-−]/.test(src[i])) {
          charge += src[i];
          i++;
        }
      }
      const norm = normalizeCharge(charge);
      if (!norm) return null;
      hasCharge = true;
      push("sup", norm);
      continue;
    }

    // 元素符号
    if (/[A-Z]/.test(ch)) {
      let symbol = ch;
      if (i + 1 < src.length && /[a-z]/.test(src[i + 1])) {
        symbol += src[i + 1];
        i += 2;
      } else {
        i += 1;
      }
      if (!ELEMENTS.has(symbol)) return null;
      elements.push(symbol);
      push("text", symbol);

      // 数字：可能是下标，也可能是电荷数量
      const digits = readDigits();
      if (digits) {
        const next = src[i];
        const isChargeDigits =
          (next === "+" || next === "-" || next === "−") &&
          (elements.length === 1 || digits.length >= 2);

        if (isChargeDigits) {
          if (digits.length >= 2) {
            const subPart = digits.slice(0, -1);
            const chargePart = digits.slice(-1);
            hasSubscript = true;
            push("sub", subPart);
            i += 1; // 消耗符号
            hasCharge = true;
            push("sup", `${chargePart}${next === "-" || next === "−" ? "-" : "+"}`);
            continue;
          }
          i += 1;
          hasCharge = true;
          push("sup", `${digits}${next === "-" || next === "−" ? "-" : "+"}`);
          continue;
        }

        hasSubscript = true;
        push("sub", digits);
      }

      // 紧跟的 + / - 视为电荷
      if (src[i] === "+" || src[i] === "-" || src[i] === "−") {
        const sign = src[i] === "+" ? "+" : "-";
        i++;
        hasCharge = true;
        push("sup", sign);
      }
      continue;
    }

    // 前导系数（如 2H2O 的 2）
    if (/\d/.test(ch)) {
      const digits = readDigits();
      push("text", digits);
      continue;
    }

    // 其它字符：视为无法识别
    return null;
  }

  if (elements.length === 0 && parts.length === 0) return null;
  return { parts: normalizeSpaces(mergeText(parts)), elements, hasSubscript, hasCharge };
}

/** 合并重复空格并去掉首尾空白 */
function normalizeSpaces(parts: ChemPart[]): ChemPart[] {
  const out = parts.map((p) => (p.t === "text" ? { ...p, v: p.v.replace(/\s{2,}/g, " ") } : { ...p }));
  if (out.length > 0 && out[0].t === "text") out[0].v = out[0].v.replace(/^\s+/, "");
  if (out.length > 0 && out[out.length - 1].t === "text") {
    out[out.length - 1].v = out[out.length - 1].v.replace(/\s+$/, "");
  }
  return out.filter((p) => p.v !== "");
}

/** 规整电荷写法：2+ / +2 / 2− / -2 → 2+ / + / 2- */
function normalizeCharge(raw: string): string | null {
  const s = raw.replace(/\s+/g, "").replace(/−/g, "-");
  if (!s) return null;
  const m = /^(\d*)([+-])$/.exec(s);
  if (m) return `${m[1]}${m[2]}`;
  const m2 = /^([+-])(\d+)$/.exec(s);
  if (m2) return `${m2[2]}${m2[1]}`;
  return null;
}

function findMatching(src: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function mergeText(parts: ChemPart[]): ChemPart[] {
  const out: ChemPart[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && last.t === p.t && p.t === "text") last.v += p.v;
    else out.push({ ...p });
  }
  return out;
}

/**
 * 判断纯文本片段是否“像化学式”，避免把 USB3、A4、COVID19 误判成化学式。
 * 规则：元素全部合法 + 有足够化学特征 + 至少含一个常见元素
 */
export function isPlainFormula(token: string): boolean {
  const t = token.trim();
  if (t.length < 2 || t.length > 40) return false;
  if (!/[A-Z]/.test(t)) return false;

  const parsed = parseChem(t);
  if (!parsed) return false;

  // 必须完整消费：不允许留下未识别内容
  const rebuilt = parsed.parts.map((p) => p.v).join("");
  if (rebuilt.replace(/\s/g, "").length === 0) return false;

  const { elements, hasSubscript, hasCharge } = parsed;
  if (elements.length === 0) return false;
  if (elements.length === 1 && !hasSubscript && !hasCharge) return false; // 单个元素符号不算
  if (!elements.some((e) => CORE_ELEMENTS.has(e))) return false; // 至少一个常见元素
  if (elements.length >= 2 && !hasSubscript && !hasCharge) {
    // 形如 NaCl 这种无数字的式子：要求至少有两个双字母元素或总数 ≥ 3
    const hasMultiLetter = elements.filter((e) => e.length > 1).length >= 2;
    if (!hasMultiLetter && elements.length < 3) return false;
  }
  return true;
}

/** 解析纯文本化学式（失败返回 null） */
export function parsePlainFormula(token: string): ChemResult | null {
  return isPlainFormula(token) ? parseChem(token.trim()) : null;
}
