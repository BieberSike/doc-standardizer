import { ProcessingConfig, TypographyTemplate, WorkflowStep } from "./types";

export const DEFAULT_TEMPLATES: TypographyTemplate[] = [
  {
    id: "compact",
    name: "极度紧凑打印模板 (超省纸)",
    font: "HarmonyOS Sans SC",
    fontSize: 9,
    lineSpacing: 1.0,
    paragraphBefore: 0,
    paragraphAfter: 0,
    margins: 0.5,
    isBuiltIn: true,
  },
  {
    id: "standard",
    name: "标准五号高效排版",
    font: "HarmonyOS Sans SC",
    fontSize: 10.5,
    lineSpacing: 1.15,
    paragraphBefore: 2,
    paragraphAfter: 2,
    margins: 0.75,
    isBuiltIn: true,
  },
  {
    id: "academic",
    name: "学术大字清晰模板",
    font: "Microsoft YaHei",
    fontSize: 12,
    lineSpacing: 1.5,
    paragraphBefore: 4,
    paragraphAfter: 4,
    margins: 1.0,
    isBuiltIn: true,
  },
];

/** 大段空白被替换后的分隔标号（独占一行，预览与 Word 均按居中细线渲染） */
export const WHITESPACE_SEPARATOR = "──── ◆ ────";

/** 行内连续空白压缩阈值：连续 ≥ 该数目的空格/制表符压缩为 1 个半角空格 */
export const INLINE_SPACE_THRESHOLD = 3;

/** 连续空行阈值：连续 ≥ 该数目的空行视为“分隔作用的大段空白”，替换为分隔标号 */
export const BLANK_LINE_SEPARATOR_THRESHOLD = 3;

/** 流水线步骤，顺序与 processTextOffline 的执行顺序一致（后两项在导出/预览时生效） */
export const WORKFLOW_STEPS: WorkflowStep[] = [
  { id: "removeAIChatter", name: "清除AI客套前言与尾注", description: "自动剥离诸如“好的，为您解答如下”等修饰语" },
  { id: "removeGarbledText", name: "智能过滤乱码残缺符", description: "清理网页格式残留及损坏符号" },
  { id: "autoFormatQuestionNumbers", name: "题目层级识别与符号化", description: "大题 ■ ／ 小题 ◆ ／ 小问 ▸ 三级符号区分，选项自动弱化缩进" },
  {
    id: "compressWhitespace",
    name: "空白压缩与分隔标号替换",
    description: "行内连续 ≥3 个空白压成 1 个空格；连续 ≥3 个空行改为一行“──── ◆ ────”分隔标号",
  },
  { id: "cleanExtraBlankLines", name: "压缩冗余连续空行", description: "合并段落间多余换行，消除双空格" },
  { id: "autoIdentifyTitle", name: "智能内容标题自动识别", description: "根据文档开头提取作业主题作为输出文件名" },
  { id: "convertMathFormulas", name: "公式转 Word 原生公式", description: "LaTeX 行内/块级公式（$…$、$$…$$、\\(…\\)、\\[…\\]）输出为可编辑的 Word 公式对象" },
  { id: "convertChemFormulas", name: "化学式转真实上下标", description: "\\ce{…} 与纯文本化学式、离子电荷输出为 Word 原生上下标" },
];

/** 快速工作区里的开关选项（与 ProcessingConfig 一一对应，顺序同上） */
export const CONFIG_OPTIONS: { key: keyof ProcessingConfig; title: string; desc: string }[] = [
  { key: "removeAIChatter", title: "剔除 AI 聊天客套话", desc: "剔除“好的，这是回答：”等" },
  { key: "removeGarbledText", title: "过滤符号与损坏乱码", desc: "擦除网页破损与网络引用标记" },
  { key: "autoFormatQuestionNumbers", title: "题目分级 ■ ◆ ▸", desc: "大题/小题/小问三级符号，选项自动缩进" },
  { key: "compressWhitespace", title: "空白压缩 + 分隔标号", desc: "超长空格压成 1 格，大段空行换成 ◆ 分隔线" },
  { key: "cleanExtraBlankLines", title: "清理多余空行", desc: "压缩废旧换行节省版面" },
  { key: "autoIdentifyTitle", title: "智能标题识别并重命名", desc: "自动抓取首行题头作为默认文件名" },
  { key: "convertMathFormulas", title: "公式 → Word 原生公式", desc: "LaTeX 转为可编辑的 Word 公式对象" },
  { key: "convertChemFormulas", title: "化学式 → 真实上下标", desc: "H₂SO₄、Fe³⁺ 转为 Word 上下标" },
];

export const FONT_DISPLAY_NAMES: Record<string, string> = {
  "HarmonyOS Sans SC": "鸿蒙体 (HarmonyOS Sans SC - 推荐首选)",
  SimSun: "宋体 (SimSun - 经典省油墨)",
  "Microsoft YaHei": "微软雅黑 (Microsoft YaHei - 现代无衬线)",
  SimHei: "黑体 (SimHei)",
  KaiTi: "楷体 (KaiTi)",
  FangSong: "仿宋 (FangSong)",
  DengXian: "等线 (DengXian)",
  YouYuan: "幼圆 (YouYuan)",
  STXingkai: "华文行楷 (STXingkai)",
  STXinwei: "华文新魏 (STXinwei)",
  STHupo: "华文琥珀 (STHupo)",
  STLiti: "华文隶书 (STLiti)",
  "PingFang SC": "苹方 (PingFang SC)",
};

export const STANDARD_FONTS = ["SimSun", "Microsoft YaHei", "KaiTi", "FangSong", "DengXian", "Times New Roman", "Arial", "Calibri"];
