/**
 * LaTeX 子集解析器
 * 把形如 \frac{a}{b}、x^{2}、\sqrt[3]{x}、\sum_{i=1}^{n} 的公式解析成 AST，
 * 供 Word 原生公式（OMML）生成器与页面预览共用。
 */

export type MathVariant = "default" | "normal" | "bold" | "doubleStruck";

export type MathNode =
  | { t: "run"; text: string; variant?: MathVariant }
  | { t: "frac"; num: MathNode[]; den: MathNode[] }
  | { t: "sqrt"; body: MathNode[]; deg?: MathNode[] }
  | { t: "script"; base: MathNode[]; sub?: MathNode[]; sup?: MathNode[] }
  | {
      t: "op";
      symbol: string;
      sub?: MathNode[];
      sup?: MathNode[];
      body: MathNode[];
      limits: "aboveBelow" | "side";
    }
  | { t: "delim"; open: string; close: string; body: MathNode[] };

// ---------- 符号表 ----------
const SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε",
  zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ",
  lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", omicron: "ο", pi: "π", varpi: "ϖ",
  rho: "ρ", sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ", phi: "φ",
  varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π",
  Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  times: "×", div: "÷", pm: "±", mp: "∓", cdot: "·", ast: "∗", star: "⋆",
  circ: "∘", bullet: "∙",
  le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈",
  equiv: "≡", sim: "∼", simeq: "≃", cong: "≅", propto: "∝", ll: "≪", gg: "≫",
  infty: "∞", partial: "∂", nabla: "∇", emptyset: "∅", varnothing: "∅",
  forall: "∀", exists: "∃", neg: "¬", land: "∧", lor: "∨",
  in: "∈", notin: "∉", ni: "∋", subset: "⊂", supset: "⊃", subseteq: "⊆",
  supseteq: "⊇", cup: "∪", cap: "∩", setminus: "∖",
  to: "→", rightarrow: "→", leftarrow: "←", uparrow: "↑", downarrow: "↓",
  leftrightarrow: "↔", Rightarrow: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔",
  rightleftharpoons: "⇌", leftrightharpoons: "⇋", rightleftarrows: "⇄",
  mapsto: "↦", implies: "⟹", iff: "⟺",
  therefore: "∴", because: "∵", angle: "∠", perp: "⊥", parallel: "∥",
  degree: "°", prime: "′", ell: "ℓ", hbar: "ℏ", Re: "ℜ", Im: "ℑ",
  ldots: "…", cdots: "⋯", dots: "…", vdots: "⋮", ddots: "⋱",
  quad: " ", qquad: "  ", ",": " ", ";": " ", ":": " ", "!": "", " ": " ",
  "%": "%", "&": "&", "#": "#", $: "$", "{": "{", "}": "}", "_": "_",
};

const BIG_OPS: Record<string, { symbol: string; limits: "aboveBelow" | "side" }> = {
  sum: { symbol: "∑", limits: "aboveBelow" },
  prod: { symbol: "∏", limits: "aboveBelow" },
  coprod: { symbol: "∐", limits: "aboveBelow" },
  bigcup: { symbol: "⋃", limits: "aboveBelow" },
  bigcap: { symbol: "⋂", limits: "aboveBelow" },
  int: { symbol: "∫", limits: "side" },
  iint: { symbol: "∬", limits: "side" },
  iiint: { symbol: "∭", limits: "side" },
  oint: { symbol: "∮", limits: "side" },
};

/** 函数名：正体显示 */
const FUNCTIONS = new Set([
  "sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan",
  "sinh", "cosh", "tanh", "log", "ln", "lg", "exp", "lim", "max", "min",
  "sup", "inf", "det", "gcd", "dim", "ker", "deg", "arg", "mod",
]);

// ---------- 词法 ----------
type Token =
  | { k: "cmd"; v: string } // v 不含反斜杠
  | { k: "char"; v: string }
  | { k: "open" }
  | { k: "close" }
  | { k: "sup" }
  | { k: "sub" };

function tokenize(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      const rest = src.slice(i + 1);
      const m = /^[a-zA-Z]+/.exec(rest);
      if (m) {
        toks.push({ k: "cmd", v: m[0] });
        i += 1 + m[0].length;
      } else if (rest.length > 0) {
        toks.push({ k: "cmd", v: rest[0] });
        i += 2;
      } else {
        i++;
      }
      continue;
    }
    if (c === "{") { toks.push({ k: "open" }); i++; continue; }
    if (c === "}") { toks.push({ k: "close" }); i++; continue; }
    if (c === "^") { toks.push({ k: "sup" }); i++; continue; }
    if (c === "_") { toks.push({ k: "sub" }); i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    toks.push({ k: "char", v: c });
    i++;
  }
  return toks;
}

class Parser {
  private i = 0;
  constructor(private readonly toks: Token[]) {}

  eof() { return this.i >= this.toks.length; }
  peek(offset = 0): Token | undefined { return this.toks[this.i + offset]; }
  next(): Token | undefined { return this.toks[this.i++]; }

  /** 解析到 `}` 或 \right 为止 */
  parseSeq(stopAtBrace = false): MathNode[] {
    const out: MathNode[] = [];
    while (!this.eof()) {
      const t = this.peek()!;
      if (t.k === "close") {
        if (stopAtBrace) break;
        this.next();
        continue;
      }
      if (t.k === "cmd" && t.v === "right") break;
      out.push(...this.parseItem());
    }
    return mergeRuns(out);
  }

  /** 读取一个参数：{...} 或单个记号 */
  parseArg(): MathNode[] {
    const t = this.peek();
    if (!t) return [];
    if (t.k === "open") {
      this.next();
      const body = this.parseSeq(true);
      if (this.peek()?.k === "close") this.next();
      return body;
    }
    return this.parseItem();
  }

  /**
   * 只取一个原子，不再吞掉其后的上下标。
   * 用于 \sum_{i=1}^{n}、\int_0^1 这类大运算符的上下限。
   */
  parseSingleAtom(): MathNode[] {
    const t = this.peek();
    if (!t) return [];
    if (t.k === "open") {
      this.next();
      const body = this.parseSeq(true);
      if (this.peek()?.k === "close") this.next();
      return body;
    }
    if (t.k === "cmd") {
      this.next();
      return this.parseCommand(t.v);
    }
    if (t.k === "char") {
      this.next();
      return [{ t: "run", text: t.v }];
    }
    return [];
  }

  parseItem(): MathNode[] {
    const t = this.peek();
    if (!t) return [];

    if (t.k === "open") {
      this.next();
      const body = this.parseSeq(true);
      if (this.peek()?.k === "close") this.next();
      return this.attachScripts(body);
    }

    if (t.k === "cmd") {
      this.next();
      return this.attachScripts(this.parseCommand(t.v));
    }

    if (t.k === "char") {
      this.next();
      return this.attachScripts([{ t: "run", text: t.v }]);
    }

    // 孤立的 ^ _ 之类的容错
    this.next();
    return [];
  }

  attachScripts(base: MathNode[]): MathNode[] {
    let sub: MathNode[] | undefined;
    let sup: MathNode[] | undefined;
    let seen = false;

    while (!this.eof()) {
      const t = this.peek()!;
      if (t.k === "sub" && !sub) { this.next(); sub = this.parseArg(); seen = true; continue; }
      if (t.k === "sup" && !sup) { this.next(); sup = this.parseArg(); seen = true; continue; }
      break;
    }

    if (!seen) return base;
    if (sub && sup) return [{ t: "script", base, sub, sup }];
    if (sub) return [{ t: "script", base, sub }];
    return [{ t: "script", base, sup }];
  }

  private parseCommand(name: string): MathNode[] {
    // 大运算符
    const bigOp = BIG_OPS[name];
    if (bigOp) {
      let sub: MathNode[] | undefined;
      let sup: MathNode[] | undefined;
      while (!this.eof()) {
        const t = this.peek()!;
        if (t.k === "sub" && !sub) { this.next(); sub = this.parseSingleAtom(); continue; }
        if (t.k === "sup" && !sup) { this.next(); sup = this.parseSingleAtom(); continue; }
        break;
      }
      // 紧随其后的被运算对象
      const body = this.eof() ? [] : this.parseItem();
      return [{ t: "op", symbol: bigOp.symbol, sub, sup, body: mergeRuns(body), limits: bigOp.limits }];
    }

    switch (name) {
      case "frac":
      case "dfrac":
      case "tfrac":
      case "cfrac": {
        const num = this.parseArg();
        const den = this.parseArg();
        return [{ t: "frac", num, den }];
      }
      case "sqrt": {
        let deg: MathNode[] | undefined;
        if (this.peek()?.k === "char" && (this.peek() as { v: string }).v === "[") {
          this.next();
          const d: MathNode[] = [];
          while (!this.eof()) {
            const t = this.next()!;
            if (t.k === "char" && t.v === "]") break;
            if (t.k === "char") d.push({ t: "run", text: t.v });
            if (t.k === "cmd") d.push({ t: "run", text: SYMBOLS[t.v] ?? t.v });
          }
          deg = d;
        }
        const body = this.parseArg();
        return [{ t: "sqrt", body, deg }];
      }
      case "text":
      case "textrm":
      case "operatorname":
      case "mathrm":
      case "mathcal":
      case "mathsf":
      case "mathtt":
        // 正体显示的文本类命令
        return [{ t: "run", text: this.readRawGroup(), variant: "normal" }];
      case "mathbf":
        return [{ t: "run", text: this.readRawGroup(), variant: "bold" }];
      case "mathit":
        return [{ t: "run", text: this.readRawGroup() }];
      case "mathbb":
        return [{ t: "run", text: this.readRawGroup(), variant: "doubleStruck" }];
      case "left": {
        const open = this.readDelimiter();
        const body = this.parseSeq(false);
        let close = "";
        if (this.peek()?.k === "cmd" && (this.peek() as { v: string }).v === "right") {
          this.next();
          close = this.readDelimiter();
        }
        return [{ t: "delim", open, close, body }];
      }
      case "right":
        return [];
      case "big": case "Big": case "bigg": case "Bigg": {
        this.readDelimiter();
        return [];
      }
      case "displaystyle":
      case "textstyle":
        return [];
      case "\\": // 换行
        return [{ t: "run", text: " " }];
      default:
        break;
    }

    if (FUNCTIONS.has(name)) {
      return [{ t: "run", text: name, variant: "normal" }];
    }
    if (name in SYMBOLS) {
      const v = SYMBOLS[name];
      return v ? [{ t: "run", text: v }] : [];
    }
    // 未知命令：保留名字，避免信息丢失
    return [{ t: "run", text: name }];
  }

  /** 原样读取 {...} 内的文本（用于 \text、\mathrm 等） */
  private readRawGroup(): string {
    if (this.peek()?.k !== "open") {
      const t = this.next();
      if (!t) return "";
      return t.k === "char" ? t.v : t.k === "cmd" ? (SYMBOLS[t.v] ?? t.v) : "";
    }
    this.next();
    let depth = 1;
    let out = "";
    while (!this.eof()) {
      const t = this.next()!;
      if (t.k === "open") { depth++; out += "{"; continue; }
      if (t.k === "close") { depth--; if (depth === 0) break; out += "}"; continue; }
      if (t.k === "cmd") { out += SYMBOLS[t.v] ?? t.v; continue; }
      if (t.k === "char") { out += t.v; continue; }
    }
    return out;
  }

  private readDelimiter(): string {
    const t = this.next();
    if (!t) return "";
    let d = "";
    if (t.k === "char") d = t.v;
    else if (t.k === "cmd") d = t.v === "{" ? "{" : t.v === "}" ? "}" : (SYMBOLS[t.v] ?? t.v);
    if (d === ".") return ""; // \left. 表示空
    return d === "\\" ? "" : d;
  }
}

function mergeRuns(nodes: MathNode[]): MathNode[] {
  const out: MathNode[] = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    if (n.t === "run" && last && last.t === "run" && (last.variant ?? "default") === (n.variant ?? "default")) {
      out[out.length - 1] = { t: "run", text: last.text + n.text, variant: last.variant };
    } else {
      out.push(n);
    }
  }
  return out;
}

/** 解析 LaTeX 数学表达式 */
export function parseLatex(src: string): MathNode[] {
  const trimmed = src.trim();
  if (!trimmed) return [];
  const parser = new Parser(tokenize(trimmed));
  return parser.parseSeq(false);
}

// ---------- 纯文本降级输出（预览/复制用） ----------
const SUP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷",
  "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ",
  i: "ⁱ", x: "ˣ", y: "ʸ", a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", k: "ᵏ", m: "ᵐ",
  t: "ᵗ", p: "ᵖ", s: "ˢ", r: "ʳ", u: "ᵘ", v: "ᵛ", w: "ʷ", j: "ʲ", l: "ˡ", o: "ᵒ", g: "ᵍ",
};

const SUB: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇",
  "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ",
  e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ",
  r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ",
};

const toSup = (s: string) => (s.split("").every((c) => SUP[c]) ? s.split("").map((c) => SUP[c]).join("") : `^(${s})`);
const toSub = (s: string) => (s.split("").every((c) => SUB[c]) ? s.split("").map((c) => SUB[c]).join("") : `_(${s})`);

/** 把 AST 压平成便于粘贴的纯文本（Unicode 上下标） */
export function flattenMath(nodes: MathNode[]): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case "run":
          return n.text;
        case "frac": {
          const a = flattenMath(n.num);
          const b = flattenMath(n.den);
          return /^[\w.]+$/.test(a) && /^[\w.]+$/.test(b) ? `${a}/${b}` : `(${a})/(${b})`;
        }
        case "sqrt":
          return n.deg && n.deg.length ? `${flattenMath(n.deg)}√(${flattenMath(n.body)})` : `√(${flattenMath(n.body)})`;
        case "script": {
          const base = flattenMath(n.base);
          const sub = n.sub ? toSub(flattenMath(n.sub)) : "";
          const sup = n.sup ? toSup(flattenMath(n.sup)) : "";
          return base + sub + sup;
        }
        case "op": {
          const sub = n.sub ? toSub(flattenMath(n.sub)) : "";
          const sup = n.sup ? toSup(flattenMath(n.sup)) : "";
          const body = " " + flattenMath(n.body);
          return n.symbol + sub + sup + body;
        }
        case "delim":
          return `${n.open}${flattenMath(n.body)}${n.close}`;
        default:
          return "";
      }
    })
    .join("");
}

/** 转 Unicode 上标（不可转换时原样返回） */
export function toSuperText(s: string): string {
  return s.split("").every((c) => c in SUP) ? s.split("").map((c) => SUP[c]).join("") : s;
}

/** 转 Unicode 下标（不可转换时原样返回） */
export function toSubText(s: string): string {
  return s.split("").every((c) => c in SUB) ? s.split("").map((c) => SUB[c]).join("") : s;
}

/**
 * 清理不带 $ 定界符的散落 LaTeX 片段（如 \alpha、x^{2}、\frac{a}{b}）。
 * 用于无法识别为完整公式的零散写法，保证输出仍然可读。
 */
export function cleanStrayLatex(text: string): string {
  let s = text;
  s = s.replace(/\\(?:text|textrm|mathrm|mathbf|mathit|mathbb)\s*\{([^{}]*)\}/g, "$1");
  s = s.replace(/\\[dtc]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)");
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
  s = s.replace(/\\([a-zA-Z]+)/g, (m, name: string) => SYMBOLS[name] ?? m);
  s = s.replace(/\^\{([^{}]*)\}/g, (_, p: string) => toSuperText(p));
  s = s.replace(/([A-Za-z0-9])\^(\d)/g, (_, a: string, b: string) => a + toSuperText(b));
  s = s.replace(/_\{([^{}]*)\}/g, (_, p: string) => toSubText(p));
  s = s.replace(/([A-Za-z0-9])_(\d)/g, (_, a: string, b: string) => a + toSubText(b));
  return s;
}
