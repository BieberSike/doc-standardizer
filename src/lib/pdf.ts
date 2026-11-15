/**
 * 极简 PDF 生成器：每页一张 JPEG 图片，按所选纸张版心等比居中。
 * 不依赖 jsPDF / CDN，保证离线单文件可用。
 */

export interface PdfImage {
  /** JPEG 字节流（DCTDecode） */
  data: Uint8Array;
  width: number;
  height: number;
}

/** 支持的导出纸张（尺寸单位 pt，按 1/72 inch） */
export const PAPER_SIZES = {
  A4: { label: "A4", w: 595.28, h: 841.89, note: "210 × 297 mm" },
  A5: { label: "A5", w: 419.53, h: 595.28, note: "148 × 210 mm" },
  A3: { label: "A3", w: 841.89, h: 1190.55, note: "297 × 420 mm" },
  Letter: { label: "Letter", w: 612, h: 792, note: "8.5 × 11 in" },
} as const;

export type PaperSize = keyof typeof PAPER_SIZES;

/** 图片在一页纸上的位置（与传入的页面尺寸同单位） */
export interface PageLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MM_TO_PT = 72 / 25.4;

/** 图片在版心内等比缩放后居中——PDF 与界面预览共用这一份排版算法 */
export function layoutOnPage(
  imgW: number,
  imgH: number,
  pageW: number,
  pageH: number,
  marginMm: number
): PageLayout {
  const margin = Math.max(0, Math.min(30, marginMm)) * MM_TO_PT;
  const maxW = Math.max(1, pageW - margin * 2);
  const maxH = Math.max(1, pageH - margin * 2);

  // 以 150dpi 作为物理尺寸基准，再等比缩放到版心以内
  let w = (imgW / 150) * 72;
  let h = (imgH / 150) * 72;
  const scale = Math.min(maxW / w, maxH / h);
  w *= scale;
  h *= scale;

  return { x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}

const ascii = (text: string) => {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
};

const pad10 = (n: number) => String(n).padStart(10, "0");

/** 生成图片型 PDF；marginMm 为四边留白（毫米），paper 默认 A4 */
export function createImagePdf(
  images: PdfImage[],
  marginMm: number,
  paper: PaperSize = "A4"
): Blob {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    size += bytes.length;
  };
  const write = (text: string) => push(ascii(text));

  const { w: PAGE_W, h: PAGE_H } = PAPER_SIZES[paper] ?? PAPER_SIZES.A4;

  const objectCount = 2 + images.length * 3;
  const offsets = new Array<number>(objectCount + 1).fill(0);

  const beginObj = (num: number) => {
    offsets[num] = size;
    write(`${num} 0 obj\n`);
  };
  const endObj = () => write("endobj\n");

  write("%PDF-1.4\n");

  beginObj(1);
  write("<< /Type /Catalog /Pages 2 0 R >>\n");
  endObj();

  beginObj(2);
  write(
    `<< /Type /Pages /Count ${images.length} /Kids [${images
      .map((_, i) => `${3 + i * 3} 0 R`)
      .join(" ")}] >>\n`
  );
  endObj();

  images.forEach((img, i) => {
    const pageNum = 3 + i * 3;
    const contentNum = pageNum + 1;
    const imageNum = pageNum + 2;

    const box = layoutOnPage(img.width, img.height, PAGE_W, PAGE_H, marginMm);

    const content = `q\n${box.w.toFixed(2)} 0 0 ${box.h.toFixed(2)} ${box.x.toFixed(2)} ${box.y.toFixed(
      2
    )} cm\n/Im0 Do\nQ\n`;

    beginObj(pageNum);
    write(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /XObject << /Im0 ${imageNum} 0 R >> >> /Contents ${contentNum} 0 R >>\n`
    );
    endObj();

    beginObj(contentNum);
    write(`<< /Length ${content.length} >>\nstream\n${content}endstream\n`);
    endObj();

    beginObj(imageNum);
    write(
      `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.data.length} >>\nstream\n`
    );
    push(img.data);
    write("\nendstream\n");
    endObj();
  });

  const xrefOffset = size;
  write(`xref\n0 ${objectCount + 1}\n`);
  write("0000000000 65535 f \n");
  for (let i = 1; i <= objectCount; i++) write(`${pad10(offsets[i])} 00000 n \n`);
  write(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return new Blob(chunks as unknown as BlobPart[], { type: "application/pdf" });
}

/** canvas → Blob（浏览器原生编码，不引入额外依赖） */
export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("图片编码失败"))),
      type,
      quality
    );
  });
}

export const blobToBytes = async (blob: Blob): Promise<Uint8Array> =>
  new Uint8Array(await blob.arrayBuffer());
