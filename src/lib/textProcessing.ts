import { ProcessingConfig } from "../types";
import { normalizeMathMarkers } from "./richText";
import { compressWhitespace } from "./whitespace";
import { restructureQuestionNumbers } from "./questionNumbering";

/** AI 开场白（“好的，以下是……”之类） */
const CHATTER_PATTERNS_START = [
  /^好的[，、]?这是为您(解答|整理|生成|准备)的作业(答案|内容|解答)?[：:\n]/i,
  /^好的[，、]?以下是(关于)?.*的[：:\n]/i,
  /^没问题[，、]?为您解答如下[：:\n]/i,
  /^下面是关于.*的(解答|分析)[：:\n]/i,
  /^根据您的要求[，、]?(以下是|为您解答)[：:\n]/i,
  /^这里是.*的答案[：:\n]/i,
];

/** AI 结尾客套（“希望对你有帮助”之类） */
const CHATTER_PATTERNS_END = [
  /希望对(你|您)有所帮助[！。]?/i,
  /祝(你|您)学习进步[！。]?/i,
  /如有疑问[，、]?随时(提问|联系|沟通)[！。]?/i,
  /以上就是全部(答案|解答|分析)[！。]?/i,
  /希望(这个解答|我的回答)能够解答您的疑问[！。]?/i,
];

/** 题目分级符号：带这些前缀的行不是标题 */
const QUESTION_MARK_PREFIX = /^[■◆▸◇]/;

const matchesAny = (line: string, patterns: RegExp[]) => patterns.some((p) => p.test(line));

/**
 * 离线清洗主流程（严格按以下顺序执行）：
 *   1. 剔除 AI 开场白与结语
 *   2. 清除网页残留与乱码
 *   3. 题目层级识别与符号化（■ / ◆ / ▸）
 *   4. 空白压缩与分隔标号替换
 *   5. 规范化公式与化学式定界符
 *   6. 压缩连续空行
 *   7. 从正文首行提取标题
 */
export function processTextOffline(
  text: string,
  configs: ProcessingConfig
): { title: string; cleanedText: string } {
  if (!text) return { title: "", cleanedText: "" };

  let lines = text.split("\n");

  // 1. 剔除 AI 开场白与结语
  if (configs.removeAIChatter) {
    let startIdx = 0;
    while (startIdx < Math.min(lines.length, 5)) {
      const line = lines[startIdx].trim();
      if (!line) {
        startIdx++;
        continue;
      }
      if (
        matchesAny(line, CHATTER_PATTERNS_START) ||
        (line.length < 15 &&
          (line.startsWith("好的") || line.startsWith("收到") || line.endsWith("请看：") || line.endsWith("解答如下：")))
      ) {
        startIdx++;
      }
      break;
    }
    lines = lines.slice(startIdx);

    let endIdx = lines.length;
    while (endIdx > Math.max(0, lines.length - 5)) {
      const line = lines[endIdx - 1]?.trim();
      if (!line) {
        endIdx--;
        continue;
      }
      if (
        matchesAny(line, CHATTER_PATTERNS_END) ||
        (line.length < 15 && (line.includes("解答完毕") || line.includes("如有需要") || line.includes("加油")))
      ) {
        endIdx--;
      }
      break;
    }
    lines = lines.slice(0, endIdx);
  }

  // 2. 清除网页残留与乱码
  if (configs.removeGarbledText) {
    lines = lines.map((line) =>
      line
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .replace(/�/g, "")
        .replace(/【AI输出】/g, "")
        .replace(/\[\d+\][a-zA-Z0-9_\-\s]*web_search/gi, "")
    );
  }

  // 3. 题目层级识别与符号化（■ 大题 / ◆ 小题 / ▸ 小问）
  //    依据：序号字符集 + 递增序列 + 题干关键词；选项组与小数行受保护不误判。
  if (configs.autoFormatQuestionNumbers) {
    lines = restructureQuestionNumbers(lines.join("\n")).text.split("\n");
  }

  // 4. 空白压缩与分隔标号替换
  //    行内连续 ≥3 个空白 → 1 个空格；连续 ≥3 个空行 → 一行分隔标号；
  //    $$ 公式块与代码围栏内部原样保护，避免破坏公式语法。
  if (configs.compressWhitespace) {
    lines = compressWhitespace(lines.join("\n")).split("\n");
  }

  // 5. 公式与化学式定界符规范化
  //    保留 $...$ / $$...$$ / \ce{...} 标记，交由 Word 生成器输出原生公式与真实上下标；
  //    对应开关关闭时去掉标记，仅保留原文本。
  lines = lines.map((line) => normalizeMathMarkers(line, configs));

  // 6. 压缩连续空行（最多保留 1 个）
  if (configs.cleanExtraBlankLines) {
    const cleaned: string[] = [];
    let blanks = 0;
    for (const line of lines) {
      if (!line.trim()) {
        if (++blanks <= 1) cleaned.push("");
      } else {
        blanks = 0;
        cleaned.push(line);
      }
    }
    lines = cleaned;
  }

  // 7. 自动识别标题：取第一个像标题的普通段落（跳过题目行、表格、公式与列表）
  let detectedTitle = "标准化排版作业";
  if (configs.autoIdentifyTitle) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || QUESTION_MARK_PREFIX.test(trimmed)) continue;
      if (trimmed.startsWith("|") || trimmed.startsWith("```") || trimmed.startsWith("$$")) continue;
      if (/^[-*+]\s/.test(trimmed)) continue;

      const candidate = trimmed
        .replace(/^#{1,6}\s+/, "")
        .replace(/\*\*/g, "")
        .trim();
      if (candidate.length > 3 && candidate.length < 30) {
        detectedTitle = candidate;
        break;
      }
    }
  }

  return { title: detectedTitle, cleanedText: lines.join("\n") };
}
