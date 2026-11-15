import type { DragEvent } from "react";
import { Check, Copy, Download, Eye, FolderOpen, Layers, Settings2, Trash2 } from "lucide-react";
import { ProcessingConfig, TypographyTemplate } from "../types";
import { CONFIG_OPTIONS } from "../constants";
import { RichOptions } from "../lib/richText";
import { FormattedText } from "./FormattedText";

interface QuickTabProps {
  dark: boolean;
  rawText: string;
  onRawTextChange: (v: string) => void;
  processedText: string;
  richOptions: RichOptions;
  outputTitle: string;
  onOutputTitleChange: (v: string) => void;
  configs: ProcessingConfig;
  onToggleConfig: (key: keyof ProcessingConfig) => void;
  templates: TypographyTemplate[];
  selectedTemplateId: string;
  onSelectTemplate: (id: string) => void;
  customFont: string;
  customFontSize: number;
  customLineSpacing: number;
  customMargins: number;
  copied: boolean;
  onCopy: () => void;
  onExport: (title: string, text: string) => void;
  onImportFiles: (files: File[]) => void;
  onOpenWorkflowSettings: () => void;
  setStatus: (msg: string) => void;
}

export function QuickTab({  dark,
  rawText,
  onRawTextChange,
  processedText,
  richOptions,
  outputTitle,
  onOutputTitleChange,
  configs,
  onToggleConfig,
  templates,
  selectedTemplateId,
  onSelectTemplate,
  customFont,
  customFontSize,
  customLineSpacing,
  customMargins,
  copied,
  onCopy,
  onExport,
  onImportFiles,
  onOpenWorkflowSettings,
  setStatus,
}: QuickTabProps) {
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onImportFiles(files);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 页头 */}
      <header>
        <h2 className="page-title">工作区</h2>
      </header>

      {/* 输入 / 预览双栏：16px 栅格间距，两栏标题行同高 28px 保证基线对齐 */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        {/* 左：原始输入 */}
        <section className="flex h-[400px] flex-col gap-2">
          <div className="flex h-7 items-center justify-between gap-3">
            <div className="flex min-w-0 items-baseline gap-2">
              <label className="truncate text-[12.5px] font-semibold text-[var(--text-1)]">原始文本输入</label>
              <span className="meta shrink-0">{rawText.length} 字</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => { onRawTextChange(""); setStatus("已清空文本输入框"); }}
                className="btn btn-sm btn-danger-subtle"
              >
                <Trash2 className="h-3 w-3" />
                <span>清空</span>
              </button>
              <label className="btn btn-sm btn-accent-subtle cursor-pointer">
                <FolderOpen className="h-3 w-3" />
                <span>导入文件...</span>
                <input
                  type="file"
                  accept=".txt,.md"
                  multiple
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) onImportFiles(Array.from(files));
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="card relative flex flex-1 overflow-hidden">
            <textarea
              id="raw-text-input"
              value={rawText}
              onChange={(e) => onRawTextChange(e.target.value)}
              placeholder={"在此粘贴您从 AI 对话复制的带有 LaTeX 数学公式和乱码符号的作业回复内容...\n\n或者，您也可以直接把 TXT / MD 文档拖入此区域直接加载并处理！"}
              className="mono h-full w-full resize-none bg-transparent p-4 text-[12px] leading-[1.75] text-[var(--text-1)] outline-none placeholder:text-[var(--text-3)]"
            />
            {!rawText && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-6 text-center">
                <Layers className="h-9 w-9 text-[var(--text-3)] opacity-40" />
                <span className="text-[11.5px] font-medium text-[var(--text-3)]">拖拽 TXT/MD 作业文件至此或在此粘贴聊天文本</span>
              </div>
            )}
          </div>
        </section>

        {/* 右：实时预览 */}
        <section className="flex h-[400px] flex-col gap-2">
          <div className="flex h-7 items-center justify-between gap-3">
            <div className="flex min-w-0 items-baseline gap-2">
              <label className="truncate text-[12.5px] font-semibold text-[var(--text-1)]">排版效果实时预览</label>
              <span className="meta shrink-0">{processedText.length} 字</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={onCopy}
                disabled={!processedText}
                className={`btn btn-sm ${copied ? "btn-success-soft" : "btn-neutral"}`}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? "已复制" : "复制结果"}</span>
              </button>
              <button
                onClick={() => onExport(outputTitle, processedText)}
                disabled={!processedText}
                className="btn btn-sm btn-accent-subtle"
              >
                <Download className="h-3.5 w-3.5" />
                <span>导出为 Word (.docx)</span>
              </button>
            </div>
          </div>

          <div
            className="card relative flex flex-1 overflow-y-auto p-4"
            style={{ background: "var(--well)" }}
          >
            <div
              className="paper relative mx-auto min-h-[300px] w-full max-w-[520px] self-start"
              style={{
                fontFamily: `${customFont}, "SimSun", "Microsoft YaHei", sans-serif`,
                fontSize: `${customFontSize}pt`,
                lineHeight: `${customLineSpacing}`,
                padding: `${customMargins * 72}px`,
              }}
            >
              {processedText ? (
                <div className="flex flex-col gap-3">
                  <div className="mb-4 border-b border-[var(--paper-border)] pb-2.5 text-center text-[1.15em] font-bold text-[var(--text-1)]">
                    {outputTitle}
                  </div>
                  <FormattedText text={processedText} dark={dark} options={richOptions} />
                </div>
              ) : (
                <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 p-6 text-center">
                  <Eye className="h-7 w-7 text-[var(--text-3)]" />
                  <span className="text-[11.5px] text-[var(--text-3)]">实时处理效果预览区域</span>
                  <p className="max-w-[280px] text-[10.5px] leading-[1.6] text-[var(--text-3)]">
                    选择左侧粘贴或上传内容，您即可在此实时查看优化页间距、公式标准化以及清除乱码后的排版情况。
                  </p>
                </div>
              )}
              <div className="mono pointer-events-none absolute right-1.5 top-1.5 select-none rounded-[3px] px-1 text-[8px] tracking-[0.08em] text-[var(--text-3)] opacity-60">
                A4 SIMULATOR ({customMargins} INCH MARGIN)
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* 模板选择 + 开关：卡片内 20px 内边距、24px 分栏槽 */}
      <section className="card grid grid-cols-1 gap-6 p-5 md:grid-cols-3">
        <div className="flex flex-col gap-2.5">
          <span className="text-[12px] font-semibold text-[var(--text-2)]">排版标准配置模板</span>
          <div className="flex flex-1 flex-col gap-1.5">
            {templates.map((tpl) => {
              const selected = selectedTemplateId === tpl.id;
              return (
                <label
                  key={tpl.id}
                  className={`flex min-h-9 flex-1 cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 text-[12px] transition ${
                    selected
                      ? "border-[var(--accent-border)] bg-[var(--accent-soft)] font-semibold text-[var(--accent-fg)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <input
                      type="radio"
                      name="selected_tpl"
                      checked={selected}
                      onChange={() => onSelectTemplate(tpl.id)}
                    />
                    <span className="truncate">{tpl.name}</span>
                  </div>
                  <span className="mono shrink-0 text-[10.5px] text-[var(--text-3)]">
                    {tpl.fontSize}pt / {tpl.lineSpacing}行距
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2.5 md:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-[var(--text-2)]">精细处理选项功能开关</span>
            <button
              type="button"
              onClick={onOpenWorkflowSettings}
              className="btn btn-sm btn-accent-subtle"
              title="打开设置中的「处理工作流」，可逐条开关并查看完整规则"
            >
              <Settings2 className="h-3 w-3" />
              在设置中调整
            </button>
          </div>
          <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2">
            {CONFIG_OPTIONS.map((opt) => (
              <label
                key={opt.key}
                className="flex cursor-pointer select-none items-start gap-2.5 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
              >
                <input
                  type="checkbox"
                  checked={configs[opt.key]}
                  onChange={() => onToggleConfig(opt.key)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <span className="block text-[12px] font-medium text-[var(--text-1)]">{opt.title}</span>
                  <span className="mt-0.5 block text-[10.5px] leading-[1.5] text-[var(--text-3)]">{opt.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* 底部操作栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
        <div className="flex w-full max-w-[360px] items-center gap-2">
          <span className="shrink-0 text-[11.5px] font-medium text-[var(--text-2)]">输出文件名:</span>
          <input
            id="filename-config-input"
            type="text"
            value={outputTitle}
            onChange={(e) => onOutputTitleChange(e.target.value)}
            className="field"
            placeholder="导出文档的名称"
          />
          <span className="mono shrink-0 text-[11px] text-[var(--text-3)]">.docx</span>
        </div>

        <button
          id="btn-export"
          onClick={() => onExport(outputTitle, processedText)}
          disabled={!processedText}
          className="btn btn-accent btn-lg"
        >
          <Download className="h-4 w-4" />
          <span>一键转换并压缩下载</span>
        </button>
      </div>
    </div>
  );
}
