import {
  AlignmentType,
  BorderStyle,
  Document,
  Math as DocxMath,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { TypographyTemplate } from "../types";
import { WHITESPACE_SEPARATOR } from "../constants";
import { parseLatex } from "./mathAst";
import { parseRichLine, RichOptions, Segment, splitLogicalLines } from "./richText";
import { toMathComponents } from "./omml";
import { MdTableData, parseTableAt } from "./markdownTable";
import { isOptionLine, questionLevel } from "./questionNumbering";

type Child = TextRun | DocxMath;

/** 把一行文本转成 Word 运行片段（含原生公式与上下标） */
function buildChildren(
  line: string,
  options: RichOptions,
  template: TypographyTemplate,
  bold: boolean,
  size: number
): Child[] {
  const segments: Segment[] = parseRichLine(line, options);
  const children: Child[] = [];

  for (const seg of segments) {
    if (seg.type === "text") {
      children.push(
        new TextRun({ text: seg.text, bold: bold || seg.bold, font: template.font, size })
      );
      continue;
    }

    if (seg.type === "chem") {
      for (const part of seg.parts) {
        children.push(
          new TextRun({
            text: part.v,
            bold,
            font: template.font,
            size,
            subScript: part.t === "sub",
            superScript: part.t === "sup",
          })
        );
      }
      continue;
    }

    // 数学公式 → Word 原生公式（OMML）
    const components = toMathComponents(parseLatex(seg.latex));
    if (components.length > 0) {
      children.push(new DocxMath({ children: components }));
    } else {
      children.push(new TextRun({ text: seg.latex, bold, font: template.font, size }));
    }
  }

  if (children.length === 0) {
    children.push(new TextRun({ text: "", font: template.font, size }));
  }
  return children;
}

const ALIGN = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
} as const;

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "A6A6A6" };

/** Markdown 表格 → Word 原生表格（可直接编辑单元格、调整列宽） */
function buildTable(
  data: MdTableData,
  template: TypographyTemplate,
  options: RichOptions,
  baseSize: number
): Table {
  const cellSize = Math.max(baseSize - 2, 16);

  const makeCell = (text: string, bold: boolean, align: "left" | "center" | "right") =>
    new TableCell({
      children: [
        new Paragraph({
          alignment: ALIGN[align],
          spacing: { before: 40, after: 40 },
          children: buildChildren(text, options, template, bold, cellSize),
        }),
      ],
    });

  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: data.header.map((h, i) => makeCell(h, true, data.align[i] ?? "left")),
    }),
    ...data.rows.map(
      (row) =>
        new TableRow({
          children: row.map((c, i) => makeCell(c, false, data.align[i] ?? "left")),
        })
    ),
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: CELL_BORDER,
      bottom: CELL_BORDER,
      left: CELL_BORDER,
      right: CELL_BORDER,
      insideHorizontal: CELL_BORDER,
      insideVertical: CELL_BORDER,
    },
    rows,
  });
}

/** 生成排版好的 Word 文档（.docx Blob），公式输出为 Word 原生公式，化学式为真实上下标 */
export async function generateWordDocument(
  text: string,
  title: string,
  template: TypographyTemplate,
  options: RichOptions = { math: true, chem: true }
): Promise<Blob> {
  const lines = splitLogicalLines(text);
  const blocks: (Paragraph | Table)[] = [];

  // 居中标题
  blocks.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 240 },
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: (template.fontSize + 4) * 2,
          font: template.font,
        }),
      ],
    })
  );

  const baseSize = template.fontSize * 2;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Markdown 表格 → Word 原生表格
    const tableBlock = parseTableAt(lines, i);
    if (tableBlock) {
      blocks.push(buildTable(tableBlock.table, template, options, baseSize));
      // 表后补一个极小间距段，避免与后文粘连
      blocks.push(
        new Paragraph({ spacing: { before: 0, after: 60 }, children: [new TextRun({ text: "" })] })
      );
      i = tableBlock.next - 1;
      continue;
    }

    if (!trimmed) {
      if (template.lineSpacing > 1.0) {
        blocks.push(
          new Paragraph({
            spacing: { before: 100, after: 100 },
            children: [new TextRun({ text: "" })],
          })
        );
      }
      continue;
    }

    // 空白压缩生成的分隔标号：居中、灰色、略小，醒目又紧凑
    if (trimmed === WHITESPACE_SEPARATOR) {
      blocks.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 120, line: Math.round(template.lineSpacing * 240) },
          children: [
            new TextRun({
              text: trimmed,
              color: "808080",
              font: template.font,
              size: Math.round(template.fontSize * 2 * 0.95),
            }),
          ],
        })
      );
      continue;
    }

    // ---- Markdown 无序列表 → Word 项目符号 ----
    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      blocks.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { before: 20, after: 20, line: Math.round(template.lineSpacing * 240) },
          children: buildChildren(bullet[1], options, template, false, baseSize),
        })
      );
      continue;
    }

    // ---- 标题层级 ----
    const isHeading1 = line.startsWith("# ");
    const isHeading2 = line.startsWith("## ");
    const isHeading3 = line.startsWith("### ");

    let contentLine = line;
    let runSize = baseSize;
    let beforeSpacing = template.paragraphBefore * 20;
    let afterSpacing = template.paragraphAfter * 20;
    let bold = false;
    let indentLeft = 0;

    if (isHeading1 || isHeading2 || isHeading3) {
      contentLine = line.replace(/^#+\s+/, "");
      runSize = (template.fontSize + (isHeading1 ? 3 : isHeading2 ? 2 : 1)) * 2;
      beforeSpacing = isHeading1 ? 240 : isHeading2 ? 180 : 120;
      afterSpacing = isHeading1 ? 120 : isHeading2 ? 90 : 60;
      bold = true;
    } else {
      // ---- 题目层级：■ 大题 / ◆ 小题 / ▸ 小问 ----
      const level = questionLevel(trimmed);
      if (level === 1) {
        runSize = (template.fontSize + 1) * 2;
        beforeSpacing = Math.max(beforeSpacing, 200);
        afterSpacing = Math.max(afterSpacing, 80);
        bold = true;
      } else if (level === 2) {
        beforeSpacing = Math.max(beforeSpacing, 120);
        afterSpacing = Math.max(afterSpacing, 40);
        bold = true;
      } else if (level === 3) {
        indentLeft = 360;
        beforeSpacing = Math.max(beforeSpacing, 60);
      } else if (isOptionLine(trimmed)) {
        // 选项弱化：缩进、不加大、不加粗
        indentLeft = 480;
      }
    }

    blocks.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        indent: indentLeft ? { left: indentLeft } : undefined,
        spacing: {
          before: beforeSpacing,
          after: afterSpacing,
          line: Math.round(template.lineSpacing * 240),
        },
        children: buildChildren(contentLine.trim(), options, template, bold, runSize),
      })
    );
  }

  const marginDxa = Math.round(template.margins * 1440); // 1 inch = 1440 dxa

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: marginDxa, bottom: marginDxa, left: marginDxa, right: marginDxa },
          },
        },
        children: blocks,
      },
    ],
  });

  return Packer.toBlob(doc);
}

/** 触发浏览器下载 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
