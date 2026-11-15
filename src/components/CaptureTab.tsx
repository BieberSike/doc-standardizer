import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  Check,
  Crop,
  Download,
  FileDown,
  Images,
  Info,
  RefreshCw,
  Ruler,
  Sparkles,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  applyCropTemplate,
  cropToCanvas,
  detectCropBox,
  extractTimestamp,
  learnCropTemplate,
  loadImageFile,
  type CaptureItem,
  type CropBox,
  type CropTemplate,
} from "../lib/imageCrop";
import {
  blobToBytes,
  canvasToBlob,
  createImagePdf,
  layoutOnPage,
  PAPER_SIZES,
  type PaperSize,
} from "../lib/pdf";
import { createZip } from "../lib/zip";
import { downloadBlob } from "../lib/docx";

interface CaptureTabProps {
  onStatus: (msg: string) => void;
}

interface TemplateFile {
  canvas: HTMLCanvasElement;
  url: string;
  name: string;
}

type CropEdge = "top" | "bottom" | "left" | "right";
type FlashKind = "pdf" | "zip" | "one" | "template";

interface FlashMsg {
  id: number;
  text: string;
  kind: FlashKind;
}

const newId = () => Math.random().toString(36).slice(2, 9);

/** Windows 文件名不能含 \ / : * ? " < > | */
const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, "_").trim() || "image";

const baseName = (name: string) => safeName(name.replace(/\.[^.]+$/, ""));

/** 卡片画布展示尺寸：卡片内容宽约 210px，高不超过 288px */
const DISPLAY_W = 210;
const DISPLAY_H = 288;

/** 裁切框在任一方向上的最小保留尺寸（原图像素） */
const MIN_KEEP = 40;

/** 预览缩放档位 */
const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2, 2.5];

/** 预览页在 100% 时的宽度（px） */
const PREVIEW_BASE_W = 188;

/** 沿某个方向移动一条裁切边（拖拽与键盘共用） */
function moveEdge(crop: CropBox, edge: CropEdge, dx: number, dy: number, w: number, h: number): CropBox {
  const minW = Math.min(MIN_KEEP, Math.max(2, Math.floor(w / 2)));
  const minH = Math.min(MIN_KEEP, Math.max(2, Math.floor(h / 2)));
  switch (edge) {
    case "top":
      return { ...crop, top: Math.max(0, Math.min(crop.bottom - minH, Math.round(crop.top + dy))) };
    case "bottom":
      return { ...crop, bottom: Math.min(h, Math.max(crop.top + minH, Math.round(crop.bottom + dy))) };
    case "left":
      return { ...crop, left: Math.max(0, Math.min(crop.right - minW, Math.round(crop.left + dx))) };
    default:
      return { ...crop, right: Math.min(w, Math.max(crop.left + minW, Math.round(crop.right + dx))) };
  }
}

export function CaptureTab({ onStatus }: CaptureTabProps) {
  const [items, setItems] = useState<CaptureItem[]>([]);
  const [threshold, setThreshold] = useState(50);
  const [avoidButton, setAvoidButton] = useState(true);
  const [trimSides, setTrimSides] = useState(false);
  const [paper, setPaper] = useState<PaperSize>("A4");
  const [pdfMargin, setPdfMargin] = useState(6);
  const [zoom, setZoom] = useState(1);
  const [template, setTemplate] = useState<CropTemplate | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [flash, setFlash] = useState<FlashMsg | null>(null);
  const [tplPair, setTplPair] = useState<{ original: TemplateFile | null; cropped: TemplateFile | null }>({
    original: null,
    cropped: null,
  });

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const tplOriginalRef = useRef<HTMLInputElement>(null);
  const tplCroppedRef = useRef<HTMLInputElement>(null);
  const tplUrls = useRef<{ original?: string; cropped?: string }>({});

  const flashTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    []
  );

  /** 完成提示：0.3s 入场、2.4s 后自动消失，不打断任何操作 */
  const showFlash = (text: string, kind: FlashKind) => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    setFlash({ id: Date.now(), text, kind });
    flashTimer.current = window.setTimeout(() => setFlash(null), 2400);
  };

  const dragRef = useRef<{
    id: string;
    edge: CropEdge;
    startX: number;
    startY: number;
    startCrop: CropBox;
    displayW: number;
    displayH: number;
    naturalW: number;
    naturalH: number;
  } | null>(null);

  /** 阈值 / 避让开关 / 左右裁边变化后重新识别（防抖，避免拖滑块时反复全量计算） */
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (template || itemsRef.current.length === 0) return;
    const timer = window.setTimeout(() => {
      const total = itemsRef.current.length;
      setItems((prev) =>
        prev.map((it) => ({ ...it, crop: detectCropBox(it.canvas, threshold, avoidButton, trimSides) }))
      );
      onStatus(`已按新的识别参数重新处理 ${total} 张截图`);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [threshold, avoidButton, trimSides, template, onStatus]);

  /** 拖动裁切手柄：上下左右共用一套逻辑，以按下时的值为基准，避免累计误差 */
  useEffect(() => {
    if (!draggingId) return;
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = ((e.clientX - drag.startX) / Math.max(1, drag.displayW)) * drag.naturalW;
      const dy = ((e.clientY - drag.startY) / Math.max(1, drag.displayH)) * drag.naturalH;
      setItems((prev) =>
        prev.map((it) =>
          it.id !== drag.id
            ? it
            : { ...it, crop: moveEdge(drag.startCrop, drag.edge, dx, dy, it.canvas.width, it.canvas.height) }
        )
      );
    };
    const onUp = () => {
      dragRef.current = null;
      setDraggingId(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [draggingId]);

  const addFiles = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      onStatus("没有可用的图片文件（支持 PNG / JPG / WebP）");
      return;
    }
    setBusy(`正在读取 ${images.length} 张图片...`);
    const loaded: CaptureItem[] = [];
    for (const file of images) {
      try {
        const canvas = await loadImageFile(file);
        loaded.push({
          id: newId(),
          name: file.name,
          timestamp: extractTimestamp(file.name),
          canvas,
          crop: { left: 0, top: 0, right: canvas.width, bottom: canvas.height },
        });
      } catch (err) {
        onStatus((err as Error).message);
      }
    }
    if (loaded.length === 0) {
      setBusy(null);
      return;
    }

    setBusy(`正在识别 ${loaded.length} 张截图的页面边界...`);
    // 让忙碌提示先渲染一帧，避免大图计算期间界面“卡住无反馈”
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    const cropped = loaded.map((it) => ({
      ...it,
      crop: template
        ? applyCropTemplate(it.canvas, template)
        : detectCropBox(it.canvas, threshold, avoidButton, trimSides),
    }));
    setItems((prev) =>
      [...prev, ...cropped].sort((a, b) => a.timestamp.localeCompare(b.timestamp, undefined, { numeric: true }))
    );
    setBusy(null);
    onStatus(`已导入 ${cropped.length} 张截图，可直接拖动红线微调或导出`);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) void addFiles(files);
  };

  const recropAll = async () => {
    if (itemsRef.current.length === 0) return;
    setBusy("正在重新识别页面边界...");
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        crop: template
          ? applyCropTemplate(it.canvas, template)
          : detectCropBox(it.canvas, threshold, avoidButton, trimSides),
      }))
    );
    setBusy(null);
    onStatus(template ? "已按锁定的模板重新裁切全部截图" : "已按当前参数重新识别全部截图");
    showFlash(template ? "已按模板重新裁切" : "已重新识别边界", "template");
  };

  /** 以第 1 张的四边裁切比例为准，等比同步给其余图片 */
  const syncFromFirst = () => {
    const list = itemsRef.current;
    if (list.length < 2) return;
    const ref = list[0];
    const refW = ref.canvas.width;
    const refH = ref.canvas.height;
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx === 0) return it;
        const sx = it.canvas.width / refW;
        const sy = it.canvas.height / refH;
        return {
          ...it,
          crop: {
            left: Math.round(ref.crop.left * sx),
            top: Math.round(ref.crop.top * sy),
            right: Math.round(it.canvas.width - (refW - ref.crop.right) * sx),
            bottom: Math.round(ref.crop.bottom * sy),
          },
        };
      })
    );
    onStatus("已按第 1 页的裁切比例同步到全部截图");
    showFlash("已同步第 1 页的裁切比例", "template");
  };

  const downloadOne = async (item: CaptureItem) => {
    try {
      const blob = await canvasToBlob(cropToCanvas(item.canvas, item.crop), "image/png");
      downloadBlob(blob, `${baseName(item.name)}_cropped.png`);
      onStatus(`已下载单张：${baseName(item.name)}_cropped.png`);
      showFlash("单张图片已保存", "one");
    } catch (err) {
      onStatus(`下载失败：${(err as Error).message}`);
    }
  };

  const handleExportZip = async () => {
    if (items.length === 0) return;
    setBusy("正在打包 ZIP...");
    try {
      const entries = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setBusy(`正在打包第 ${i + 1}/${items.length} 张...`);
        const blob = await canvasToBlob(cropToCanvas(item.canvas, item.crop), "image/png");
        entries.push({
          name: `${String(i + 1).padStart(3, "0")}_${baseName(item.name)}_cropped.png`,
          data: await blobToBytes(blob),
        });
      }
      downloadBlob(createZip(entries), `截图裁切_${entries.length}张.zip`);
      onStatus(`已打包下载 ${entries.length} 张裁切图片（ZIP）`);
      showFlash(`已打包 ${entries.length} 张图片`, "zip");
    } catch (err) {
      onStatus(`打包失败：${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleExportPdf = async () => {
    if (items.length === 0) return;
    const paperLabel = PAPER_SIZES[paper].label;
    setBusy("正在生成 PDF...");
    try {
      const pages = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setBusy(`正在生成 PDF 第 ${i + 1}/${items.length} 页...`);
        const canvas = cropToCanvas(item.canvas, item.crop);
        const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
        pages.push({ data: await blobToBytes(blob), width: canvas.width, height: canvas.height });
      }
      downloadBlob(
        createImagePdf(pages, pdfMargin, paper),
        `截图裁切排版_${pages.length}页_${paperLabel}.pdf`
      );
      onStatus(`已导出 ${pages.length} 页 PDF（${paperLabel} · 边距 ${pdfMargin}mm）`);
      showFlash(`已导出 ${pages.length} 页 ${paperLabel} PDF`, "pdf");
    } catch (err) {
      onStatus(`导出 PDF 失败：${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  // ---------- 模板学习 ----------
  const loadTemplateFile = async (file: File | undefined, slot: "original" | "cropped") => {
    if (!file) return;
    try {
      const canvas = await loadImageFile(file);
      const previous = tplUrls.current[slot];
      if (previous) URL.revokeObjectURL(previous);
      const url = URL.createObjectURL(file);
      tplUrls.current[slot] = url;
      setTplPair((prev) => ({ ...prev, [slot]: { canvas, url, name: file.name } }));
    } catch (err) {
      onStatus((err as Error).message);
    }
  };

  const handleLearn = () => {
    const original = tplPair.original?.canvas;
    const cropped = tplPair.cropped?.canvas;
    if (!original || !cropped) return;
    const result = learnCropTemplate(original, cropped);
    if (!result.ok) {
      onStatus(result.reason);
      return;
    }
    const learned = result.template;
    setTemplate(learned);
    setItems((prev) => prev.map((it) => ({ ...it, crop: applyCropTemplate(it.canvas, learned) })));
    const keepW = learned.right - learned.left;
    const keepH = learned.bottom - learned.top;
    onStatus(
      `已学习模板：左 ${learned.left}px · 右 ${original.width - learned.right}px · ` +
        `上 ${learned.top}px · 下 ${original.height - learned.bottom}px，` +
        `匹配度 ${Math.round(learned.confidence * 100)}%，已套用到全部截图`
    );
    showFlash(`模板已应用：保留 ${keepW}×${keepH}px`, "template");
  };

  const clearTemplate = () => {
    setTemplate(null);
    setItems((prev) =>
      prev.map((it) => ({ ...it, crop: detectCropBox(it.canvas, threshold, avoidButton, trimSides) }))
    );
    onStatus("已清除模板，恢复自动边界识别");
  };

  const handlePointerDown = (
    e: ReactPointerEvent<HTMLDivElement>,
    item: CaptureItem,
    edge: CropEdge,
    displayW: number,
    displayH: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      id: item.id,
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...item.crop },
      displayW,
      displayH,
      naturalW: item.canvas.width,
      naturalH: item.canvas.height,
    };
    setDraggingId(item.id);
  };

  /** 键盘微调（聚焦红线后按方向键，Shift 加速 5 倍） */
  const nudgeCrop = (item: CaptureItem, edge: CropEdge, delta: number) => {
    const horizontal = edge === "left" || edge === "right";
    setItems((prev) =>
      prev.map((it) =>
        it.id !== item.id
          ? it
          : {
              ...it,
              crop: moveEdge(
                it.crop,
                edge,
                horizontal ? delta : 0,
                horizontal ? 0 : delta,
                it.canvas.width,
                it.canvas.height
              ),
            }
      )
    );
  };

  const zoomIndex = Math.max(0, ZOOM_STEPS.indexOf(zoom));
  const stepZoom = (dir: number) => {
    const next = Math.min(ZOOM_STEPS.length - 1, Math.max(0, zoomIndex + dir));
    setZoom(ZOOM_STEPS[next]);
  };

  const totalPages = items.length;
  const paperMeta = PAPER_SIZES[paper];
  const templateLocked = !!template;
  const trimmedCount = useMemo(
    () => items.filter((it) => it.crop.left > 1 || it.crop.right < it.canvas.width - 1).length,
    [items]
  );

  return (
    <div
      className="flex flex-col gap-4"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.relatedTarget === null) setDragOver(false);
      }}
      onDrop={handleDrop}
      data-drag={dragOver}
    >
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="page-title">截图裁切排版</h2>
          <p className="page-sub">
            把手机或网页长截图拖进来，自动切掉顶部状态栏、底部黑边与蓝色悬浮按钮，再按所选纸张一键导出图片或 PDF。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTemplate((v) => !v)}
            className={`btn btn-sm ${showTemplate ? "btn-accent-subtle" : "btn-neutral"}`}
            aria-expanded={showTemplate}
          >
            <Crop className="h-3.5 w-3.5" />
            <span>模板学习</span>
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-neutral">
            <Upload className="h-3.5 w-3.5" />
            <span>导入截图</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) void addFiles(Array.from(files));
              e.target.value = "";
            }}
          />
        </div>
      </header>

      {/* 模板学习面板：给一张原图 + 对应的已裁好样本，自动学出裁切位置 */}
      {showTemplate && (
        <section className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[12.5px] font-semibold text-[var(--text-1)]">模板学习（可选）</div>
              <p className="mt-1 max-w-[640px] text-[11.5px] leading-[1.6] text-[var(--text-3)]">
                固定设备截图时，给一张原图和它对应的已裁切样本，程序按像素特征反推裁剪位置（上下左右都能学），
                之后所有截图沿用同一套比例，比自动识别更稳。样本被缩放导出过也能识别。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLearn}
                disabled={!tplPair.original || !tplPair.cropped}
                className="btn btn-sm btn-accent"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>学习并应用</span>
              </button>
              {template && (
                <button type="button" onClick={clearTemplate} className="btn btn-sm btn-neutral">
                  清除模板
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {(
              [
                { slot: "original" as const, label: "1. 原图（未裁切）", ref: tplOriginalRef },
                { slot: "cropped" as const, label: "2. 样本（已裁切）", ref: tplCroppedRef },
              ]
            ).map(({ slot, label, ref }) => {
              const file = tplPair[slot];
              return (
                <div key={slot} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => ref.current?.click()}
                    className="flex h-[92px] w-[74px] flex-col items-center justify-center gap-1 overflow-hidden rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-1 text-center text-[10px] leading-tight text-[var(--text-3)] transition hover:border-[var(--accent)] hover:text-[var(--accent-fg)]"
                  >
                    {file ? (
                      <img src={file.url} alt={label} className="h-full w-full object-contain" />
                    ) : (
                      <>
                        <Images className="h-4 w-4" />
                        <span>{label}</span>
                      </>
                    )}
                  </button>
                  <input
                    ref={ref}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      void loadTemplateFile(e.target.files?.[0], slot);
                      e.target.value = "";
                    }}
                  />
                </div>
              );
            })}
            <span className="text-[11px] leading-[1.7] text-[var(--text-3)]">
              {template
                ? `已锁定模板：左 ${template.left} · 上 ${template.top} · 右 ${template.right} · 下 ${template.bottom}` +
                  `（保留 ${template.right - template.left}×${template.bottom - template.top}px，匹配度 ${Math.round(
                    template.confidence * 100
                  )}%）`
                : "两张都选好后点击「学习并应用」"}
            </span>
          </div>
        </section>
      )}

      {/* 参数工具栏 */}
      {totalPages > 0 && (
        <section className="card flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
          <div
            className="flex items-center gap-2"
            title={
              templateLocked
                ? "模板已锁定，清除模板后才能调整识别参数"
                : "数值越大，越容易把浅灰/暗色区域判为黑边裁掉"
            }
          >
            <span className={`text-[11.5px] ${templateLocked ? "text-[var(--text-3)]" : "text-[var(--text-2)]"}`}>
              黑边阈值
            </span>
            <input
              type="range"
              min={20}
              max={120}
              step={1}
              value={threshold}
              disabled={templateLocked}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-[110px]"
              aria-label="黑边阈值"
            />
            <span className="mono w-6 text-right text-[11.5px] font-semibold text-[var(--accent-fg)]">
              {threshold}
            </span>
          </div>

          <label
            className={`flex items-center gap-1.5 text-[11.5px] ${
              templateLocked ? "cursor-not-allowed text-[var(--text-3)]" : "cursor-pointer text-[var(--text-2)]"
            }`}
            title={templateLocked ? "模板已锁定，清除模板后才能调整识别参数" : "避开截图底部的蓝色悬浮按钮"}
          >
            <input
              type="checkbox"
              checked={avoidButton}
              disabled={templateLocked}
              onChange={(e) => setAvoidButton(e.target.checked)}
            />
            避让底部蓝钮
          </label>

          <label
            className={`flex items-center gap-1.5 text-[11.5px] ${
              templateLocked ? "cursor-not-allowed text-[var(--text-3)]" : "cursor-pointer text-[var(--text-2)]"
            }`}
            title={
              templateLocked
                ? "模板已锁定，清除模板后才能调整识别参数"
                : "自动剥掉左右两侧又暗又均匀的黑边（带纹理的深色区域不会被裁）"
            }
          >
            <input
              type="checkbox"
              checked={trimSides}
              disabled={templateLocked}
              onChange={(e) => setTrimSides(e.target.checked)}
            />
            左右自动裁边
            {trimmedCount > 0 && <span className="mono text-[10px] text-[var(--accent-fg)]">{trimmedCount} 张已裁</span>}
          </label>

          <div className="flex items-center gap-2" title="导出 PDF 使用的纸张尺寸，A4 为默认值">
            <FileDown className="h-3.5 w-3.5 text-[var(--text-3)]" />
            <span className="text-[11.5px] text-[var(--text-2)]">纸张</span>
            <select
              value={paper}
              onChange={(e) => setPaper(e.target.value as PaperSize)}
              className="field h-7 w-auto max-w-[176px] px-1.5 text-[11.5px]"
              aria-label="导出纸张尺寸"
            >
              {Object.entries(PAPER_SIZES).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}（{meta.note}）
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-2)]">
            <Ruler className="h-3.5 w-3.5 text-[var(--text-3)]" />
            页边距
            <input
              type="number"
              min={0}
              max={30}
              value={pdfMargin}
              onChange={(e) => setPdfMargin(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
              className="field h-7 w-[58px] px-2 text-[11.5px]"
              aria-label="PDF 页边距（毫米）"
            />
            <span className="text-[11px] text-[var(--text-3)]">mm</span>
          </label>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => void recropAll()} disabled={!!busy} className="btn btn-sm btn-neutral">
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
              重新识别
            </button>
            <button
              type="button"
              onClick={syncFromFirst}
              disabled={totalPages < 2 || !!busy}
              className="btn btn-sm btn-neutral"
              title="以第 1 张的裁切比例为准，同步给所有图片"
            >
              <Crop className="h-3.5 w-3.5" />
              首图比例同步
            </button>
            <button
              type="button"
              onClick={() => {
                setItems([]);
                onStatus("已清空截图队列");
              }}
              disabled={!!busy}
              className="btn btn-sm btn-danger-subtle"
            >
              <Trash2 className="h-3.5 w-3.5" />
              清空
            </button>
          </div>
        </section>
      )}

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {totalPages === 0 ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
              }}
              className="dropzone flex cursor-pointer flex-col items-center gap-3 px-6 py-16 text-center outline-none"
            >
              <Images className="h-10 w-10 text-[var(--text-3)] opacity-50" />
              <div>
                <div className="text-[13px] font-semibold text-[var(--text-1)]">
                  把截图拖到这里，或点击选择文件
                </div>
                <div className="mt-1 text-[11.5px] text-[var(--text-3)]">
                  支持 PNG / JPG / WebP · 可一次拖入多张 · 按文件名时间戳自动排序
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                <span className="chip chip-neutral">四边都能裁</span>
                <span className="chip chip-neutral">避让底部蓝钮</span>
                <span className="chip chip-neutral">A4 / A5 / A3 / Letter</span>
              </div>
              <p className="max-w-[440px] text-[11px] leading-[1.7] text-[var(--text-3)]">
                导入后依然可以继续拖图追加页面，或按住红色手柄上下左右拖动微调单张边界；所有处理都在本机内存完成，不上传任何图片。
              </p>
            </div>
          ) : (
            <div className="cap-grid">
              {items.map((item, index) => {
                const scale = Math.min(DISPLAY_W / item.canvas.width, DISPLAY_H / item.canvas.height);
                const displayW = Math.max(1, Math.round(item.canvas.width * scale));
                const displayH = Math.max(1, Math.round(item.canvas.height * scale));
                const naturalW = Math.max(1, item.canvas.width);
                const naturalH = Math.max(1, item.canvas.height);
                const topPct = (item.crop.top / naturalH) * 100;
                const bottomPct = (item.crop.bottom / naturalH) * 100;
                const leftPct = (item.crop.left / naturalW) * 100;
                const rightPct = (item.crop.right / naturalW) * 100;
                const keepW = Math.round(item.crop.right - item.crop.left);
                const keepH = Math.round(item.crop.bottom - item.crop.top);
                const bandH = Math.max(0, bottomPct - topPct);
                const edgeKeys: { edge: CropEdge; label: string }[] = [
                  { edge: "left", label: "LEFT ↔" },
                  { edge: "right", label: "RIGHT ↔" },
                ];
                const sideTrimmed =
                  item.crop.left > 2 || item.crop.right < item.canvas.width - 2;

                return (
                  <article key={item.id} id={`cap-card-${item.id}`} className="cap-card">
                    <div className="cap-card-head">
                      <span className="mono text-[11.5px] font-semibold text-[var(--text-2)]">第 {index + 1} 页</span>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            setItems((prev) => {
                              if (index === 0) return prev;
                              const next = [...prev];
                              [next[index - 1], next[index]] = [next[index], next[index - 1]];
                              return next;
                            })
                          }
                          disabled={index === 0}
                          className="icon-btn h-6 w-6"
                          title="向前移动"
                          aria-label={`将第 ${index + 1} 页向前移动`}
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setItems((prev) => {
                              if (index === prev.length - 1) return prev;
                              const next = [...prev];
                              [next[index], next[index + 1]] = [next[index + 1], next[index]];
                              return next;
                            })
                          }
                          disabled={index === items.length - 1}
                          className="icon-btn h-6 w-6"
                          title="向后移动"
                          aria-label={`将第 ${index + 1} 页向后移动`}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setItems((prev) => prev.filter((it) => it.id !== item.id));
                            onStatus(`已移除第 ${index + 1} 页`);
                          }}
                          className="icon-btn h-6 w-6 hover:text-[var(--danger)]"
                          title="移除此页"
                          aria-label={`移除第 ${index + 1} 页`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="cap-stage">
                      <div className="cap-canvas-wrap" style={{ width: displayW, height: displayH }}>
                        <CaptureCanvas canvas={item.canvas} width={displayW} height={displayH} />

                        {/* 四块遮罩：上下全宽，左右只覆盖页面带，拼出保留区域 */}
                        <div className="cap-mask" style={{ top: 0, left: 0, width: "100%", height: `${topPct}%` }} />
                        <div
                          className="cap-mask"
                          style={{ top: `${bottomPct}%`, left: 0, width: "100%", height: `${100 - bottomPct}%` }}
                        />
                        <div
                          className="cap-mask"
                          style={{ top: `${topPct}%`, left: 0, width: `${leftPct}%`, height: `${bandH}%` }}
                        />
                        <div
                          className="cap-mask"
                          style={{ top: `${topPct}%`, left: `${rightPct}%`, width: `${100 - rightPct}%`, height: `${bandH}%` }}
                        />

                        {/* 上下边界 */}
                        <div
                          className="cap-line"
                          style={{ top: `${topPct}%` }}
                          onPointerDown={(e) => handlePointerDown(e, item, "top", displayW, displayH)}
                          onKeyDown={(e) => {
                            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                            e.preventDefault();
                            nudgeCrop(item, "top", (e.key === "ArrowUp" ? -1 : 1) * (e.shiftKey ? 50 : 10));
                          }}
                          role="slider"
                          aria-label="上边界"
                          aria-orientation="horizontal"
                          aria-valuemin={0}
                          aria-valuemax={Math.round(item.crop.bottom - MIN_KEEP)}
                          aria-valuenow={Math.round(item.crop.top)}
                          tabIndex={0}
                        >
                          <span className="cap-handle cap-handle-t">TOP ↕</span>
                        </div>
                        <div
                          className="cap-line"
                          style={{ top: `${bottomPct}%` }}
                          onPointerDown={(e) => handlePointerDown(e, item, "bottom", displayW, displayH)}
                          onKeyDown={(e) => {
                            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                            e.preventDefault();
                            nudgeCrop(item, "bottom", (e.key === "ArrowUp" ? -1 : 1) * (e.shiftKey ? 50 : 10));
                          }}
                          role="slider"
                          aria-label="下边界"
                          aria-orientation="horizontal"
                          aria-valuemin={Math.round(item.crop.top + MIN_KEEP)}
                          aria-valuemax={item.canvas.height}
                          aria-valuenow={Math.round(item.crop.bottom)}
                          tabIndex={0}
                        >
                          <span className="cap-handle cap-handle-b">BOT ↕</span>
                        </div>

                        {/* 左右边界 */}
                        {edgeKeys.map(({ edge, label }) => {
                          const pos = edge === "left" ? leftPct : rightPct;
                          return (
                            <div
                              key={edge}
                              className="cap-guide"
                              style={{ left: `${pos}%` }}
                              onPointerDown={(e) => handlePointerDown(e, item, edge, displayW, displayH)}
                              onKeyDown={(e) => {
                                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                                e.preventDefault();
                                nudgeCrop(item, edge, (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 50 : 10));
                              }}
                              role="slider"
                              aria-label={edge === "left" ? "左边界" : "右边界"}
                              aria-orientation="vertical"
                              aria-valuemin={edge === "left" ? 0 : Math.round(item.crop.left + MIN_KEEP)}
                              aria-valuemax={
                                edge === "left" ? Math.round(item.crop.right - MIN_KEEP) : item.canvas.width
                              }
                              aria-valuenow={Math.round(edge === "left" ? item.crop.left : item.crop.right)}
                              tabIndex={0}
                            >
                              <span
                                className={`cap-handle cap-handle-${edge === "left" ? "l" : "r"}${
                                  sideTrimmed ? " is-on" : ""
                                }`}
                              >
                                {label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="cap-card-foot">
                      <span className="truncate" title={item.name}>
                        {item.name}
                      </span>
                      <span className="mono shrink-0 text-[10.5px] text-[var(--text-3)]">
                        {keepW}×{keepH}
                      </span>
                      <button
                        type="button"
                        onClick={() => void downloadOne(item)}
                        className="btn btn-sm btn-accent-subtle shrink-0"
                      >
                        <Download className="h-3 w-3" />
                        单张
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {totalPages > 0 && (
          <aside className="sticky top-0 hidden w-[240px] shrink-0 flex-col gap-2 xl:flex">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-[var(--text-2)]">
                {paperMeta.label} 实时预览
              </span>
              <span className="meta">{totalPages} 页</span>
            </div>

            <div className="cap-zoom" role="group" aria-label="预览缩放">
              <button
                type="button"
                onClick={() => stepZoom(-1)}
                disabled={zoomIndex === 0}
                className="cap-zoom-btn"
                aria-label="缩小预览"
                title="缩小预览"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="mono cap-zoom-value">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => stepZoom(1)}
                disabled={zoomIndex === ZOOM_STEPS.length - 1}
                className="cap-zoom-btn"
                aria-label="放大预览"
                title="放大预览"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                disabled={zoom === 1}
                className="cap-zoom-reset"
                title="恢复到 100%"
              >
                适应
              </button>
            </div>

            <div className="cap-preview-scroll">
              {items.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    document
                      .getElementById(`cap-card-${item.id}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                  className="cap-page"
                  style={{
                    width: Math.round(PREVIEW_BASE_W * zoom),
                    aspectRatio: `${paperMeta.w} / ${paperMeta.h}`,
                  }}
                  title={`点击定位到第 ${index + 1} 页编辑卡片`}
                >
                  <PageThumb
                    item={item}
                    paper={paper}
                    marginMm={pdfMargin}
                    cssWidth={Math.round(PREVIEW_BASE_W * zoom)}
                  />
                  <span className="cap-page-num mono">- {index + 1} -</span>
                </button>
              ))}
            </div>

            <p className="text-[10.5px] leading-[1.6] text-[var(--text-3)]">
              放大会出现滚动条，可查看细节；版心与导出的 PDF 完全一致。
            </p>
          </aside>
        )}
      </div>

      {totalPages === 0 ? (
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-3)]">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>提示：截图命名里带 20240512_182233 这类时间戳时，导入后会自动按拍摄顺序排列。</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
          <div className="flex min-w-0 items-center gap-2 text-[11.5px] text-[var(--text-3)]">
            {busy ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--accent-fg)]" />
                <span className="truncate">{busy}</span>
              </>
            ) : flash ? (
              <span key={flash.id} className="cap-flash">
                <Check className="cap-pop h-3.5 w-3.5 shrink-0 text-[var(--success)]" />
                <span className="truncate text-[var(--text-2)]">{flash.text}</span>
              </span>
            ) : (
              <>
                <Check className="h-3.5 w-3.5 shrink-0 text-[var(--success)]" />
                <span className="truncate">
                  {`${totalPages} 张截图 · ${templateLocked ? "模板锁定" : "智能边界识别"} · ${paperMeta.label} · 单页裁切已实时同步`}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleExportZip()}
              disabled={!!busy}
              className={`btn btn-neutral ${flash?.kind === "zip" ? "cap-btn-done" : ""}`}
            >
              <Archive className="h-4 w-4" />
              打包 ZIP
            </button>
            <button
              type="button"
              onClick={() => void handleExportPdf()}
              disabled={!!busy}
              className={`btn btn-accent btn-lg ${flash?.kind === "pdf" ? "cap-btn-done" : ""}`}
            >
              <FileDown className="h-4 w-4" />
              导出 PDF（{paperMeta.label}）
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 卡片内画布：按展示尺寸重绘原图（只在原图变化时重绘） */
function CaptureCanvas({
  canvas,
  width,
  height,
}: {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    target.width = width;
    target.height = height;
    const ctx = target.getContext("2d");
    if (ctx) ctx.drawImage(canvas, 0, 0, width, height);
  }, [canvas, width, height]);
  return <canvas ref={ref} className="cap-canvas" />;
}

/**
 * 右侧纸张预览：白纸上按「版心内等比居中」摆放裁切后的图片，
 * 位置与 createImagePdf 用的是同一个 layoutOnPage，所见即所得。
 */
function PageThumb({
  item,
  paper,
  marginMm,
  cssWidth,
}: {
  item: CaptureItem;
  paper: PaperSize;
  marginMm: number;
  cssWidth: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const page = PAPER_SIZES[paper];
  const cw = Math.max(1, Math.round(item.crop.right - item.crop.left));
  const ch = Math.max(1, Math.round(item.crop.bottom - item.crop.top));
  const box = layoutOnPage(cw, ch, page.w, page.h, marginMm);

  const widthPct = (box.w / page.w) * 100;
  const heightPct = (box.h / page.h) * 100;
  const leftPct = (box.x / page.w) * 100;
  const topPct = (box.y / page.h) * 100;

  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    // 画布内部分辨率随缩放提高，放大后依然清晰（上限 900px 控制内存）
    const innerW = Math.max(1, Math.min(900, Math.round((cssWidth * widthPct) / 100)));
    const innerH = Math.max(1, Math.round((innerW * ch) / cw));
    target.width = innerW;
    target.height = innerH;
    const ctx = target.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(item.canvas, item.crop.left, item.crop.top, cw, ch, 0, 0, innerW, innerH);
  }, [item.canvas, item.crop.left, item.crop.top, cw, ch, cssWidth, widthPct]);

  return (
    <canvas
      ref={ref}
      className="cap-page-img"
      style={{ left: `${leftPct}%`, top: `${topPct}%`, width: `${widthPct}%`, height: `${heightPct}%` }}
    />
  );
}
