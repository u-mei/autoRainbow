// 纯工具函数（ES Module 拆分 Phase 0）
// 依赖：constants.js（SUPPORTED_EXTS / CONFIG_V2_MAX_COLS）。
// 本模块只含无 DOM、无全局可变状态的纯函数。

import { SUPPORTED_EXTS, CONFIG_V2_MAX_COLS } from "./constants.js";

export function getExt(pathText) {
  const idx = pathText.lastIndexOf(".");
  if (idx < 0) return "";
  return pathText.slice(idx + 1).toLowerCase();
}

export function getFileName(pathText) {
  const parts = pathText.split(/[\\/]/);
  return parts[parts.length - 1] || pathText;
}

export function getDisplayFileName(name) {
  const base = getFileName(String(name || ""));
  return base.replace(/\.[^.\\/]+$/, "");
}

export function getDirName(pathText) {
  const parts = pathText.split(/[\\/]/);
  parts.pop();
  return parts.join("/");
}

export function isInputsPath(pathText) {
  // 2026-08-16：判断路径是否在 workspace/inputs/ 内（删除队列文件时需同步移走磁盘文件）
  return /[\\/]inputs[\\/]/.test(String(pathText || ""));
}

export function isImageExt(ext) {
  return ext === "png" || ext === "jpg" || ext === "jpeg";
}

export function evaluateSupport(pathText) {
  const ext = getExt(pathText);
  const supported = SUPPORTED_EXTS.has(ext);
  return { ext, supported };
}

export function computeRowStatusMeta(row) {
  if (!row.supported) return { text: "不匹配", cls: "status-bad" };
  if (!row.templateId) return { text: "未指定", cls: "status-unassigned" };
  const s = row.genStatus || "未处理";
  if (s === "失败" || s === "解析失败" || s === "缓存丢失") return { text: s, cls: "status-bad" };
  if (s === "未处理" || s === "处理中" || s === "解析中") return { text: s, cls: "status-warn" };
  if (s === "未指定") return { text: s, cls: "status-unassigned" };
  if (s === "已解析") return { text: "可编辑", cls: "status-ok" };
  return { text: s, cls: "status-ok" };
}

export function splitSupportedPaths(paths) {
  const supported = [];
  const unsupported = [];
  (paths || []).forEach((p) => {
    const info = evaluateSupport(p || "");
    if (info.supported) supported.push(p);
    else unsupported.push(p);
  });
  return { supported, unsupported };
}

export function normalizeCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function normalizeQueueSnapshot(snapshot) {
  const source = snapshot || {};
  return {
    pending: normalizeCount(source.pending ?? source.pending_count),
    running: normalizeCount(source.running ?? source.running_count)
  };
}

export function normalizeDashboardSummary(summary) {
  const source = summary || {};
  const fileDone = source.lastSuccess ?? source.last_success;
  const fileFail = source.lastFail ?? source.last_fail;
  return {
    doneCount: normalizeCount(fileDone ?? source.doneCount ?? source.done_count),
    errorCount: normalizeCount(fileFail ?? source.errorCount ?? source.error_count),
    watcherAlive: !!(source.watcherAlive ?? source.watcher_alive)
  };
}

export function pathsMatch(a, b) {
  if (!a || !b) return false;
  const left = String(a);
  const right = String(b);
  return left === right || getFileName(left) === getFileName(right);
}

export function getRunMetaTaskId(meta) {
  if (!meta) return "";
  return String(meta.task_id || meta.taskId || meta.last_task_id || meta.lastTaskId || "");
}

export function rowAcceptsRunResult(row, taskId) {
  if (!row) return false;
  if (taskId) {
    if (row.activeTaskId) return row.activeTaskId === taskId;
    return row.genStatus === "已投递" || row.genStatus === "处理中";
  }
  return row.genStatus === "已投递" || row.genStatus === "处理中";
}

export function nowTimestampText() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function normalizeLogForDisplay(rawText) {
  const text = String(rawText || "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  const splitInlineTs = text.replace(/(?!^)\s+(\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\])/g, "\n$1").trim();
  const tsReg = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/;
  const lines = splitInlineTs.split("\n");
  const entries = [];
  let current = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (tsReg.test(line)) {
      if (current.length > 0) entries.push(current.join("\n"));
      current = [line];
      continue;
    }
    if (current.length === 0) current = [`[${nowTimestampText()}] ${line}`];
    else current.push(line);
  }
  if (current.length > 0) entries.push(current.join("\n"));
  return entries.join("\n");
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[ch]));
}

export function cloneEditorElement(el) {
  return JSON.parse(JSON.stringify(el || { type: "text", content: "" }));
}

// 2026-08-16：统一"行"模型——文本元素带 cols（1~3 格）。
// 设计文档：private/docs/features/一行多文本块设计方案.md §2。
// - 无 cols → 补 [{content}]（1 格 = 默认/现状等价）
// - 1 格 → 同步 content（向后兼容旧消费者，如 JSX templateA/templateD、合并逻辑）
// - 多格行由拖拽产生，content 保持 undefined（行感知消费者读 cols）
export function normalizeTextElement(el) {
  if (!el || typeof el !== "object") return el;
  if ((el.type || "text") === "image") return el;
  const cols = Array.isArray(el.cols) && el.cols.length > 0 ? el.cols : null;
  if (!cols) {
    el.cols = [{ content: el.content || "" }];
  }
  if (el.cols.length === 1) {
    el.content = (el.cols[0] && el.cols[0].content) || "";
  }
  return el;
}

// 返回文本元素的格列表（归一化后），非文本返回 null
export function getTextCols(el) {
  if (!el || typeof el !== "object") return null;
  if ((el.type || "text") === "image") return null;
  if (Array.isArray(el.cols) && el.cols.length > 0) return el.cols;
  return [{ content: el.content || "" }];
}

// 返回某格的文本内容（越界/空格返回 ""）
export function getTextCellContent(el, col) {
  const cols = getTextCols(el);
  if (!cols) return "";
  const cell = cols[col];
  return (cell && typeof cell === "object" ? cell.content : cell) || "";
}

// 设置某格文本内容（1 格时同步 content）
export function setTextCellContent(el, col, value) {
  const cols = getTextCols(el);
  if (!cols) return;
  const text = String(value || "");
  if (!cols[col]) cols[col] = {};
  cols[col].content = text;
  if (cols.length === 1) el.content = text;
}

// 列数（1~3），文本元素有效
export function getTextColCount(el) {
  const cols = getTextCols(el);
  return cols ? Math.min(Math.max(cols.length, 1), CONFIG_V2_MAX_COLS) : 0;
}

export function isTextEditorElement(el) {
  return (el && (el.type || "text") !== "image");
}

export function trimTrailingLineBreaks(text) {
  return String(text || "").replace(/[\r\n]+$/g, "");
}