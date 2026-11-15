export interface TypographyTemplate {
  id: string;
  name: string;
  font: string;
  fontSize: number; // pt
  lineSpacing: number; // 倍率，如 1.0、1.15、1.5
  paragraphBefore: number; // pt
  paragraphAfter: number; // pt
  margins: number; // 英寸，如 0.5、0.75、1.0
  isBuiltIn: boolean;
}

/** 主题模式：浅色 / 深色 / 跟随系统 */
export type ThemeMode = "light" | "dark" | "system";

export interface ProcessingConfig {
  cleanExtraBlankLines: boolean;
  removeGarbledText: boolean;
  autoFormatQuestionNumbers: boolean;
  /** LaTeX 公式 → Word 原生公式（OMML） */
  convertMathFormulas: boolean;
  /** 化学式 / 离子 → Word 真实上下标 */
  convertChemFormulas: boolean;
  /** 空白压缩：行内超长空白压成 1 个空格，大段空行换成分隔标号 */
  compressWhitespace: boolean;
  removeAIChatter: boolean;
  autoIdentifyTitle: boolean;
}

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
}

export interface BatchFile {
  id: string;
  name: string;
  size: number; // KB
  status: "pending" | "completed" | "failed";
  originalContent: string;
  processedContent: string;
  detectedTitle: string;
  error?: string;
}
