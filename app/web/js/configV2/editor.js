// 配置页编辑器模块——2026-08-22 拆分自 app.js（批 2）
// 包含：配置页数据准备、编辑器渲染/交互、历史/分页断点/缩放、图片面板、属性面板、
// 文件解析（parseFileRow，被编辑器加载与投递共用）。
// 依赖 app.js 的 render() 通过 setEditorHooks 注入（避免循环依赖与过渡环双实例）。

import {
  TEMPLATES, SUPPORTED_EXTS, getCharsPerLine, getTemplateById, supportsManualPageBreak, CONFIG_V2_MAX_COLS,
  CONFIG_V2_HISTORY_LIMIT, CONFIG_V2_ZOOM_MIN, CONFIG_V2_ZOOM_MAX, CONFIG_V2_ZOOM_STEP
} from "../constants.js";
import { api, API_BASE } from "../api.js";
import {
  getExt, getFileName, getDisplayFileName, getDirName, isInputsPath, isImageExt, evaluateSupport,
  computeRowStatusMeta, splitSupportedPaths, normalizeCount, normalizeQueueSnapshot, normalizeDashboardSummary,
  pathsMatch, getRunMetaTaskId, rowAcceptsRunResult, nowTimestampText, normalizeLogForDisplay, escapeHtml,
  cloneEditorElement, normalizeTextElement, getTextCols, getTextCellContent, setTextCellContent,
  getTextColCount, isTextEditorElement, trimTrailingLineBreaks
} from "../utils.js";
import { state, persistState } from "../state.js";
import {
  updateWorkStatusText, updateCustomScrollbar, showCustomScrollbarTemporarily, showFormatToast, showFormatToastAction
} from "../ui.js";
import { getConfigV2InputRows } from "../queue.js";
import { setTab, panes } from "../views/nav.js";

// ===== 需要的 DOM 常量（与 app.js 各自独立声明同一 id，模块作用域无冲突）=====
const configV2AddLineBtn = document.getElementById("configV2AddLineBtn")
const configV2EditorBody = document.getElementById("configV2EditorBody")
const configV2EditorMeta = document.getElementById("configV2EditorMeta")
const configV2EditorTitle = document.getElementById("configV2EditorTitle")
const configV2PageTrimCheck = document.getElementById("configV2PageTrimCheck")
const configV2PageTrimToggle = document.getElementById("configV2PageTrimToggle")
const configV2RedoBtn = document.getElementById("configV2RedoBtn")
const configV2ReparseBtn = document.getElementById("configV2ReparseBtn")
const configV2ResetBreaksBtn = document.getElementById("configV2ResetBreaksBtn")
const configV2TemplateDropdown = document.getElementById("configV2TemplateDropdown")
const configV2TplDot = document.getElementById("configV2TplDot")
const configV2TplTrigger = document.getElementById("configV2TplTrigger")
const configV2UndoBtn = document.getElementById("configV2UndoBtn")
const configV2ZoomControls = document.querySelector(".config-v2-zoom-controls")
const configV2ZoomInBtn = document.getElementById("configV2ZoomInBtn")
const configV2ZoomOutBtn = document.getElementById("configV2ZoomOutBtn")
const configV2ZoomResetBtn = document.getElementById("configV2ZoomResetBtn")
const configV2ZoomValue = document.getElementById("configV2ZoomValue")

// ===== 编辑器共享状态（原 app.js 模块级）=====
let configV2Elements = [];
let configV2BrokenImages = {};
let configV2FocusedIdx = -1;
let configV2LoadedKey = "";
let configV2LoadingKey = "";
let configV2LoadErrorKey = "";
let configV2LoadErrorMessage = "";
let configV2Dirty = false;
let configV2EditingIdx = -1;
let configV2EditingCol = -1;
let configV2UndoStack = [];
let configV2RedoStack = [];
let configV2Zoom = 1;
let configV2ImagePickerInput = null;
let configV2ImagePickerMode = null;
let configV2ImagePickerIndex = null;

// ===== 钩子注入：app.js bootstrap 调用 setEditorHooks({ render, renderConfigV2 }) =====
let renderHook = () => {};
let renderConfigV2Hook = () => {};
export function setEditorHooks(hooks) {
  if (hooks && typeof hooks.render === "function") renderHook = hooks.render;
  if (hooks && typeof hooks.renderConfigV2 === "function") renderConfigV2Hook = hooks.renderConfigV2;
}

// 投递逻辑（app.js）读取编辑未保存状态用
export function isConfigV2Dirty() {
  return configV2Dirty;
}

// app.js 缩放按钮读取当前缩放值用
export function getConfigV2Zoom() {
  return configV2Zoom;
}

// app.js 加图后让编辑器重新加载：只清加载键（不重置缩放/历史）
export function resetConfigV2LoadState() {
  configV2LoadedKey = "";
  configV2LoadingKey = "";
  configV2LoadErrorKey = "";
  configV2LoadErrorMessage = "";
}

// 统一重置编辑器内部状态（app.js 在缓存失效/清空输入时调用）
export function resetConfigV2EditorState() {
  configV2Elements = [];
  configV2BrokenImages = {};
  configV2FocusedIdx = -1;
  configV2LoadedKey = "";
  configV2LoadingKey = "";
  configV2LoadErrorKey = "";
  configV2LoadErrorMessage = "";
  configV2Dirty = false;
  configV2EditingIdx = -1;
  configV2EditingCol = -1;
  configV2UndoStack = [];
  configV2RedoStack = [];
  resetConfigV2Editing();
  resetConfigV2History();
}

const TEMPLATE_D_CAKE_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14"></path><path d="M5 20v-6"></path><path d="M19 20v-6"></path><path d="M5 14c0-1.7 1.3-2.6 2.6-2.6s2.6.9 2.6 2.6 1.3 2.6 2.6 2.6 2.6-.9 2.6-2.6 1.3-2.6 2.6-2.6S19 12.3 19 14"></path><path d="M12 11.4V9"></path><path d="M12 9c-.8 0-1.2.5-1.2 1.1 0 .7.5 1.1 1.2 1.1s1.2-.4 1.2-1.1c0-.6-.4-1.1-1.2-1.1z" fill="currentColor" stroke="none"></path></svg>`;

// ===== 函数体（原样搬移，render() → renderHook()，全部导出）=====
export function resetConfigV2Editing() {
  configV2EditingIdx = -1;
  configV2EditingCol = -1;
}

export function getHeadingLabelsForTemplate(elements, templateId) {
  const tmpl = getTemplateById(templateId);
  if (!tmpl || (tmpl.layoutMode !== "templateA" && tmpl.layoutMode !== "templateC")) return {};
  const labels = {};
  let textCount = 0;
  let imageAssigned = false;
  elements.forEach((el, i) => {
    if (el.type === "text") {
      textCount += 1;
      if (textCount === 1) labels[i] = "主标题";
      else if (textCount === 2) labels[i] = "副标题";
    } else if (el.type === "image" && !imageAssigned) {
      imageAssigned = true;
      labels[i] = "题图";
    }
  });
  return labels;
}

export function getConfigV2SelectedRow() {
  if (!state.configV2SelectedId) return null;
  return state.files.find((row) => row.id === state.configV2SelectedId) || null;
}

export function ensureConfigV2Selection() {
  const inputRows = getConfigV2InputRows();
  if (state.configV2SelectedId && inputRows.some((row) => row.id === state.configV2SelectedId)) return;
  state.configV2SelectedId = inputRows.length > 0 ? inputRows[0].id : "";
  configV2LoadedKey = "";
  configV2LoadingKey = "";
  configV2LoadErrorKey = "";
  configV2LoadErrorMessage = "";
  configV2Elements = [];
  configV2FocusedIdx = -1;
  resetConfigV2Editing();
  configV2Dirty = false;
  resetConfigV2History();
}

export function configV2CacheKey(row) {
  if (!row || !row.cachePath) return "";
  return `${row.id}:${row.cachePath}`;
}

export function renderConfigV2TemplateMenu(row) {
  if (!configV2TplTrigger || !configV2TemplateDropdown) return;
  const menu = configV2TemplateDropdown.querySelector(".tpl-menu");
  const label = configV2TplTrigger.querySelector(".config-v2-tpl-label");
  const template = row ? getTemplateById(row.templateId) : null;
  if (label) label.textContent = template ? template.label : "未选择";
  if (configV2TplDot) configV2TplDot.style.backgroundColor = template ? template.color : "#a1b3aa";
  configV2TplTrigger.disabled = !row || row.lockedTemplate;
  configV2TplTrigger.title = configV2TplTrigger.disabled ? (row ? "该文件锁定模板，不可切换" : "请先在队列中选择文件") : "";
  if (!menu) return;
  if (!row) {
    menu.innerHTML = "";
    return;
  }
  menu.innerHTML = `
    <button class="tpl-option" data-tid="">
      <span class="dot" style="background:#a1b3aa"></span><span>未选择</span>
    </button>
    ${TEMPLATES.map((t) => `
      <button class="tpl-option" data-tid="${escapeHtml(t.id)}" ${row.lockedTemplate && row.templateId !== t.id ? "disabled" : ""}>
        <span class="dot" style="background:${t.color}"></span><span>${escapeHtml(t.label)}</span>
      </button>
    `).join("")}
  `;
  menu.querySelectorAll(".tpl-option").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const tid = btn.getAttribute("data-tid") || "";
      configV2TemplateDropdown.classList.remove("open");
      await changeConfigV2Template(row, tid);
    });
  });
}

export function renderConfigV2InputTailActions() {
  return `
    <button class="config-v2-list-tail-btn" data-action="process-current" type="button">处理当前打开项</button>
    <button class="config-v2-list-tail-btn primary" data-action="process-all" type="button">处理全部</button>
    <button class="config-v2-list-tail-btn" data-action="add-files" type="button">添加文件</button>
  `;
}

export function renderConfigV2PendingStat(count) {
  return `
    <div class="config-v2-inline-stat">
      <span>文件</span>
      <strong>${count} 个</strong>
    </div>
  `;
}

export function cloneConfigV2Elements() {
  return configV2Elements.map((el) => cloneEditorElement(el));
}

export function updateConfigV2HistoryButtons() {
  const row = getConfigV2SelectedRow();
  const canEdit = !!(row && row.cachePath && configV2LoadedKey === configV2CacheKey(row));
  if (configV2UndoBtn) configV2UndoBtn.disabled = !canEdit || configV2UndoStack.length === 0;
  if (configV2RedoBtn) configV2RedoBtn.disabled = !canEdit || configV2RedoStack.length === 0;
}

export function resetConfigV2History() {
  configV2UndoStack = [];
  configV2RedoStack = [];
  updateConfigV2HistoryButtons();
}

export function pushConfigV2History() {
  configV2UndoStack.push(cloneConfigV2Elements());
  if (configV2UndoStack.length > CONFIG_V2_HISTORY_LIMIT) {
    configV2UndoStack.shift();
  }
  configV2RedoStack = [];
  updateConfigV2HistoryButtons();
}

export function canBreakAfterConfigV2Index(idx) {
  return Number.isInteger(idx) && idx >= 0 && idx < configV2Elements.length - 1;
}

export function hasConfigV2BreakAfter(idx) {
  return canBreakAfterConfigV2Index(idx) && !!configV2Elements[idx + 1].page_break_before;
}

export function setConfigV2BreakAfter(idx, enabled) {
  if (!canBreakAfterConfigV2Index(idx)) return false;
  if (enabled) configV2Elements[idx + 1].page_break_before = true;
  else delete configV2Elements[idx + 1].page_break_before;
  return true;
}

export function clearConfigV2PageBreaks() {
  configV2Elements.forEach((el) => {
    if (el && typeof el === "object") delete el.page_break_before;
  });
}

export function snapshotPageBreakGaps() {
  const gaps = [];
  for (let i = 0; i < configV2Elements.length - 1; i += 1) {
    if (configV2Elements[i + 1].page_break_before) gaps.push(i);
  }
  return gaps;
}

export function relocatePageBreakGaps(gaps, ops) {
  clearConfigV2PageBreaks();
  gaps.forEach((i) => {
    let j = i;
    ops.forEach((op) => {
      if (op.type === "remove") {
        if (j >= op.at) j -= 1;
      } else if (op.type === "insert") {
        if (op.at <= j) j += 1;
      }
    });
    if (j >= 0 && j < configV2Elements.length - 1) {
      configV2Elements[j + 1].page_break_before = true;
    }
  });
}

export function applyConfigV2PageBreakIndexes(indexes) {
  clearConfigV2PageBreaks();
  (indexes || []).forEach((value) => {
    const itemIndex = Number(value);
    if (!Number.isFinite(itemIndex) || itemIndex <= 1) return;
    const idx = itemIndex - 1;
    if (idx >= 0 && idx < configV2Elements.length) {
      configV2Elements[idx].page_break_before = true;
    }
  });
}

export function clampConfigV2BreakAfterIndex(idx) {
  const maxIdx = configV2Elements.length - 2;
  if (maxIdx < 0) return -1;
  if (idx < 0) return 0;
  if (idx > maxIdx) return maxIdx;
  return idx;
}

export function undoConfigV2Editor() {
  const row = getConfigV2SelectedRow();
  if (!row || !row.cachePath) return;
  commitConfigV2TextEditor();
  if (configV2UndoStack.length === 0) return;
  configV2RedoStack.push(cloneConfigV2Elements());
  configV2Elements = configV2UndoStack.pop().map((el) => cloneEditorElement(el));
  configV2FocusedIdx = -1;
  resetConfigV2Editing();
  configV2Dirty = true;
  scheduleConfigV2AutoSave();
  renderConfigV2EditorItems(row);
  renderConfigV2Editor();
  updateConfigV2HistoryButtons();
}

export function redoConfigV2Editor() {
  const row = getConfigV2SelectedRow();
  if (!row || !row.cachePath) return;
  commitConfigV2TextEditor();
  if (configV2RedoStack.length === 0) return;
  configV2UndoStack.push(cloneConfigV2Elements());
  configV2Elements = configV2RedoStack.pop().map((el) => cloneEditorElement(el));
  configV2FocusedIdx = -1;
  resetConfigV2Editing();
  configV2Dirty = true;
  scheduleConfigV2AutoSave();
  renderConfigV2EditorItems(row);
  renderConfigV2Editor();
  updateConfigV2HistoryButtons();
}

export function updateConfigV2ZoomControls() {
  const percent = Math.round(configV2Zoom * 100);
  if (configV2ZoomValue) configV2ZoomValue.textContent = `${percent}%`;
  if (configV2ZoomOutBtn) configV2ZoomOutBtn.disabled = configV2Zoom <= CONFIG_V2_ZOOM_MIN;
  if (configV2ZoomInBtn) configV2ZoomInBtn.disabled = configV2Zoom >= CONFIG_V2_ZOOM_MAX;
  if (configV2ZoomResetBtn) configV2ZoomResetBtn.disabled = Math.abs(configV2Zoom - 1) < 0.001;
  updateConfigV2ZoomPosition();
}

export function updateConfigV2ZoomPosition() {
  if (!configV2ZoomControls) return;
  const editor = configV2ZoomControls.closest(".config-v2-editor");
  if (!editor || state.activeTab !== "config2") {
    configV2ZoomControls.style.visibility = "hidden";
    if (configV2PageTrimToggle) configV2PageTrimToggle.style.visibility = "hidden";
    return;
  }
  const rect = editor.getBoundingClientRect();
  const visible = rect.bottom > 0 && rect.top < window.innerHeight;
  if (!visible) {
    configV2ZoomControls.style.visibility = "hidden";
    if (configV2PageTrimToggle) configV2PageTrimToggle.style.visibility = "hidden";
    return;
  }
  const controlWidth = configV2ZoomControls.offsetWidth || 160;
  const visibleBottom = Math.min(rect.bottom, window.innerHeight - 12);
  const left = Math.max(12, Math.min(rect.left + 16, window.innerWidth - controlWidth - 12));
  const bottom = Math.max(12, window.innerHeight - visibleBottom + 14);
  configV2ZoomControls.style.setProperty("--config-v2-zoom-left", `${Math.round(left)}px`);
  configV2ZoomControls.style.setProperty("--config-v2-zoom-bottom", `${Math.round(bottom)}px`);
  configV2ZoomControls.style.visibility = "visible";
  if (configV2PageTrimToggle) {
    // 开关位于工作区右下角（editor 卡片右缘内侧）
    const trimWidth = configV2PageTrimToggle.offsetWidth || 140;
    const trimLeft = Math.max(12, Math.min(rect.right - trimWidth - 16, window.innerWidth - trimWidth - 12));
    configV2PageTrimToggle.style.setProperty("--config-v2-trim-left", `${Math.round(trimLeft)}px`);
    configV2PageTrimToggle.style.setProperty("--config-v2-zoom-bottom", `${Math.round(bottom)}px`);
    configV2PageTrimToggle.style.visibility = "visible";
  }
}

export function setConfigV2Zoom(nextZoom) {
  const clamped = Math.max(CONFIG_V2_ZOOM_MIN, Math.min(CONFIG_V2_ZOOM_MAX, nextZoom));
  configV2Zoom = Math.round(clamped * 10) / 10;
  const canvas = configV2EditorBody?.querySelector(".config-v2-editor-canvas");
  if (canvas) canvas.style.setProperty("--config-v2-zoom", String(configV2Zoom));
  updateConfigV2ZoomControls();
}

export function commitConfigV2TextEditor(editor) {
  const activeEditor = editor || configV2EditorBody?.querySelector(".config-v2-text-editor");
  if (!activeEditor) return false;
  const idx = parseInt(activeEditor.dataset.index);
  const col = parseInt(activeEditor.dataset.col || "0");
  let changed = false;
  if (!isNaN(idx) && configV2Elements[idx]) {
    const target = configV2Elements[idx];
    const prev = getTextCellContent(target, col);
    const nextValue = activeEditor.value;
    if (prev !== nextValue) {
      pushConfigV2History();
      setTextCellContent(target, col, nextValue);
      configV2Dirty = true;
  scheduleConfigV2AutoSave();
      changed = true;
    }
  }
  resetConfigV2Editing();
  updateConfigV2HistoryButtons();
  return changed;
}

export function normalizeConfigV2ElementsForSave(elements) {
  const metadataKeys = ["doc_name", "section_name", "template_id", "doc_images_dir", "base36_id", "source_path"];
  const defaults = {};
  (elements || []).forEach((el) => {
    if (!el || typeof el !== "object") return;
    metadataKeys.forEach((key) => {
      if (defaults[key] === undefined && el[key]) defaults[key] = el[key];
    });
  });
  return (elements || []).map((el, i) => {
    const next = { ...(el || {}) };
    next.index = i + 1;
    if (!next.type) next.type = next.src ? "image" : "text";
    // 2026-08-16：统一"行"模型——文本元素保存时确保带 cols
    normalizeTextElement(next);
    metadataKeys.forEach((key) => {
      if (!next[key] && defaults[key]) next[key] = defaults[key];
    });
    return next;
  });
}

export function getSourcePathFromElements(elements) {
  const found = (elements || []).find((el) => el && typeof el === "object" && el.source_path);
  return found ? found.source_path : "";
}

export function getFirstPageBreakAfterIndex(elements) {
  const idx = (elements || []).findIndex((el) => el && typeof el === "object" && el.page_break_before);
  return idx > 0 ? idx - 1 : -1;
}

export function renderConfigV2EditorItems(row) {
  if (!configV2EditorBody) return;
  const previousScrollTop = configV2EditorBody.scrollTop;
  const headingLabels = getHeadingLabelsForTemplate(configV2Elements, row ? row.templateId : "");
  const allowPageBreak = supportsManualPageBreak(row ? row.templateId : "");
  const tmpl = row ? getTemplateById(row.templateId) : null;
  const isTemplateD = !!(tmpl && tmpl.layoutMode === "templateD");
  const firstBreakAfterIdx = isTemplateD ? getFirstPageBreakAfterIndex(configV2Elements) : -1;
  if (configV2Elements.length === 0) {
    configV2EditorBody.innerHTML = `
      <div class="config-v2-empty">
        <strong>暂无可编辑元素</strong>
        <span>可以添加空行，或重新解析当前文件。</span>
      </div>
    `;
    bindConfigV2EditorInteractions();
    updateConfigV2HistoryButtons();
    return;
  }
  configV2FocusedIdx = Math.min(configV2FocusedIdx, configV2Elements.length - 1);
  const isEditingText = configV2EditingIdx >= 0;
  const rowsHtml = configV2Elements.map((el, i) => {
    const type = el.type === "image" ? "image" : "text";
    const focused = i === configV2FocusedIdx ? " focused" : "";
    const editingClass = isEditingText ? " editing-locked" : "";
    const hasBreakAfter = allowPageBreak && hasConfigV2BreakAfter(i);
    const breakClass = hasBreakAfter ? " has-page-break" : "";
    // 2026-08-22 用户确认：拖拽对象 = 块（文本格 / 图片），不是行。
    // 图片行与 1 格文本行本体可拖（= 拖其块）；多格行外壳不可拖（只能拖各格的 ⠿ 手柄）。
    const isMultiCell = type === "text" && getTextCols(el).length > 1;
    const draggableAttr = isEditingText || isMultiCell ? "false" : "true";
    const label = headingLabels[i] || "";
    const labelHtml = label ? `<div class="editor-label-col"><span class="editor-label-tag">${label}</span></div>` : `<div class="editor-label-col"></div>`;
    let contentHtml = "";
    if (type === "image") {
      // 2026-08-16：修复误报——configV2BrokenImages 里检查通过({valid:true})的记录
      // 也是 truthy 对象，之前会把完好图片也打上"已损坏"标签；只有 valid===false 才算损坏。
      const brokenEntry = el && el.src ? configV2BrokenImages[el.src] : null;
      const broken = brokenEntry && brokenEntry.valid === false ? brokenEntry : null;
      const brokenHtml = broken
        ? `<div class="config-v2-image-broken-tag" title="${escapeHtml(broken.error || "图片文件损坏")}">⚠ 图片损坏 · InDesign 无法读取</div>`
        : "";
      contentHtml = `<div class="editor-item-content image${broken ? " broken" : ""}"><img src="${API_BASE}/api/image?path=${encodeURIComponent(el.src || "")}" onerror="this.style.display='none'" />${brokenHtml}</div>`;
    } else if (type === "text") {
      // 2026-08-16：统一"行"模型——多格行渲染为行容器 + N 格（1 格保持现状外观）
      const cols = getTextCols(el);
      if (cols.length > 1) {
        const cellsHtml = cols.map((cell, k) => {
          const cellText = (cell && typeof cell === "object" ? cell.content : cell) || "";
          const editingThis = configV2EditingIdx === i && configV2EditingCol === k;
          const cellContentHtml = editingThis
            ? `<textarea class="editor-item-content text config-v2-text-editor" data-index="${i}" data-col="${k}">${escapeHtml(cellText)}</textarea>`
            : `<div class="editor-item-content text config-v2-row-cell-text" data-index="${i}" data-col="${k}">${escapeHtml(cellText.trim() || "\u200B")}</div>`;
          return `
            <div class="config-v2-row-cell${editingThis ? " editing" : ""}${i === configV2FocusedIdx ? " focused" : ""}" data-index="${i}" data-col="${k}">
              <span class="config-v2-row-cell-handle" title="拖动此块（左/右边缘并入列，中间合并；同行内可合并/重排）" draggable="${isEditingText ? "false" : "true"}">⠿</span>
              ${cellContentHtml}
              <div class="config-v2-row-cell-actions">
                <button class="config-v2-item-edit config-v2-row-cell-edit" data-index="${i}" data-col="${k}" title="编辑此格" type="button">✎</button>
                <button class="config-v2-item-cell-delete config-v2-row-cell-delete" data-index="${i}" data-col="${k}" title="删除此格" type="button">✕</button>
              </div>
            </div>`;
        }).join("");
        // 2026-08-22 用户确认：多格行总宽与单块行严格一致（含格间距）——
        // 每格宽 = (单块行总宽 - (N-1)×间距) / N；每格字号 = 内容区 / Z(N)，
        // 保证每格显示的字数量与真机排版（Z(N) 字/格）一致，通过缩小字号适配。
        const zMap = getCharsPerLine(row ? row.templateId : "");
        const zN = (zMap && zMap[cols.length]) || 13;
        const n = cols.length;
        const editorEl = document.querySelector(".config-v2-editor");
        const textMeasureEm = parseFloat(editorEl ? getComputedStyle(editorEl).getPropertyValue("--config-v2-text-measure") : "") || 26;
        const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const baseTotalPx = textMeasureEm * rootFont + 56; // 单块行总宽（内容 26em + 外壳 56px）
        const gapPx = 14; // 行内格间距（.is-row gap）
        const cellShellPx = 56; // 每格外壳（手柄 24 + 格内间距 8 + 内边距 22 + 边框 ≈ 56）
        const cellW = (baseTotalPx - (n - 1) * gapPx) / n;
        const contentW = cellW - cellShellPx;
        const cellFont = Math.max(9, contentW / zN);
        contentHtml = `<div class="config-v2-row-container" style="--row-cell-width:${cellW}px;--row-cell-content:${contentW}px;--row-cell-font:${cellFont}px">${cellsHtml}</div>`;
      } else if (configV2EditingIdx === i) {
        contentHtml = `<textarea class="editor-item-content text config-v2-text-editor" data-index="${i}" data-col="0">${escapeHtml(getTextCellContent(el, 0))}</textarea>`;
      } else {
        contentHtml = `<div class="editor-item-content text">${escapeHtml((getTextCellContent(el, 0) || "").trim() || "\u200B")}</div>`;
      }
    }
    const isFirstBreak = hasBreakAfter && i === firstBreakAfterIdx;
    const breakBubbleIcon = isFirstBreak ? TEMPLATE_D_CAKE_SVG : `<svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7z"></path><path d="M14 3v5h5"></path><path d="M9 13h8"></path></svg>`;
    const pageBreakHtml = hasBreakAfter ? `
      <div class="config-v2-page-break-marker${isFirstBreak ? " is-first-break" : ""}" data-break-after-index="${i}" draggable="${isEditingText ? "false" : "true"}" title="拖拽调整分页位置">
        <span class="config-v2-page-break-line" aria-hidden="true"></span>
        <span class="config-v2-page-break-bubble" aria-hidden="true">
          ${breakBubbleIcon}
        </span>
      </div>
    ` : "";
    const pageBreakIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"></path><path d="M14 3v5h5"></path><path d="M9 13h8"></path></svg>`;
    const pageBreakBtn = allowPageBreak && canBreakAfterConfigV2Index(i) ? `<button class="config-v2-item-page-break editor-item-page-break${hasBreakAfter ? " active" : ""}" data-index="${i}" title="${hasBreakAfter ? "取消下方分页" : "在下方分页"}" type="button">${isFirstBreak ? TEMPLATE_D_CAKE_SVG : pageBreakIcon}</button>` : "";
    return `
      <div class="config-v2-editor-row editor-row">
        ${labelHtml}
        <div class="config-v2-editor-item editor-item${focused}${editingClass}${breakClass}${type === "text" && getTextCols(el).length > 1 ? " is-row" : ""}${isMultiCell ? " no-drag" : ""}" data-index="${i}" draggable="${draggableAttr}">
          ${!isMultiCell ? `<span class="editor-item-handle">⠿</span>` : ""}
          ${contentHtml}
          <div class="editor-item-actions">
            <button class="config-v2-item-add editor-item-add" data-index="${i}" title="在下方添加空行" type="button">+</button>
            <button class="config-v2-item-image-add editor-item-image-add" data-index="${i}" title="在下方添加图片" type="button">🖼</button>
            ${type === "image" ? `<button class="config-v2-item-image-replace editor-item-image-replace" data-index="${i}" title="更换图片" type="button">↻</button>` : ""}
            ${pageBreakBtn}
            ${type === "text" ? `<button class="config-v2-item-edit editor-item-edit" data-index="${i}" title="编辑文本" type="button">✎</button>` : ""}
            <button class="config-v2-item-copy editor-item-copy" data-index="${i}" title="复制到下方" type="button">⧉</button>
            <button class="config-v2-item-delete editor-item-delete" data-index="${i}" title="删除" type="button">✕</button>
          </div>
          ${pageBreakHtml}
        </div>
      </div>
    `;
  }).join("");
  configV2EditorBody.innerHTML = `<div class="config-v2-editor-canvas" style="--config-v2-zoom:${configV2Zoom}">${rowsHtml}</div>`;
  bindConfigV2EditorInteractions();
  configV2EditorBody.scrollTop = previousScrollTop;
  updateConfigV2HistoryButtons();
  updateConfigV2ZoomControls();
  // 编辑元素增删后实时刷新图片列表（删除的组置灰、索引状态即时反映）
  renderConfigV2ImagePanel();
}

export function renderConfigV2Editor() {
  if (!configV2EditorBody) return;
  const row = getConfigV2SelectedRow();
  renderConfigV2TemplateMenu(row);
  if (!row) {
    if (configV2EditorTitle) configV2EditorTitle.textContent = "选择一个文件开始编辑";
    if (configV2EditorMeta) configV2EditorMeta.textContent = "未打开";
    configV2EditorBody.innerHTML = `
      <div class="config-v2-empty">
        <strong>还没有打开文件</strong>
        <span>从左侧选择文件，或把 docx / 图片拖到页面任意位置。</span>
      </div>
    `;
    [configV2AddLineBtn, configV2ReparseBtn, configV2ResetBreaksBtn, configV2UndoBtn, configV2RedoBtn].forEach((btn) => { if (btn) btn.disabled = true; });
    return;
  }
  if (configV2EditorTitle) configV2EditorTitle.textContent = getDisplayFileName(row.name);
  if (configV2EditorMeta) {
    const dirtyText = configV2Dirty ? " · 未保存" : "";
    configV2EditorMeta.textContent = `${row.genStatus || "未处理"}${dirtyText}`;
  }
  const cacheMissing = row.genStatus === "缓存丢失";
  if (configV2AddLineBtn) configV2AddLineBtn.disabled = !row.cachePath || cacheMissing;
  if (configV2ReparseBtn) configV2ReparseBtn.disabled = !row.templateId || row.genStatus === "解析中";
  if (configV2ResetBreaksBtn) configV2ResetBreaksBtn.disabled = !row.cachePath || cacheMissing || row.genStatus === "解析中" || !supportsManualPageBreak(row.templateId);
  updateConfigV2HistoryButtons();

  if (!row.templateId) {
    configV2EditorBody.innerHTML = `
      <div class="config-v2-empty">
        <strong>先选择模板</strong>
        <span>选择模板后会自动解析，并在这里显示可编辑顺序。</span>
      </div>
    `;
    return;
  }
  if (row.genStatus === "解析中") {
    configV2EditorBody.innerHTML = `<div class="config-v2-empty"><strong>解析中</strong><span>解析完成后会自动载入编辑内容。</span></div>`;
    return;
  }
  if (row.genStatus === "缓存丢失") {
    configV2EditorBody.innerHTML = `<div class="config-v2-empty"><strong>缓存丢失</strong><span>${escapeHtml(row.parseError || "核心缓存文件不存在，请重新解析当前文件。")}</span></div>`;
    return;
  }
  if (!row.cachePath) {
    configV2EditorBody.innerHTML = `<div class="config-v2-empty"><strong>还没有解析缓存</strong><span>点击重新解析生成可编辑内容。</span></div>`;
    return;
  }
  const key = configV2CacheKey(row);
  if (configV2LoadErrorKey === key) {
    configV2EditorBody.innerHTML = `<div class="config-v2-empty"><strong>加载失败</strong><span>${escapeHtml(configV2LoadErrorMessage)}</span></div>`;
    return;
  }
  if (configV2LoadedKey !== key) {
    if (configV2LoadingKey !== key) loadConfigV2Editor(row);
    configV2EditorBody.innerHTML = `<div class="config-v2-empty"><strong>加载中</strong><span>正在读取解析缓存。</span></div>`;
    return;
  }
  renderConfigV2EditorItems(row);
}

export function updateConfigV2ImageFloaterPosition() {
  const floater = document.getElementById("configV2ImageFloater");
  const work = document.querySelector(".config-v2-editor-work");
  if (!floater || !work || state.activeTab !== "config2" || floater.classList.contains("hidden")) return;
  const rect = work.getBoundingClientRect();
  if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
    floater.style.visibility = "hidden";
    return;
  }
  floater.style.visibility = "visible";
  const left = Math.max(12, Math.min(rect.left + 12, window.innerWidth - 260));
  const floaterHeight = document.getElementById("configV2ImageToggle")?.offsetHeight || 32;
  const workTop = rect.top + 8;
  const workBottom = rect.bottom - floaterHeight - 8;
  const top = Math.max(workTop, 12);
  if (top > workBottom || top + floaterHeight > window.innerHeight) {
    floater.style.visibility = "hidden";
    return;
  }
  // Follow the work area until reaching the viewport gap. Scrolling back removes
  // the clamp naturally and restores the original work-area-relative position.
  floater.style.left = `${Math.round(left)}px`;
  floater.style.top = `${Math.round(top)}px`;
}

export function updateConfigV2ImageDropdownHeight() {
  const dropdown = document.getElementById("configV2ImageDropdown");
  if (!dropdown) return;
  const maxH = Math.round(window.innerHeight / 2);
  dropdown.style.maxHeight = `${maxH}px`;
  updateConfigV2ImageMask();
}

export function updateConfigV2ImageMask() {
  const dropdown = document.getElementById("configV2ImageDropdown");
  if (!dropdown) return;
  const list = dropdown.querySelector(".config-v2-image-dropdown-list");
  if (!list) {
    dropdown.classList.remove("has-mask");
    return;
  }
  // 遮罩仅当列表溢出且未滚动到底时显示（滚动到底部最后一项应完全清晰）
  requestAnimationFrame(() => {
    const overflow = list.scrollHeight > list.clientHeight + 2;
    const nearBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 4;
    dropdown.classList.toggle("has-mask", overflow && !nearBottom);
  });
}

export function renderConfigV2ImagePanel() {
  const floater = document.getElementById("configV2ImageFloater");
  const toggle = document.getElementById("configV2ImageToggle");
  const dropdown = document.getElementById("configV2ImageDropdown");
  if (!floater || !toggle || !dropdown) return;
  const row = getConfigV2SelectedRow();
  const isSentence = !!row && row.templateId === "4_一句话";
  // fixed 定位会跨 tab 残留，仅在编辑 tab 显示
  const onConfigTab = state.activeTab === "config2";
  if (!onConfigTab || !isSentence || !Array.isArray(row.images) || row.images.length === 0) {
    floater.classList.add("hidden");
    return;
  }
  floater.classList.remove("hidden");
  updateConfigV2ImageFloaterPosition();
  updateConfigV2ImageDropdownHeight();
  const label = document.getElementById("configV2ImageToggleLabel");
  if (label) label.textContent = `图片列表（${row.images.length}）`;
  // 编辑器当前已加载的元素（按 source_path/src 匹配）决定列表项是否"仍在编辑列表内"：
  // 用户删除某组后（未重置前）该项置灰提示；按用户确认的模型，图+文都删除后
  // 重置 = 整组从索引移除（removed，源文件移走），不是恢复。
  const editorLoaded = Array.isArray(configV2Elements) && configV2Elements.length > 0;
  // 列表顺序与编辑区当前顺序一致：编辑区已加载时按其中 image 元素的出现顺序排列，
  // 已删除（不在编辑区）的组排到末尾置灰；编辑区未加载时回退到项目索引顺序。
  let ordered = row.images;
  if (editorLoaded) {
    const matchIdx = (p) => configV2Elements.findIndex(
      (el) => el && (el.source_path === p || el.src === p)
    );
    const inEditor = [];
    const removed = [];
    for (const p of row.images) {
      (matchIdx(p) >= 0 ? inEditor : removed).push(p);
    }
    inEditor.sort((a, b) => matchIdx(a) - matchIdx(b));
    ordered = inEditor.concat(removed);
  }
  // 重渲染前保存滚动位置，刷新后保持在原位
  const listEl = dropdown.querySelector(".config-v2-image-dropdown-list");
  const savedScrollTop = listEl ? listEl.scrollTop : 0;
  dropdown.innerHTML = `
    <div class="config-v2-image-dropdown-list">
      ${ordered.map((p, i) => {
        const stem = getFileName(p).replace(/\.[^.]+$/, "");
        const stillInEditor = !editorLoaded || configV2Elements.some(
          (el) => el && (el.source_path === p || el.src === p)
        );
        const removedClass = stillInEditor ? "" : " removed";
        const brokenEntry = configV2BrokenImages[p];
        const broken = brokenEntry && brokenEntry.valid === false ? brokenEntry : null;
        const brokenTag = broken
          ? `<span class="config-v2-image-card-tag broken" title="${escapeHtml(broken.error || "图片文件损坏")}">⚠ 图片损坏</span>`
          : "";
        return `
          <div class="config-v2-image-card${removedClass}${broken ? " is-broken" : ""}" data-path="${escapeHtml(p)}" title="${escapeHtml(stem)}">
            <img class="config-v2-image-thumb" src="${escapeHtml(`${API_BASE}/api/thumbnail?path=${encodeURIComponent(p)}`)}" alt="" loading="lazy"
                 onerror="this.classList.add('thumb-missing')">
            <div class="config-v2-image-card-body">
              <span class="config-v2-image-card-idx">${i + 1}</span>
              <span class="config-v2-image-card-name">${escapeHtml(stem)}</span>
              ${brokenTag}
              ${stillInEditor ? "" : `<span class="config-v2-image-card-tag">已删除 · 重置后移除</span>`}
            </div>
          </div>`;
    }).join("")}
    </div>`;
  // 恢复重渲染前的滚动位置，列表保持在原位
  const newListEl = dropdown.querySelector(".config-v2-image-dropdown-list");
  if (newListEl && savedScrollTop > 0) newListEl.scrollTop = savedScrollTop;
  updateConfigV2ImageMask();
}

export function updateConfigV2PageTrimVisibility() {
  if (!configV2PageTrimToggle) return;
  const row = getConfigV2SelectedRow();
  const isSentence = !!row && row.templateId === "4_一句话";
  const onConfigTab = state.activeTab === "config2";
  if (!onConfigTab || !isSentence) {
    configV2PageTrimToggle.classList.add("hidden");
    return;
  }
  configV2PageTrimToggle.classList.remove("hidden");
}

export function updateConfigV2PageTrimUI() {
  if (configV2PageTrimCheck) configV2PageTrimCheck.checked = !!state.pageTrimEnabled;
}

export function bindConfigV2PageTrimToggle() {
  if (!configV2PageTrimCheck) return;
  updateConfigV2PageTrimUI();
  configV2PageTrimCheck.addEventListener("change", async () => {
    const enabled = configV2PageTrimCheck.checked;
    try {
      await api.postConfig({ page_bottom_trim_px: enabled ? 60 : 0 });
      state.pageTrimEnabled = enabled;
      showFormatToast(enabled ? "已启用页尾均匀裁剪（除最后一页外，每页 -60px）" : "已关闭页尾均匀裁剪");
    } catch (err) {
      configV2PageTrimCheck.checked = !!state.pageTrimEnabled;
      showFormatToast(`设置失败: ${err}`);
    }
  });
  // 初始状态从服务端配置读取（默认启用 60px）
  api.getConfig()
    .then((cfg) => {
      const px = typeof cfg.page_bottom_trim_px === "number" ? cfg.page_bottom_trim_px : 60;
      state.pageTrimEnabled = px > 0;
      updateConfigV2PageTrimUI();
    })
    .catch(() => {});
}

export function bindConfigV2ImagePanel() {
  const dropdown = document.getElementById("configV2ImageDropdown");
  if (dropdown) {
    dropdown.addEventListener("scroll", updateConfigV2ImageMask, { passive: true, capture: true });
  }
  // 按钮与下拉卡片统一在此处理（2026-08-07 修复"按钮点击无反应"）。
  document.addEventListener("click", (e) => {
    const toggle = e.target.closest("#configV2ImageToggle");
    if (toggle) {
      const dropdown = document.getElementById("configV2ImageDropdown");
      if (!dropdown) return;
      const open = dropdown.classList.toggle("open");
      toggle.classList.toggle("open", open);
      toggle.title = open ? "折叠图片列表" : "展开图片列表";
      return;
    }
    const card = e.target.closest("#configV2ImageDropdown .config-v2-image-card");
    if (!card) return;
    if (card.classList.contains("removed")) return;
    const path = card.dataset.path;
    const row = getConfigV2SelectedRow();
    if (!row || !path) return;
    document.querySelectorAll("#configV2ImageDropdown .config-v2-image-card.active").forEach((el) => el.classList.remove("active"));
    card.classList.add("active");
    // 定位到编辑区中该图片对应的元素（source_path 或 src 匹配）
    const idx = configV2Elements.findIndex(
      (el) => el && (el.source_path === path || el.src === path)
    );
    if (idx < 0) return;
    configV2FocusedIdx = idx;
    renderConfigV2EditorItems(row);
    const canvas = configV2EditorBody?.querySelector(".config-v2-editor-canvas");
    const target = canvas?.querySelector(`.config-v2-editor-item[data-index="${idx}"]`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.remove("flash");
      void target.offsetWidth;
      target.classList.add("flash");
    }
  });
}

// 2026-08-25：待确认移除的文件（撤销窗口内）——关页/刷新时 sendBeacon 补删磁盘文件 + 补清关联事件
// key = rowId；value = { targets: 磁盘路径(移回收站), eventPaths: 事件关联路径(path/cachePath/images) }
const pendingRemovals = new Map();

export function removeConfigV2File(rowId) {
  if (!rowId) return;
  const row = state.files.find((item) => item.id === rowId);
  if (!row) return;
  const before = state.files.length;
  const removedIndex = state.files.findIndex((item) => item.id === rowId);
  state.files = state.files.filter((item) => item.id !== rowId);
  if (state.files.length === before) return;
  const wasSelected = state.configV2SelectedId === rowId;
  if (wasSelected) {
    state.configV2SelectedId = "";
    configV2Elements = [];
    configV2FocusedIdx = -1;
    resetConfigV2Editing();
    configV2LoadedKey = "";
    configV2LoadingKey = "";
    configV2LoadErrorKey = "";
    configV2LoadErrorMessage = "";
    configV2Dirty = false;
    resetConfigV2History();
  }
  ensureConfigV2Selection();
  renderHook();
  persistState();

  // 2026-08-25：撤销窗口——磁盘延迟删除。inputs 文件 10s 内可撤销，超时才真正移回收站；
  // 关页/刷新时用 sendBeacon 补删（列表已移除，磁盘也要清掉，避免下次解析重新出现）。
  // 2026-08-26：移除文件时联动清理该文件的事件记录（解析失败/排版失败/坏图），避免过期事件残留。
  const eventPaths = [row.path, row.cachePath, ...(Array.isArray(row.images) ? row.images : [])].filter(Boolean);
  const targets = isInputsPath(row.path)
    ? (Array.isArray(row.images) && row.images.length > 0 ? row.images : [row.path])
    : [];
  if (targets.length === 0) {
    // 非 inputs 文件：磁盘不动，但关联事件同样清理
    if (eventPaths.length > 0) api.removeEventsByFile(eventPaths).catch(() => {});
    showFormatToast("已移除文件");
    return;
  }
  pendingRemovals.set(rowId, { targets, eventPaths });
  showFormatToastAction(`已移除「${getDisplayFileName(row.name)}」`, {
    actionLabel: "撤销",
    duration: 10000,
    onAction: () => {
      pendingRemovals.delete(rowId);
      // 恢复到原位置（越界则末尾）
      const insertAt = Math.min(removedIndex, state.files.length);
      state.files.splice(insertAt, 0, row);
      if (wasSelected) state.configV2SelectedId = rowId;
      ensureConfigV2Selection();
      renderHook();
      persistState();
      showFormatToast(`已恢复「${getDisplayFileName(row.name)}」`);
    },
    onTimeout: () => {
      const record = pendingRemovals.get(rowId);
      if (record) {
        pendingRemovals.delete(rowId);
        record.targets.forEach((p) => api.removeInput(p).catch(() => {}));
        if (record.eventPaths.length > 0) api.removeEventsByFile(record.eventPaths).catch(() => {});
      }
    }
  });
}

export async function loadConfigV2Editor(row) {
  if (!row || !row.cachePath) return;
  const key = configV2CacheKey(row);
  configV2LoadingKey = key;
  try {
    const result = await api.getCacheJson(row.cachePath);
    if (configV2CacheKey(getConfigV2SelectedRow()) !== key) return;
    if (result.cache_path && result.cache_path !== row.cachePath) {
      row.cachePath = result.cache_path;
      persistState();
    }
    configV2Elements = Array.isArray(result.elements) ? result.elements.slice() : [];
    // 2026-08-16：统一"行"模型归一化——旧缓存文本元素无 cols → 补 1 格
    configV2Elements.forEach((el) => normalizeTextElement(el));
    // 2026-08-15：并行检查缓存中所有图片是否完整可解码（截断/损坏图
    // 浏览器能显示但 InDesign place() 报 "Unable to read JPEG"），
    // 结果存入 configV2BrokenImages 供编辑器/图片面板提醒。
    configV2BrokenImages = {};
    {
      const imagePaths = configV2Elements
        .filter((el) => el && typeof el === "object" && el.type === "image" && el.src)
        .map((el) => el.src);
      const uniquePaths = [...new Set(imagePaths)];
      await Promise.all(uniquePaths.map(async (p) => {
        try {
          const r = await api.checkImage(p);
          if (!r.valid) configV2BrokenImages[p] = { valid: false, error: r.detail || "图片文件损坏" };
        } catch (_) {
          // 检测失败不阻塞编辑
        }
      }));
    }
    const sourcePath = result.source_path || getSourcePathFromElements(configV2Elements);
    if (sourcePath && row.sourcePath !== sourcePath) {
      row.sourcePath = sourcePath;
      persistState();
    }
    if (supportsManualPageBreak(row.templateId) && !configV2Elements.some((el) => el && el.page_break_before)) {
      try {
        const breakResult = await api.getPageBreaks(row.cachePath);
        if (breakResult.exists !== false) {
          applyConfigV2PageBreakIndexes(Array.isArray(breakResult.auto_break_indices) ? breakResult.auto_break_indices : []);
        }
      } catch (_) {
      }
    }
    configV2FocusedIdx = -1;
    resetConfigV2Editing();
    configV2Dirty = false;
    resetConfigV2History();
    configV2LoadedKey = configV2CacheKey(row);
    configV2LoadErrorKey = "";
    configV2LoadErrorMessage = "";
  } catch (err) {
    configV2LoadErrorKey = key;
    configV2LoadErrorMessage = String(err);
  } finally {
    if (configV2LoadingKey === key) configV2LoadingKey = "";
    renderConfigV2Hook();
  }
}

export function selectConfigV2Row(rowId) {
  if (!rowId || rowId === state.configV2SelectedId) return;
  commitConfigV2TextEditor();
  // 2026-08-25：自动保存——切换行前把旧行未保存修改立即落盘。
  // 必须用快照（row/elements）：schedule(0) 会在 selectedId 切换后才执行，会误存空元素到新行。
  if (configV2Dirty) {
    const snapshotRow = getConfigV2SelectedRow();
    const snapshotElements = configV2Elements.slice();
    saveConfigV2Editor({ silent: true, row: snapshotRow, elements: snapshotElements });
  }
  state.configV2SelectedId = rowId;
  configV2Elements = [];
  configV2FocusedIdx = -1;
  resetConfigV2Editing();
  configV2LoadedKey = "";
  configV2LoadingKey = "";
  configV2LoadErrorKey = "";
  configV2LoadErrorMessage = "";
  configV2Dirty = false;
  resetConfigV2History();
  renderConfigV2Hook();
  persistState();
}

export async function changeConfigV2Template(row, templateId) {
  if (!row || row.templateId === templateId) return;
  if (row.lockedTemplate && templateId !== row.templateId) return;
  commitConfigV2TextEditor();
  if (configV2Dirty && !confirm("切换模板将重新解析文档，未保存的调整会丢失。是否继续？")) return;
  row.templateId = templateId;
  row.cachePath = null;
  row.genStatus = row.supported ? "未处理" : "不匹配";
  row.parseError = null;
  row.outputPath = null;
  row.outputDismissed = false;
  row.activeTaskId = null;
  configV2Elements = [];
  configV2FocusedIdx = -1;
  resetConfigV2Editing();
  configV2LoadedKey = "";
  configV2LoadErrorKey = "";
  configV2LoadErrorMessage = "";
  configV2Dirty = false;
  resetConfigV2History();
  renderHook();
  persistState();
  if (templateId) {
    await parseFileRow(row, true);
    if (row.id === state.configV2SelectedId && row.cachePath) await loadConfigV2Editor(row);
  }
}

export async function reparseConfigV2Selected() {
  const row = getConfigV2SelectedRow();
  if (!row || !row.templateId) return;
  commitConfigV2TextEditor();
  if (configV2Dirty) {
    // 先保存当前编辑内容（含删除/顺序调整），reparse 再按当前列表重建，被删除的记录不会复活
    configV2Elements = normalizeConfigV2ElementsForSave(configV2Elements);
    try {
      const saved = await api.saveCacheJson(row.cachePath, configV2Elements);
      if (saved.cache_path && saved.cache_path !== row.cachePath) {
        row.cachePath = saved.cache_path;
        persistState();
      }
      configV2Dirty = false;
    } catch (err) {
      showFormatToast(`保存失败，无法重新解析: ${err}`);
      return;
    }
  }
  configV2Elements = [];
  configV2FocusedIdx = -1;
  resetConfigV2Editing();
  configV2LoadedKey = "";
  configV2LoadErrorKey = "";
  configV2LoadErrorMessage = "";
  resetConfigV2History();
  await parseFileRow(row, true);
  if (row.cachePath) await loadConfigV2Editor(row);
}

export async function saveConfigV2Editor(options = {}) {
  const silent = !!options.silent;
  // 2026-08-25：支持快照保存（切换行场景）——row/elements 传入后不依赖当前选中行，
  // 避免 selectedId 已切换/元素已清空时误存空内容到新行。
  const row = options.row || getConfigV2SelectedRow();
  const elements = options.elements || configV2Elements;
  if (!row || !row.cachePath) return;
  commitConfigV2TextEditor();
  try {
    const dataToSave = normalizeConfigV2ElementsForSave(elements);
    // 普通保存（未传快照）才同步 configV2Elements；快照保存不碰当前编辑区
    if (elements === configV2Elements) {
      configV2Elements = dataToSave;
    }
    const result = await api.saveCacheJson(row.cachePath, dataToSave);
    if (result.cache_path && result.cache_path !== row.cachePath) {
      row.cachePath = result.cache_path;
      configV2LoadedKey = configV2CacheKey(row);
      persistState();
    }
    configV2Dirty = false;
    if (!silent) showFormatToast("编辑内容已保存");
    renderConfigV2Hook();
  } catch (err) {
    showFormatToast(`保存失败: ${err}`);
  }
}

// 2026-08-25：自动保存——修改后防抖 1.5s 静默落盘（缓存 JSON）。
// 调用点：所有 configV2Dirty = true 之后（文本/拖拽/加图/删图/分页/撤销重做）。
let configV2AutoSaveTimer = null;
export function scheduleConfigV2AutoSave(delay = 1500) {
  if (configV2AutoSaveTimer) clearTimeout(configV2AutoSaveTimer);
  configV2AutoSaveTimer = setTimeout(() => {
    configV2AutoSaveTimer = null;
    if (configV2Dirty) {
      saveConfigV2Editor({ silent: true });
    }
  }, delay);
}

export async function resetConfigV2PageBreaksToAuto() {
  const row = getConfigV2SelectedRow();
  if (!row || !row.cachePath || !supportsManualPageBreak(row.templateId)) return;
  commitConfigV2TextEditor();
  if (configV2ResetBreaksBtn) configV2ResetBreaksBtn.disabled = true;
  try {
    const result = await api.recalculatePageBreaks(row.cachePath, row.templateId);
    if (result.note) {
      showFormatToast(result.note);
      return;
    }
    const indexes = Array.isArray(result.page_breaks) ? result.page_breaks : [];
    pushConfigV2History();
    applyConfigV2PageBreakIndexes(indexes);
    configV2FocusedIdx = -1;
    resetConfigV2Editing();
    configV2Dirty = true;
  scheduleConfigV2AutoSave();
    renderConfigV2EditorItems(row);
    renderConfigV2Editor();
    showFormatToast(indexes.length > 0 ? `已按模板样式计算 ${indexes.length} 个分页点` : "内容可在单页内放下，无分页点");
  } catch (err) {
    showFormatToast(`重置分页失败: ${err.message || err}`);
  } finally {
    if (configV2ResetBreaksBtn) configV2ResetBreaksBtn.disabled = false;
  }
}

export function autoSizeConfigV2TextEditor(editor) {
  if (!editor) return;
  // 编辑模式下高度随内容自适应，避免 textarea 固定矮高度（与普通文本 div 一致）
  editor.style.height = "auto";
  editor.style.height = editor.scrollHeight + "px";
}

export function addConfigV2Line(afterIdx = null) {
  const row = getConfigV2SelectedRow();
  if (!row || !row.cachePath) return;
  commitConfigV2TextEditor();
  pushConfigV2History();
  const gaps = snapshotPageBreakGaps();
  const baseIdx = Number.isInteger(afterIdx) ? afterIdx : configV2FocusedIdx;
  const insertAt = baseIdx >= 0 && baseIdx < configV2Elements.length ? baseIdx + 1 : configV2Elements.length;
  configV2Elements.splice(insertAt, 0, { type: "text", content: "" });
  relocatePageBreakGaps(gaps, [{ type: "insert", at: insertAt }]);
  configV2FocusedIdx = insertAt;
  configV2Dirty = true;
  scheduleConfigV2AutoSave();
  renderConfigV2EditorItems(row);
}

export function openConfigV2ImagePicker(mode, index) {
  const row = getConfigV2SelectedRow();
  if (!row || !row.cachePath) return;
  commitConfigV2TextEditor();
  if (!configV2ImagePickerInput) {
    configV2ImagePickerInput = document.createElement("input");
    configV2ImagePickerInput.type = "file";
    configV2ImagePickerInput.accept = "image/png,image/jpeg,image/webp,image/gif";
    configV2ImagePickerInput.style.display = "none";
    document.body.appendChild(configV2ImagePickerInput);
    configV2ImagePickerInput.addEventListener("change", async () => {
      const file = configV2ImagePickerInput.files && configV2ImagePickerInput.files[0];
      configV2ImagePickerInput.value = "";
      if (!file) return;
      const pendingMode = configV2ImagePickerMode;
      const pendingIndex = configV2ImagePickerIndex;
      configV2ImagePickerMode = null;
      configV2ImagePickerIndex = null;
      await handleConfigV2ImagePicked(file, pendingMode, pendingIndex);
    });
  }
  configV2ImagePickerMode = mode;
  configV2ImagePickerIndex = index;
  configV2ImagePickerInput.click();
}

export async function handleConfigV2ImagePicked(file, mode, index) {
  const row = getConfigV2SelectedRow();
  if (!row || !row.cachePath) return;
  if (!configV2ImagePickerInput) return;
  showFormatToast(`正在上传 ${file.name}…`);
  try {
    const result = await api.upload(file, row.templateId);
    const src = result && result.path;
    if (!src) {
      showFormatToast(`上传失败: ${(result && result.error) || "未知错误"}`);
      return;
    }
    pushConfigV2History();
    if (mode === "replace" && Number.isInteger(index) && configV2Elements[index] && configV2Elements[index].type === "image") {
      configV2Elements[index].src = src;
      configV2FocusedIdx = index;
    } else {
      const baseIdx = Number.isInteger(index) ? index : configV2FocusedIdx;
      const insertAt = baseIdx >= 0 && baseIdx < configV2Elements.length ? baseIdx + 1 : configV2Elements.length;
      const gaps = snapshotPageBreakGaps();
      configV2Elements.splice(insertAt, 0, { type: "image", src });
      relocatePageBreakGaps(gaps, [{ type: "insert", at: insertAt }]);
      configV2FocusedIdx = insertAt;
    }
    configV2Dirty = true;
  scheduleConfigV2AutoSave();
    // 新图可能损坏：重新检查并标记（避免 InDesign 排版时才失败）
    delete configV2BrokenImages[src];
    api.checkImage(src).then((r) => {
      if (r && r.valid === false) {
        configV2BrokenImages[src] = { valid: false, error: r.detail || "图片文件损坏" };
      } else {
        // 检查通过：删除残留记录，避免渲染时误判为损坏（见 renderConfigV2EditorItems）
        delete configV2BrokenImages[src];
      }
      renderConfigV2EditorItems(row);
    }).catch(() => {});
    renderConfigV2EditorItems(row);
    showFormatToast(mode === "replace" ? "图片已更换，记得保存" : "图片已添加，记得保存");
  } catch (err) {
    showFormatToast(`上传失败: ${err.message || err}`);
  }
}

export function bindConfigV2EditorInteractions() {
  const body = configV2EditorBody;
  if (!body || body.dataset.configV2Bound === "1") return;
  body.dataset.configV2Bound = "1";
  let dragIdx = -1;
  let dragCol = -1;
  let dragIsImage = false;
  let dragBreakAfterIdx = -1;
  let pointerDownInsideEditor = false;

  // 三区落点（2026-08-22 用户确认）：按目标矩形比例划分——
  // 左 1/5 = 并入为列（插前）、右 1/5 = 并入为列（插后）、中间 3/5 = 合并内容。
  const DROP_EDGE_RATIO = 0.2;

  // 判断指针相对目标矩形处于哪个落区：left / merge / right
  const getDropZone = (clientX, rect) => {
    const band = rect.width * DROP_EDGE_RATIO;
    if (clientX < rect.left + band) return "left";
    if (clientX > rect.right - band) return "right";
    return "merge";
  };

  // 找指针下的文本元素 + 落点格 + 落区（图片/非文本返回 null）
  const getDropTarget = (clientX, clientY) => {
    const hit = document.elementFromPoint(clientX, clientY);
    const item = hit ? hit.closest(".config-v2-editor-item") : null;
    if (item) {
      const idx = parseInt(item.dataset.index);
      if (isNaN(idx) || !isTextEditorElement(configV2Elements[idx])) return null;
      let cellEl = hit.closest(".config-v2-row-cell");
      // 2026-08-22 修复：悬停多格行外壳/格间隙时，按水平距离取最近格，
      // 避免 col 默认 0 导致并入/合并落到错误的格。
      if (!cellEl && getTextColCount(configV2Elements[idx]) > 1) {
        let bestCell = null;
        let bestDist = Infinity;
        body.querySelectorAll(`.config-v2-row-cell[data-index="${idx}"]`).forEach((c) => {
          const r = c.getBoundingClientRect();
          const dist = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
          if (dist < bestDist) { bestDist = dist; bestCell = c; }
        });
        if (bestCell) cellEl = bestCell;
      }
      let col = 0;
      if (cellEl) {
        const c = parseInt(cellEl.dataset.col);
        if (!isNaN(c)) col = c;
      }
      const rect = cellEl ? cellEl.getBoundingClientRect() : item.getBoundingClientRect();
      return { idx, col, zone: getDropZone(clientX, rect) };
    }
    // 行间隙容差：指针落在行间空隙时，找垂直方向 ±10px 内的文本行，
    // 且水平位置在其左/右边缘带内 → 视为该行的边缘落点（只产生并列插入，
    // 不产生合并）。解决"并入相邻行时鼠标稍微偏进间隙就变成移动"的问题。
    const GAP_TOLERANCE_PX = 10;
    let best = null;
    body.querySelectorAll(".config-v2-editor-item").forEach((el) => {
      const idx = parseInt(el.dataset.index);
      if (isNaN(idx) || !isTextEditorElement(configV2Elements[idx]) || idx === dragIdx) return;
      const r = el.getBoundingClientRect();
      if (clientY < r.top - GAP_TOLERANCE_PX || clientY > r.bottom + GAP_TOLERANCE_PX) return;
      const band = r.width * DROP_EDGE_RATIO;
      const zone = clientX < r.left + band ? "left" : clientX > r.right - band ? "right" : null;
      if (!zone) return;
      const dist = Math.abs((r.top + r.bottom) / 2 - clientY);
      if (!best || dist < best.dist) best = { idx, zone, dist };
    });
    if (!best) return null;
    const colCount = getTextColCount(configV2Elements[best.idx]);
    return { idx: best.idx, col: best.zone === "left" ? 0 : Math.max(colCount - 1, 0), zone: best.zone };
  };

  // 取出源格。多格行 = 移除该格（源行保留，removedRow=false）；
  // 单格行 = 整行从数组移走并返回原元素对象（保留 page_break_before 等字段，
  // removedRow=true——调用方后续索引需按"源行已移除"调整）。
  const takeDraggedCell = () => {
    const srcEl = configV2Elements[dragIdx];
    const cols = getTextCols(srcEl);
    const content = getTextCellContent(srcEl, dragCol);
    if (cols.length > 1) {
      cols.splice(dragCol, 1);
      normalizeTextElement(srcEl);
      return { el: null, content, removedRow: false };
    }
    configV2Elements.splice(dragIdx, 1);
    return { el: srcEl, content, removedRow: true };
  };

  // 由取出结果构造落点元素：整行移走时复用原对象，拖格出行时新建 1 格元素
  const buildCellRowElement = (taken) => {
    if (taken.el) return taken.el;
    const el = { type: "text", cols: [{ content: taken.content }] };
    normalizeTextElement(el);
    return el;
  };

  // 格内容并入目标行（zone left/right）。调用方保证未满 3 格；
  // targetEl 必须在源移除前按引用捕获（索引会失效）。
  const joinCellIntoRow = (targetEl, target, content) => {
    const tCols = getTextCols(targetEl);
    const insertAt = Math.min(Math.max(target.zone === "left" ? target.col : target.col + 1, 0), tCols.length);
    tCols.splice(insertAt, 0, { content });
  };

  // 格内容合并进目标格（中间落区）。docOrderFromFirst = 被拖格在文档中位于目标之前
  // （沿用旧 mergeTextEditorElements 的文档序拼接：前段去尾部换行）。
  const mergeCellInto = (targetEl, target, content, docOrderFromFirst) => {
    const tCols = getTextCols(targetEl);
    if (!tCols[target.col]) tCols[target.col] = {};
    const existing = tCols[target.col].content || "";
    tCols[target.col].content = docOrderFromFirst
      ? `${trimTrailingLineBreaks(content)}${existing}`
      : `${trimTrailingLineBreaks(existing)}${content}`;
    normalizeTextElement(targetEl);
  };

  // 格落两行之间成为 1 格行。toIdx 由调用方按"源行是否已移除"预调整；
  // el 来自 buildCellRowElement（整行移动时即原对象，元数据保留）。
  const insertDraggedCellAsRow = (el, toIdx) => {
    const insertAt = Math.min(Math.max(toIdx, 0), configV2Elements.length);
    configV2Elements.splice(insertAt, 0, el);
    configV2FocusedIdx = insertAt;
  };

  // 列插入高亮（左/右边缘）。2026-08-22 用户确认：满 3 格不再画红线，
  // 由 dragover 检测后在光标旁显示提示气泡。
  const clearColumnTargets = () => body.querySelectorAll(".config-v2-column-target").forEach((el) => el.classList.remove("config-v2-column-target", "col-left", "col-right"));
  const highlightColumnTarget = (target) => {
    let el = body.querySelector(`.config-v2-row-cell[data-index="${target.idx}"][data-col="${target.col}"]`);
    if (!el) el = body.querySelector(`.config-v2-editor-item[data-index="${target.idx}"]`);
    if (!el) return;
    el.classList.add("config-v2-column-target", target.zone === "left" ? "col-left" : "col-right");
  };

  // 光标旁提示气泡（满 3 格拒绝并入）
  const dropHintEl = document.createElement("div");
  dropHintEl.className = "config-v2-drop-hint";
  dropHintEl.style.display = "none";
  document.body.appendChild(dropHintEl);
  const showDropHint = (text, clientX, clientY) => {
    dropHintEl.textContent = text;
    dropHintEl.style.display = "block";
    dropHintEl.style.left = `${clientX}px`;
    dropHintEl.style.top = `${clientY}px`;
  };
  const hideDropHint = () => { dropHintEl.style.display = "none"; };

  const getInsertIdx = (clientY) => {
    const rows = body.querySelectorAll(".config-v2-editor-row");
    for (let i = 0; i < rows.length; i += 1) {
      const rect = rows[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return rows.length;
  };

  const clearIndicators = () => document.querySelectorAll(".config-v2-drag-indicator").forEach((el) => el.remove());
  const clearMergeTargets = () => body.querySelectorAll(".config-v2-editor-item.merge-target, .config-v2-row-cell.merge-target").forEach((el) => el.classList.remove("merge-target"));
  const updateIndicator = (clientY) => {
    clearIndicators();
    const rows = body.querySelectorAll(".config-v2-editor-row");
    const canvas = body.querySelector(".config-v2-editor-canvas") || body;
    const idx = getInsertIdx(clientY);
    const indicator = document.createElement("div");
    indicator.className = "config-v2-drag-indicator drag-indicator";
    if (idx < rows.length) rows[idx].parentNode.insertBefore(indicator, rows[idx]);
    else canvas.appendChild(indicator);
  };
  const getBreakAfterIdx = (clientY) => {
    const rows = body.querySelectorAll(".config-v2-editor-row");
    if (rows.length <= 1) return -1;
    for (let i = 0; i < rows.length; i += 1) {
      const rect = rows[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return clampConfigV2BreakAfterIndex(i - 1);
      if (clientY < rect.bottom) return clampConfigV2BreakAfterIndex(i);
    }
    return clampConfigV2BreakAfterIndex(rows.length - 2);
  };
  const updateBreakIndicator = (clientY) => {
    clearIndicators();
    const rows = body.querySelectorAll(".config-v2-editor-row");
    const canvas = body.querySelector(".config-v2-editor-canvas") || body;
    const afterIdx = getBreakAfterIdx(clientY);
    if (!canBreakAfterConfigV2Index(afterIdx)) return;
    const indicator = document.createElement("div");
    indicator.className = "config-v2-drag-indicator config-v2-break-drag-indicator drag-indicator";
    if (afterIdx < rows.length - 1 && rows[afterIdx + 1]) {
      rows[afterIdx + 1].parentNode.insertBefore(indicator, rows[afterIdx + 1]);
    } else {
      canvas.appendChild(indicator);
    }
  };

  body.addEventListener("pointerdown", () => {
    pointerDownInsideEditor = true;
    window.setTimeout(() => { pointerDownInsideEditor = false; }, 0);
  }, true);

  body.addEventListener("click", (e) => {
    // 点击正在编辑的 textarea 内部（移动光标/选字/换行）：不触发重建，避免失焦
    if (e.target.closest(".config-v2-text-editor")) return;
    const hadStaleTextEditor = !!body.querySelector(".config-v2-text-editor");
    const addBtn = e.target.closest(".config-v2-item-add");
    if (addBtn) {
      const idx = parseInt(addBtn.dataset.index);
      if (!isNaN(idx)) addConfigV2Line(idx);
      return;
    }
    const imageAddBtn = e.target.closest(".config-v2-item-image-add");
    if (imageAddBtn) {
      const idx = parseInt(imageAddBtn.dataset.index);
      if (!isNaN(idx)) openConfigV2ImagePicker("add", idx);
      return;
    }
    const imageReplaceBtn = e.target.closest(".config-v2-item-image-replace");
    if (imageReplaceBtn) {
      const idx = parseInt(imageReplaceBtn.dataset.index);
      if (!isNaN(idx)) openConfigV2ImagePicker("replace", idx);
      return;
    }
    const pageBreakBtn = e.target.closest(".config-v2-item-page-break");
    if (pageBreakBtn) {
      const row = getConfigV2SelectedRow();
      if (!row || !supportsManualPageBreak(row.templateId)) return;
      const idx = parseInt(pageBreakBtn.dataset.index);
      if (!isNaN(idx) && canBreakAfterConfigV2Index(idx)) {
        pushConfigV2History();
        setConfigV2BreakAfter(idx, !hasConfigV2BreakAfter(idx));
        configV2Dirty = true;
  scheduleConfigV2AutoSave();
        configV2FocusedIdx = idx;
        renderConfigV2EditorItems(row);
      }
      return;
    }
    const deleteBtn = e.target.closest(".config-v2-item-delete");
    if (deleteBtn) {
      const idx = parseInt(deleteBtn.dataset.index);
      if (!isNaN(idx)) {
        pushConfigV2History();
        const gaps = snapshotPageBreakGaps();
        configV2Elements.splice(idx, 1);
        relocatePageBreakGaps(gaps, [{ type: "remove", at: idx }]);
        configV2FocusedIdx = -1;
        configV2Dirty = true;
  scheduleConfigV2AutoSave();
        renderConfigV2EditorItems(getConfigV2SelectedRow());
      }
      return;
    }
    const copyBtn = e.target.closest(".config-v2-item-copy");
    if (copyBtn) {
      const idx = parseInt(copyBtn.dataset.index);
      if (!isNaN(idx) && configV2Elements[idx]) {
        pushConfigV2History();
        const gaps = snapshotPageBreakGaps();
        configV2Elements.splice(idx + 1, 0, cloneEditorElement(configV2Elements[idx]));
        relocatePageBreakGaps(gaps, [{ type: "insert", at: idx + 1 }]);
        configV2FocusedIdx = idx + 1;
        configV2Dirty = true;
  scheduleConfigV2AutoSave();
        renderConfigV2EditorItems(getConfigV2SelectedRow());
      }
      return;
    }
    const editBtn = e.target.closest(".config-v2-item-edit");
    if (editBtn) {
      const idx = parseInt(editBtn.dataset.index);
      if (!isNaN(idx) && isTextEditorElement(configV2Elements[idx])) {
        const col = parseInt(editBtn.dataset.col || "0");
        configV2EditingIdx = idx;
        configV2EditingCol = Number.isInteger(col) && col >= 0 ? col : 0;
        configV2FocusedIdx = idx;
        renderConfigV2EditorItems(getConfigV2SelectedRow());
        const editor = body.querySelector(`.config-v2-text-editor[data-index="${idx}"]`);
        if (editor) {
          autoSizeConfigV2TextEditor(editor);
          editor.focus();
          editor.setSelectionRange(editor.value.length, editor.value.length);
        }
      }
      return;
    }
    const cellDeleteBtn = e.target.closest(".config-v2-item-cell-delete");
    if (cellDeleteBtn) {
      const idx = parseInt(cellDeleteBtn.dataset.index);
      const col = parseInt(cellDeleteBtn.dataset.col);
      if (!isNaN(idx) && !isNaN(col) && isTextEditorElement(configV2Elements[idx])) {
        const cols = getTextCols(configV2Elements[idx]);
        if (cols.length > 1 && col >= 0 && col < cols.length) {
          pushConfigV2History();
          cols.splice(col, 1);
          // 剩 1 格 = 正常 1 格行（统一模型，无降级特判）
          normalizeTextElement(configV2Elements[idx]);
          configV2Dirty = true;
  scheduleConfigV2AutoSave();
          configV2FocusedIdx = idx;
          resetConfigV2Editing();
          renderConfigV2EditorItems(getConfigV2SelectedRow());
        }
      }
      return;
    }
    const item = e.target.closest(".config-v2-editor-item");
    if (!item) {
      configV2FocusedIdx = -1;
      if (hadStaleTextEditor) renderConfigV2EditorItems(getConfigV2SelectedRow());
      else body.querySelectorAll(".config-v2-editor-item, .config-v2-row-cell").forEach((el) => el.classList.remove("focused"));
      return;
    }
    configV2FocusedIdx = parseInt(item.dataset.index);
    if (hadStaleTextEditor) {
      renderConfigV2EditorItems(getConfigV2SelectedRow());
    } else {
      body.querySelectorAll(".config-v2-editor-item, .config-v2-row-cell").forEach((el) => el.classList.remove("focused"));
      item.classList.add("focused");
      // 2026-08-22 修复：多格行外壳透明——选中反馈落到行内各格上
      item.querySelectorAll(".config-v2-row-cell").forEach((c) => c.classList.add("focused"));
    }
  });

  body.addEventListener("focusout", (e) => {
    const editor = e.target.closest(".config-v2-text-editor");
    if (!editor) return;
    commitConfigV2TextEditor(editor);
    if (!pointerDownInsideEditor) {
      renderConfigV2EditorItems(getConfigV2SelectedRow());
    }
  });

  body.addEventListener("input", (e) => {
    const editor = e.target.closest(".config-v2-text-editor");
    if (!editor) return;
    autoSizeConfigV2TextEditor(editor);
  });

  body.addEventListener("dragstart", (e) => {
    if (configV2EditingIdx >= 0) { e.preventDefault(); return; } // 编辑态：阻止原生拖拽（如 img）
    const breakMarker = e.target.closest(".config-v2-page-break-marker");
    if (breakMarker) {
      dragBreakAfterIdx = parseInt(breakMarker.dataset.breakAfterIndex);
      breakMarker.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `break:${dragBreakAfterIdx}`);
      if (typeof e.dataTransfer.setDragImage === "function") {
        e.dataTransfer.setDragImage(breakMarker, 0, 0);
      }
      return;
    }
    const item = e.target.closest(".config-v2-editor-item");
    if (!item || e.target.closest(".config-v2-text-editor") || e.target.closest(".config-v2-item-add") || e.target.closest(".config-v2-item-image-add") || e.target.closest(".config-v2-item-image-replace") || e.target.closest(".config-v2-item-page-break") || e.target.closest(".config-v2-item-delete") || e.target.closest(".config-v2-item-copy") || e.target.closest(".config-v2-item-edit") || e.target.closest(".config-v2-row-cell-edit") || e.target.closest(".config-v2-row-cell-delete")) {
      e.preventDefault(); // 非块拖拽入口：阻止浏览器原生拖拽
      return;
    }
    dragIdx = parseInt(item.dataset.index);
    const dragEl = configV2Elements[dragIdx];
    // 2026-08-22 用户确认：拖拽对象 = 块（文本格 / 图片），不是行。
    // 视觉与拖影只加在被拖的块元素上，不波及同行的其他块与分页分割线。
    const cellHandle = e.target.closest(".config-v2-row-cell-handle");
    let dragVisual = null;
    if (cellHandle) {
      // 文本格（块）拖动：三区语义
      const cellEl = cellHandle.closest(".config-v2-row-cell");
      dragCol = cellEl ? parseInt(cellEl.dataset.col) : 0;
      dragVisual = cellEl;
    } else if (isTextEditorElement(dragEl)) {
      const cols = getTextCols(dragEl);
      if (cols.length > 1) { e.preventDefault(); return; } // 多格行外壳：不拖（只能拖各格的 ⠿ 手柄）
      dragCol = 0; // 1 格文本行：拖其唯一格
      dragVisual = item.querySelector(".editor-item-content") || item;
    } else {
      // 图片块：独立块拖拽（插入线重排，不参与文本三区并入/合并）
      dragCol = -1;
      dragIsImage = true;
      dragVisual = item.querySelector(".editor-item-content") || item;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragIsImage ? `img:${dragIdx}` : `cell:${dragIdx}:${dragCol}`);
    // 2026-08-22 修复：先拍拖影再变暗——否则拖影是半透明块
    if (typeof e.dataTransfer.setDragImage === "function") {
      e.dataTransfer.setDragImage(dragVisual, 0, 0);
    }
    dragVisual.classList.add("dragging");
  });

  body.addEventListener("dragend", () => {
    hideDropHint();
    body.querySelectorAll(".config-v2-editor-item, .config-v2-row-cell, .editor-item-content").forEach((el) => el.classList.remove("dragging"));
    body.querySelectorAll(".config-v2-page-break-marker").forEach((el) => el.classList.remove("dragging"));
    clearIndicators();
    clearMergeTargets();
    clearColumnTargets();
    dragIdx = -1;
    dragCol = -1;
    dragIsImage = false;
    dragBreakAfterIdx = -1;
  });

  body.addEventListener("dragover", (e) => {
    if (configV2EditingIdx >= 0 || (dragIdx < 0 && dragBreakAfterIdx < 0)) return;
    e.preventDefault();
    hideDropHint();
    if (dragBreakAfterIdx >= 0) {
      clearMergeTargets();
      clearColumnTargets();
      updateBreakIndicator(e.clientY);
      return;
    }
    clearMergeTargets();
    clearColumnTargets();
    if (dragCol >= 0) {
      // 格拖动：三区落点
      const target = getDropTarget(e.clientX, e.clientY);
      if (target && target.idx !== dragIdx) {
        clearIndicators();
        if (target.zone === "merge") {
          const targetItem = body.querySelector(`.config-v2-editor-item[data-index="${target.idx}"]`);
          if (targetItem) targetItem.classList.add("merge-target");
        } else {
          const tCols = getTextCols(configV2Elements[target.idx]);
          if (Array.isArray(tCols) && tCols.length >= CONFIG_V2_MAX_COLS) {
            // 2026-08-22 用户确认：满 3 格不画红线，光标旁提示
            showDropHint("该行已满 3 格", e.clientX, e.clientY);
          } else {
            highlightColumnTarget(target);
          }
        }
        return;
      }
      if (target && target.idx === dragIdx && target.col !== dragCol) {
        // 2026-08-22 修复：同行格操作反馈——中间=合并高亮、左/右边缘=行内重排高亮
        clearIndicators();
        if (target.zone === "merge") {
          const cellEl = body.querySelector(`.config-v2-row-cell[data-index="${target.idx}"][data-col="${target.col}"]`);
          if (cellEl) cellEl.classList.add("merge-target");
        } else {
          highlightColumnTarget(target);
        }
        return;
      }
      if (target) {
        // 悬停自身行：放到自己上是空操作，不显示误导性插入线
        clearIndicators();
        return;
      }
      updateIndicator(e.clientY);
      return;
    }
    if (dragIsImage) {
      // 图片块拖动：仅插入线（图片不参与文本三区并入/合并）
      updateIndicator(e.clientY);
      return;
    }
  });

  body.addEventListener("dragleave", (e) => {
    if (body.contains(e.relatedTarget)) return;
    hideDropHint();
    clearIndicators();
    clearMergeTargets();
    clearColumnTargets();
  });

  body.addEventListener("drop", (e) => {
    if (configV2EditingIdx >= 0 || (dragIdx < 0 && dragBreakAfterIdx < 0)) return;
    e.preventDefault();
    hideDropHint();
    clearIndicators();
    clearMergeTargets();
    clearColumnTargets();
    if (dragBreakAfterIdx >= 0) {
      const toAfterIdx = getBreakAfterIdx(e.clientY);
      // 2026-08-22 修复：拖回原位不产生幻影历史
      if (canBreakAfterConfigV2Index(toAfterIdx) && toAfterIdx !== dragBreakAfterIdx) {
        pushConfigV2History();
        setConfigV2BreakAfter(dragBreakAfterIdx, false);
        setConfigV2BreakAfter(toAfterIdx, true);
        configV2FocusedIdx = toAfterIdx;
        configV2Dirty = true;
  scheduleConfigV2AutoSave();
        renderConfigV2EditorItems(getConfigV2SelectedRow());
      }
      dragBreakAfterIdx = -1;
      return;
    }
    if (dragCol >= 0) {
      // 格拖动：三区（并入列 / 合并）或落两行之间成为新的 1 格行
      const target = getDropTarget(e.clientX, e.clientY);
      if (target) {
        if (target.idx === dragIdx) {
          // 2026-08-22 修复：同行格操作不再无反应——
          // 中间 3/5 = 合并到另一格；左/右边缘 = 行内移动该格（重排）。
          // 悬停自身格（col 相同）保持 no-op。
          const srcEl = configV2Elements[dragIdx];
          if (isTextEditorElement(srcEl) && getTextCols(srcEl).length > 1 && target.col !== dragCol) {
            const cols = getTextCols(srcEl);
            const content = getTextCellContent(srcEl, dragCol);
            pushConfigV2History();
            cols.splice(dragCol, 1);
            const tCol = target.col > dragCol ? target.col - 1 : target.col;
            if (target.zone === "merge") {
              if (!cols[tCol]) cols[tCol] = {};
              const existing = cols[tCol].content || "";
              const srcFirst = dragCol < target.col;
              cols[tCol].content = srcFirst
                ? `${trimTrailingLineBreaks(content)}${existing}`
                : `${trimTrailingLineBreaks(existing)}${content}`;
              normalizeTextElement(srcEl);
            } else {
              const insertAt = Math.min(Math.max(target.zone === "left" ? tCol : tCol + 1, 0), cols.length);
              cols.splice(insertAt, 0, { content });
              normalizeTextElement(srcEl);
            }
            configV2Dirty = true;
  scheduleConfigV2AutoSave();
            configV2FocusedIdx = dragIdx;
            renderConfigV2EditorItems(getConfigV2SelectedRow());
          }
          dragIdx = -1;
          dragCol = -1;
          return;
        }
        // 先捕获引用与文档序（takeDraggedCell 移除整行后索引即失效）
        const targetEl = configV2Elements[target.idx];
        const docOrderFromFirst = dragIdx < target.idx;
        const tCols = getTextCols(targetEl);
        if (target.zone !== "merge" && Array.isArray(tCols) && tCols.length >= CONFIG_V2_MAX_COLS) {
          // 目标行已满 3 格：拒绝（不推历史、不变更）
          dragIdx = -1;
          dragCol = -1;
          return;
        }
        pushConfigV2History();
        const gaps = snapshotPageBreakGaps();
        const taken = takeDraggedCell();
        if (target.zone === "merge") {
          mergeCellInto(targetEl, target, taken.content, docOrderFromFirst);
        } else {
          joinCellIntoRow(targetEl, target, taken.content);
        }
        // 2026-08-22：分页线独立——源为 1 格行（整行移除）时分页间隔左移保持原位
        if (taken.removedRow) relocatePageBreakGaps(gaps, [{ type: "remove", at: dragIdx }]);
        configV2Dirty = true;
  scheduleConfigV2AutoSave();
        configV2FocusedIdx = taken.removedRow && target.idx > dragIdx ? target.idx - 1 : target.idx;
        renderConfigV2EditorItems(getConfigV2SelectedRow());
        dragIdx = -1;
        dragCol = -1;
        return;
      }
      // 落两行之间。单格行 = 整行移动（预调整落点，原位则空操作）；
      // 多格格 = 拖出成为新 1 格行。
      let toIdx = getInsertIdx(e.clientY);
      const singleRowMove = getTextColCount(configV2Elements[dragIdx]) === 1;
      if (singleRowMove && toIdx > dragIdx) toIdx -= 1;
      if (singleRowMove && toIdx === dragIdx) {
        dragIdx = -1;
        dragCol = -1;
        return;
      }
      pushConfigV2History();
      const gaps = snapshotPageBreakGaps();
      const taken = takeDraggedCell();
      insertDraggedCellAsRow(buildCellRowElement(taken), toIdx);
      // 2026-08-22：分页线独立——单格行=整行移动（remove+insert），多格格=拖出新行（insert）
      if (singleRowMove) relocatePageBreakGaps(gaps, [{ type: "remove", at: dragIdx }, { type: "insert", at: toIdx }]);
      else relocatePageBreakGaps(gaps, [{ type: "insert", at: toIdx }]);
      configV2Dirty = true;
  scheduleConfigV2AutoSave();
      renderConfigV2EditorItems(getConfigV2SelectedRow());
      dragIdx = -1;
      dragCol = -1;
      return;
    }
    if (dragIsImage) {
      // 图片块：插入线重排（图片是独立块，不参与文本三区并入/合并）
      const toIdx = getInsertIdx(e.clientY);
      const adjusted = toIdx > dragIdx ? toIdx - 1 : toIdx;
      if (adjusted !== dragIdx) {
        pushConfigV2History();
        const gaps = snapshotPageBreakGaps();
        const [moved] = configV2Elements.splice(dragIdx, 1);
        configV2Elements.splice(adjusted, 0, moved);
        // 2026-08-22：分页线独立——图片重排后间隔保持在原位
        relocatePageBreakGaps(gaps, [{ type: "remove", at: dragIdx }, { type: "insert", at: adjusted }]);
        configV2FocusedIdx = adjusted;
        configV2Dirty = true;
  scheduleConfigV2AutoSave();
        renderConfigV2EditorItems(getConfigV2SelectedRow());
      }
      dragIdx = -1;
      dragCol = -1;
      dragIsImage = false;
      return;
    }
    // 2026-08-22 用户确认：拖拽对象 = 块/分页——此处仅作防御（非分页拖拽必为格或图片块）
    dragIdx = -1;
    dragCol = -1;
    dragIsImage = false;
  });
}

export async function parseFileRow(row, force = false) {
  if (!row.templateId) return;
  if (!force && row.cachePath) return;
  const sourcePath = row.sourcePath || row.path;
  if (!sourcePath) {
    row.genStatus = "解析失败";
    row.parseError = "缺少源文件路径";
    renderHook();
    persistState();
    return;
  }
  row.genStatus = "解析中";
  row.parseError = null;
  renderHook();
  try {
    const isProjectRow = row.templateId === "4_一句话" && (Array.isArray(row.images) || row.cachePath);
    let result;
    if (isProjectRow && row.cachePath) {
      result = await api.reparse(row.cachePath, row.templateId, Array.isArray(row.images) ? row.images : undefined);
    } else if (Array.isArray(row.images) && row.images.length > 0) {
      result = await api.parseImages(row.images, row.templateId);
    } else {
      result = await api.parseFile(sourcePath, row.templateId);
    }
      if (result.cache_path) {
        row.cachePath = result.cache_path;
        if (row.templateId === "4_一句话" && Array.isArray(row.images)) {
          if (Array.isArray(result.removed) && result.removed.length > 0) {
            // 整组删除的图移出索引；源文件由后端从 inputs/ 真正移走（回收站）。
            // 想重新加入时重新放入 inputs/ / 手动拖入即可。
            const removedSet = new Set(result.removed);
            row.images = row.images.filter((p) => !removedSet.has(p));
          }
          if (Array.isArray(result.image_paths) && result.image_paths.length > 0) {
            // 重建后的完整索引持久化（旧数据行没有 images 时也恢复）
            row.images = result.image_paths.filter(Boolean);
          }
        }
        if (result.source_path) {
          row.path = result.source_path;
          row.sourcePath = result.source_path;
          row.sourceDir = getDirName(result.source_path);
        }
        row.outputPath = null;
        row.outputDismissed = false;
        row.activeTaskId = null;
        row.genStatus = "已解析";
      } else {
      row.genStatus = "解析失败";
      row.parseError = result.error || "未知错误";
    }
  } catch (err) {
    row.genStatus = "解析失败";
    row.parseError = String(err);
  }
  renderHook();
  persistState();
}

// 2026-08-25：关页/刷新兜底——①有未保存修改先尝试落盘并提示；②撤销窗口内未决的移除用 sendBeacon 补删（列表已移除，磁盘也要清掉）
window.addEventListener("beforeunload", (e) => {
  if (configV2Dirty) {
    scheduleConfigV2AutoSave(0);
    e.preventDefault();
    e.returnValue = "";
  }
  if (pendingRemovals.size > 0) {
    pendingRemovals.forEach((record) => {
      record.targets.forEach((p) => {
        try {
          navigator.sendBeacon(`${API_BASE}/api/input/remove`, new Blob([JSON.stringify({ path: p })], { type: "application/json" }));
        } catch (_) { /* 关页补删失败：文件仍在 inputs，下次解析会重新出现，可再次移除 */ }
      });
      if (record.eventPaths.length > 0) {
        try {
          navigator.sendBeacon(`${API_BASE}/api/events/remove-by-file`, new Blob([JSON.stringify({ paths: record.eventPaths })], { type: "application/json" }));
        } catch (_) { /* 关页补清事件失败：下次打开点忽略时仍可走"过时移除" */ }
      }
    });
    pendingRemovals.clear();
  }
});
