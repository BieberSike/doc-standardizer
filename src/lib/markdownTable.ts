/**
 * Markdown 表格识别
 * ────────────────────────────────────────────────────────────────
 * AI 输出的表格基本都是标准 Markdown 表格：
 *
 *   | 物质 | 摩尔质量 | 备注 |
 *   | --- | :---: | ---: |
 *   | H2SO4 | 98 | 浓硫酸 |
 *
 * 判定条件（必须同时满足，避免把正文里的竖线当成表格）：
 *  1. 当前行是表格行：去掉首尾竖线后按 | 切分，列数 ≥2
 *  2. 下一行是分隔行：每列形如 ---、:---、---:、:---:
 *  3. 分隔行列数与表头列数一致
 */

export type Align = "left" | "center" | "right";

export interface MdTableData {
  header: string[];
  align: Align[];
  rows: string[][];
}

const isTableRow = (line: string): boolean => {
  const t = line.trim();
  if (!t.includes("|")) return false;
  return splitRow(t).length >= 2;
};

const SEP_CELL_RE = /^:?-{2,}:?$/;

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

const isSeparatorRow = (line: string, cols: number): boolean => {
  const t = line.trim();
  if (!t.includes("-")) return false;
  if (!/^\|?[\s:|-]+\|?$/.test(t)) return false;
  const cells = splitRow(t);
  if (cells.length !== cols) return false;
  return cells.every((c) => SEP_CELL_RE.test(c.replace(/\s/g, "")));
};

/** 尝试从第 start 行解析一张表格 */
export function parseTableAt(
  lines: string[],
  start: number
): { table: MdTableData; next: number } | null {
  if (start + 1 >= lines.length) return null;
  if (!isTableRow(lines[start])) return null;

  const header = splitRow(lines[start]);
  if (!isSeparatorRow(lines[start + 1], header.length)) return null;

  const align: Align[] = splitRow(lines[start + 1]).map((c) => {
    const s = c.replace(/\s/g, "");
    if (s.startsWith(":") && s.endsWith(":")) return "center";
    if (s.endsWith(":")) return "right";
    return "left";
  });

  const rows: string[][] = [];
  let i = start + 2;
  while (i < lines.length && isTableRow(lines[i])) {
    const cells = splitRow(lines[i]);
    // 补齐 / 截断到表头列数，避免 Word 里错列
    rows.push(Array.from({ length: header.length }, (_, k) => cells[k] ?? ""));
    i++;
  }

  return { table: { header, align, rows }, next: i };
}
