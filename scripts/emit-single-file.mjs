/**
 * 构建后处理：把 vite-plugin-singlefile 生成的 dist/index.html
 * 搬到项目根目录，命名成可直接双击的单个文件，并删除中间目录 dist。
 *
 * 搬运前会校验产物确实自包含（没有外链脚本 / 样式），否则拒绝移动，
 * 避免出现「换台电脑就白屏」的情况。
 */
import { readFile, writeFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "dist", "index.html");
const target = join(root, "文档压缩标准化工具.html");

const html = await readFile(source, "utf8");

const externalRefs = [
  /<script[^>]+src=/i,
  /<link[^>]+rel=["']stylesheet["'][^>]*href=["'](?!#)/i,
  /<img[^>]+src=["'](?!data:)/i,
].filter((re) => re.test(html));

if (externalRefs.length > 0) {
  console.error("构建产物仍引用外部资源，无法作为单文件分发：");
  for (const re of externalRefs) console.error("  -", re);
  process.exit(1);
}

await writeFile(target, html, "utf8");
await rm(join(root, "dist"), { recursive: true, force: true });

const { size } = await stat(target);
console.log(`单文件已生成：${target}（${Math.round(size / 1024)} KB，可离线双击打开）`);
