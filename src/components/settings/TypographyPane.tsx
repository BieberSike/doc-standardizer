import { useEffect, useState, type FormEvent } from "react";
import { RotateCcw, ScanSearch, Save } from "lucide-react";
import { TypographyTemplate } from "../../types";
import { FONT_DISPLAY_NAMES, STANDARD_FONTS } from "../../constants";
import { runCanvasFontScan, scanLocalFonts } from "../../lib/fonts";

export interface TypographyPaneProps {
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
  setStatus: (msg: string) => void;
}

/** 「排版标准」分类：字体、版面参数与模板动作，全部为系统设置式的行条目 */
export function TypographyPane(props: TypographyPaneProps) {
  const {
    activeTemplate,
    customFont,
    customFontSize,
    customLineSpacing,
    customParagraphBefore,
    customParagraphAfter,
    customMargins,
    onCustomFontChange,
    onCustomFontSizeChange,
    onCustomLineSpacingChange,
    onCustomParagraphBeforeChange,
    onCustomParagraphAfterChange,
    onCustomMarginsChange,
    onSaveTemplate,
    onResetTemplates,
    setStatus,
  } = props;

  const [detectedFonts, setDetectedFonts] = useState<string[]>([]);
  const [isManualFont, setIsManualFont] = useState(false);
  const [isFontScanning, setIsFontScanning] = useState(false);

  useEffect(() => {
    setDetectedFonts(runCanvasFontScan());
  }, []);

  const handleScan = async () => {
    setIsFontScanning(true);
    setStatus("正在扫描系统已安装的字体...");
    const result = await scanLocalFonts();
    setDetectedFonts(result.fonts);
    setStatus(result.message);
    setIsFontScanning(false);
  };

  const showManualInput =
    isManualFont || (!detectedFonts.includes(customFont) && !STANDARD_FONTS.includes(customFont));

  return (
    <div className="flex flex-col gap-5">
      <header className="pane-head">
        <h2>排版标准</h2>
        <p>决定导出 Word 的字号、行距与页边距。改动即时生效，并自动保存在本机。</p>
      </header>

      {/* 当前模板 */}
      <section className="set-group">
        <div className="set-group-label">当前模板</div>
        <div className="set-card">
          <div className="set-row">
            <div className="set-row-main">
              <div className="set-row-title">{activeTemplate.name}</div>
              <div className="set-row-desc">在「快速排版工作区」的模板卡片中切换，下面的参数会紧随所选模板</div>
            </div>
            <div className="set-row-ctl">
              <span className={activeTemplate.isBuiltIn ? "chip chip-neutral" : "chip chip-accent"}>
                {activeTemplate.isBuiltIn ? "内置模板" : "自定义模板"}
              </span>
            </div>
          </div>

          <div className="set-row">
            <div className="set-row-main">
              <div className="set-row-title">打印效果预览</div>
              <div className="set-row-desc">按当前字体、字号与行距实时渲染，仅示意版面密度</div>
            </div>
          </div>

          <div className="px-4 pb-4">
            <div
              className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[var(--text-2)]"
              style={{
                fontFamily: customFont,
                fontSize: `${customFontSize}pt`,
                lineHeight: customLineSpacing,
              }}
            >
              <div style={{ marginBottom: customParagraphAfter }}>
                示例：本工具会把 AI 输出的长文重排为适合打印的紧凑版式，减少无效空白。
              </div>
              <div style={{ marginTop: customParagraphBefore }}>
                公式预览：a² + b² = c²（c = √(a² + b²)）
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 字体 */}
      <section className="set-group">
        <div className="set-group-label">字体</div>
        <div className="set-card">
          <div className="set-row">
            <div className="set-row-main">
              <div className="set-row-title">正文字体</div>
              <div className="set-row-desc">导出 Word 与页面预览共用同一字体，目标电脑未安装时会回退为宋体</div>
            </div>
            <div className="set-row-ctl">
              <select
                value={isManualFont ? "manual" : customFont}
                onChange={(e) => {
                  if (e.target.value === "manual") setIsManualFont(true);
                  else {
                    setIsManualFont(false);
                    onCustomFontChange(e.target.value);
                  }
                }}
                className="field w-[230px]"
              >
                {detectedFonts.length > 0 && (
                  <optgroup label={`本机已检测到的字体（${detectedFonts.length} 种）`}>
                    {detectedFonts.map((font) => (
                      <option key={font} value={font}>
                        {FONT_DISPLAY_NAMES[font] || font}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="其它标准字体">
                  {STANDARD_FONTS.filter((f) => !detectedFonts.includes(f)).map((f) => (
                    <option key={f} value={f}>
                      {FONT_DISPLAY_NAMES[f] || f}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="高级自定义">
                  <option value="manual">手动指定本机安装的其他字体...</option>
                </optgroup>
              </select>
              <button
                type="button"
                onClick={handleScan}
                disabled={isFontScanning}
                className="btn btn-sm btn-neutral shrink-0"
              >
                <ScanSearch className="h-3.5 w-3.5" />
                {isFontScanning ? "扫描中" : "扫描字体"}
              </button>
            </div>
          </div>

          {showManualInput && (
            <div className="set-row">
              <div className="set-row-main">
                <div className="set-row-title">手动输入字体名称</div>
                <div className="set-row-desc">例如 华文行楷、微软雅黑；填写本机真实安装的名称才生效</div>
              </div>
              <div className="set-row-ctl">
                <input
                  type="text"
                  value={customFont}
                  onChange={(e) => onCustomFontChange(e.target.value)}
                  placeholder="字体名称"
                  className="field w-[230px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsManualFont(false);
                    onCustomFontChange("SimSun");
                  }}
                  className="btn btn-sm btn-neutral shrink-0"
                >
                  重置
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 版面参数 */}
      <section className="set-group">
        <div className="set-group-label">版面参数</div>
        <div className="set-card">
          <SliderRow
            label="基本字号"
            desc="正文默认字号，9pt 最省纸，12pt 接近论文正文"
            min={8}
            max={14}
            step={0.5}
            value={customFontSize}
            unit={`${customFontSize} pt`}
            onChange={onCustomFontSizeChange}
          />
          <SliderRow
            label="行间距"
            desc="行距倍数，越小越紧凑"
            min={0.9}
            max={1.8}
            step={0.05}
            value={customLineSpacing}
            unit={`${customLineSpacing}×`}
            onChange={onCustomLineSpacingChange}
          />
          <SliderRow
            label="页边距"
            desc="纸张四周留白，影响单页可容纳的行数"
            min={0.25}
            max={1.25}
            step={0.05}
            value={customMargins}
            unit={`${customMargins} in`}
            onChange={onCustomMarginsChange}
          />

          <div className="set-row">
            <div className="set-row-main">
              <div className="set-row-title">段落间距</div>
              <div className="set-row-desc">段前与段后空距，单位磅（pt），两者都为 0 时最紧凑</div>
            </div>
            <div className="set-row-ctl">
              <label className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-3)]">
                段前
                <input
                  type="number"
                  value={customParagraphBefore}
                  onChange={(e) => onCustomParagraphBeforeChange(parseInt(e.target.value) || 0)}
                  className="field mono w-[68px]"
                />
              </label>
              <label className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-3)]">
                段后
                <input
                  type="number"
                  value={customParagraphAfter}
                  onChange={(e) => onCustomParagraphAfterChange(parseInt(e.target.value) || 0)}
                  className="field mono w-[68px]"
                />
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* 模板动作 */}
      <section className="set-group">
        <div className="set-group-label">模板操作</div>
        <div className="set-card">
          <form onSubmit={onSaveTemplate} className="set-row">
            <div className="set-row-main">
              <div className="set-row-title">另存为我的专属模板</div>
              <div className="set-row-desc">把上面调整好的参数固化为独立模板，可在快速排版工作区选用</div>
            </div>
            <div className="set-row-ctl">
              <button type="submit" className="btn btn-accent">
                <Save className="h-4 w-4" />
                保存为模板
              </button>
            </div>
          </form>

          <div className="set-row">
            <div className="set-row-main">
              <div className="set-row-title">恢复出厂模板</div>
              <div className="set-row-desc">删除全部自定义模板并回到三套内置模板，此操作不可撤销</div>
            </div>
            <div className="set-row-ctl">
              <button type="button" onClick={onResetTemplates} className="btn btn-danger-subtle">
                <RotateCcw className="h-3.5 w-3.5" />
                恢复默认
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SliderRow({
  label,
  desc,
  min,
  max,
  step,
  value,
  unit,
  onChange,
}: {
  label: string;
  desc: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="set-row">
      <div className="set-row-main">
        <div className="set-row-title">{label}</div>
        <div className="set-row-desc">{desc}</div>
      </div>
      <div className="set-row-ctl">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-[150px]"
        />
        <span className="chip chip-neutral mono w-[62px] justify-center">{unit}</span>
      </div>
    </div>
  );
}
