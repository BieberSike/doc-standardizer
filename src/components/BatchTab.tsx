import { AlertTriangle, CheckCircle, Download, FileText, FolderCheck, Layers, RefreshCw, Trash2 } from "lucide-react";
import { BatchFile } from "../types";

interface BatchTabProps {
  dark: boolean;
  queue: BatchFile[];
  onImportFiles: (files: File[]) => void;
  onRun: () => void;
  onExportAll: () => void;
  onExportOne: (title: string, text: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

/** 表格列宽统一在此声明，表头与数据行共用同一套栅格 → 列必然对齐 */
const QUEUE_GRID = "grid grid-cols-[minmax(0,1fr)_72px_140px_128px] items-center gap-3";

export function BatchTab({
  queue,
  onImportFiles,
  onRun,
  onExportAll,
  onExportOne,
  onRemove,
  onClear,
}: BatchTabProps) {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="page-title">批量作业文件排版队列</h2>
        <p className="page-sub">
          拖入多个 TXT / MD 文件即可一次性进行公式标准化替换、空行清除以及智能打印极度紧凑排版，支持批量导出 Word。
        </p>
      </header>

      {/* 拖拽导入区：32px 内边距，内容三行 12px 行距 */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files);
          if (files.length > 0) onImportFiles(files);
        }}
        className="dropzone flex cursor-pointer flex-col items-center justify-center gap-3 px-8 py-9 text-center"
        onClick={() => document.getElementById("batch-file-selector")?.click()}
      >
        <div className="grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-soft)]">
          <Layers className="h-5 w-5 text-[var(--accent-fg)]" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[12.5px] font-semibold text-[var(--text-1)]">拖入多份作业文件到这里，或点击浏览上传本地文件</p>
          <p className="text-[11px] text-[var(--text-3)]">支持拖入任意数量的 .txt, .md 后缀格式文件</p>
        </div>
        <input
          id="batch-file-selector"
          type="file"
          accept=".txt,.md"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) onImportFiles(Array.from(files));
            e.target.value = "";
          }}
        />
      </div>

      {/* 队列 */}
      {queue.length > 0 ? (
        <div className="card overflow-hidden">
          <div
            className={`${QUEUE_GRID} h-9 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 text-[11.5px] font-semibold text-[var(--text-2)]`}
          >
            <div>文件名称</div>
            <div className="text-right">大小</div>
            <div className="text-center">状态</div>
            <div className="text-right">操作</div>
          </div>

          <div className="list max-h-[320px] overflow-y-auto">
            {queue.map((item) => (
              <div key={item.id} className={`${QUEUE_GRID} px-4 py-2.5 transition hover:bg-[var(--surface-2)]`}>
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--accent-fg)]" />
                  <span className="truncate text-[12px] font-medium text-[var(--text-1)]">{item.name}</span>
                </div>
                <div className="mono text-right text-[11px] text-[var(--text-3)]">{item.size} KB</div>

                <div className="flex items-center justify-center">
                  {item.status === "pending" && <span className="chip chip-neutral">待处理</span>}
                  {item.status === "completed" && (
                    <span className="chip chip-success">
                      <CheckCircle className="h-3 w-3" />
                      <span>完成并紧凑化</span>
                    </span>
                  )}
                  {item.status === "failed" && (
                    <span className="chip chip-danger max-w-full" title={item.error}>
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span className="truncate">错误: {item.error}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-end gap-1">
                  {item.status === "completed" && (
                    <button
                      onClick={() => onExportOne(item.detectedTitle, item.processedContent)}
                      className="btn btn-sm btn-accent-subtle"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>下载 DOCX</span>
                    </button>
                  )}
                  <button onClick={() => onRemove(item.id)} className="icon-btn" title="移除">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card flex flex-col items-center justify-center gap-2.5 px-8 py-12 text-center">
          <FolderCheck className="h-8 w-8 text-[var(--text-3)] opacity-40" />
          <span className="text-[12px] text-[var(--text-3)]">暂无待处理的文件队列</span>
          <p className="max-w-[420px] text-[10.5px] leading-[1.65] text-[var(--text-3)] opacity-80">
            当您需要同时将多门功课作业或几份不同的AI聊天记录统一整理成标准化A4小边距排版时，欢迎批量导入它们，一键压缩！
          </p>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
        <button onClick={onClear} disabled={queue.length === 0} className="btn btn-danger-subtle">
          <Trash2 className="h-4 w-4" />
          <span>一键清空队列</span>
        </button>

        <div className="flex items-center gap-2">
          <button onClick={onRun} disabled={queue.length === 0} className="btn btn-accent btn-lg">
            <RefreshCw className="h-4 w-4" />
            <span>一键智能排版所有</span>
          </button>

          <button
            onClick={onExportAll}
            disabled={queue.filter((f) => f.status === "completed").length === 0}
            className="btn btn-success btn-lg"
          >
            <Download className="h-4 w-4" />
            <span>打包导出所有Word成果</span>
          </button>
        </div>
      </div>
    </div>
  );
}
