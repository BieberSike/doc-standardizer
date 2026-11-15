import { ShieldCheck } from "lucide-react";

/** 「关于」分类：版本与运行信息 */
export function AboutPane() {
  const rows = [
    { k: "应用名称", v: "文档压缩标准化与打印排版工具" },
    { k: "版本", v: "2.0.0" },
    { k: "运行方式", v: "纯本地离线 · 单文件 HTML" },
    { k: "数据流向", v: "不上传、不联网、无后台服务" },
    { k: "技术栈", v: "React + Vite + docx（OMML 原生公式）" },
  ];

  const abilities = [
    "LaTeX 公式 → Word 原生公式（可双击编辑）",
    "化学式 / 离子 → Word 真实上下标",
    "题目三级分级：■ 大题 / ◆ 小题 / ▸ 小问",
    "AI 客套话清除、空白压缩与分隔标号",
    "Markdown 表格 / 列表 → Word 原生格式",
  ];

  return (
    <div className="flex flex-col gap-5">
      <header className="pane-head">
        <h2>关于</h2>
        <p>本工具用于把 AI 对话里的作业文本整理成排版紧凑、可直接打印的 Word 文档。</p>
      </header>

      <section className="set-group">
        <div className="set-group-label">应用信息</div>
        <div className="set-card">
          {rows.map((row) => (
            <div key={row.k} className="set-row">
              <div className="set-row-main">
                <div className="set-row-title">{row.k}</div>
              </div>
              <div className="set-row-ctl">
                <span className="mono text-right text-[11.5px] text-[var(--text-2)]">{row.v}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="set-group">
        <div className="set-group-label">能力摘要</div>
        <div className="set-card">
          <div className="set-row items-start">
            <div className="set-row-main">
              <ul className="flex flex-col gap-1.5 text-[11.5px] text-[var(--text-2)]">
                {abilities.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <ShieldCheck className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
