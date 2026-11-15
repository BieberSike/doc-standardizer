/**
 * 截图裁切排版：图片读取、边界自动识别、裁切与模板学习
 * —— 全部在浏览器内存中用 canvas 完成，不联网、不上传。
 */

export interface CropBox {
  /** 保留区域（原图像素坐标） */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CaptureItem {
  id: string;
  name: string;
  /** 文件名里的时间戳（用于按拍摄顺序排序），没有则为文件名 */
  timestamp: string;
  canvas: HTMLCanvasElement;
  crop: CropBox;
}

/** 由「原图 + 已裁好样本图」学到的裁切模板（坐标均为原图像素） */
export interface CropTemplate {
  top: number;
  bottom: number;
  left: number;
  right: number;
  origW: number;
  origH: number;
  /** 换算倍率：原图尺寸 = 样本尺寸 × scale（0.5 表示样本是 2 倍分辨率导出） */
  scale: number;
  /** 匹配置信度 0~1 */
  confidence: number;
}

/** 模板学习结果：失败时给出可直接展示给用户的原因 */
export type LearnResult =
  | { ok: true; template: CropTemplate }
  | { ok: false; reason: string };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 从文件名里提取 20240512_182233 这类时间戳；取不到就用文件名本身排序 */
export function extractTimestamp(filename: string): string {
  const m = filename.match(/(\d{8})[-_]?(\d{6})/);
  return m ? m[1] + m[2] : filename;
}

/** 读取图片文件为 canvas（保留原始像素，后续所有裁切都从这里取） */
export function loadImageFile(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("浏览器无法创建画布"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      if (!canvas.width || !canvas.height) reject(new Error(`图片尺寸无效：${file.name}`));
      else resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`无法解码图片：${file.name}`));
    };
    img.src = url;
  });
}

/**
 * 自动识别页面的上下边界（可选同时识别左右）。
 * 思路：先把图缩到 540px 宽做“整行亮度曲线”粗定位，再回原图在 ±100px 内精修，
 * 最后避开截图底部常见的蓝色悬浮按钮。
 * trimSides 打开时，再从两侧剥掉连续且均匀的深色列（黑边 / letterbox）。
 */
export function detectCropBox(
  canvas: HTMLCanvasElement,
  threshold: number,
  avoidBlueButton: boolean,
  trimSides = false
): CropBox {
  const w = canvas.width;
  const h = canvas.height;
  const fallback: CropBox = { left: 0, top: 0, right: w, bottom: h };
  if (w < 4 || h < 4) return fallback;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return fallback;

  // —— 第一步：低分辨率粗定位 ——
  const scale = Math.min(1, 540 / w);
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));

  const small = document.createElement("canvas");
  small.width = sw;
  small.height = sh;
  const sCtx = small.getContext("2d", { willReadFrequently: true });
  if (!sCtx) return fallback;
  sCtx.drawImage(canvas, 0, 0, sw, sh);
  const sData = sCtx.getImageData(0, 0, sw, sh).data;

  // 只看中间 15%~85% 的列，排除左右边框与滚动条
  const sx0 = Math.floor(sw * 0.15);
  const sx1 = Math.max(sx0 + 1, Math.floor(sw * 0.85));
  const rowBright = new Float32Array(sh);
  for (let y = 0; y < sh; y++) {
    let sum = 0;
    for (let x = sx0; x < sx1; x++) {
      const i = (y * sw + x) * 4;
      sum += 0.299 * sData[i] + 0.587 * sData[i + 1] + 0.114 * sData[i + 2];
    }
    rowBright[y] = sum / (sx1 - sx0);
  }

  const topThresh = Math.max(100, threshold * 2);
  let topSmall = 0;
  for (let y = 0; y < sh; y++) {
    if (rowBright[y] > topThresh) {
      topSmall = y;
      break;
    }
  }

  let pageEndSmall = sh - 1;
  let inPage = false;
  let darkStreak = 0;
  for (let y = topSmall; y < sh; y++) {
    if (rowBright[y] > 200) {
      inPage = true;
      darkStreak = 0;
    }
    if (inPage && rowBright[y] < threshold) {
      darkStreak++;
      if (darkStreak >= Math.ceil(30 * scale)) {
        pageEndSmall = y - darkStreak + 1;
        break;
      }
    }
  }

  // —— 第二步：原图精修上边界 ——
  const x0 = Math.floor(w * 0.15);
  const x1 = Math.max(x0 + 1, Math.floor(w * 0.85));
  const refine = 100;
  const topGuess = Math.round(topSmall / scale);
  let top = clamp(topGuess, 0, h - 1);
  {
    const start = Math.max(0, topGuess - refine);
    const end = Math.min(h, topGuess + refine);
    if (end - start > 1) {
      const strip = ctx.getImageData(0, start, w, end - start).data;
      const rows = end - start;
      for (let dy = 0; dy < rows; dy++) {
        let sum = 0;
        for (let x = x0; x < x1; x++) {
          const i = (dy * w + x) * 4;
          sum += 0.299 * strip[i] + 0.587 * strip[i + 1] + 0.114 * strip[i + 2];
        }
        if (sum / (x1 - x0) > topThresh) {
          top = start + dy;
          break;
        }
      }
    }
  }

  // —— 第三步：原图精修下边界（连续 20 行暗色判为正文结束）——
  const bottomGuess = Math.round(pageEndSmall / scale);
  let bottom = clamp(bottomGuess, top + 1, h);
  {
    const start = Math.max(top, bottomGuess - refine);
    const end = Math.min(h, bottomGuess + refine);
    if (end - start > 1) {
      const strip = ctx.getImageData(0, start, w, end - start).data;
      const rows = end - start;
      let darkCount = 0;
      for (let dy = 0; dy < rows; dy++) {
        let sum = 0;
        for (let x = x0; x < x1; x++) {
          const i = (dy * w + x) * 4;
          sum += 0.299 * strip[i] + 0.587 * strip[i + 1] + 0.114 * strip[i + 2];
        }
        if (sum / (x1 - x0) < threshold) {
          darkCount++;
          if (darkCount >= 20) {
            bottom = start + dy - darkCount + 1;
            break;
          }
        } else {
          darkCount = 0;
        }
      }
    }
  }

  // —— 第四步：避让底部蓝色悬浮按钮（只扫最后 900px，兼顾速度与准确度）——
  if (avoidBlueButton) {
    const thirdStart = top + Math.floor((bottom - top) * (2 / 3));
    const searchStart = Math.max(thirdStart, bottom - 900);
    const searchEnd = bottom;
    if (searchEnd - searchStart > 8) {
      const strip = ctx.getImageData(0, searchStart, w, searchEnd - searchStart).data;
      const rows = searchEnd - searchStart;
      for (let dy = 0; dy < rows; dy++) {
        let blueCount = 0;
        for (let x = 0; x < w; x++) {
          const i = (dy * w + x) * 4;
          if (strip[i + 2] > 150 && strip[i] < 130 && strip[i + 1] < 190) {
            blueCount++;
            if (blueCount > 30) break;
          }
        }
        if (blueCount > 30) {
          bottom = Math.max(top + 50, searchStart + dy - 15);
          break;
        }
      }
    }
  }

  bottom = clamp(Math.max(top + 50, bottom), top + 1, h);

  // —— 第五步（可选）：左右自动裁边 ——
  // 只在页面带内统计每列亮度，剥掉「又暗又均匀」的列；带纹理的深色列不会被误裁。
  let left = 0;
  let right = w;
  if (trimSides) {
    const yTop = Math.max(0, Math.round(top * scale));
    const yEnd = Math.min(sh - 1, Math.round(bottom * scale));
    if (yEnd - yTop > 8) {
      const colMean = new Float32Array(sw);
      const colDev = new Float32Array(sw);
      const n = yEnd - yTop + 1;
      for (let x = 0; x < sw; x++) {
        let sum = 0;
        let sum2 = 0;
        for (let y = yTop; y <= yEnd; y++) {
          const i = (y * sw + x) * 4;
          const v = 0.299 * sData[i] + 0.587 * sData[i + 1] + 0.114 * sData[i + 2];
          sum += v;
          sum2 += v * v;
        }
        const mean = sum / n;
        colMean[x] = mean;
        colDev[x] = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
      }

      const darkCol = Math.min(threshold, 70);
      const maxTrim = Math.max(1, Math.floor(sw * 0.2));
      let l = 0;
      while (l < maxTrim && colMean[l] < darkCol && colDev[l] < 14) l++;
      let r = sw - 1;
      while (r > sw - 1 - maxTrim && colMean[r] < darkCol && colDev[r] < 14) r--;
      // 裁完至少保留 60% 宽度，避免把整页当成黑边
      if (r - l + 1 > sw * 0.6) {
        left = clamp(Math.round(l / scale), 0, w - 1);
        right = clamp(Math.round((r + 1) / scale), left + 1, w);
      }
    }
  }

  return { left, top, right, bottom };
}

/** 按裁切框生成新画布（导出、缩略图都用它） */
export function cropToCanvas(canvas: HTMLCanvasElement, crop: CropBox): HTMLCanvasElement {
  const left = clamp(Math.round(crop.left), 0, canvas.width - 1);
  const top = clamp(Math.round(crop.top), 0, canvas.height - 1);
  const right = clamp(Math.round(crop.right), left + 1, canvas.width);
  const bottom = clamp(Math.round(crop.bottom), top + 1, canvas.height);
  const w = right - left;
  const h = bottom - top;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (ctx) ctx.drawImage(canvas, left, top, w, h, 0, 0, w, h);
  return out;
}

/* ==========================================================================
   模板学习
   旧实现的三个问题：
   1. 左右位置按「样本居中」猜，样本不是居中裁的就整体错位；
   2. 只拿样本最上面 24 行比对，样本顶部是白边时会锁到任意白行；
   3. 样本被缩放导出（半分辨率截图 / 预览图）时算出的 top 完全错，且不报警。
   现在的做法：把样本与「张成同一坐标系的原图缩略图」做多尺度、多探针的行带匹配，
   再用匹配残差换算置信度，低置信度直接拒绝而不是悄悄套用。
   ========================================================================== */

/** 学习时原图缩略图的宽度上限（越大越准，越慢） */
const LEARN_MAX_W = 360;

interface Gray {
  w: number;
  h: number;
  data: Float32Array;
}

interface Probe {
  /** 样本内部的行号（缩略坐标系） */
  rows: number[];
}

/** 把画布重绘成指定尺寸的灰度图（顺带完成缩放） */
function toGray(src: HTMLCanvasElement, w: number, h: number): Gray | null {
  if (w < 4 || h < 4) return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const data = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    data[i] = 0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2];
  }
  return { w, h, data };
}

/** 逐行纹理强度：行内像素与行均值的平均偏差。纯色行≈0，文字行很大 */
function rowInk(g: Gray): Float32Array {
  const ink = new Float32Array(g.h);
  const step = g.w > 240 ? 2 : 1;
  const n = Math.ceil(g.w / step);
  for (let y = 0; y < g.h; y++) {
    const base = y * g.w;
    let sum = 0;
    for (let x = 0; x < g.w; x += step) sum += g.data[base + x];
    const mean = sum / n;
    let dev = 0;
    for (let x = 0; x < g.w; x += step) dev += Math.abs(g.data[base + x] - mean);
    ink[y] = dev / n;
  }
  return ink;
}

/**
 * 挑探针行：把样本纵向切成若干段，每段取纹理最强的一行。
 * 这样纯白/纯色的顶部与空白页脚自然不参与比对，也不会把结果带偏。
 */
function pickProbes(g: Gray, zones = 8): Probe | null {
  const ink = rowInk(g);
  let maxInk = 0;
  for (let i = 0; i < ink.length; i++) if (ink[i] > maxInk) maxInk = ink[i];
  if (maxInk < 2) return null;

  const zoneH = Math.max(1, Math.floor(g.h / zones));
  const rows: number[] = [];
  for (let z = 0; z < zones; z++) {
    const start = z * zoneH;
    const end = Math.min(g.h - 1, start + zoneH - 1);
    let bestY = -1;
    let bestV = 0;
    for (let y = start; y <= end; y++) {
      const v = ink[y] + (y > 0 ? ink[y - 1] : 0) + (y < g.h - 1 ? ink[y + 1] : 0);
      if (v > bestV) {
        bestV = v;
        bestY = y;
      }
    }
    if (bestY >= 0 && bestV >= maxInk * 0.3) rows.push(bestY);
  }

  // 兜底：内容分布极不均匀时，直接取纹理最强的几行
  if (rows.length < 3) {
    const ranked = Array.from({ length: g.h }, (_, i) => i)
      .sort((a, b) => ink[b] - ink[a])
      .slice(0, 6);
    for (const y of ranked) if (!rows.includes(y)) rows.push(y);
    rows.sort((a, b) => a - b);
  }
  return rows.length > 0 ? { rows } : null;
}

/** 在候选位置 (x, y) 上比对探针行，返回平均灰度误差 */
function probeError(small: Gray, probe: Gray, rows: number[], x: number, y: number): number {
  let err = 0;
  let count = 0;
  for (const r of rows) {
    for (let dy = -1; dy <= 1; dy++) {
      const sy = y + r + dy;
      if (sy < 0 || sy >= small.h) continue;
      const rowBase = r + dy;
      if (rowBase < 0 || rowBase >= probe.h) continue;
      const oBase = sy * small.w + x;
      const cBase = rowBase * probe.w;
      for (let sx = 0; sx < probe.w; sx += 3) {
        err += Math.abs(small.data[oBase + sx] - probe.data[cBase + sx]);
        count++;
      }
    }
  }
  return count > 0 ? err / count : Number.POSITIVE_INFINITY;
}

interface Match {
  x: number;
  y: number;
  err: number;
}

/** 先在纵向粗扫 + 精修，再横向全扫 + 精修（横纵分开做，成本可控） */
function searchInSmall(small: Gray, probe: Gray, rows: number[], guessX: number): Match | null {
  const maxX = small.w - probe.w;
  const maxY = small.h - probe.h;
  if (maxX < 0 || maxY < 0) return null;

  const best: Match = { x: clamp(guessX, 0, maxX), y: 0, err: Number.POSITIVE_INFINITY };

  const stepY = Math.max(1, Math.round(maxY / 320));
  for (let y = 0; y <= maxY; y += stepY) {
    const e = probeError(small, probe, rows, best.x, y);
    if (e < best.err) {
      best.err = e;
      best.y = y;
    }
  }
  for (let y = Math.max(0, best.y - stepY * 2); y <= Math.min(maxY, best.y + stepY * 2); y++) {
    const e = probeError(small, probe, rows, best.x, y);
    if (e < best.err) {
      best.err = e;
      best.y = y;
    }
  }

  for (let x = 0; x <= maxX; x += 2) {
    const e = probeError(small, probe, rows, x, best.y);
    if (e < best.err) {
      best.err = e;
      best.x = x;
    }
  }
  const cx = best.x;
  const cy = best.y;
  for (let x = Math.max(0, cx - 2); x <= Math.min(maxX, cx + 2); x++) {
    for (let y = Math.max(0, cy - 2); y <= Math.min(maxY, cy + 2); y++) {
      const e = probeError(small, probe, rows, x, y);
      if (e < best.err) {
        best.err = e;
        best.x = x;
        best.y = y;
      }
    }
  }
  return best;
}

/** 样本相对原图可能的缩放倍率（覆盖半分辨率 / 2 倍导出等常见情况） */
const LEARN_SCALES = [1, 2, 2.5, 0.5, 1.5, 0.667, 0.75, 3, 0.333, 1.25, 4, 0.4, 0.25, 5];

/** 置信度门槛：低于它说明样本对不上这张原图 */
const MIN_CONFIDENCE = 0.55;

/**
 * 模板学习：用户给一张原图 + 对应的已裁好样本，反推样本在原图中的位置。
 * 同时给出上下左右四个边界，以及匹配置信度。
 */
export function learnCropTemplate(
  original: HTMLCanvasElement,
  cropped: HTMLCanvasElement
): LearnResult {
  const ow = original.width;
  const oh = original.height;
  const cw = cropped.width;
  const ch = cropped.height;
  if (!ow || !oh || !cw || !ch) return { ok: false, reason: "图片尺寸无效，请重新选择" };
  // 样本可能是同一张图的高倍导出，允许 4 倍以内；真正的错位交给置信度判定
  if (cw > ow * 4.2 || ch > oh * 4.2) {
    return { ok: false, reason: "样本尺寸与原图相差过大，请确认两张图没有选反" };
  }

  const base = Math.min(1, LEARN_MAX_W / ow);
  const small = toGray(original, Math.max(4, Math.round(ow * base)), Math.max(4, Math.round(oh * base)));
  if (!small) return { ok: false, reason: "无法读取原图像素" };

  let best: { scale: number; x: number; y: number; err: number } | null = null;
  for (const scale of LEARN_SCALES) {
    const wS = Math.round(cw * base * scale);
    const hS = Math.round(ch * base * scale);
    if (wS < 8 || hS < 8 || wS > small.w || hS > small.h) continue;

    const probe = toGray(cropped, wS, hS);
    if (!probe) continue;
    const picked = pickProbes(probe);
    if (!picked) continue;

    const match = searchInSmall(small, probe, picked.rows, Math.round((small.w - wS) / 2));
    if (!match || !Number.isFinite(match.err)) continue;
    if (!best || match.err < best.err - 0.01) {
      best = { scale, x: match.x, y: match.y, err: match.err };
    }
    // 已经严丝合缝，不必再试其它倍率
    if (best.err < 2.5) break;
  }

  if (!best) {
    return { ok: false, reason: "样本内容过于单一（几乎纯色），无法定位裁切位置，请改用自动识别" };
  }

  const confidence = clamp(1 - best.err / 48, 0, 1);
  if (confidence < MIN_CONFIDENCE) {
    return {
      ok: false,
      reason: `样本与原图只有 ${Math.round(confidence * 100)}% 的相似度，请确认这张样本确实是该原图的裁切结果`,
    };
  }

  const left = clamp(Math.round(best.x / base), 0, ow - 1);
  const top = clamp(Math.round(best.y / base), 0, oh - 1);
  const right = clamp(Math.round(left + cw * best.scale), left + 1, ow);
  const bottom = clamp(Math.round(top + ch * best.scale), top + 1, oh);

  return {
    ok: true,
    template: { left, top, right, bottom, origW: ow, origH: oh, scale: best.scale, confidence },
  };
}

/** 把模板按比例套到另一张图上（适配不同分辨率 / 不同机型的截图） */
export function applyCropTemplate(canvas: HTMLCanvasElement, template: CropTemplate): CropBox {
  const w = canvas.width;
  const h = canvas.height;
  const scaleX = w / (template.origW || w);
  const scaleY = h / (template.origH || h);
  const left = clamp(Math.round(template.left * scaleX), 0, w - 1);
  const top = clamp(Math.round(template.top * scaleY), 0, h - 1);
  return {
    left,
    top,
    right: clamp(Math.round(template.right * scaleX), left + 1, w),
    bottom: clamp(Math.round(template.bottom * scaleY), top + 1, h),
  };
}
