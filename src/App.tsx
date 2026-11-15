import { useEffect, useState, type FormEvent } from "react";
import { Crop, FileText, Layers, Moon, Settings, Sparkles, Sun } from "lucide-react";
import { BatchFile, ProcessingConfig, ThemeMode, TypographyTemplate } from "./types";
import { DEFAULT_TEMPLATES } from "./constants";
import { processTextOffline } from "./lib/textProcessing";
import { downloadBlob, generateWordDocument } from "./lib/docx";
import { flattenRichText, RichOptions } from "./lib/richText";
import { QuickTab } from "./components/QuickTab";
import { BatchTab } from "./components/BatchTab";
import { CaptureTab } from "./components/CaptureTab";
import { SettingsWindow, type SettingsSection } from "./components/settings/SettingsWindow";

const NAV_ITEMS = [
  { id: "quick", name: "快速排版工作区", icon: Sparkles },
  { id: "batch", name: "批量文件排版", icon: Layers },
  { id: "capture", name: "截图裁切排版", icon: Crop },
  { id: "settings", name: "设置", icon: Settings },
];

/** 支持 #settings、#settings/workflow、#settings/general 深链接，便于书签与自动化检查 */
const readInitialHash = (): { open: boolean; section: SettingsSection } => {
  const hash = window.location.hash.replace(/^#/, "");
  const part = hash.split("/")[1];
  return {
    open: hash === "settings" || hash.startsWith("settings/"),
    section:
      part === "workflow" || part === "general" || part === "about" ? part : "typography",
  };
};

export default function App() {
  const [activeTab, setActiveTab] = useState("quick");
  const [statusBarMsg, setStatusBarMsg] = useState("就绪");

  // 设置窗口（核心功能菜单的「设置」入口）
  const [settingsOpen, setSettingsOpen] = useState(() => readInitialHash().open);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(() => readInitialHash().section);

  // 主题：浅色 / 深色 / 跟随系统（首次使用默认跟随系统；旧版本的 doc_theme 键仍兼容读取）
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("doc_theme_mode");
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
    const legacy = localStorage.getItem("doc_theme");
    if (legacy === "dark" || legacy === "light") return legacy;
    return "system";
  });
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const isDarkMode = themeMode === "system" ? systemDark : themeMode === "dark";

  useEffect(() => {
    localStorage.setItem("doc_theme_mode", themeMode);
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [themeMode, isDarkMode]);

  // 桌面软件惯例：Ctrl + , 打开设置
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 处理开关
  const [configs, setConfigs] = useState<ProcessingConfig>({
    cleanExtraBlankLines: true,
    removeGarbledText: true,
    autoFormatQuestionNumbers: true,
    convertMathFormulas: true,
    convertChemFormulas: true,
    compressWhitespace: true,
    removeAIChatter: true,
    autoIdentifyTitle: true,
  });

  // 模板
  const [templates, setTemplates] = useState<TypographyTemplate[]>(() => {
    try {
      const local = localStorage.getItem("doc_templates");
      return local ? JSON.parse(local) : DEFAULT_TEMPLATES;
    } catch {
      return DEFAULT_TEMPLATES;
    }
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState("compact");
  useEffect(() => {
    localStorage.setItem("doc_templates", JSON.stringify(templates));
  }, [templates]);

  const activeTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  // 公式/化学式转换选项（预览与导出共用同一套解析）
  const richOptions: RichOptions = {
    math: configs.convertMathFormulas,
    chem: configs.convertChemFormulas,
  };

  // 微调参数（跟随当前模板）
  const [customFont, setCustomFont] = useState(activeTemplate.font);
  const [customFontSize, setCustomFontSize] = useState(activeTemplate.fontSize);
  const [customLineSpacing, setCustomLineSpacing] = useState(activeTemplate.lineSpacing);
  const [customParagraphBefore, setCustomParagraphBefore] = useState(activeTemplate.paragraphBefore);
  const [customParagraphAfter, setCustomParagraphAfter] = useState(activeTemplate.paragraphAfter);
  const [customMargins, setCustomMargins] = useState(activeTemplate.margins);

  // 切换模板时，把微调参数重置为该模板的值（只在切换时同步，不随手动修改回写）
  useEffect(() => {
    setCustomFont(activeTemplate.font);
    setCustomFontSize(activeTemplate.fontSize);
    setCustomLineSpacing(activeTemplate.lineSpacing);
    setCustomParagraphBefore(activeTemplate.paragraphBefore);
    setCustomParagraphAfter(activeTemplate.paragraphAfter);
    setCustomMargins(activeTemplate.margins);
  }, [selectedTemplateId]);

  // 快速处理
  const [rawText, setRawText] = useState("");
  const [processedText, setProcessedText] = useState("");
  const [outputTitle, setOutputTitle] = useState("未命名标准化文档");
  const [copied, setCopied] = useState(false);

  // 防抖实时处理，避免长文本逐字输入时卡顿
  useEffect(() => {
    const timer = setTimeout(() => {
      const result = processTextOffline(rawText, configs);
      setProcessedText(result.cleanedText);
      if (configs.autoIdentifyTitle) setOutputTitle(result.title);
    }, 150);
    return () => clearTimeout(timer);
  }, [rawText, configs]);

  // 批量队列
  const [batchQueue, setBatchQueue] = useState<BatchFile[]>([]);

  // 省纸估算
  const originalPages = Math.max(1, Math.ceil(rawText.length / 450));
  const charsPerPage = selectedTemplateId === "compact" ? 1500 : selectedTemplateId === "standard" ? 1100 : 700;
  const optimizedPages = Math.max(1, Math.ceil(processedText.length / charsPerPage));
  const savedPagesCount = Math.max(0, originalPages - optimizedPages);
  const savedPercentage = originalPages > 1 ? Math.round((savedPagesCount / originalPages) * 100) : 0;

  // ---------- 文件导入 ----------
  const readFileAsText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error(`读取 ${file.name} 失败`));
      reader.readAsText(file);
    });

  /** 单文件进快速工作区，多文件进批量队列 */
  const handleImportFiles = async (files: File[]) => {
    if (files.length === 1) {
      const text = await readFileAsText(files[0]);
      setRawText(text);
      setActiveTab("quick");
      setStatusBarMsg(`已成功加载文件: ${files[0].name}`);
      return;
    }

    const newItems: BatchFile[] = files.map((file) => ({
      id: Math.random().toString(36).substring(2, 9),
      name: file.name,
      size: Math.round(file.size / 1024),
      status: "pending",
      originalContent: "",
      processedContent: "",
      detectedTitle: file.name.replace(/\.[^.]+$/, ""),
    }));
    setBatchQueue((prev) => [...prev, ...newItems]);
    setActiveTab("batch");
    setStatusBarMsg(`已将 ${files.length} 个文件导入批量队列`);

    for (let i = 0; i < files.length; i++) {
      const content = await readFileAsText(files[i]);
      const id = newItems[i].id;
      setBatchQueue((prev) =>
        prev.map((item) => (item.id === id ? { ...item, originalContent: content } : item))
      );
    }
  };

  // ---------- 批量处理 ----------
  const runBatchProcessing = () => {
    if (batchQueue.length === 0) return;
    setStatusBarMsg("正在批量排版处理文档队列...");

    setBatchQueue((prev) =>
      prev.map((item) => {
        if (item.status === "completed") return item;
        try {
          const result = processTextOffline(item.originalContent, configs);
          return {
            ...item,
            status: "completed" as const,
            processedContent: result.cleanedText,
            detectedTitle: configs.autoIdentifyTitle ? result.title : item.detectedTitle,
          };
        } catch (err) {
          return { ...item, status: "failed" as const, error: (err as Error).message || "处理失败" };
        }
      })
    );

    setStatusBarMsg("批量任务全部完成！可以直接一键导出全部成果。");
  };

  // ---------- 导出 ----------
  const handleExportWord = async (titleToUse: string, textToUse: string) => {
    if (!textToUse.trim()) {
      setStatusBarMsg("内容为空，无法导出文件");
      return;
    }
    setStatusBarMsg("正在生成 Word 文档...");
    try {
      const blob = await generateWordDocument(textToUse, titleToUse, activeTemplate, richOptions);
      downloadBlob(blob, `${titleToUse}.docx`);
      setStatusBarMsg(`已导出 ${titleToUse}.docx（通过浏览器下载保存）`);
    } catch (err) {
      console.error(err);
      setStatusBarMsg(`导出失败：${(err as Error).message}`);
    }
  };

  const handleExportAllBatch = async () => {
    const completed = batchQueue.filter((f) => f.status === "completed");
    if (completed.length === 0) {
      setStatusBarMsg("队列中没有处理成功的文档可供下载");
      return;
    }
    setStatusBarMsg(`正在导出 ${completed.length} 份文件...`);
    for (const file of completed) {
      try {
        const blob = await generateWordDocument(file.processedContent, file.detectedTitle, activeTemplate, richOptions);
        downloadBlob(blob, `${file.detectedTitle}.docx`);
        // 浏览器连续下载需要间隔，避免被拦截
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        console.error(err);
      }
    }
    setStatusBarMsg(`已全部导出 ${completed.length} 份文件（若浏览器拦截多个下载，请允许）`);
  };

  const handleCopyToClipboard = () => {
    if (!processedText) return;
    // 复制时压平为 Unicode 上下标，粘贴到其它编辑器也能读
    navigator.clipboard.writeText(flattenRichText(processedText, richOptions));
    setCopied(true);
    setStatusBarMsg("已复制排版优化后的文本到剪贴板（公式/上下标已转为 Unicode）");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleConfig = (key: keyof ProcessingConfig) => {
    setConfigs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  /** 工作流设置里的「全部启用 / 全部禁用」 */
  const handleSetAllConfigs = (enabled: boolean) => {
    setConfigs({
      cleanExtraBlankLines: enabled,
      removeGarbledText: enabled,
      autoFormatQuestionNumbers: enabled,
      convertMathFormulas: enabled,
      convertChemFormulas: enabled,
      compressWhitespace: enabled,
      removeAIChatter: enabled,
      autoIdentifyTitle: enabled,
    });
    setStatusBarMsg(enabled ? "已启用全部处理步骤" : "已跳过全部处理步骤");
  };

  const handleSaveCustomTemplate = (e: FormEvent) => {
    e.preventDefault();
    const newTemplate: TypographyTemplate = {
      id: "custom_" + Date.now(),
      name: "自定义排版配置 " + (templates.filter((t) => !t.isBuiltIn).length + 1),
      font: customFont,
      fontSize: customFontSize,
      lineSpacing: customLineSpacing,
      paragraphBefore: customParagraphBefore,
      paragraphAfter: customParagraphAfter,
      margins: customMargins,
      isBuiltIn: false,
    };
    setTemplates((prev) => [...prev, newTemplate]);
    setSelectedTemplateId(newTemplate.id);
    setStatusBarMsg("已创建并切换至新的自定义排版模版");
  };

  const handleResetTemplates = () => {
    setTemplates(DEFAULT_TEMPLATES);
    setSelectedTemplateId("compact");
    setStatusBarMsg("已成功重置系统排版模板为出厂配置");
  };

  /** 清除本机保存的主题与自定义模板（浏览器 localStorage），随后刷新 */
  const handleResetLocalData = () => {
    ["doc_theme_mode", "doc_theme", "doc_templates"].forEach((key) => localStorage.removeItem(key));
    setStatusBarMsg("已清除本地设置，页面即将刷新...");
    window.setTimeout(() => window.location.reload(), 400);
  };

  /** 工作区里的快捷开关仍保留，需要完整流水线配置时跳到设置对应分类 */
  const openWorkflowSettings = () => {
    setSettingsSection("workflow");
    setSettingsOpen(true);
  };

  /** 关闭设置窗口并把焦点还给菜单入口，键盘操作不会丢失位置 */
  const closeSettings = () => {
    setSettingsOpen(false);
    requestAnimationFrame(() => document.getElementById("nav-settings")?.focus());
  };

  return (
    <div className="win">
      {/* 标题栏（Fluent 亚克力质感） */}
      <header className="titlebar">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-white shadow-sm"
            style={{ background: "linear-gradient(140deg, #2f8fdd 0%, #0f6cbd 100%)" }}
          >
            <FileText className="h-3.5 w-3.5" />
          </div>
          <span className="truncate text-[12.5px] font-semibold text-[var(--text-1)]">
            文档压缩标准化与打印排版工具
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {rawText.trim() && (
            <div className="chip chip-success hidden h-6 gap-1.5 px-2.5 md:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)] animate-pulse"></span>
              <span>
                预计节省纸张: <strong className="font-semibold">{savedPagesCount} 张 (省 {savedPercentage}%)</strong> 🌿
              </span>
            </div>
          )}

          <button
            onClick={() => setThemeMode(isDarkMode ? "light" : "dark")}
            className="icon-btn"
            title={isDarkMode ? "切换到日间明亮模式" : "切换到护眼暗黑模式"}
          >
            {isDarkMode ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* 主体 */}
      <div className="flex min-h-0 flex-1">
        {/* 侧边导航 */}
        <nav className="nav">
          <div className="nav-label">核心功能菜单</div>
          <div className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isSettings = item.id === "settings";
              // 设置窗口打开时不再重复高亮背景标签，避免两个入口同时显示为选中
              const active = isSettings ? settingsOpen : !settingsOpen && activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={isSettings ? "nav-settings" : undefined}
                  onClick={() => {
                    if (isSettings) setSettingsOpen(true);
                    else setActiveTab(item.id);
                  }}
                  data-active={active}
                  className="nav-item"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.name}</span>
                  {item.id === "batch" && batchQueue.length > 0 && (
                    <span className="chip chip-accent mono ml-auto px-1.5">
                      {batchQueue.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* 工作区：统一 24px 外边距 + 1180px 内容最大宽度，保证超宽屏不散 */}
        <main className="content">
          <div className="mx-auto w-full max-w-[1180px] px-6 py-6">
            <div key={activeTab} className="tab-enter">
              {activeTab === "quick" && (
                <QuickTab
                  dark={isDarkMode}
                  rawText={rawText}
                  onRawTextChange={setRawText}
                  processedText={processedText}
                  richOptions={richOptions}
                  outputTitle={outputTitle}
                  onOutputTitleChange={setOutputTitle}
                  configs={configs}
                  onToggleConfig={handleToggleConfig}
                  templates={templates}
                  selectedTemplateId={selectedTemplateId}
                  onSelectTemplate={setSelectedTemplateId}
                  customFont={customFont}
                  customFontSize={customFontSize}
                  customLineSpacing={customLineSpacing}
                  customMargins={customMargins}
                  copied={copied}
                  onCopy={handleCopyToClipboard}
                  onExport={handleExportWord}
                  onImportFiles={handleImportFiles}
                  onOpenWorkflowSettings={openWorkflowSettings}
                  setStatus={setStatusBarMsg}
                />
              )}
              {activeTab === "batch" && (
                <BatchTab
                  dark={isDarkMode}
                  queue={batchQueue}
                  onImportFiles={handleImportFiles}
                  onRun={runBatchProcessing}
                  onExportAll={handleExportAllBatch}
                  onExportOne={handleExportWord}
                  onRemove={(id) => setBatchQueue((prev) => prev.filter((it) => it.id !== id))}
                  onClear={() => { setBatchQueue([]); setStatusBarMsg("已清空批量作业处理队列"); }}
                />
              )}
              {activeTab === "capture" && <CaptureTab onStatus={setStatusBarMsg} />}
            </div>
          </div>
        </main>
      </div>

      {/* 状态栏 */}
      <footer className="statusbar">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)] animate-pulse"></span>
          <span className="truncate">{statusBarMsg}</span>
        </div>
        <span className="shrink-0">UTF-8 · 纯本地离线运行</span>
      </footer>

      {/* 设置窗口：排版标准 + 通用 + 关于，由核心菜单的「设置」入口打开 */}
      <SettingsWindow
        open={settingsOpen}
        section={settingsSection}
        onSectionChange={setSettingsSection}
        onClose={closeSettings}
        status={statusBarMsg}
        setStatus={setStatusBarMsg}
        activeTemplate={activeTemplate}
        customFont={customFont}
        customFontSize={customFontSize}
        customLineSpacing={customLineSpacing}
        customParagraphBefore={customParagraphBefore}
        customParagraphAfter={customParagraphAfter}
        customMargins={customMargins}
        onCustomFontChange={setCustomFont}
        onCustomFontSizeChange={setCustomFontSize}
        onCustomLineSpacingChange={setCustomLineSpacing}
        onCustomParagraphBeforeChange={setCustomParagraphBefore}
        onCustomParagraphAfterChange={setCustomParagraphAfter}
        onCustomMarginsChange={setCustomMargins}
        onSaveTemplate={handleSaveCustomTemplate}
        onResetTemplates={handleResetTemplates}
        configs={configs}
        onToggleConfig={handleToggleConfig}
        onSetAllConfigs={handleSetAllConfigs}
        themeMode={themeMode}
        isDarkMode={isDarkMode}
        onThemeModeChange={setThemeMode}
        onResetLocalData={handleResetLocalData}
      />
    </div>
  );
}
