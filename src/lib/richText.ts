import { ChemPart, isPlainFormula, parseChem, parsePlainFormula } from "./chem";
import { cleanStrayLatex, flattenMath, parseLatex, toSubText, toSuperText } from "./mathAst";

export interface RichOptions {
  /** 把 LaTeX 公式转成 Word 原生公式 */
  math: boolean;
  /** 把化学式/离子转成 Word 上下标 */
  chem: boolean;
}

export type Segment =
  | { type: "text"; text: string; bold: boolean }
  | { type: "math"; latex: string; display: boolean }
  | { type: "chem"; parts: ChemPart[]; source: string };

/** 公式 / 化学式定界符 */
const CONSTRUCT_RE =
  /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)|\\ce\s*\{([^{}]+)\}|\\pu\s*\{([^{}]+)\}/g;

/** 纯文本里潜在的化学式候选 */
const CHEM_CANDIDATE_RE = /[A-Z][A-Za-z0-9()[\]]*(?:[·•][A-Z0-9][A-Za-z0-9()[\]]*)*(?:\^?[0-9]{0,2}[+-])?/g;

/**
 * 从文本中找出最长的合法化学式（从候选串尾部逐字回退）
 */
function findFormula(text: string, startIdx: number): { token: string; end: number } | null {
  CHEM_CANDIDATE_RE.lastIndex = startIdx;
  const m = CHEM_CANDIDATE_RE.exec(text);
  if (!m || m.index !== startIdx) return null;

  let token = m[0];
  // 逐步裁剪尾部，直到成为合法化学式（最少 2 个字符）
  while (token.length >= 2) {
    if (isPlainFormula(token)) return { token, end: startIdx + token.length };
    token = token.slice(0, -1);
  }
  return null;
}

function pushText(out: Segment[], text: string, bold: boolean) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.type === "text" && last.bold === bold) {
    last.text += text;
  } else {
    out.push({ type: "text", text, bold });
  }
}

/** 处理一段纯文本：拆加粗、识别化学式、清理散落 LaTeX */
function pushPlainSegment(out: Segment[], text: string, bold: boolean, opts: RichOptions) {
  const boldParts = text.split(/\*\*(.+?)\*\*/g);
  boldParts.forEach((chunk, idx) => {
    if (!chunk) return;
    const isBold = idx % 2 === 1;
    if (isBold) {
      // 加粗块内部仍可能有化学式
      scanChem(out, chunk, true, opts);
      return;
    }
    scanChem(out, chunk, bold, opts);
  });
}

function scanChem(out: Segment[], text: string, bold: boolean, opts: RichOptions) {
  if (!opts.chem) {
    pushText(out, cleanStrayLatex(text), bold);
    return;
  }

  let cursor = 0;
  while (cursor < text.length) {
    const idx = text.slice(cursor).search(/[A-Z]/);
    if (idx === -1) break;
    const abs = cursor + idx;
    const found = findFormula(text, abs);

    if (found) {
      if (abs > cursor) pushText(out, cleanStrayLatex(text.slice(cursor, abs)), bold);
      const parsed = parsePlainFormula(found.token);
      if (parsed) {
        out.push({ type: "chem", parts: parsed.parts, source: found.token });
      } else {
        pushText(out, found.token, bold);
      }
      cursor = found.end;
    } else {
      // 该位置不是化学式，跳过这个字符继续找
      if (abs > cursor) pushText(out, cleanStrayLatex(text.slice(cursor, abs)), bold);
      pushText(out, text[abs], bold);
      cursor = abs + 1;
    }
  }
  if (cursor < text.length) {
    pushText(out, cleanStrayLatex(text.slice(cursor)), bold);
  }
}

/** 解析一行文本为富文本分段 */
export function parseRichLine(line: string, opts: RichOptions): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  CONSTRUCT_RE.lastIndex = 0;

  let m: RegExpExecArray | null;
  while ((m = CONSTRUCT_RE.exec(line)) !== null) {
    if (m.index > last) {
      pushPlainSegment(out, line.slice(last, m.index), false, opts);
    }
    const [full, dMath, bMath, iMath, pMath, ce, pu] = m;
    const body = dMath ?? bMath ?? iMath ?? pMath;
    const display = dMath !== undefined || bMath !== undefined;

    if (body !== undefined) {
      if (opts.math) {
        out.push({ type: "math", latex: body.trim(), display });
      } else {
        pushPlainSegment(out, body, false, opts);
      }
    } else if (ce !== undefined || pu !== undefined) {
      const src = (ce ?? pu ?? "").trim();
      if (opts.chem) {
        const parsed = parseChem(src);
        if (parsed && parsed.parts.length > 0) {
          out.push({ type: "chem", parts: parsed.parts, source: src });
        } else {
          pushPlainSegment(out, src, false, opts);
        }
      } else {
        pushPlainSegment(out, src, false, opts);
      }
    } else if (full) {
      pushText(out, full, false);
    }
    last = m.index + full.length;
  }

  if (last < line.length) {
    pushPlainSegment(out, line.slice(last), false, opts);
  }

  return out;
}

/** 化学分段压平为 Unicode 文本 */
function flattenChem(parts: ChemPart[]): string {
  return parts
    .map((p) => (p.t === "sub" ? toSubText(p.v) : p.t === "sup" ? toSuperText(p.v) : p.v))
    .join("");
}

const countMarker = (s: string, marker: string) => s.split(marker).length - 1;

/**
 * 合并跨行的块级公式：AI 经常把 $$...$$ 写成多行，
 * 这里把未闭合的 $$ 行拼成一条逻辑行，保证能被解析成公式。
 */
export function splitLogicalLines(text: string): string[] {
  const raw = text.split("\n");
  const out: string[] = [];
  let buffer = "";

  for (const line of raw) {
    if (buffer) {
      buffer += " " + line.trim();
      if (countMarker(buffer, "$$") % 2 === 0) {
        out.push(buffer);
        buffer = "";
      }
      continue;
    }
    if (countMarker(line, "$$") % 2 === 1) {
      buffer = line.trim();
      continue;
    }
    out.push(line);
  }

  if (buffer) out.push(buffer);
  return out;
}

/** 整段文本压平为纯文本（用于“复制结果”，保留 Unicode 上下标） */
export function flattenRichText(text: string, opts: RichOptions): string {
  return text
    .split("\n")
    .map((line) =>
      parseRichLine(line, opts)
        .map((seg) => {
          if (seg.type === "text") return seg.text;
          if (seg.type === "math") return flattenMath(parseLatex(seg.latex));
          return flattenChem(seg.parts);
        })
        .join("")
    )
    .join("\n");
}

/**
 * 规范化公式定界符，供下游解析：
 * - 统一成 $...$ / $$...$$ / \ce{...}（只保留一种形态，降低解析分支）
 * - 关闭对应开关时去掉定界符、保留内容
 */
export function normalizeMathMarkers(
  line: string,
  opts: { convertMathFormulas: boolean; convertChemFormulas: boolean }
): string {
  let s = line;

  if (opts.convertMathFormulas) {
    s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner: string) => `$$${inner}$$`);
    s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner: string) => `$${inner}$`);
  } else {
    s = s.replace(/\$\$([\s\S]*?)\$\$/g, "$1");
    s = s.replace(/\\\[([\s\S]*?)\\\]/g, "$1");
    s = s.replace(/\$([^$\n]+?)\$/g, "$1");
    s = s.replace(/\\\(|\\\)/g, "");
  }

  if (!opts.convertChemFormulas) {
    s = s.replace(/\\ce\s*\{([^{}]+)\}/g, "$1");
    s = s.replace(/\\pu\s*\{([^{}]+)\}/g, "$1");
  }

  return s;
}
