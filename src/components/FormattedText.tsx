import { Fragment, type ReactNode } from "react";
import { MathNode, parseLatex } from "../lib/mathAst";
import { parseRichLine, RichOptions, Segment, splitLogicalLines } from "../lib/richText";
import { WHITESPACE_SEPARATOR } from "../constants";
import { MdTableData, parseTableAt } from "../lib/markdownTable";
import { isOptionLine, questionLevel } from "../lib/questionNumbering";

interface FormattedTextProps {
  text: string;
  dark: boolean;
  options: RichOptions;
}

/** 公式的近似渲染（Word 中为原生公式，此处仅作版面示意） */
function MathView({ nodes }: { nodes: MathNode[] }) {
  return (
    <>
      {nodes.map((node, idx) => {
        switch (node.t) {
          case "run":
            return (
              <span key={idx} className={node.variant === "normal" ? "not-italic" : "italic"}>
                {node.text}
              </span>
            );
          case "frac":
            return (
              <span key={idx} className="inline-flex flex-col items-center align-middle mx-0.5 text-[0.9em] leading-tight">
                <span className="px-1.5 pb-[1px] border-b border-current">
                  <MathView nodes={node.num} />
                </span>
                <span className="px-1.5 pt-[1px]">
                  <MathView nodes={node.den} />
                </span>
              </span>
            );
          case "sqrt":
            return (
              <span key={idx} className="whitespace-nowrap">
                {node.deg && node.deg.length > 0 && (
                  <sup className="text-[0.7em]">
                    <MathView nodes={node.deg} />
                  </sup>
                )}
                √
                <span className="border-t border-current px-0.5">
                  <MathView nodes={node.body} />
                </span>
              </span>
            );
          case "script":
            return (
              <span key={idx} className="whitespace-nowrap">
                <MathView nodes={node.base} />
                {node.sub && (
                  <sub className="text-[0.7em]">
                    <MathView nodes={node.sub} />
                  </sub>
                )}
                {node.sup && (
                  <sup className="text-[0.7em]">
                    <MathView nodes={node.sup} />
                  </sup>
                )}
              </span>
            );
          case "op":
            return (
              <span key={idx} className="inline-flex flex-col items-center align-middle mx-0.5">
                {node.limits === "aboveBelow" && node.sup && (
                  <span className="text-[0.65em] leading-none">
                    <MathView nodes={node.sup} />
                  </span>
                )}
                <span className="text-[1.3em] leading-none">{node.symbol}</span>
                {node.limits === "aboveBelow" && node.sub && (
                  <span className="text-[0.65em] leading-none">
                    <MathView nodes={node.sub} />
                  </span>
                )}
                {node.limits === "side" && (
                  <span className="text-[0.65em] leading-none">
                    {node.sub && <MathView nodes={node.sub} />}
                    {node.sup && <MathView nodes={node.sup} />}
                  </span>
                )}
                <span>
                  <MathView nodes={node.body} />
                </span>
              </span>
            );
          case "delim":
            return (
              <span key={idx}>
                {node.open}
                <MathView nodes={node.body} />
                {node.close}
              </span>
            );
          default:
            return null;
        }
      })}
    </>
  );
}

function SegmentView({ seg, dark }: { seg: Segment; dark: boolean }) {
  if (seg.type === "text") {
    return seg.bold ? <strong className="font-bold">{seg.text}</strong> : <>{seg.text}</>;
  }
  if (seg.type === "chem") {
    return (
      <span className="whitespace-nowrap">
        {seg.parts.map((p, i) =>
          p.t === "sub" ? (
            <sub key={i} className="text-[0.72em]">
              {p.v}
            </sub>
          ) : p.t === "sup" ? (
            <sup key={i} className="text-[0.72em]">
              {p.v}
            </sup>
          ) : (
            <Fragment key={i}>{p.v}</Fragment>
          )
        )}
      </span>
    );
  }
  return (
    <span className={`whitespace-nowrap ${dark ? "text-zinc-100" : "text-gray-900"}`}>
      <MathView nodes={parseLatex(seg.latex)} />
    </span>
  );
}

/** Markdown 表格的近似渲染（Word 中为原生表格，可编辑单元格） */
function TableView({ data, dark }: { data: MdTableData; dark: boolean }) {
  const border = dark ? "border-zinc-700" : "border-gray-300";
  return (
    <div className="my-3 overflow-x-auto">
      <table className={`w-full border-collapse text-[0.95em] ${dark ? "text-zinc-200" : "text-gray-700"}`}>
        <thead>
          <tr className={dark ? "bg-zinc-800/60" : "bg-gray-100/80"}>
            {data.header.map((h, i) => (
              <th
                key={i}
                className={`border ${border} px-2 py-1 font-semibold`}
                style={{ textAlign: data.align[i] ?? "left" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, r) => (
            <tr key={r}>
              {row.map((c, i) => (
                <td key={i} className={`border ${border} px-2 py-1`} style={{ textAlign: data.align[i] ?? "left" }}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 轻量排版预览渲染器：支持 # 标题、**加粗**、Markdown 表格与列表、
 * 题目三级符号（■ ◆ ▸）、数学公式（近似渲染）与化学式真实上下标。
 */
export function FormattedText({ text, dark, options }: FormattedTextProps) {
  if (!text) return null;
  const lines = splitLogicalLines(text);
  const nodes: ReactNode[] = [];

  const renderLine = (line: string, idx: number) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={idx} className="h-3" />;

    if (trimmed === WHITESPACE_SEPARATOR) {
      return (
        <div
          key={idx}
          className={`text-center my-2 tracking-widest text-[0.9em] ${dark ? "text-zinc-500" : "text-gray-400"}`}
        >
          {trimmed}
        </div>
      );
    }

    if (line.startsWith("# ") || line.startsWith("## ") || line.startsWith("### ")) {
      const content = line.replace(/^#+\s+/, "");
      const cls = line.startsWith("# ")
        ? "text-lg font-bold mt-4 mb-1"
        : line.startsWith("## ")
          ? "text-base font-bold mt-3 mb-1"
          : "font-bold mt-2 mb-0.5";
      return (
        <div key={idx} className={`${cls} ${dark ? "text-zinc-100" : "text-gray-900"}`}>
          {parseRichLine(content, options).map((seg, i) => (
            <SegmentView key={i} seg={seg} dark={dark} />
          ))}
        </div>
      );
    }

    // Markdown 无序列表
    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      return (
        <div key={idx} className="flex pl-3 my-0.5">
          <span className={`mr-1.5 shrink-0 ${dark ? "text-zinc-500" : "text-gray-500"}`}>•</span>
          <span>
            {parseRichLine(bullet[1], options).map((seg, i) => (
              <SegmentView key={i} seg={seg} dark={dark} />
            ))}
          </span>
        </div>
      );
    }

    // 题目层级：■ 大题（最大最重）／◆ 小题／▸ 小问
    const level = questionLevel(trimmed);
    if (level === 1) {
      return (
        <div key={idx} className={`mt-3.5 mb-1 text-[1.08em] font-bold ${dark ? "text-zinc-100" : "text-gray-900"}`}>
          {parseRichLine(trimmed, options).map((seg, i) => (
            <SegmentView key={i} seg={seg} dark={dark} />
          ))}
        </div>
      );
    }
    if (level === 2) {
      return (
        <div key={idx} className={`mt-2 mb-0.5 font-semibold ${dark ? "text-zinc-100" : "text-gray-900"}`}>
          {parseRichLine(trimmed, options).map((seg, i) => (
            <SegmentView key={i} seg={seg} dark={dark} />
          ))}
        </div>
      );
    }
    if (level === 3) {
      return (
        <div key={idx} className={`pl-5 mt-1 ${dark ? "text-zinc-300" : "text-gray-700"}`}>
          {parseRichLine(trimmed, options).map((seg, i) => (
            <SegmentView key={i} seg={seg} dark={dark} />
          ))}
        </div>
      );
    }

    // 选项弱化：缩进、颜色略浅
    if (isOptionLine(trimmed)) {
      return (
        <div key={idx} className={`pl-8 my-0.5 ${dark ? "text-zinc-400" : "text-gray-600"}`}>
          {parseRichLine(trimmed, options).map((seg, i) => (
            <SegmentView key={i} seg={seg} dark={dark} />
          ))}
        </div>
      );
    }

    return (
      <div key={idx}>
        {parseRichLine(trimmed, options).map((seg, i) => (
          <SegmentView key={i} seg={seg} dark={dark} />
        ))}
      </div>
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const table = parseTableAt(lines, i);
    if (table) {
      nodes.push(<TableView key={`t${i}`} data={table.table} dark={dark} />);
      i = table.next - 1;
      continue;
    }
    nodes.push(renderLine(lines[i], i));
  }

  return <div>{nodes}</div>;
}
