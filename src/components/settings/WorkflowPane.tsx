import { ChevronDown } from "lucide-react";
import { ProcessingConfig } from "../../types";
import { WHITESPACE_SEPARATOR, WORKFLOW_STEPS } from "../../constants";

export interface WorkflowPaneProps {
  configs: ProcessingConfig;
  onToggle: (key: keyof ProcessingConfig) => void;
  onSetAll: (enabled: boolean) => void;
}

/** 说明型正文：11.5px / 1.75 行高，段落间 6px */
const PROSE = "prose text-[11.5px] leading-[1.75] text-[var(--text-2)]";
const PROSE_HEAD = "mb-1.5 text-[11.5px] font-semibold text-[var(--text-1)]";

/** 「工作流」分类：流水线开关 + 规则说明（从原「自定义工作流」页迁移过来） */
export function WorkflowPane({ configs, onToggle, onSetAll }: WorkflowPaneProps) {
  return (
    <div className="flex flex-col gap-5">
      <header className="pane-head">
        <h2>处理工作流</h2>
        <p>
          决定粘贴内容进入流水线后哪些步骤执行、哪些跳过。改动立即作用于快速排版与批量排版，并与工作区里的快捷开关保持同步。
        </p>
      </header>

      <section className="set-group">
        <div className="set-group-label">流水线步骤（按执行顺序）</div>
        <div className="set-card">
          {WORKFLOW_STEPS.map((step, idx) => {
            const key = step.id as keyof ProcessingConfig;
            const enabled = configs[key];
            return (
              <div key={step.id} className="set-row">
                <div className="set-row-main flex items-start gap-3">
                  <span className="mono mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[10px] font-semibold text-[var(--accent-fg)]">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="set-row-title">{step.name}</div>
                    <div className="set-row-desc">{step.description}</div>
                  </div>
                </div>

                <div className="set-row-ctl">
                  {enabled ? (
                    <span className="chip chip-success">运行中</span>
                  ) : (
                    <span className="chip chip-neutral">已跳过</span>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={step.name}
                    onClick={() => onToggle(key)}
                    data-on={enabled}
                    className="set-switch"
                  >
                    <span className="set-switch-thumb" />
                  </button>
                </div>
              </div>
            );
          })}

          <div className="set-row">
            <div className="set-row-main">
              <div className="set-row-title">批量操作</div>
              <div className="set-row-desc">一次性开启或跳过全部步骤，适合对照原稿做 A/B 比较</div>
            </div>
            <div className="set-row-ctl">
              <button type="button" onClick={() => onSetAll(true)} className="btn btn-sm btn-neutral">
                全部启用
              </button>
              <button type="button" onClick={() => onSetAll(false)} className="btn btn-sm btn-neutral">
                全部禁用
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="set-group">
        <div className="set-group-label">规则说明（展开查看）</div>
        <div className="flex flex-col gap-2">
          <details className="set-details">
            <summary>
              <span>题目分级：识别依据与符号体系</span>
              <span className="flex items-center gap-2">
                <span className="mono text-[10.5px] font-normal text-[var(--text-3)]">■ 大题 · ◆ 小题 · ▸ 小问</span>
                <ChevronDown className="set-chevron h-3.5 w-3.5 text-[var(--text-3)]" />
              </span>
            </summary>
            <div className={`set-details-body grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 ${PROSE}`}>
              <div>
                <p className={PROSE_HEAD}>① 识别依据（三条证据）</p>
                <p>· <strong>序号字符集</strong>：中文数字（一、二、三）通常只做大题；阿拉伯数字（1. 2.）做小题；（1）（2）做小问</p>
                <p>· <strong>递增序列</strong>：上一个大题序号 +1 才算大题，序号断裂就不升级（防止选项被当标题）</p>
                <p>· <strong>题干关键词</strong>：选择题/填空/解答/计算/证明/阅读/作文… 出现即认作大题，兼容分卷后重新从“一、”开始</p>
                <p>· <strong>反例防护</strong>：连续 ≥3 行「中文数字 + 短内容（≤12 字）」判为选项组；<code className="mono">3.14</code> 这类小数不当题号；公式块 / 代码块内一律不动</p>
              </div>

              <div>
                <p className={PROSE_HEAD}>② 符号体系（重量递减）</p>
                <p>· <strong>■ 大题</strong>　一、选择题（每题3分）</p>
                <p>· <strong>◆ 小题</strong>　1. 下列各题…</p>
                <p>· <strong>▸ 小问</strong>　（1）求…</p>
                <p>· 选项 A. B. C. D. / 甲乙丙丁 不加符号，仅缩进弱化，避免抢重点</p>
                <p>· “一、二、三”式选项（与大题同形）额外加 <strong>◇</strong> 以区分，否则无法分辨</p>
                <p>· 圈号 ①②③ 本身已是符号，保持原样不重复加标</p>
                <p>· 原有题号文字（数字、括号形态）一律保留，只前置层级符号</p>
              </div>

              <div>
                <p className={PROSE_HEAD}>③ 视觉层级（Word 中的具体样式）</p>
                <p>· 大题：字号 +1pt、加粗、段前 10pt，像章节标题</p>
                <p>· 小题：加粗、段前 6pt，视线一眼能跳题</p>
                <p>· 小问：不加粗、左缩进 0.25 英寸，明显从属于小题</p>
                <p>· 选项：左缩进 0.33 英寸、常规字重，形成“题目—选项”的主次对比</p>
                <p>· 关闭「题目层级识别与符号化」即可恢复原样</p>
              </div>
            </div>
          </details>

          <details className="set-details">
            <summary>
              <span>空白压缩：触发方式、处理规则与取舍</span>
              <span className="flex items-center gap-2">
                <span className="mono text-[10.5px] font-normal text-[var(--text-3)]">
                  行内 ≥3 → 1 空格 ｜ 空行 ≥3 → {WHITESPACE_SEPARATOR}
                </span>
                <ChevronDown className="set-chevron h-3.5 w-3.5 text-[var(--text-3)]" />
              </span>
            </summary>
            <div className={`set-details-body grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 ${PROSE}`}>
              <div>
                <p className={PROSE_HEAD}>① 触发方式</p>
                <p>· 独立开关「空白压缩与分隔标号替换」，与其它开关互不影响，默认开启</p>
                <p>· 关闭后：原文空白一个字符都不动，方便对照原稿</p>
                <p>· 只作用在“白版”上：不新增、不删除任何可见文字，仅压缩间隔</p>
                <p>· 实时预览与导出的 Word 走同一套规则，所见即所得</p>
              </div>

              <div>
                <p className={PROSE_HEAD}>② 处理规则（阈值）</p>
                <p>· 行内连续空白 <strong>≥3 个</strong>（半角空格、制表符、全角空格、NBSP）→ 压成 1 个半角空格</p>
                <p>· 连续 <strong>≤2 个</strong>空白视为有意留白（中英文间距、手工对齐），原样保留</p>
                <p>· 行尾空白 → 全部删除；文首/文尾空行 → 直接丢弃</p>
                <p>· 行首缩进宽度 ≤4 保留（护住段首缩进与嵌套列表），&gt;4 视为粘贴垃圾，压成 2 个空格</p>
                <p>· 零宽字符（U+200B~U+200D、U+FEFF）删除；制表符统一按 4 空格宽度折算</p>
              </div>

              <div>
                <p className={PROSE_HEAD}>③ 压缩 / 分隔标号的取舍</p>
                <p>· 连续空行 <strong>≥3 个</strong>：视作“分隔作用的大段空白”→ 换成一行 {WHITESPACE_SEPARATOR}</p>
                <p>· 连续 1~2 个空行：属于正常段落间隔，保留，不插图符（避免整篇花掉）</p>
                <p>· 分隔标号在 Word 中居中、灰色、略小，比 3 行空白省版面又比直接删掉更醒目</p>
                <p>· 保护区域：$$ 公式块（可跨行）与 ``` 代码围栏内部完全不压缩，避免破坏公式语法</p>
                <p>· 与「压缩冗余连续空行」同开时：剩余的 1~2 个空行会再被收紧为 1 个</p>
                <p>· 已知取舍：靠空格对齐的“伪表格”（名称　数量　单价）会被压平，需要保留列对齐时请关掉本开关</p>
              </div>
            </div>
          </details>

          <details className="set-details">
            <summary>
              <span>粘贴转换：支持范围与边界情况</span>
              <span className="flex items-center gap-2">
                <span className="mono text-[10.5px] font-normal text-[var(--text-3)]">OMML · 真实上下标</span>
                <ChevronDown className="set-chevron h-3.5 w-3.5 text-[var(--text-3)]" />
              </span>
            </summary>
            <div className={`set-details-body grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 ${PROSE}`}>
              <div>
                <p className={PROSE_HEAD}>① 可识别的输入</p>
                <p>· LaTeX 公式：<code className="mono">$x^2$</code>、<code className="mono">$$…$$</code>、<code className="mono">\(…\)</code>、<code className="mono">\[…\]</code></p>
                <p>· 支持命令：\frac \sqrt \sum \prod \int \left( \right)、希腊字母、关系符、上下标、\text \mathrm \mathbf \mathbb</p>
                <p>· mhchem 化学：<code className="mono">\ce&#123;H2SO4&#125;</code>、<code className="mono">\ce&#123;Fe^3+&#125;</code>、<code className="mono">\ce&#123;2H2 + O2 -&gt; 2H2O&#125;</code>、<code className="mono">\pu&#123;…&#125;</code></p>
                <p>· 纯文本化学式：H2SO4、Ca(OH)2、CuSO4·5H2O、NH4+、SO42-、Cr2O72-</p>
                <p>· 零散 LaTeX（\alpha、x^2、\frac&#123;a&#125;&#123;b&#125;）转为 Unicode 字符</p>
              </div>

              <div>
                <p className={PROSE_HEAD}>② 输出的可编辑形式</p>
                <p>· 数学公式 → <strong>Word 原生公式对象（OMML）</strong>：双击即可编辑，公式工具、字体大小、编号均可用</p>
                <p>· 化学式 / 离子 → <strong>Word 真实上下标</strong>：普通文字 + 上标/下标格式，任意修改不丢格式</p>
                <p>· 化学方程式箭头、结晶水点号、状态 (aq) 按文字输出</p>
                <p>· 页面预览仅为近似示意，实际以导出的 Word 为准</p>
              </div>

              <div>
                <p className={PROSE_HEAD}>③ 无法自动识别的情况</p>
                <p>· 无定界符且结构复杂的长公式（只能做符号替换，不生成公式对象）</p>
                <p>· 多行环境：align / gather / cases / matrix / 自定义宏 \newcommand</p>
                <p>· \overbrace、\underbrace、\boxed、\cancel 等装饰命令</p>
                <p>· 歧义缩写：CO、COVID19、MP3、USB3 可能漏判或误判（代码按“元素合法性 + 常见元素”双重校验来降低误判）</p>
                <p>· 结构式、键线式、SMILES、苯环、同位素上下标组合</p>
                <p>· 箭头上的反应条件（温度/催化剂）会被忽略，只保留箭头</p>
                <p>· 中英文与公式之间没有空格时可能粘连</p>
              </div>
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
