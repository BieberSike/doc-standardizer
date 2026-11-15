/** Canvas 测量的本地字体探测（无需权限、快速） */
export function runCanvasFontScan(): string[] {
  const detected: string[] = [];
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context) {
    const text = "abcdefghijklmnopqrstuvwxyz0123456789拉啦哈嘛中";

    context.font = "72px monospace";
    const monoWidth = context.measureText(text).width;
    context.font = "72px sans-serif";
    const sansWidth = context.measureText(text).width;

    const candidates = [
      "HarmonyOS Sans SC", "HarmonyOS Sans", "SimSun", "Microsoft YaHei", "KaiTi",
      "FangSong", "DengXian", "SimHei", "YouYuan", "LiSu",
      "STXingkai", "STXinwei", "STHupo", "STLiti", "STCaiyun", "STXihei", "STZhongsong",
      "PingFang SC", "Hiragino Sans GB", "STHeiti", "Songti SC", "Kaiti SC", "Heiti SC",
      "Times New Roman", "Arial", "Calibri", "Georgia", "Consolas", "Courier New",
      "Verdana", "Tahoma",
    ];

    for (const font of candidates) {
      context.font = `72px "${font}", monospace`;
      const testMono = context.measureText(text).width;
      context.font = `72px "${font}", sans-serif`;
      const testSans = context.measureText(text).width;
      if ((testMono !== monoWidth || testSans !== sansWidth) && !detected.includes(font)) {
        detected.push(font);
      }
    }
  }

  if (detected.length === 0) {
    detected.push("HarmonyOS Sans SC", "SimSun", "Microsoft YaHei", "Times New Roman", "Arial");
  }
  return detected;
}

/** 深度扫描：优先 queryLocalFonts，失败时回退 Canvas 探测 */
export async function scanLocalFonts(): Promise<{ fonts: string[]; message: string }> {
  const canvasFonts = runCanvasFontScan();

  if (!("queryLocalFonts" in window)) {
    return {
      fonts: canvasFonts,
      message: `扫描完成（浏览器无感检测模式），定位到 ${canvasFonts.length} 种可用字体`,
    };
  }

  try {
    // @ts-expect-error queryLocalFonts 是较新的浏览器 API
    const availableFonts = await window.queryLocalFonts();
    const families = Array.from(new Set(availableFonts.map((f: { family: string }) => f.family))) as string[];
    const sorted = families.filter((f) => f && f.trim() !== "").sort((a, b) => a.localeCompare(b, "zh"));

    if (sorted.length > 0) {
      return {
        fonts: Array.from(new Set([...canvasFonts, ...sorted])),
        message: `扫描完成，识别到本机 ${sorted.length} 种系统字体`,
      };
    }
    return { fonts: canvasFonts, message: `扫描完成，捕获到 ${canvasFonts.length} 种主流字体` };
  } catch {
    return { fonts: canvasFonts, message: `扫描完成（安全沙盒模式），匹配到 ${canvasFonts.length} 种字体` };
  }
}
