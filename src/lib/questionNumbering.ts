/**
 * 题目层级识别与符号化
 * ────────────────────────────────────────────────────────────────
 * 识别依据（三条独立证据，命中两条以上才升级为“大题”，避免把选项当标题）：
 *
 *  ① 序号字符集 —— 层级的第一判据
 *     中文数字 一、二、三 → 习惯上只用于“大题/部分”（试卷、章节、题型组）
 *     阿拉伯数字 1. 2. 3. → 小题（或有序列表）
 *     （1）（2） / 1)      → 小问（大题里的小题下再分问）
 *     ① ② ③               → 更细的分点，本身已是符号，不再加标记
 *
 *  ② 递增序列 —— 最可靠的证据
 *     选择题的选项也可能写成“一、二、三”，但选项组不会跟着上一个“三、”继续走到“四、”。
 *     因此用「上一个已识别大题的序号 + 1 == 当前序号」来判断，序号断裂就不当大题。
 *
 *  ③ 题干关键词 —— 兜底证据
 *     “选择题 / 填空题 / 解答题 / 计算 / 证明 / 阅读 / 作文 …”出现在标题行里，
 *     即使序号不连续（例如分 Ⅰ 卷、Ⅱ 卷各从“一、”重新开始）也认作大题。
 *
 *  反例防护：
 *     · 连续 ≥3 行「中文数字 + 短内容（≤12 字）」→ 判为选项组，不当大题
 *     · “3.14 是圆周率” 这类小数、以及序号后无内容的空号行，一律不动
 *     · 已在 $$ 公式块 / ``` 代码块内的行，一律不动
 *
 * 输出符号（与层级一一对应，重量递减，视觉上自然分层）：
 *     ■  大题        一、选择题            （填充方块：最重，章节级）
 *     ◆  小题        1. 下列各题…          （实心菱形：次重，题目级）
 *     ▸  小问        （1）求…              （小三角：轻，追问级）
 *     选项            A. …  /  一、…        （不加符号，仅缩进，避免抢重点）
 */

export const QN_MARK = {
  l1: "■",
  l2: "◆",
  l3: "▸",
  /** 仅用于“一、二、三”式选项：这类行形态与大题完全一样，必须给个记号才能分辨 */
  option: "◇",
} as const;

/** 已带层级符号的行（避免重复处理） */
const MARK_PREFIX = new RegExp(`^[${QN_MARK.l1}${QN_MARK.l2}${QN_MARK.l3}${QN_MARK.option}]`);

export type QuestionLevel = 1 | 2 | 3;

export interface NumberingStats {
  l1: number;
  l2: number;
  l3: number;
  options: number;
}

const CN_DIGIT: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

/** 中文数字转数值，支持 十一 / 二十 / 二十三 */
function cnToNumber(s: string): number {
  if (!s) return 0;
  if (s === "十") return 10;
  if (s.startsWith("十")) return 10 + (CN_DIGIT[s[1]] ?? 0);
  const idx = s.indexOf("十");
  if (idx === -1) return CN_DIGIT[s] ?? 0;
  const tens = CN_DIGIT[s.slice(0, idx)] ?? 0;
  const ones = s.length > idx + 1 ? CN_DIGIT[s[idx + 1]] ?? 0 : 0;
  return tens * 10 + ones;
}

/** 大题/题型关键词：序号断裂时靠它兜底 */
const SECTION_KEYWORDS =
  /(选择|单选|多选|不定项|填空|判断|改错|名词解释|简答|论述|综合|计算|解答|证明|作图|实验|探究|阅读|翻译|作文|完形|听力|语法|基础|提高|拓展|必做|选做|部分|题型)/;

/** 中文数字题号：一、 ／ 一． ／ （一） */
const CN_L1_RE = /^([一二三四五六七八九十]{1,3})\s*[、.．]\s*(.*)$/;
const CN_L1_PAREN_RE = /^[（(]\s*([一二三四五六七八九十]{1,3})\s*[)）]\s*(.*)$/;
/** 第X部分 / 第一部分 */
const CN_PART_RE = /^(第\s*[一二三四五六七八九十0-9]{1,3}\s*[部分篇章节讲卷])\s*[：:、.．]?\s*(.*)$/;

/** 小问：（1） ／ (1) ／ 1) */
const L3_PAREN_RE = /^[（(]\s*(\d{1,2})\s*[)）]\s*(.*)$/;
const L3_HALF_RE = /^(\d{1,2})\s*[)）]\s+(.+)$/;

/** 小题：1. ／ 1、 ／ 第1题 ／ Q1 */
const L2_DOT_RE = /^(\d{1,2})\s*[.．、]\s*(.*)$/;
const L2_CN_RE = /^第\s*(\d{1,2})\s*题\s*[：:.．、]?\s*(.*)$/;
const L2_Q_RE = /^[Qq]\s*(\d{1,2})\s*[：:.．、]?\s*(.+)$/;

/** 选项：A. ／ A、 ／ (A) ／ 甲、 */
const OPTION_RE = /^[（(]?\s*([A-Ha-h]|[甲乙丙丁戊])\s*[)）.．、]\s*\S/;

/** 圈号分点 ①②③：本身即符号，不加标记 */
const CIRCLED_RE = /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫]/;

/** 读取一行已有的层级标记（供 Word / 预览渲染层级样式） */
export function questionLevel(line: string): 0 | QuestionLevel {
  const t = line.trimStart();
  if (t.startsWith(QN_MARK.l1)) return 1;
  if (t.startsWith(QN_MARK.l2)) return 2;
  if (t.startsWith(QN_MARK.l3)) return 3;
  return 0;
}

/** 行内是否以“选项”形态开头（◇ 中文数字式 / A. / (B) / 丙、），用于缩进弱化 */
export function isOptionLine(line: string): boolean {
  const t = line.trim();
  if (t.startsWith(QN_MARK.option)) return true;
  return OPTION_RE.test(t);
}

/** 中文数字短行 → 疑似“一、二、三”式选项（含题型关键词的短标题不算选项，如“一、选择题”） */
function isCnShortItem(line: string, maxLen = 12): boolean {
  const m = line.trim().match(CN_L1_RE) || line.trim().match(CN_L1_PAREN_RE);
  if (!m) return false;
  const body = m[2].replace(/[\s，。；、,.;:：]/g, "");
  if (!body) return false;
  if (SECTION_KEYWORDS.test(body)) return false;
  return body.length <= maxLen;
}

/**
 * 预扫描：把连续出现的中文数字短行归成“选项组”，返回每行所属组的大小。
 * 组内 ≥3 行才认定为选项组（两行可能是并列的两个大题）。
 */
function optionGroupSizes(lines: string[]): number[] {
  const sizes = new Array<number>(lines.length).fill(0);
  let i = 0;
  while (i < lines.length) {
    if (!isCnShortItem(lines[i])) {
      i++;
      continue;
    }
    let j = i;
    let count = 0;
    let blanks = 0;
    while (j < lines.length) {
      const l = lines[j];
      if (!l.trim()) {
        if (++blanks > 1) break;
        j++;
        continue;
      }
      if (!isCnShortItem(l)) break;
      blanks = 0;
      count++;
      j++;
    }
    if (count >= 3) {
      for (let k = i; k < j; k++) sizes[k] = count;
    }
    i = Math.max(j, i + 1);
  }
  return sizes;
}

export interface NumberingResult {
  text: string;
  stats: NumberingStats;
}

export function restructureQuestionNumbers(text: string): NumberingResult {
  const lines = text.split("\n");
  const stats: NumberingStats = { l1: 0, l2: 0, l3: 0, options: 0 };
  if (!text.trim()) return { text, stats };

  const groupSize = optionGroupSizes(lines);
  const out: string[] = [];

  let inMath = false;
  let inFence = false;
  let lastL1 = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // ---- 保护区域：公式块 / 代码围栏 ----
    const fence = trimmed.startsWith("```");
    const dollars = (raw.match(/\$\$/g) || []).length;
    if (inFence || inMath) {
      out.push(raw);
      if (inFence && fence) inFence = false;
      if (inMath && dollars % 2 === 1) inMath = false;
      continue;
    }
    if (fence) {
      out.push(raw);
      inFence = true;
      continue;
    }
    if (dollars % 2 === 1) {
      out.push(raw);
      inMath = true;
      continue;
    }

    if (!trimmed) {
      out.push(raw);
      continue;
    }

    // Markdown 标题、已处理过的行、圈号分点：保持原样
    if (/^#{1,6}\s/.test(trimmed) || MARK_PREFIX.test(trimmed) || CIRCLED_RE.test(trimmed)) {
      out.push(raw);
      continue;
    }

    // ---- 大题：一、选择题 ／ （一）基础题 ／ 第一部分 ----
    const partMatch = trimmed.match(CN_PART_RE);
    const cnMatch =
      trimmed.match(CN_L1_RE) || trimmed.match(CN_L1_PAREN_RE);

    if (partMatch || cnMatch) {
      const isParen = !partMatch && !!CN_L1_PAREN_RE.test(trimmed);
      const numeral = partMatch ? partMatch[1] : (cnMatch as RegExpMatchArray)[1];
      const rest = (partMatch ? partMatch[2] : (cnMatch as RegExpMatchArray)[2]).trim();
      const value = cnToNumber(numeral.replace(/[^一二三四五六七八九十]/g, ""));

      const inOptionGroup = groupSize[i] >= 3;
      const sequential = lastL1 === 0 ? value === 1 : value === lastL1 + 1;
      const keywords = SECTION_KEYWORDS.test(rest);
      const hasContent = rest.length > 0;

      const isBigSection =
        hasContent && !inOptionGroup && (sequential || keywords);

      if (isBigSection) {
        // 保留原始题号形态，只在前面补层级符号
        const body = partMatch
          ? `${numeral}${rest ? " " + rest : ""}`
          : isParen
            ? `（${numeral}）${rest}`
            : `${numeral}、${rest}`;
        out.push(`${QN_MARK.l1} ${body}`);
        lastL1 = value;
        stats.l1++;
        continue;
      }

      // 中文数字但没有大题特征 → 多为“一、二、三”式选项
      if (inOptionGroup) {
        // 形态与大题一模一样，加 ◇ 才能和大题区分开
        out.push(`${QN_MARK.option} ${trimmed}`);
        stats.options++;
      } else {
        out.push(trimmed);
      }
      continue;
    }

    // ---- 小问：（1）求… ／ 1) 求… ----
    let m = trimmed.match(L3_PAREN_RE) || trimmed.match(L3_HALF_RE);
    if (m) {
      const rest = (m[2] || "").trim();
      if (rest) {
        out.push(`${QN_MARK.l3}（${m[1]}）${rest}`);
        stats.l3++;
        continue;
      }
    }

    // ---- 小题：1. ／ 1、 ／ 第1题 ／ Q1 ----
    const cnQ = trimmed.match(L2_CN_RE);
    const letterQ = trimmed.match(L2_Q_RE);
    const dotQ = cnQ || letterQ ? null : trimmed.match(L2_DOT_RE);
    const l2 = cnQ || letterQ || dotQ;
    if (l2) {
      const rest = (l2[2] || "").trim();
      // 小数误判防护：3.14 → “.” 后紧跟数字，不是题号
      const decimalLike = !!dotQ && /^\d/.test(rest);
      if (rest && !decimalLike) {
        const label = cnQ ? `第${l2[1]}题` : letterQ ? `Q${l2[1]}` : `${l2[1]}.`;
        out.push(`${QN_MARK.l2} ${label} ${rest}`);
        stats.l2++;
        continue;
      }
    }

    // ---- 选项：保留原文，仅计数（渲染时缩进弱化）----
    if (OPTION_RE.test(trimmed)) {
      stats.options++;
      out.push(trimmed);
      continue;
    }

    out.push(trimmed);
  }

  return { text: out.join("\n"), stats };
}
