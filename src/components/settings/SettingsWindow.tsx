import { useEffect, useRef, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { FileText, Info, Layout, Palette, SlidersHorizontal, X } from "lucide-react";
import { ProcessingConfig, TypographyTemplate } from "../../types";
import { ThemeMode } from "../../types";
import { TypographyPane } from "./TypographyPane";
import { WorkflowPane } from "./WorkflowPane";
import { GeneralPane } from "./GeneralPane";
import { AboutPane } from "./AboutPane";

export type SettingsSection = "typography" | "workflow" | "general" | "about";

const SECTIONS: { id: SettingsSection; name: string; desc: string; icon: typeof Layout }[] = [
  { id: "typography", name: "排版标准", desc: "模板、字体与版面参数", icon: Layout },
  { id: "workflow", name: "处理工作流", desc: "流水线步骤与规则说明", icon: SlidersHorizontal },
  { id: "general", name: "通用", desc: "主题与本地数据", icon: Palette },
  { id: "about", name: "关于", desc: "版本与运行信息", icon: Info },
];

export interface SettingsWindowProps {
  open: boolean;
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;
  status: string;
  setStatus: (msg: string) => void;

  // 排版标准
  activeTemplate: TypographyTemplate;
  customFont: string;
  customFontSize: number;
  customLineSpacing: number;
  customParagraphBefore: number;
  customParagraphAfter: number;
  customMargins: number;
  onCustomFontChange: (v: string) => void;
  onCustomFontSizeChange: (v: number) => void;
  onCustomLineSpacingChange: (v: number) => void;
  onCustomParagraphBeforeChange: (v: number) => void;
  onCustomParagraphAfterChange: (v: number) => void;
  onCustomMarginsChange: (v: number) => void;
  onSaveTemplate: (e: FormEvent) => void;
  onResetTemplates: () => void;

  // 处理工作流
  configs: ProcessingConfig;
  onToggleConfig: (key: keyof ProcessingConfig) => void;
  onSetAllConfigs: (enabled: boolean) => void;

  // 通用
  themeMode: ThemeMode;
  isDarkMode: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
  onResetLocalData: () => void;
}

/**
 * 系统设置式的模态窗口：
 * 左侧分类导航（支持 ↑ / ↓ 切换） + 右侧设置卡片；Esc 或点击遮罩关闭。
 */
export function SettingsWindow(props: SettingsWindowProps) {
  const { open, section, onSectionChange, onClose, status, setStatus } = props;
  const windowRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    windowRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 切换分类时回到内容区顶部
  useEffect(() => {
    paneRef.current?.scrollTo({ top: 0 });
  }, [section]);

  if (!open) return null;

  const moveSection = (dir: 1 | -1) => {
    const idx = SECTIONS.findIndex((s) => s.id === section);
    const next = SECTIONS[(idx + dir + SECTIONS.length) % SECTIONS.length];
    onSectionChange(next.id);
  };

  /** 模态焦点陷阱：Tab / Shift+Tab 只在窗口内循环，不跑到底层页面 */
  const trapFocus = (e: ReactKeyboardEvent) => {
    if (e.key !== "Tab") return;
    const root = windowRef.current;
    if (!root) return;
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  };

  return (
    <div
      className="settings-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={windowRef}
        tabIndex={-1}
        onKeyDown={trapFocus}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="settings-window"
      >
        {/* 标题栏：只保留真实可用的关闭按钮，不做假的最小化/最大化 */}
        <header className="settings-titlebar">
          <div
            className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] text-white"
            style={{ background: "linear-gradient(140deg, #2f8fdd 0%, #0f6cbd 100%)" }}
          >
            <FileText className="h-3 w-3" />
          </div>
          <span id="settings-title" className="text-[12.5px] font-semibold text-[var(--text-1)]">
            设置
          </span>
          <span className="meta hidden sm:inline">文档压缩标准化与打印排版工具</span>
          <button onClick={onClose} className="icon-btn ml-auto" title="关闭设置（Esc）" aria-label="关闭设置">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="settings-body">
          {/* 分类导航 */}
          <nav
            className="settings-nav"
            aria-label="设置分类"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                moveSection(1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                moveSection(-1);
              }
            }}
          >
            {SECTIONS.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSectionChange(item.id)}
                  data-active={active}
                  className="settings-nav-item"
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex min-w-0 flex-col items-start leading-tight">
                    <span className="truncate">{item.name}</span>
                    <span className="truncate text-[10.5px] font-normal text-[var(--text-3)]">
                      {item.desc}
                    </span>
                  </span>
                </button>
              );
            })}

            <div className="mt-auto px-2 pb-1 text-[10.5px] leading-relaxed text-[var(--text-3)]">
              版本 2.0.0 · 本地离线
            </div>
          </nav>

          {/* 内容区 */}
          <div ref={paneRef} className="settings-pane">
            <div key={section} className="tab-enter">
              {section === "typography" && (
                <TypographyPane
                  activeTemplate={props.activeTemplate}
                  customFont={props.customFont}
                  customFontSize={props.customFontSize}
                  customLineSpacing={props.customLineSpacing}
                  customParagraphBefore={props.customParagraphBefore}
                  customParagraphAfter={props.customParagraphAfter}
                  customMargins={props.customMargins}
                  onCustomFontChange={props.onCustomFontChange}
                  onCustomFontSizeChange={props.onCustomFontSizeChange}
                  onCustomLineSpacingChange={props.onCustomLineSpacingChange}
                  onCustomParagraphBeforeChange={props.onCustomParagraphBeforeChange}
                  onCustomParagraphAfterChange={props.onCustomParagraphAfterChange}
                  onCustomMarginsChange={props.onCustomMarginsChange}
                  onSaveTemplate={props.onSaveTemplate}
                  onResetTemplates={props.onResetTemplates}
                  setStatus={setStatus}
                />
              )}
              {section === "workflow" && (
                <WorkflowPane
                  configs={props.configs}
                  onToggle={props.onToggleConfig}
                  onSetAll={props.onSetAllConfigs}
                />
              )}
              {section === "general" && (
                <GeneralPane
                  themeMode={props.themeMode}
                  isDarkMode={props.isDarkMode}
                  onThemeModeChange={props.onThemeModeChange}
                  onResetLocalData={props.onResetLocalData}
                />
              )}
              {section === "about" && <AboutPane />}
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <footer className="settings-footer">
          <div className="flex min-w-0 items-center gap-2 text-[11px] text-[var(--text-3)]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--success)]" />
            <span className="truncate">{status}</span>
          </div>
          <button onClick={onClose} className="btn btn-accent">
            完成
          </button>
        </footer>
      </div>
    </div>
  );
}
