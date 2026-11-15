import {
  BLANK_LINE_SEPARATOR_THRESHOLD,
  INLINE_SPACE_THRESHOLD,
  WHITESPACE_SEPARATOR,
} from "../constants";

/**
 * 空白压缩
 * ────────────────────────────────────────────────────────────────
 * 目标：把「无效空白」占掉的版面还给正文，同时不改变任何可见字符。
 *
 * 判定规则：
 *  1) 行内连续空白 ≥ INLINE_SPACE_THRESHOLD(3) 个 → 压缩为 1 个半角空格；
 *     ≤2 个视为作者有意为之（如中英文间留白、手工对齐），原样保留。
 *  2) 行尾空白 → 全部删除（无排版意义）。
 *  3) 行首缩进 → 宽度 ≤4（2 个全角空格或 4 个半角空格）保留，保护段首缩进与嵌套列表；
 *     宽度 >4 视为粘贴产生的垃圾缩进，压成 2 个半角空格。
 *  4) 连续空行 ≥ BLANK_LINE_SEPARATOR_THRESHOLD(3) → 视为「分隔作用的大段空白」，
 *     替换成一行分隔标号（比空行紧凑，又比直接删掉更醒目）；1~2 个空行是正常段落间隔，保留。
 *  5) 文首、文尾的空白 → 直接丢弃（不产生分隔标号）。
 *
 * 保护区域（不参与任何压缩，避免破坏语法）：
 *  · 块级公式 $$ … $$（可跨行）
 *  · ``` 围栏代码块内部
 *
 * 空白字符处理：\r\n → \n；U+00A0 不断行空格、U+2000–U+200A 各种窄空格、U+202F/U+205F
 * 统一视作普通空格；U+200B–U+200D/U+FEFF/U+2060 零宽字符直接删除；
 * 全角空格 U+3000 仅在行首缩进位置保留语义，其余位置按普通空格参与压缩。
 */

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u2060]/g;
const NBSP_LIKE = /[\u00A0\u2000-\u200A\u202F\u205F]/g;
const LEADING_WS = /^[ \t\u3000\u00A0]+/;
const INLINE_WS_RUN = new RegExp(`[ \\t\\u3000\\u00A0]{${INLINE_SPACE_THRESHOLD},}`, "g");
const WHITESPACE_ONLY_LINE = /^[ \t\u3000\u00A0\u2000-\u200A\u202F\u205F]+$/;

/** 单个行首缩进字符折算的“宽度”：制表符 4，全角空格 2，其余 1 */
const indentWidth = (s: string) =>
  Array.from(s).reduce((w, ch) => w + (ch === "\t" ? 4 : ch === "\u3000" ? 2 : 1), 0);

/** 压缩单行的行内空白（不含换行），返回去掉行尾空白后的行 */
function compressLine(line: string): string {
  const cleaned = line.replace(ZERO_WIDTH, "");
  const lead = cleaned.match(LEADING_WS);
  let indent = "";
  let body = cleaned;

  if (lead) {
    const raw = lead[0];
    if (indentWidth(raw) <= 4) {
      // 保留原缩进（制表符按 4 个空格折算，便于 Word 里对齐稳定）
      indent = raw.replace(/\t/g, "    ").replace(/\u00A0/g, " ");
    } else {
      indent = "  ";
    }
    body = cleaned.slice(raw.length);
  }

  body = body
    .replace(NBSP_LIKE, " ")
    .replace(/\u3000/g, " ")
    .replace(INLINE_WS_RUN, " ")
    .replace(/[ \t]+$/g, "");

  return indent + body;
}

export function compressWhitespace(text: string): string {
  if (!text) return "";

  const rawLines = text.replace(/\r\n?/g, "\n").split("\n");
  const lines: string[] = [];
  /** 与 lines 一一对应：true 表示该行位于保护区域内，空行合并时也不得动 */
  const frozen: boolean[] = [];
  const push = (line: string, isFrozen = false) => {
    lines.push(line);
    frozen.push(isFrozen);
  };

  let inMathBlock = false;
  let inFence = false;

  for (const raw of rawLines) {
    const fence = raw.trimStart().startsWith("```");
    const dollarPairs = (raw.match(/\$\$/g) || []).length;

    // 围栏代码块：整体原样保留（含开闭标记）
    if (inFence) {
      push(raw, true);
      if (fence) inFence = false;
      continue;
    }
    if (fence) {
      push(raw, true);
      inFence = true;
      continue;
    }

    // 块级公式内部：原样保留，仅检查是否闭合
    if (inMathBlock) {
      push(raw, true);
      if (dollarPairs % 2 === 1) inMathBlock = false;
      continue;
    }
    if (dollarPairs % 2 === 1) {
      push(raw, true);
      inMathBlock = true;
      continue;
    }

    // 整行只有空白 → 归一为空行，交由下面的空行合并逻辑处理
    if (WHITESPACE_ONLY_LINE.test(raw)) {
      push("");
      continue;
    }

    push(compressLine(raw));
  }

  // ---- 空行合并：小间隔保留，大间隔换成分隔标号 ----
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== "") {
      out.push(lines[i]);
      continue;
    }

    let j = i;
    while (j < lines.length && lines[j] === "") j++;
    const blankCount = j - i;
    const hasFrozen = frozen.slice(i, j).some(Boolean);

    // 保护区域内的空行（如跨行 $$ 公式中的空行）、文首 / 文尾的空白：原样处理
    if (hasFrozen) {
      for (let k = 0; k < blankCount; k++) out.push("");
      i = j - 1;
      continue;
    }
    if (out.length === 0 || j >= lines.length) {
      i = j - 1;
      continue;
    }

    if (blankCount >= BLANK_LINE_SEPARATOR_THRESHOLD) {
      out.push(WHITESPACE_SEPARATOR);
    } else {
      // 1~2 个空行属于正常段落间隔，原样保留（是否进一步收紧由“压缩冗余空行”开关决定）
      for (let k = 0; k < blankCount; k++) out.push("");
    }
    i = j - 1;
  }

  return out.join("\n");
}
