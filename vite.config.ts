import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  // 产物内联为单个 HTML；构建后由 scripts/emit-single-file.mjs
  // 搬到项目根目录并改名，用户直接双击该文件即可离线使用。
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile()],
});
