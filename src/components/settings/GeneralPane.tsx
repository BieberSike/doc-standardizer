import { Palette, RotateCcw } from "lucide-react";
import { ThemeMode } from "../../types";

export interface GeneralPaneProps {
  themeMode: ThemeMode;
  isDarkMode: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
  onResetLocalData: () => void;
}

/** 「通用」分类：主题与本地数据 */
export function GeneralPane({
  themeMode,
  isDarkMode,
  onThemeModeChange,
  onResetLocalData,
}: GeneralPaneProps) {
  return (
    <div className="flex flex-col gap-5">
      <header className="pane-head">
        <h2>通用</h2>
        <p>界面外观与保存在本机的数据。所有设置只存在当前浏览器，不会上传。</p>
      </header>

      <section className="set-group">
        <div className="set-group-label">外观</div>
        <div className="set-card">
          <div className="set-row">
            <div className="set-row-main">
              <div className="set-row-title">主题模式</div>
              <div className="set-row-desc">
                浅色适合打印预览，深色适合夜间；跟随系统会随 Windows 主题自动切换
              </div>
            </div>
            <div className="set-row-ctl">
              <select
                className="field w-[132px]"
                value={themeMode}
                onChange={(e) => onThemeModeChange(e.target.value as ThemeMode)}
              >
                <option value="light">浅色</option>
                <option value="dark">深色</option>
                <option value="system">跟随系统</option>
              </select>
            </div>
          </div>

          <div className="set-row">
            <div className="set-row-main">
              <div className="set-row-title">当前生效</div>
              <div className="set-row-desc">标题栏右上角的月亮/太阳按钮也会同步这一项</div>
            </div>
            <div className="set-row-ctl">
              <span className="chip chip-neutral">
                <Palette className="h-3 w-3" />
                {isDarkMode ? "深色" : "浅色"}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="set-group">
        <div className="set-group-label">本地数据</div>
        <div className="set-card">
          <div className="set-row">
            <div className="set-row-main">
              <div className="set-row-title">存储位置</div>
              <div className="set-row-desc">浏览器 localStorage：主题偏好与自定义排版模板</div>
            </div>
            <div className="set-row-ctl">
              <span className="chip chip-neutral mono">localStorage</span>
            </div>
          </div>

          <div className="set-row">
            <div className="set-row-main">
              <div className="set-row-title">恢复默认设置</div>
              <div className="set-row-desc">清除主题偏好与全部自定义模板，页面会自动刷新</div>
            </div>
            <div className="set-row-ctl">
              <button type="button" onClick={onResetLocalData} className="btn btn-danger-subtle">
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
