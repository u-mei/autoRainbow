const BUILD_TIME = "2026-06-18 16:00";

const TEMPLATES = [
  { id: "1_本周头条", label: "本周头条", color: "#3f8efc", layoutMode: "templateA" },
  { id: "2_直播精选", label: "直播精选", color: "#00a870", layoutMode: "templateA" },
  { id: "3_彩虹综艺", label: "彩虹综艺", color: "#ff9f1c", layoutMode: "templateA" },
  { id: "4_一句话", label: "一句话", color: "#9b5de5", layoutMode: "templateB" },
  { id: "5_音乐专题", label: "音乐专题", color: "#e05a5a", layoutMode: "templateA" },
  { id: "6_新衣披露", label: "新衣披露", color: "#2a9d8f", layoutMode: "templateC" },
  { id: "7_周边", label: "周边", color: "#6c757d", layoutMode: "templateD" }
];

const SUPPORTED_EXTS = new Set(["docx", "png", "jpg", "jpeg"]);

const API_BASE = "http://localhost:8800";

async function fetchJsonChecked(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(data.error || `请求失败: ${response.status}`);
  }
  return data;
}

const api = {
  async health() { return fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(2000) }).then(r => r.json()); },
  async dashboard() { return fetch(`${API_BASE}/api/dashboard`).then(r => r.json()); },
  async getState() { return fetch(`${API_BASE}/api/state`).then(r => r.json()); },
  async saveState(content) {
    const data = typeof content === "string" ? { content } : content;
    return fetch(`${API_BASE}/api/state`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json());
  },
  async pickFiles() { return fetch(`${API_BASE}/api/pick-files`).then(r => r.json()); },
  async startPipeline(rows) { return fetchJsonChecked(`${API_BASE}/api/pipeline/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) }); },
  async pipelineFull() { return fetch(`${API_BASE}/api/pipeline/full`, { method: "POST" }).then(r => r.json()); },
  async recoverTasks() { return fetch(`${API_BASE}/api/pipeline/recover`, { method: "POST" }).then(r => r.json()); },
  async openPath(path) { return fetch(`${API_BASE}/api/open-path`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) }); },
  async openOutputFolder() { return fetch(`${API_BASE}/api/open-output-folder`, { method: "POST" }); },
  async deleteOutputFile(path) { return fetchJsonChecked(`${API_BASE}/api/output/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) }); },
  async watcherStatus() { return fetch(`${API_BASE}/api/watcher/status`).then(r => r.json()); },
  async installWatcher() { return fetch(`${API_BASE}/api/watcher/install`, { method: "POST" }).then(r => r.json()); },
  async uninstallWatcher() { return fetch(`${API_BASE}/api/watcher/uninstall`, { method: "POST" }).then(r => r.json()); },
  async getConfig() { return fetch(`${API_BASE}/api/config`).then(r => r.json()); },
  async setConfig(data) { return fetch(`${API_BASE}/api/config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()); },
  async clearLog(kind) { return fetch(`${API_BASE}/api/log/clear`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) }).then(r => r.json()); },
  async cleanup() { return fetch(`${API_BASE}/api/cleanup`, { method: "POST" }).then(r => r.json()); },
  async clearCache() { return fetch(`${API_BASE}/api/cache/clear`, { method: "POST" }).then(r => r.json()); },
  async diskSpace() { return fetch(`${API_BASE}/api/disk-space`).then(r => r.json()); },
  async snapshotExport() { return fetch(`${API_BASE}/api/snapshot/export`, { method: "POST" }).then(r => r.json()); },
  async snapshotCompare() { return fetch(`${API_BASE}/api/snapshot/compare`, { method: "POST" }).then(r => r.json()); },
  async snapshotPromote() { return fetch(`${API_BASE}/api/snapshot/promote`, { method: "POST" }).then(r => r.json()); },
  async snapshotDirs() { return fetch(`${API_BASE}/api/snapshot/dirs`).then(r => r.json()); },
  async getTemplates() { return fetch(`${API_BASE}/api/templates`).then(r => r.json()); },
  async getTemplateConfig(id) { return fetch(`${API_BASE}/api/templates/${id}/config`).then(r => r.json()); },
  async setTemplateConfig(id, config) { return fetch(`${API_BASE}/api/templates/${id}/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) }).then(r => r.json()); },
  async autoDetect() { return fetch(`${API_BASE}/api/config/auto-detect`, { method: "POST" }).then(r => r.json()); },
  async queueStats() { return fetch(`${API_BASE}/api/queue/stats`).then(r => r.json()); },
  async openWatcherFolder() { return fetch(`${API_BASE}/api/watcher/open-folder`, { method: "POST" }).then(r => r.json()); },
  async stopAgent() { return fetch(`${API_BASE}/api/stop`, { method: "POST" }).then(r => r.json()); },
  async openTemplateFolder(id) { return fetch(`${API_BASE}/api/templates/${id}/open-folder`, { method: "POST" }).then(r => r.json()); },
  async upload(file, templateId) {
    const url = `${API_BASE}/api/upload?filename=${encodeURIComponent(file.name)}&template_id=${encodeURIComponent(templateId || "")}`;
    return fetch(url, { method: "POST", body: file }).then(r => r.json());
  },
  async clearInbox() { return fetch(`${API_BASE}/api/input/clear`, { method: "POST" }).then(r => r.json()); },
  async validateFiles(paths) { return fetch(`${API_BASE}/api/validate-files`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths }) }).then(r => r.json()); },
  async getInputs() { return fetch(`${API_BASE}/api/inputs`).then(r => r.json()); },
  async cacheStats() { return fetch(`${API_BASE}/api/cache-stats`).then(r => r.json()); },
  async parseFile(path, templateId) { return fetch(`${API_BASE}/api/parse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, template_id: templateId }) }).then(r => r.json()); },
  async getCacheJson(path) { return fetchJsonChecked(`${API_BASE}/api/cache?path=${encodeURIComponent(path)}`); },
  async getPageBreaks(path) { return fetchJsonChecked(`${API_BASE}/api/page-breaks?path=${encodeURIComponent(path)}`); },
  async resolveCaches(paths) { return fetchJsonChecked(`${API_BASE}/api/cache/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths }) }); },
  async saveCacheJson(path, elements) { return fetchJsonChecked(`${API_BASE}/api/cache`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, elements }) }); },
};

const lastUpdate = document.getElementById("lastUpdate");
const statusText = document.getElementById("statusText");
const dropZone = document.getElementById("dropZone");
const dropHint = document.getElementById("dropHint");
const filesBody = document.getElementById("filesBody");
const stateDot = document.getElementById("stateDot");
const stateText = document.getElementById("stateText");
const allStateDots = [stateDot].filter(Boolean);
const allStateTexts = [stateText].filter(Boolean);
const allStateHints = [];
const formatToast = document.getElementById("formatToast");

const resultSummary = document.getElementById("resultSummary");
const resultErrors = document.getElementById("resultErrors");

const dispatchLogEl = document.getElementById("dispatchLog");
const watcherLogEl = document.getElementById("watcherLog");
const pipelineLogEl = document.getElementById("pipelineLog");

const pickBtn = document.getElementById("pickBtn");
const refreshBtn = document.getElementById("refreshBtn");
const openTemplateBtn = document.getElementById("openTemplateBtn");
const clearInputBtn = document.getElementById("clearInputBtn");
const startBtn = document.getElementById("startBtn");
const openGeneratedBtn = document.getElementById("openGeneratedBtn");
const exportAllBtn = document.getElementById("exportAllBtn");
const installWatcherBtn = document.getElementById("installWatcherBtn");
const updateWatcherBtn = document.getElementById("updateWatcherBtn");
const uninstallWatcherBtn = document.getElementById("uninstallWatcherBtn");
const checkWatcherBtn = document.getElementById("checkWatcherBtn");
const openStartupDirBtn = document.getElementById("openStartupDirBtn");
const filePicker = document.getElementById("filePicker");
const templateDirInput = document.getElementById("templateDirInput");
const saveTemplateDirBtn = document.getElementById("saveTemplateDirBtn");
const templateDirStatus = document.getElementById("templateDirStatus");
const customScrollbar = document.getElementById("customScrollbar");
const customScrollbarThumb = document.getElementById("customScrollbarThumb");
const clearLogButtons = Array.from(document.querySelectorAll(".clear-log-btn"));
const cleanupCheckBtn = document.getElementById("cleanupCheckBtn");
const cleanupResultEl = document.getElementById("cleanupResult");
const configWatcherStatusEl = document.getElementById("configWatcherStatus");
const configWatcherHintEl = document.getElementById("configWatcherHint");
const configQueueStatusEl = document.getElementById("configQueueStatus");
const configQueueHintEl = document.getElementById("configQueueHint");
const configResultStatusEl = document.getElementById("configResultStatus");
const configResultHintEl = document.getElementById("configResultHint");
const configOpenOutputBtn = document.getElementById("configOpenOutputBtn");
const configV2WatcherStatusEl = document.getElementById("configV2WatcherStatus");
const configV2WatcherHintEl = document.getElementById("configV2WatcherHint");
const configV2PendingStatusEl = document.getElementById("configV2PendingStatus");
const configV2PendingHintEl = document.getElementById("configV2PendingHint");
const configV2QueueStatusEl = document.getElementById("configV2QueueStatus");
const configV2QueueHintEl = document.getElementById("configV2QueueHint");
const configV2ResultStatusEl = document.getElementById("configV2ResultStatus");
const configV2ResultHintEl = document.getElementById("configV2ResultHint");
const configV2OpenOutputBtn = document.getElementById("configV2OpenOutputBtn");
const configV2FileCountEl = document.getElementById("configV2FileCount");
const configV2FilesBody = document.getElementById("configV2FilesBody");
const configV2OutputCountEl = document.getElementById("configV2OutputCount");
const configV2OutputBody = document.getElementById("configV2OutputBody");
const configV2EditorTitle = document.getElementById("configV2EditorTitle");
const configV2EditorMeta = document.getElementById("configV2EditorMeta");
const configV2EditorBody = document.getElementById("configV2EditorBody");
const configV2AddFilesBtn = document.getElementById("configV2AddFilesBtn");
const configV2StartBtn = document.getElementById("configV2StartBtn");
const configV2RefreshBtn = document.getElementById("configV2RefreshBtn");
const configV2CacheDirBtn = document.getElementById("configV2CacheDirBtn");
const configV2ClearDoneBtn = document.getElementById("configV2ClearDoneBtn");
const configV2ClearInputBtn = document.getElementById("configV2ClearInputBtn");
const configV2AddLineBtn = document.getElementById("configV2AddLineBtn");
const configV2UndoBtn = document.getElementById("configV2UndoBtn");
const configV2RedoBtn = document.getElementById("configV2RedoBtn");
const configV2TplDot = document.getElementById("configV2TplDot");
const configV2TplTrigger = document.getElementById("configV2TplTrigger");
const configV2TemplateDropdown = document.getElementById("configV2TemplateDropdown");
const configV2ReparseBtn = document.getElementById("configV2ReparseBtn");
const configV2ResetBreaksBtn = document.getElementById("configV2ResetBreaksBtn");
const configV2SaveBtn = document.getElementById("configV2SaveBtn");
const configV2ZoomOutBtn = document.getElementById("configV2ZoomOutBtn");
const configV2ZoomInBtn = document.getElementById("configV2ZoomInBtn");
const configV2ZoomResetBtn = document.getElementById("configV2ZoomResetBtn");
const configV2ZoomValue = document.getElementById("configV2ZoomValue");
const configV2ZoomControls = document.querySelector(".config-v2-zoom-controls");
const globalDropOverlay = document.getElementById("globalDropOverlay");

const watcherInstallStatusEl = document.getElementById("watcherInstallStatus");
const watcherAliveStatusEl = document.getElementById("watcherAliveStatus");
const watcherPathEl = document.getElementById("watcherPath");
const watcherActionStatusEl = document.getElementById("watcherActionStatus");
const configProjectRootEl = document.getElementById("configProjectRoot");
const configFilePathEl = document.getElementById("configFilePath");
const configIndesignPathEl = document.getElementById("configIndesignPath");
const projectRootInput = document.getElementById("projectRootInput");
const setProjectRootBtn = document.getElementById("setProjectRootBtn");
const projectRootStatusEl = document.getElementById("projectRootStatus");
const indesignAppPathInput = document.getElementById("indesignAppPathInput");
const setIndesignAppPathBtn = document.getElementById("setIndesignAppPathBtn");
const indesignAppPathStatusEl = document.getElementById("indesignAppPathStatus");

const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const phoneTabButtons = Array.from(document.querySelectorAll(".phone-app"));
const phoneClockEl = document.getElementById("phoneClock");
const panes = {
  config: document.getElementById("tab-config"),
  config2: document.getElementById("tab-config2"),
  result: document.getElementById("tab-result"),
  logs: document.getElementById("tab-logs"),
  watcher: document.getElementById("tab-watch"),
  env: document.getElementById("tab-env"),
  cleanup: document.getElementById("tab-cleanup"),
  templates: document.getElementById("tab-templates"),
  snapshot: document.getElementById("tab-snapshot"),
  components: document.getElementById("tab-components")
};

const state = {
  activeTab: "config2",
  files: [],
  watcherInstalled: null,
  templateDir: "",
  showStateHint: false,
  statusPreviewKey: "",
  queueSnapshot: {
    pending: 0,
    running: 0
  },
  dashboardSummary: {
    doneCount: 0,
    errorCount: 0,
    watcherAlive: false
  },
  lastCheckReportKey: "",
  lastRun: {
    accepted: 0,
    skipped: 0,
    errors: []
  },
  configV2SelectedId: ""
};
let previousRowTopById = new Map();
let templateMenuDocHandler = null;
let statusHotkeyArmed = false;
let statusHotkeyTimer = null;
let formatToastTimer = null;
let startActionTestDisabled = false;
let scrollbarDragging = false;
let scrollbarDragStartY = 0;
let scrollbarDragStartTop = 0;
let scrollbarHideTimer = null;
let persistStateQueue = Promise.resolve();
const CUSTOM_SCROLLBAR_ENABLED = false;
let agentOnline = false;
let globalDragDepth = 0;

const STATUS_PREVIEW_MAP = {
  "1": { text: "未安装环境", cls: "env", detail: "监听器未配置（预览）" },
  "2": { text: "错误", cls: "bad", detail: "存在异常情况，请检查日志（预览）" },
  "3": { text: "待配置", cls: "unassigned", detail: "有文件未指定使用模板（预览）" },
  "4": { text: "待处理", cls: "warn", detail: "存在待处理文件（预览）" },
  "5": { text: "空闲", cls: "idle", detail: "" },
  "6": { text: "已完成", cls: "done", detail: "所有文件均已处理（预览）" }
};
let tabSwitchToken = 0;

function getTemplateById(id) {
  return TEMPLATES.find((x) => x.id === id) || null;
}

function supportsManualPageBreak(templateId) {
  const tmpl = getTemplateById(templateId);
  return !!tmpl && tmpl.layoutMode !== "templateC";
}

function getExt(pathText) {
  const idx = pathText.lastIndexOf(".");
  if (idx < 0) return "";
  return pathText.slice(idx + 1).toLowerCase();
}

function getFileName(pathText) {
  const parts = pathText.split(/[\\/]/);
  return parts[parts.length - 1] || pathText;
}

function getDisplayFileName(name) {
  const base = getFileName(String(name || ""));
  return base.replace(/\.[^.\\/]+$/, "");
}

function getDirName(pathText) {
  const parts = pathText.split(/[\\/]/);
  parts.pop();
  return parts.join("/");
}

function isInboxPath(pathText) {
  return /[\\/]_inbox[\\/]/.test(String(pathText || ""));
}

function isImageExt(ext) {
  return ext === "png" || ext === "jpg" || ext === "jpeg";
}

function evaluateSupport(pathText) {
  const ext = getExt(pathText);
  const supported = SUPPORTED_EXTS.has(ext);
  return { ext, supported };
}

function computeRowStatusMeta(row) {
  if (!row.supported) return { text: "不匹配", cls: "status-bad" };
  if (!row.templateId) return { text: "未指定", cls: "status-unassigned" };
  const s = row.genStatus || "未处理";
  if (s === "失败" || s === "解析失败" || s === "缓存丢失") return { text: s, cls: "status-bad" };
  if (s === "未处理" || s === "处理中" || s === "解析中") return { text: s, cls: "status-warn" };
  if (s === "未指定") return { text: s, cls: "status-unassigned" };
  if (s === "已解析") return { text: "可编辑", cls: "status-ok" };
  return { text: s, cls: "status-ok" };
}

function splitSupportedPaths(paths) {
  const supported = [];
  const unsupported = [];
  (paths || []).forEach((p) => {
    const info = evaluateSupport(p || "");
    if (info.supported) supported.push(p);
    else unsupported.push(p);
  });
  return { supported, unsupported };
}

function normalizeCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeQueueSnapshot(snapshot) {
  const source = snapshot || {};
  return {
    pending: normalizeCount(source.pending ?? source.pending_count),
    running: normalizeCount(source.running ?? source.running_count)
  };
}

function normalizeDashboardSummary(summary) {
  const source = summary || {};
  const fileDone = source.lastSuccess ?? source.last_success;
  const fileFail = source.lastFail ?? source.last_fail;
  return {
    doneCount: normalizeCount(fileDone ?? source.doneCount ?? source.done_count),
    errorCount: normalizeCount(fileFail ?? source.errorCount ?? source.error_count),
    watcherAlive: !!(source.watcherAlive ?? source.watcher_alive)
  };
}

function pathsMatch(a, b) {
  if (!a || !b) return false;
  const left = String(a);
  const right = String(b);
  return left === right || getFileName(left) === getFileName(right);
}

function getRunMetaTaskId(meta) {
  if (!meta) return "";
  return String(meta.task_id || meta.taskId || meta.last_task_id || meta.lastTaskId || "");
}

function rowAcceptsRunResult(row, taskId) {
  if (!row) return false;
  if (taskId) {
    if (row.activeTaskId) return row.activeTaskId === taskId;
    return row.genStatus === "已投递" || row.genStatus === "处理中";
  }
  return row.genStatus === "已投递" || row.genStatus === "处理中";
}

function applyFileRunResults(results, meta = {}) {
  if (!Array.isArray(results) || results.length === 0) return false;
  const taskId = getRunMetaTaskId(meta);
  let changed = false;
  results.forEach((item) => {
    const cachePath = item.cache_path || item.cachePath || "";
    if (!cachePath) return;
    const row = state.files.find((x) => pathsMatch(x.cachePath, cachePath));
    if (!row) return;
    if (!rowAcceptsRunResult(row, taskId)) return;
    const status = String(item.status || "").toLowerCase();
    if (status === "done" || status === "success" || status === "ok") {
      if (row.outputDismissed) return;
      if (row.genStatus !== "已完成") {
        row.genStatus = "已完成";
        row.parseError = null;
        row.activeTaskId = null;
        changed = true;
      }
      if (item.output_path && row.outputPath !== item.output_path) {
        row.outputPath = item.output_path;
        changed = true;
      }
    } else if (status === "fail" || status === "failed" || status === "error") {
      if (row.genStatus !== "失败" || row.parseError !== item.error) {
        row.genStatus = "失败";
        row.parseError = item.error || "处理失败，请查看 dispatch 日志";
        row.activeTaskId = null;
        changed = true;
      }
    }
  });
  return changed;
}

function persistState() {
  const snapshot = JSON.stringify(state);
  persistStateQueue = persistStateQueue
    .catch(() => {})
    .then(() => api.saveState(snapshot))
    .catch((err) => {
      statusText.textContent = `状态保存失败: ${err}`;
    });
  return persistStateQueue;
}

async function loadState() {
  try {
    const data = await api.getState();
    const savedTab = data.activeTab === "config" ? "config2" : data.activeTab;
    state.activeTab = panes[savedTab] ? savedTab : "config2";
    state.watcherInstalled = typeof data.watcherInstalled === "boolean" ? data.watcherInstalled : null;
    state.templateDir = data.templateDir || "";
    state.showStateHint = !!data.showStateHint;
    state.queueSnapshot = normalizeQueueSnapshot(data.queueSnapshot || state.queueSnapshot);
    state.dashboardSummary = normalizeDashboardSummary(data.dashboardSummary || state.dashboardSummary);
    state.lastCheckReportKey = data.lastCheckReportKey || "";
    state.configV2SelectedId = data.configV2SelectedId || "";
    state.files = Array.isArray(data.files) ? data.files : [];
    state.files = state.files.map((row) => {
      const path = row.path || "";
      const name = row.name || getFileName(path);
      const sourceDir = row.sourceDir || getDirName(path);
      const support = evaluateSupport(path);
      return {
        id: row.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        path,
        name,
        ext: row.ext || support.ext,
        supported: typeof row.supported === "boolean" ? row.supported : support.supported,
        sourceDir,
        templateId: isImageExt(row.ext || support.ext) ? "4_一句话" : (row.templateId || ""),
        lockedTemplate: isImageExt(row.ext || support.ext),
        genStatus: row.genStatus || (support.supported ? "未处理" : "不匹配"),
        cachePath: row.cachePath || null,
        sourcePath: row.sourcePath || row.source_path || null,
        outputPath: row.outputPath || row.output_path || null,
        outputDismissed: !!row.outputDismissed,
        activeTaskId: row.activeTaskId || row.active_task_id || null,
        parseError: row.parseError || null
      };
    });
    if (state.configV2SelectedId && !state.files.some((row) => row.id === state.configV2SelectedId)) {
      state.configV2SelectedId = "";
    }
    state.lastRun = data.lastRun || state.lastRun;
  } catch (err) {
    statusText.textContent = `读取状态失败: ${err}`;
  }
}

async function setTab(tabId, force = false) {
  if (tabId === "config") tabId = "config2";
  const previousTabId = state.activeTab;
  if (!panes[tabId] || (previousTabId === tabId && !force)) return;
  const currentPane = panes[previousTabId];
  const nextPane = panes[tabId];
  const switchToken = ++tabSwitchToken;

  state.activeTab = tabId;
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  phoneTabButtons.forEach((btn) => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle("active", active);
    if (active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  document.body.classList.toggle("config-v2-active", tabId === "config2");

  if (currentPane && currentPane.classList.contains("active")) {
    Array.from(currentPane.children).forEach((el) => { el.style.transition = ""; el.style.opacity = ""; });
  }
  Object.keys(panes).forEach((id) => {
    panes[id].classList.toggle("active", id === tabId);
  });

  Array.from((nextPane || {children: []}).children).forEach((el) => {
    el.style.opacity = "0";
    el.style.transition = "opacity 150ms ease";
    requestAnimationFrame(() => { el.style.opacity = "1"; });
    setTimeout(() => {
      el.style.transition = "";
      el.style.opacity = "";
    }, 150);
  });

  persistState();
}

function updateWorkStatusText(text, cls, detail) {
  statusText.textContent = text;
  const fadeUpdate = (el, nextText) => {
    if (!el) return;
    if (el.textContent === nextText) return;
    if (el._fadeTimer) clearTimeout(el._fadeTimer);
    el.style.opacity = "0";
    el._fadeTimer = setTimeout(() => {
      el.textContent = nextText;
      el.style.opacity = "1";
      el._fadeTimer = null;
    }, 120);
  };
  allStateTexts.forEach((el) => fadeUpdate(el, text));
  const fadeHint = (el, nextText) => {
    if (!el) return;
    const show = state.showStateHint && !!(nextText && String(nextText).trim());
    if (el._fadeTimer) clearTimeout(el._fadeTimer);
    el.style.opacity = "0";
    el._fadeTimer = setTimeout(() => {
      let textNode = el.querySelector(".state-hint-text");
      if (!textNode) {
        textNode = document.createElement("span");
        textNode.className = "state-hint-text";
        el.appendChild(textNode);
      }
      textNode.textContent = show ? nextText : "";
      el.classList.toggle("hidden", !show);
      el.style.opacity = show ? "1" : "0";
      el._fadeTimer = null;
    }, 120);
  };
  allStateHints.forEach((el) => fadeHint(el, detail || ""));
  allStateDots.forEach((el) => {
    el.className = `dot js-state-dot ${cls || ""}`.trim();
  });
}

function getGlobalStatus() {
  if (state.statusPreviewKey && STATUS_PREVIEW_MAP[state.statusPreviewKey]) {
    return STATUS_PREVIEW_MAP[state.statusPreviewKey];
  }
  if (state.watcherInstalled === false) {
    return { text: "未安装环境", cls: "env", detail: "监听器未配置" };
  }

  const hasFail = state.files.some((x) => x.genStatus === "失败")
    || (Array.isArray(state.lastRun.errors) && state.lastRun.errors.length > 0);
  if (hasFail) return { text: "错误", cls: "bad", detail: "存在异常情况，请检查日志" };

  if (state.files.length === 0) return { text: "空闲", cls: "idle", detail: "" };

  const hasNeedTemplate = state.files.some((x) => x.supported && !x.templateId);
  if (hasNeedTemplate) {
    const unassignedRows = state.files.filter((x) => x.supported && !x.templateId);
    const names = unassignedRows.map((x) => `- ${x.name}`).join("\n");
    return { text: "待配置", cls: "unassigned", detail: `以下文件未指定使用模板：\n${names}` };
  }

  const pendingRows = state.files.filter((x) => (
    x.supported
    && x.templateId
    && ["未处理", "已解析", "已投递", "处理中", "解析中"].includes(x.genStatus)
  ));
  const hasPending = pendingRows.length > 0;
  if (hasPending) {
    const names = pendingRows.map((x) => `- ${x.name}`).join("\n");
    return { text: "待处理", cls: "warn", detail: `以下文件待处理：\n${names}` };
  }

  const allDone = state.files.length > 0 && state.files.every((x) => ["已完成", "已跳过", "不匹配"].includes(x.genStatus));
  if (allDone) return { text: "已完成", cls: "done", detail: "所有文件均已处理" };

  return { text: "待处理", cls: "warn", detail: "" };
}

function bindStatusPreviewHotkeys() {
  window.addEventListener("keydown", (e) => {
    if (e.key === "F9") {
      e.preventDefault();
      statusHotkeyArmed = true;
      if (statusHotkeyTimer) clearTimeout(statusHotkeyTimer);
      statusHotkeyTimer = setTimeout(() => {
        statusHotkeyArmed = false;
        statusHotkeyTimer = null;
      }, 3000);
      updateWorkStatusText("待处理", "warn", "预览模式：按 1-6 切换状态，按 0 关闭预览");
      return;
    }

    if (e.key === "F12") {
      e.preventDefault();
      state.showStateHint = !state.showStateHint;
      const global = getGlobalStatus();
      updateWorkStatusText(global.text, global.cls, global.detail);
      persistState();
      showFormatToast(state.showStateHint ? "状态面板已显示" : "状态面板已隐藏");
      return;
    }

    if (e.key === "F11") {
      e.preventDefault();
      startActionTestDisabled = !startActionTestDisabled;
      showFormatToast(startActionTestDisabled ? "开始处理已禁用（测试）" : "开始处理已恢复");
      return;
    }

    if (!statusHotkeyArmed) return;
    if (e.key >= "0" && e.key <= "6") {
      e.preventDefault();
      statusHotkeyArmed = false;
      if (statusHotkeyTimer) { clearTimeout(statusHotkeyTimer); statusHotkeyTimer = null; }
      state.statusPreviewKey = e.key === "0" ? "" : e.key;
      render();
      persistState();
    }
  });
}

function updateCustomScrollbar() {
  if (!CUSTOM_SCROLLBAR_ENABLED) {
    if (customScrollbar) { customScrollbar.classList.add("hidden"); customScrollbar.classList.remove("is-active"); }
    return;
  }
  if (!customScrollbar || !customScrollbarThumb) return;
  const doc = document.documentElement;
  const viewport = window.innerHeight || doc.clientHeight || 0;
  const content = Math.max(doc.scrollHeight, document.body.scrollHeight);
  const maxScroll = Math.max(content - viewport, 0);
  if (maxScroll <= 1) {
    customScrollbar.classList.add("hidden");
    customScrollbar.classList.remove("is-active");
    return;
  }
  customScrollbar.classList.remove("hidden");
  const trackHeight = customScrollbar.clientHeight;
  const rawThumbHeight = Math.max((viewport / content) * trackHeight, 36);
  const thumbHeight = Math.min(rawThumbHeight, trackHeight);
  const maxThumbTop = Math.max(trackHeight - thumbHeight, 0);
  const scrollTop = window.scrollY || doc.scrollTop || 0;
  const ratio = maxScroll > 0 ? (scrollTop / maxScroll) : 0;
  const thumbTop = maxThumbTop * ratio;
  customScrollbarThumb.style.height = `${thumbHeight}px`;
  customScrollbarThumb.style.top = `${thumbTop}px`;
}

function showCustomScrollbarTemporarily() {
  if (!CUSTOM_SCROLLBAR_ENABLED) return;
  if (!customScrollbar || customScrollbar.classList.contains("hidden")) return;
  customScrollbar.classList.add("is-active");
  if (scrollbarHideTimer) { clearTimeout(scrollbarHideTimer); scrollbarHideTimer = null; }
  scrollbarHideTimer = setTimeout(() => {
    if (scrollbarDragging) return;
    customScrollbar.classList.remove("is-active");
    scrollbarHideTimer = null;
  }, 700);
}

function bindCustomScrollbar() {
  if (!CUSTOM_SCROLLBAR_ENABLED) {
    if (customScrollbar) { customScrollbar.classList.add("hidden"); customScrollbar.classList.remove("is-active"); }
    return;
  }
  if (!customScrollbar || !customScrollbarThumb) return;
  const onPointerMove = (e) => {
    if (!scrollbarDragging) return;
    const trackHeight = customScrollbar.clientHeight;
    const thumbHeight = customScrollbarThumb.clientHeight;
    const maxThumbTop = Math.max(trackHeight - thumbHeight, 0);
    const nextTop = Math.min(Math.max(scrollbarDragStartTop + (e.clientY - scrollbarDragStartY), 0), maxThumbTop);
    const ratio = maxThumbTop > 0 ? (nextTop / maxThumbTop) : 0;
    const doc = document.documentElement;
    const viewport = window.innerHeight || doc.clientHeight || 0;
    const content = Math.max(doc.scrollHeight, document.body.scrollHeight);
    const maxScroll = Math.max(content - viewport, 0);
    window.scrollTo(0, ratio * maxScroll);
  };
  const stopDragging = () => {
    scrollbarDragging = false;
    showCustomScrollbarTemporarily();
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", stopDragging);
    document.removeEventListener("pointercancel", stopDragging);
  };
  customScrollbarThumb.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    scrollbarDragging = true;
    scrollbarDragStartY = e.clientY;
    scrollbarDragStartTop = parseFloat(customScrollbarThumb.style.top || "0") || 0;
    showCustomScrollbarTemporarily();
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", stopDragging);
    document.addEventListener("pointercancel", stopDragging);
  });
  customScrollbar.addEventListener("pointerdown", (e) => {
    if (e.target === customScrollbarThumb) return;
    const rect = customScrollbar.getBoundingClientRect();
    const thumbHeight = customScrollbarThumb.clientHeight;
    const maxThumbTop = Math.max(rect.height - thumbHeight, 0);
    const targetTop = Math.min(Math.max(e.clientY - rect.top - thumbHeight / 2, 0), maxThumbTop);
    const ratio = maxThumbTop > 0 ? (targetTop / maxThumbTop) : 0;
    const doc = document.documentElement;
    const viewport = window.innerHeight || doc.clientHeight || 0;
    const content = Math.max(doc.scrollHeight, document.body.scrollHeight);
    const maxScroll = Math.max(content - viewport, 0);
    window.scrollTo({ top: ratio * maxScroll, behavior: "smooth" });
    showCustomScrollbarTemporarily();
  });
  window.addEventListener("scroll", () => {
    updateCustomScrollbar();
    updateConfigV2ZoomPosition();
    showCustomScrollbarTemporarily();
  }, { passive: true });
  window.addEventListener("wheel", showCustomScrollbarTemporarily, { passive: true });
  window.addEventListener("resize", () => {
    updateCustomScrollbar();
    updateConfigV2ZoomPosition();
  }, { passive: true });
  configV2EditorBody?.addEventListener("scroll", updateConfigV2ZoomPosition, { passive: true });
  updateCustomScrollbar();
}

function showFormatToast(text) {
  if (!formatToast) return;
  formatToast.textContent = text;
  formatToast.classList.remove("hidden");
  if (formatToastTimer) { clearTimeout(formatToastTimer); }
  formatToastTimer = setTimeout(() => {
    formatToast.classList.add("hidden");
    formatToastTimer = null;
  }, 1800);
}

function nowTimestampText() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normalizeLogForDisplay(rawText) {
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[ch]));
}

function cloneEditorElement(el) {
  return JSON.parse(JSON.stringify(el || { type: "text", content: "" }));
}

function isTextEditorElement(el) {
  return (el && (el.type || "text") !== "image");
}

function trimTrailingLineBreaks(text) {
  return String(text || "").replace(/[\r\n]+$/g, "");
}

function mergeTextEditorElements(fromIdx, toIdx) {
  if (fromIdx === toIdx) return false;
  const fromEl = configV2Elements[fromIdx];
  const toEl = configV2Elements[toIdx];
  if (!isTextEditorElement(fromEl) || !isTextEditorElement(toEl)) return false;

  if (fromIdx < toIdx) {
    toEl.content = `${trimTrailingLineBreaks(fromEl.content)}${toEl.content || ""}`;
  } else {
    toEl.content = `${trimTrailingLineBreaks(toEl.content)}${fromEl.content || ""}`;
  }
  configV2Elements.splice(fromIdx, 1);
  configV2FocusedIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
  configV2EditingIdx = -1;
  configV2Dirty = true;
  return true;
}

function renderFiles() {
  filesBody.innerHTML = "";
  if (state.files.length === 0) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "empty-files";
    emptyEl.innerHTML = "<strong>暂无待处理文件</strong><span>选择 docx 或图片后，会在这里配置模板和查看生成状态。</span>";
    filesBody.appendChild(emptyEl);
  }
  state.files.forEach((row) => {
    const rowEl = document.createElement("div");
    const statusMeta = computeRowStatusMeta(row);
    const template = getTemplateById(row.templateId);
    const dotColor = template ? template.color : "#a1b3aa";
    rowEl.className = "file-row";
    rowEl.innerHTML = `
      <div class="file-col col-handle">
        <button class="drag-handle-btn" data-id="${escapeHtml(row.id)}" title="拖拽排序" draggable="false">☰</button>
      </div>
      <div class="file-col col-name" title="${escapeHtml(row.path)}">
        <div class="file-cell">
          <span class="file-name-text">${escapeHtml(row.name)}</span>
        </div>
      </div>
      <div class="file-col col-template">
        <div class="template-cell">
          <span class="dot" style="background:${dotColor}"></span>
          <div class="template-dropdown ${row.lockedTemplate ? "is-locked" : ""}" data-id="${escapeHtml(row.id)}">
            <button class="tpl-trigger" data-id="${escapeHtml(row.id)}" ${row.lockedTemplate ? "disabled" : ""}>
              ${template ? escapeHtml(template.label) : "未选择"}
            </button>
            <div class="tpl-menu" role="listbox" aria-label="模板选择">
              <button class="tpl-option" data-id="${escapeHtml(row.id)}" data-template-id="">
                <span class="dot" style="background:#a1b3aa"></span>
                <span>未选择</span>
              </button>
              ${TEMPLATES.map((t) => `
                <button class="tpl-option" data-id="${escapeHtml(row.id)}" data-template-id="${escapeHtml(t.id)}">
                  <span class="dot" style="background:${t.color}"></span>
                  <span>${escapeHtml(t.label)}</span>
                </button>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
      <div class="file-col col-status ${statusMeta.cls}">${escapeHtml(statusMeta.text)}</div>
      <div class="file-col col-action">
        <div class="row-actions">
          <button class="edit-row-btn ghost${row.cachePath && row.templateId ? "" : " inactive"}" data-id="${escapeHtml(row.id)}" title="编辑顺序">✎</button>
          <button class="remove-row-btn ghost" data-id="${escapeHtml(row.id)}" title="移除">✕</button>
        </div>
      </div>
    `;
    filesBody.appendChild(rowEl);
    rowEl.setAttribute("data-id", row.id);
  });

  const closeAllTemplateMenus = () => {
    const dropdowns = Array.from(document.querySelectorAll(".template-dropdown.open"));
    dropdowns.forEach((d) => {
      d.classList.remove("open");
      const row = d.closest(".file-row");
      if (row) row.classList.remove("has-open-menu");
    });
  };

  const tplTriggers = Array.from(document.querySelectorAll(".tpl-trigger"));
  tplTriggers.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const dropdown = btn.closest(".template-dropdown");
      if (!dropdown) return;
      const opened = dropdown.classList.contains("open");
      closeAllTemplateMenus();
      if (!opened) {
        const row = dropdown.closest(".file-row");
        if (row) row.classList.add("has-open-menu");
        requestAnimationFrame(() => { dropdown.classList.add("open"); });
      }
    });
  });

  const tplOptions = Array.from(document.querySelectorAll(".tpl-option"));
  tplOptions.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      const templateId = btn.getAttribute("data-template-id") || "";
      const row = state.files.find((x) => x.id === id);
      if (!row) return;
      row.templateId = templateId;
      row.cachePath = null;
      row.outputPath = null;
      row.outputDismissed = false;
      row.activeTaskId = null;
      if (row.genStatus !== "已完成") row.genStatus = "未处理";
        const rowEl = Array.from(filesBody.querySelectorAll(".file-row[data-id]"))
          .find((el) => el.getAttribute("data-id") === id);
      if (rowEl) {
        const mainDot = rowEl.querySelector(".template-cell > .dot");
        const trigger = rowEl.querySelector(".tpl-trigger");
        const statusEl = rowEl.querySelector(".col-status");
        const selectedTemplate = getTemplateById(templateId);
        if (mainDot) mainDot.style.backgroundColor = selectedTemplate ? selectedTemplate.color : "#a1b3aa";
        if (trigger) trigger.textContent = selectedTemplate ? selectedTemplate.label : "未选择";
        if (statusEl) {
          const statusMeta = computeRowStatusMeta(row);
          statusEl.textContent = statusMeta.text;
          statusEl.classList.remove("status-ok", "status-bad", "status-warn", "status-unassigned");
          statusEl.classList.add(statusMeta.cls);
        }
      }
      renderResults();
      const global = getGlobalStatus();
      updateWorkStatusText(global.text, global.cls, global.detail);
      closeAllTemplateMenus();
      persistState();
      // 选择模板后自动解析
      if (templateId) {
        row.cachePath = null;
        parseFileRow(row, true);
      }
    });
  });

  if (templateMenuDocHandler) document.removeEventListener("click", templateMenuDocHandler);
  templateMenuDocHandler = () => { closeAllTemplateMenus(); };
  document.addEventListener("click", templateMenuDocHandler);

  const removeBtns = Array.from(document.querySelectorAll(".remove-row-btn"));
  removeBtns.forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-id");
      state.files = state.files.filter((x) => x.id !== id);
      render();
      persistState();
    });
  });

  const editBtns = Array.from(document.querySelectorAll(".edit-row-btn"));
  editBtns.forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      if (btn.classList.contains("inactive")) return;
      const id = btn.getAttribute("data-id");
      const row = state.files.find((x) => x.id === id);
      if (!row || !row.cachePath || !row.templateId) return;
      openEditor(row);
    });
  });

  const rows = Array.from(filesBody.querySelectorAll(".file-row[data-id]"));
  const handles = Array.from(filesBody.querySelectorAll(".drag-handle-btn"));
  let dragSourceRow = null;
  let pointerDragging = false;
  let startClientY = 0;
  let onPointerMove = null;
  let onPointerUp = null;

  function cleanupDragVisual() {
    rows.forEach((r) => r.classList.remove("drop-target"));
    if (dragSourceRow) dragSourceRow.classList.remove("dragging-row");
    dragSourceRow = null;
  }

  function snapshotRowTopMap() {
    const map = new Map();
    const currentRows = Array.from(filesBody.querySelectorAll(".file-row[data-id]"));
    currentRows.forEach((r) => {
      const id = r.getAttribute("data-id");
      if (!id) return;
      map.set(id, r.getBoundingClientRect().top);
    });
    return map;
  }

  function animateRowsByMap(beforeMap) {
    const currentRows = Array.from(filesBody.querySelectorAll(".file-row[data-id]"));
    currentRows.forEach((r) => {
      const id = r.getAttribute("data-id");
      if (!id) return;
      const firstTop = beforeMap.get(id);
      if (typeof firstTop !== "number") return;
      const lastTop = r.getBoundingClientRect().top;
      const dy = firstTop - lastTop;
      if (Math.abs(dy) < 1) return;
      r.style.transition = "none";
      r.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        r.style.transition = "transform 0.4s ease";
        r.style.transform = "translateY(0)";
      });
    });
  }

  function moveRowByPointer(clientX, clientY) {
    if (!dragSourceRow) return;
    const hit = document.elementFromPoint(clientX, clientY);
    let targetRow = hit ? hit.closest(".file-row[data-id]") : null;
    if (!targetRow) {
      let nearest = null;
      let nearestDist = Number.POSITIVE_INFINITY;
      rows.forEach((row) => {
        if (row === dragSourceRow) return;
        const rect = row.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const dist = Math.abs(clientY - centerY);
        if (dist < nearestDist) { nearestDist = dist; nearest = row; }
      });
      targetRow = nearest;
    }
    if (!targetRow || targetRow === dragSourceRow) return;
    rows.forEach((r) => r.classList.remove("drop-target"));
    targetRow.classList.add("drop-target");
    const rect = targetRow.getBoundingClientRect();
    const after = clientY > rect.top + rect.height / 2;
    const beforeMap = snapshotRowTopMap();
    if (after && targetRow.nextSibling !== dragSourceRow) {
      targetRow.parentNode.insertBefore(dragSourceRow, targetRow.nextSibling);
      animateRowsByMap(beforeMap);
      return;
    }
    if (!after && targetRow.previousSibling !== dragSourceRow) {
      targetRow.parentNode.insertBefore(dragSourceRow, targetRow);
      animateRowsByMap(beforeMap);
    }
  }

  function commitOrderFromDom() {
    previousRowTopById = snapshotRowTopMap();
    const order = Array.from(filesBody.querySelectorAll(".file-row[data-id]")).map((x) => x.getAttribute("data-id"));
    const map = new Map(state.files.map((x) => [x.id, x]));
    const next = [];
    order.forEach((id) => { if (map.has(id)) next.push(map.get(id)); });
    if (next.length === state.files.length) { state.files = next; persistState(); }
    render();
  }

  handles.forEach((btn) => {
    const rowEl = btn.closest(".file-row[data-id]");
    if (!rowEl) return;
    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragSourceRow = rowEl;
      startClientY = e.clientY;
      pointerDragging = false;
      dragSourceRow.classList.add("dragging-row");
      if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId);

      onPointerMove = (ev) => {
        if (!dragSourceRow) return;
        const dy = Math.abs(ev.clientY - startClientY);
        if (!pointerDragging && dy >= 4) pointerDragging = true;
        if (pointerDragging) moveRowByPointer(ev.clientX, ev.clientY);
      };

      onPointerUp = () => {
        if (pointerDragging && dragSourceRow) commitOrderFromDom();
        else cleanupDragVisual();
        pointerDragging = false;
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("pointercancel", onPointerUp);
      };

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("pointercancel", onPointerUp);
    });
  });

  rows.forEach((rowEl) => {
    rowEl.addEventListener("pointerleave", () => { if (!pointerDragging) rowEl.classList.remove("drop-target"); });
  });

  const nextRowTopById = new Map();
  const finalRows = Array.from(filesBody.querySelectorAll(".file-row[data-id]"));
  finalRows.forEach((rowEl) => {
    const id = rowEl.getAttribute("data-id");
    if (!id) return;
    const newTop = rowEl.getBoundingClientRect().top;
    nextRowTopById.set(id, newTop);
    const oldTop = previousRowTopById.get(id);
    if (typeof oldTop === "number") {
      const dy = oldTop - newTop;
      if (Math.abs(dy) > 1) {
        rowEl.style.transition = "none";
        rowEl.style.transform = `translateY(${dy}px)`;
        requestAnimationFrame(() => {
          rowEl.style.transition = "transform 0.4s ease";
          rowEl.style.transform = "translateY(0)";
          setTimeout(() => { rowEl.style.transition = ""; rowEl.style.transform = ""; }, 420);
        });
      }
    }
  });
  previousRowTopById = nextRowTopById;
}

function renderResults() {
  const total = state.files.length;
  const success = state.files.filter((x) => x.genStatus === "已完成").length;
  const failed = state.files.filter((x) => x.genStatus === "失败").length;
  const skipped = state.files.filter((x) => x.genStatus === "已跳过").length;
  const accepted = normalizeCount(state.lastRun.accepted);
  const startupSkipped = normalizeCount(state.lastRun.skipped);
  resultSummary.innerHTML = `
    <div>总文件：${total}</div>
    <div>成功：${success}</div>
    <div>失败：${failed}</div>
    <div>跳过：${skipped}</div>
    <div>本次启动接收：${accepted}</div>
    <div>本次启动跳过：${startupSkipped}</div>
  `;
  resultErrors.innerHTML = "";
  const errs = state.lastRun.errors || [];
  if (errs.length === 0) {
    const li = document.createElement("li");
    li.textContent = "暂无错误";
    resultErrors.appendChild(li);
    return;
  }
  errs.forEach((x) => { const li = document.createElement("li"); li.textContent = x; resultErrors.appendChild(li); });
}

function renderWorkflowOverview() {
  const pending = normalizeCount(state.queueSnapshot.pending);
  const running = normalizeCount(state.queueSnapshot.running);
  const activeCount = pending + running;
  const dash = state.dashboardSummary || {};
  const todo = state.files.filter((x) => x.supported && x.templateId && x.genStatus !== "已完成").length;
  const v2Pending = getConfigV2InputRows().length;
  const watcherTargets = [
    { status: configWatcherStatusEl, hint: configWatcherHintEl },
    { status: configV2WatcherStatusEl, hint: configV2WatcherHintEl }
  ];
  const queueTargets = [
    { status: configQueueStatusEl, hint: configQueueHintEl },
    { status: configV2QueueStatusEl, hint: configV2QueueHintEl }
  ];
  const resultTargets = [
    { status: configResultStatusEl, hint: configResultHintEl },
    { status: configV2ResultStatusEl, hint: configV2ResultHintEl }
  ];

  watcherTargets.forEach(({ status, hint }) => {
    if (!status) return;
    if (state.watcherInstalled === false) {
      status.textContent = "未安装";
      status.className = "workflow-bad";
      if (hint) hint.textContent = "需先安装监听器";
    } else if (dash.watcherAlive) {
      status.textContent = "运行中";
      status.className = "workflow-good";
      if (hint) hint.textContent = "可自动处理队列";
    } else if (state.watcherInstalled) {
      status.textContent = "未响应";
      status.className = "workflow-warn";
      if (hint) hint.textContent = "检查 InDesign";
    } else {
      status.textContent = "检测中";
      status.className = "";
      if (hint) hint.textContent = "-";
    }
  });

  queueTargets.forEach(({ status, hint }) => {
    if (!status) return;
    if (activeCount > 0) {
      status.textContent = `${running} 运行 / ${pending} 等待`;
      status.className = "workflow-warn";
    } else if (todo > 0) {
      status.textContent = "待处理";
      status.className = "workflow-warn";
    } else {
      status.textContent = "空闲";
      status.className = "workflow-good";
    }
    if (hint) hint.textContent = todo > 0 ? `${todo} 个文件待处理` : "没有待处理文件";
  });

  if (configV2PendingStatusEl) {
    configV2PendingStatusEl.textContent = `${v2Pending} 个文件`;
    configV2PendingStatusEl.className = v2Pending > 0 ? "workflow-warn" : "workflow-good";
  }
  if (configV2PendingHintEl) {
    configV2PendingHintEl.textContent = v2Pending > 0 ? "位于左侧队列" : "等待添加";
  }

  resultTargets.forEach(({ status, hint }) => {
    if (!status) return;
    const done = normalizeCount(dash.doneCount);
    const errors = normalizeCount(dash.errorCount);
    status.textContent = `${done} / ${errors}`;
    status.className = errors > 0 ? "workflow-bad" : "workflow-good";
    if (hint) hint.textContent = "完成 / 异常";
  });
}

function renderComponents() {
  const el = document.getElementById("componentsShowcase");
  if (!el) return;
  el.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <h3>许可证标记</h3>
      <p style="color:var(--muted);margin:0">
        UI 样式参考
        <a href="https://github.com/guokaigdg/animal-island-ui.git" target="_blank" rel="noreferrer">Animal Island UI</a>
        ，上游许可证为 Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)。
      </p>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>组件样式展示</h3>
      <p style="color:var(--muted);margin:0">覆盖所有页面的 UI 元素及对应样式</p>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>按钮 Buttons</h3>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <button>默认</button>
        <button class="primary">主要</button>
        <button class="ghost">幽灵</button>
        <button disabled>禁用</button>
        <button class="primary" disabled>禁用主要</button>
        <button class="small">小按钮</button>
        <button class="primary small">小主要</button>
        <button class="primary" style="height:48px;border-radius:24px;font-size:16px">开始处理</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>卡片 Card</h3>
      <div style="display:flex;flex-wrap:wrap;gap:12px">
        <div class="card" style="margin:0;flex:1;min-width:200px">
          <strong>默认卡片</strong>
          <p style="margin:6px 0 0;color:var(--muted);font-size:13px">圆角 20px · 点阵背景 · 柔和阴影</p>
        </div>
        <div class="log-card" style="margin:0;flex:1;min-width:200px">
          <h3>日志卡片</h3>
          <p style="margin:6px 0 0;color:var(--muted);font-size:13px">日志页专用卡片样式</p>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>输入框 Input</h3>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <input type="text" placeholder="请输入内容" value="示例文字" />
        <input type="text" placeholder="占位符样式" />
        <input type="text" placeholder="禁用状态" disabled />
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>下拉菜单 Select</h3>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <div class="template-dropdown" style="position:relative">
          <button class="tpl-trigger">本周头条</button>
          <div class="tpl-menu" style="display:flex;position:static;box-shadow:none;border:none;background:transparent;padding:4px 0;flex-direction:row;gap:4px;flex-wrap:wrap">
            <button class="tpl-option"><span class="dot" style="background:#3f8efc"></span><span>本周头条</span></button>
            <button class="tpl-option"><span class="dot" style="background:#00a870"></span><span>直播精选</span></button>
            <button class="tpl-option"><span class="dot" style="background:#ff9f1c"></span><span>彩虹综艺</span></button>
            <button class="tpl-option"><span class="dot" style="background:#9b5de5"></span><span>一句话</span></button>
            <button class="tpl-option"><span class="dot" style="background:#e05a5a"></span><span>音乐专题</span></button>
            <button class="tpl-option"><span class="dot" style="background:#2a9d8f"></span><span>新衣披露</span></button>
            <button class="tpl-option"><span class="dot" style="background:#6c757d"></span><span>周边</span></button>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>状态指示 Status Dot</h3>
      <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center">
        <span><span class="dot good"></span> 成功</span>
        <span><span class="dot bad"></span> 失败</span>
        <span><span class="dot warn"></span> 警告</span>
        <span><span class="dot unassigned"></span> 未选择</span>
        <span><span class="dot idle"></span> 空闲</span>
        <span><span class="dot env"></span> 环境</span>
        <span><span class="dot done"></span> 完成</span>
        <span><span class="dot" style="background:#3f8efc"></span> 自定义</span>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>状态徽章 Status Badge</h3>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center">
        <span class="status-badge"><span class="dot good"></span> 运行中 <span class="status-badge-time">刚刚</span></span>
        <span class="status-badge"><span class="dot bad"></span> 已断开 <span class="status-badge-time">5分钟前</span></span>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>文件表格 File Table</h3>
      <div class="table-wrap" style="margin-top:0">
        <div class="files-list">
          <div class="files-head">
            <div class="col-handle"></div>
            <div class="col-name">文件名</div>
            <div class="col-template">使用模板</div>
            <div class="col-status">生成情况</div>
            <div class="col-action">操作</div>
          </div>
          <div class="files-body">
            <div class="file-row">
              <div class="file-col col-handle"><button class="drag-handle-btn">☰</button></div>
              <div class="file-col col-name"><span class="file-name-text">示例文档.docx</span></div>
              <div class="file-col col-template">
                <span class="dot" style="background:#3f8efc"></span>
                <span style="font-size:13px">本周头条</span>
              </div>
              <div class="file-col col-status status-ok">已完成</div>
              <div class="file-col col-action"><button class="remove-row-btn ghost">✕</button></div>
            </div>
            <div class="file-row">
              <div class="file-col col-handle"><button class="drag-handle-btn">☰</button></div>
              <div class="file-col col-name"><span class="file-name-text">图片素材.png</span></div>
              <div class="file-col col-template">
                <span class="dot" style="background:#9b5de5"></span>
                <span style="font-size:13px">一句话</span>
              </div>
              <div class="file-col col-status status-warn">处理中</div>
              <div class="file-col col-action"><button class="remove-row-btn ghost">✕</button></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>拖放区域 Drop Zone</h3>
      <div class="drop-zone" style="max-width:500px">
        <div class="drop-title">拖拽文件到此处</div>
        <div class="drop-sub" style="color:var(--muted)">支持：docx / png / jpg / jpeg</div>
        <div class="drop-actions"><button>手动选择文件</button></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>工作流磁贴 Workflow Tile</h3>
      <div class="workflow-overview" style="max-width:700px">
        <div class="workflow-tile">
          <span class="workflow-label">监听器</span>
          <strong class="workflow-good">运行中</strong>
          <span>-</span>
        </div>
        <div class="workflow-tile">
          <span class="workflow-label">队列</span>
          <strong>空闲</strong>
          <span>等待任务</span>
        </div>
        <div class="workflow-tile">
          <span class="workflow-label">本次结果</span>
          <strong>3 / 1</strong>
          <span>成功 / 失败</span>
        </div>
        <button class="workflow-tile workflow-action" type="button">
          <span class="workflow-label">输出</span>
          <strong>查看生成目录</strong>
          <span>打开 B_outputs</span>
        </button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>监听器状态 Watcher Status</h3>
      <div class="watcher-status-grid" style="max-width:500px">
        <div class="status-item">
          <span class="status-label">运行状态</span>
          <span class="status-value"><span class="dot good"></span> 运行中</span>
        </div>
        <div class="status-item">
          <span class="status-label">心跳</span>
          <span class="status-value mono">3s 前</span>
        </div>
        <div class="status-item">
          <span class="status-label">项目路径</span>
          <span class="status-value mono" style="font-size:12px">/Users/.../autoRainbow</span>
        </div>
        <div class="status-item">
          <span class="status-label">InDesign</span>
          <span class="status-value">2025</span>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>结果网格 Result Grid</h3>
      <div class="result-grid" style="max-width:500px">
        <div class="card" style="margin:0;text-align:center"><strong>3</strong><br><span class="status-label">成功</span></div>
        <div class="card" style="margin:0;text-align:center"><strong>1</strong><br><span class="status-label">失败</span></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>工具栏 Tool Row</h3>
      <div class="tool-row">
        <button>按钮一</button>
        <button class="primary">按钮二</button>
        <button class="ghost">按钮三</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>导航标签 Tab</h3>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="tab-btn active">配置</button>
        <button class="tab-btn">结果</button>
        <button class="tab-btn">日志</button>
        <button class="tab-btn">组件</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>排版 Typography</h3>
      <h3 style="margin:0 0 8px">h3 标题 · 794f27 粗体</h3>
      <p style="font-weight:700;margin:0 0 4px;color:var(--animal-text-color)">正文加粗 — 794f27</p>
      <p style="margin:0 0 4px;color:var(--muted)">次要文字 — 9f927d</p>
      <p style="margin:0 0 4px;font-size:12px;color:var(--animal-text-color-disabled)">禁用文字 — c4b89e</p>
      <span class="status-label">状态标签 status-label</span>
      <div style="margin-top:6px"><code class="mono">等宽字体 mono — SF Mono / Fira Code</code></div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>帮助文本 Watcher Help</h3>
      <div class="watcher-help-text" style="max-width:500px">
        <p>监听器是 InDesign 后台脚本，负责轮询队列并自动排版。</p>
        <ul><li>确保 InDesign 已安装</li><li>点击"安装监听器"</li></ul>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>预格式文本 Pre / Mono</h3>
      <pre style="max-height:120px;margin:0;font-size:12px">{
  "status": "ok",
  "timestamp": 1719360000,
  "message": "示例日志输出"
}</pre>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>快照测试结果 Snapshot</h3>
      <div class="snap-result" style="max-height:150px">
        <div class="pass">✓ page-001.png 通过</div>
        <div class="pass">✓ page-002.png 通过</div>
        <div class="fail">✗ page-003.png 差异: 2.3%</div>
        <div class="summary">总计: 2 通过, 1 失败</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>提示 Toast</h3>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div class="format-toast" style="position:static;opacity:1;transform:none;margin:0">操作成功</div>
        <div class="format-toast" style="position:static;opacity:1;transform:none;margin:0;background:var(--bad)">操作失败</div>
      </div>
    </div>

    <div class="card">
      <h3>空状态 Empty</h3>
      <div class="empty-files" style="position:static;border:none;box-shadow:none">
        <strong>暂无待处理文件</strong>
        <span>选择 docx 或图片后，会在这里配置模板和查看生成状态</span>
      </div>
    </div>
  `;
}

function render() {
  renderFiles();
  renderResults();
  renderWorkflowOverview();
  renderConfigV2();
  renderComponents();
  const global = getGlobalStatus();
  updateWorkStatusText(global.text, global.cls, global.detail);
  updateCustomScrollbar();
  updateConfigV2ZoomPosition();
}

function upsertFiles(paths, options = {}) {
  const skipUnsupported = !!options.skipUnsupported;
  if (!Array.isArray(paths) || paths.length === 0) {
    statusText.textContent = "未读取到可用文件路径，请改用选择文件按钮重试";
    return { added: 0, rejected: 0 };
  }
  let changed = false;
  let added = 0;
  let rejected = 0;
  paths.forEach((pathText) => {
    const exists = state.files.some((x) => x.path === pathText);
    if (exists) return;
    const name = getFileName(pathText);
    const sourceDir = getDirName(pathText);
    const { ext, supported } = evaluateSupport(pathText);
    if (skipUnsupported && !supported) { rejected += 1; return; }
    const row = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      path: pathText,
      name,
      ext,
      supported,
      sourceDir,
      templateId: isImageExt(ext) ? "4_一句话" : "",
      lockedTemplate: isImageExt(ext),
      genStatus: supported ? "未处理" : "不匹配",
      cachePath: null,
      sourcePath: null,
      outputPath: null,
      outputDismissed: false,
      activeTaskId: null,
      parseError: null
    };
    state.files.push(row);
    if (!state.configV2SelectedId) state.configV2SelectedId = row.id;
    changed = true;
    added += 1;
  });
  if (changed) { render(); persistState(); }
  // 自动解析（图片立即解析）
  state.files.forEach((row) => {
    if (row.supported && row.templateId && !row.cachePath) {
      parseFileRow(row);
    }
  });
  return { added, rejected };
}

async function reconcileCachePaths() {
  if (reconcileCachePaths._inFlight) return false;
  reconcileCachePaths._inFlight = true;
  const rows = state.files.filter((row) => row.cachePath);
  if (rows.length === 0) {
    reconcileCachePaths._inFlight = false;
    return false;
  }
  const uniquePaths = Array.from(new Set(rows.map((row) => row.cachePath).filter(Boolean)));
  if (uniquePaths.length === 0) {
    reconcileCachePaths._inFlight = false;
    return false;
  }
  try {
    const result = await api.resolveCaches(uniquePaths);
    const items = Array.isArray(result.items) ? result.items : [];
    const byPath = new Map(items.map((item) => [item.path, item]));
    let changed = false;
    rows.forEach((row) => {
      const item = byPath.get(row.cachePath);
      if (!item) return;
      if (item.exists && item.cache_path && item.cache_path !== row.cachePath) {
        row.cachePath = item.cache_path;
        row.parseError = null;
        if (row.genStatus === "缓存丢失") row.genStatus = "已解析";
        changed = true;
      } else if (!item.exists) {
        row.genStatus = "缓存丢失";
        row.parseError = item.error || "缓存文件不存在";
        row.activeTaskId = null;
        if (state.configV2SelectedId === row.id) {
          configV2LoadedKey = "";
          configV2LoadingKey = "";
          configV2LoadErrorKey = "";
          configV2LoadErrorMessage = "";
          configV2Elements = [];
          configV2FocusedIdx = -1;
          configV2EditingIdx = -1;
          configV2Dirty = false;
          resetConfigV2History();
        }
        changed = true;
      }
    });
    if (changed) {
      render();
      persistState();
    }
    return changed;
  } catch (err) {
    statusText.textContent = `缓存校验失败: ${err}`;
    return false;
  } finally {
    lastCacheReconcileAt = Date.now();
    reconcileCachePaths._inFlight = false;
  }
}

let editorCurrentRow = null;
let editorElements = [];
let editorFocusedIdx = -1;
let configV2Elements = [];
let configV2FocusedIdx = -1;
let configV2LoadedKey = "";
let configV2LoadingKey = "";
let configV2LoadErrorKey = "";
let configV2LoadErrorMessage = "";
let configV2Dirty = false;
let configV2EditingIdx = -1;
let configV2UndoStack = [];
let configV2RedoStack = [];
let configV2Zoom = 1;
const CONFIG_V2_HISTORY_LIMIT = 80;
const CONFIG_V2_ZOOM_MIN = 0.6;
const CONFIG_V2_ZOOM_MAX = 1.8;
const CONFIG_V2_ZOOM_STEP = 0.1;

function renderEditorTplMenu() {
  const menu = document.querySelector("#editorTemplateDropdown .tpl-menu");
  const trigger = document.getElementById("editorTplTrigger");
  if (!menu || !trigger) return;
  const currentTid = editorCurrentRow ? editorCurrentRow.templateId : "";
  const tmpl = getTemplateById(currentTid);
  trigger.textContent = tmpl ? tmpl.label : "未选择";
  menu.innerHTML = `
    <button class="tpl-option" data-tid="">
      <span class="dot" style="background:#a1b3aa"></span><span>未选择</span>
    </button>
    ${TEMPLATES.map((t) => `
      <button class="tpl-option" data-tid="${escapeHtml(t.id)}">
        <span class="dot" style="background:${t.color}"></span><span>${escapeHtml(t.label)}</span>
      </button>
    `).join("")}
  `;
  menu.querySelectorAll(".tpl-option").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tid = btn.getAttribute("data-tid") || "";
      if (!editorCurrentRow) return;
      if (!confirm("切换模板将重新解析文档，未保存的更改将丢失。是否继续？")) return;
      editorCurrentRow.templateId = tid;
      // 关闭下拉
      const dd = document.getElementById("editorTemplateDropdown");
      dd.classList.remove("open");
      // 重新解析
      editorCurrentRow.cachePath = null;
      editorCurrentRow.genStatus = "解析中";
      editorCurrentRow.parseError = null;
      render();
      try {
        const sourcePath = editorCurrentRow.sourcePath || editorCurrentRow.path;
        const result = await api.parseFile(sourcePath, tid);
        if (result.cache_path) {
          editorCurrentRow.cachePath = result.cache_path;
          if (result.source_path) {
            editorCurrentRow.path = result.source_path;
            editorCurrentRow.sourcePath = result.source_path;
            editorCurrentRow.sourceDir = getDirName(result.source_path);
          }
          editorCurrentRow.outputPath = null;
          editorCurrentRow.outputDismissed = false;
          editorCurrentRow.activeTaskId = null;
          editorCurrentRow.genStatus = "已解析";
          const cacheResult = await api.getCacheJson(result.cache_path);
          if (cacheResult.cache_path && cacheResult.cache_path !== editorCurrentRow.cachePath) {
            editorCurrentRow.cachePath = cacheResult.cache_path;
          }
          editorElements = Array.isArray(cacheResult.elements) ? cacheResult.elements.slice() : [];
          const cacheSourcePath = cacheResult.source_path || getSourcePathFromElements(editorElements);
          if (cacheSourcePath) editorCurrentRow.sourcePath = cacheSourcePath;
          renderEditorItems();
          renderEditorTplMenu();
        } else {
          editorCurrentRow.genStatus = "解析失败";
          editorCurrentRow.parseError = result.error || "未知错误";
          closeEditor(false);
        }
      } catch (err) {
        editorCurrentRow.genStatus = "解析失败";
        editorCurrentRow.parseError = String(err);
        closeEditor(false);
      }
      render();
      persistState();
    });
  });
}

async function openEditor(row) {
  editorCurrentRow = row;
  const overlay = document.getElementById("editorOverlay");
  const title = document.getElementById("editorTitle");
  const body = document.getElementById("editorBody");
  title.textContent = `编辑顺序 — ${row.name}`;
  body.innerHTML = "<div class='editor-empty'>加载中...</div>";
  overlay.classList.remove("hidden");
  renderEditorTplMenu();
  try {
    const result = await api.getCacheJson(row.cachePath);
    if (result.cache_path && result.cache_path !== row.cachePath) {
      row.cachePath = result.cache_path;
      persistState();
    }
    editorElements = Array.isArray(result.elements) ? result.elements.slice() : [];
    const sourcePath = result.source_path || getSourcePathFromElements(editorElements);
    if (sourcePath && row.sourcePath !== sourcePath) {
      row.sourcePath = sourcePath;
      persistState();
    }
    renderEditorItems();
  } catch (err) {
    body.innerHTML = `<div class='editor-empty'>加载失败: ${err}</div>`;
  }
}

function closeEditor(save) {
  document.getElementById("editorOverlay").classList.add("hidden");
  editorCurrentRow = null;
  editorElements = [];
  editorFocusedIdx = -1;
}

function getHeadingLabelsForTemplate(elements, templateId) {
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

function getHeadingLabels(elements) {
  return getHeadingLabelsForTemplate(elements, editorCurrentRow ? editorCurrentRow.templateId : "");
}

function renderEditorItems() {
  const body = document.getElementById("editorBody");
  editorFocusedIdx = Math.min(editorFocusedIdx, editorElements.length - 1);
  if (editorElements.length === 0) {
    body.innerHTML = "<div class='editor-empty'>暂无元素</div>";
    return;
  }
  const headingLabels = getHeadingLabels(editorElements);
  body.innerHTML = editorElements.map((el, i) => {
    const type = el.type === "image" ? "image" : "text";
    const focused = i === editorFocusedIdx ? " focused" : "";
    const label = headingLabels[i] || "";
    let contentHtml = "";
    if (type === "image") {
      contentHtml = `<div class="editor-item-content image"><img src="${API_BASE}/api/image?path=${encodeURIComponent(el.src || "")}" onerror="this.style.display='none'" /></div>`;
    } else {
      const displayText = (el.content || "").trim() || "\u200B";
      contentHtml = `<div class="editor-item-content text">${escapeHtml(displayText)}</div>`;
    }
    const labelHtml = label ? `<div class="editor-label-col"><span class="editor-label-tag">${label}</span></div>` : `<div class="editor-label-col"></div>`;
    return `<div class="editor-row">
      ${labelHtml}
      <div class="editor-item${focused}" data-index="${i}" draggable="true">
        <span class="editor-item-handle">⠿</span>
        ${contentHtml}
        <button class="editor-item-delete" data-index="${i}" title="删除">✕</button>
      </div>
    </div>`;
  }).join("");
  bindEditorClickFocus();
  bindEditorDrag();
  bindEditorDelete();
}

function bindEditorClickFocus() {
  const body = document.getElementById("editorBody");
  if (!body || body.dataset.clickFocusBound === "1") return;
  body.dataset.clickFocusBound = "1";
  body.addEventListener("click", (e) => {
    const item = e.target.closest(".editor-item");
    if (!item || e.target.closest(".editor-item-delete")) {
      editorFocusedIdx = -1;
      body.querySelectorAll(".editor-item").forEach((el) => el.classList.remove("focused"));
      return;
    }
    editorFocusedIdx = parseInt(item.dataset.index);
    body.querySelectorAll(".editor-item").forEach((el) => el.classList.remove("focused"));
    item.classList.add("focused");
  });
}

function bindEditorDelete() {
  document.querySelectorAll(".editor-item-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      if (isNaN(idx)) return;
      editorElements.splice(idx, 1);
      editorFocusedIdx = -1;
      renderEditorItems();
    });
  });
}

function bindEditorDrag() {
  const body = document.getElementById("editorBody");
  if (!body || body.dataset.dragBound === "1") return;
  body.dataset.dragBound = "1";
  let dragIdx = -1;

  const getInsertIdx = (clientY) => {
    const rows = body.querySelectorAll(".editor-row");
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return rows.length;
  };

  const updateIndicator = (clientY) => {
    document.querySelectorAll(".drag-indicator").forEach((el) => el.remove());
    const idx = getInsertIdx(clientY);
    const rows = body.querySelectorAll(".editor-row");
    const indicator = document.createElement("div");
    indicator.className = "drag-indicator";
    if (idx < rows.length) {
      rows[idx].parentNode.insertBefore(indicator, rows[idx]);
    } else {
      body.appendChild(indicator);
    }
  };

  body.addEventListener("dragstart", (e) => {
    const item = e.target.closest(".editor-item");
    if (!item || e.target.closest(".editor-item-delete")) return;
    dragIdx = parseInt(item.dataset.index);
    item.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(dragIdx));
  });

  body.addEventListener("dragend", () => {
    body.querySelectorAll(".editor-item").forEach((el) => el.classList.remove("dragging"));
    document.querySelectorAll(".drag-indicator").forEach((el) => el.remove());
    dragIdx = -1;
  });

  body.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    updateIndicator(e.clientY);
  });

  body.addEventListener("dragleave", (e) => {
    if (!e.target.closest(".editor-item") && !e.target.closest(".editor-label-col")) {
      document.querySelectorAll(".drag-indicator").forEach((el) => el.remove());
    }
  });

  body.addEventListener("drop", (e) => {
    e.preventDefault();
    document.querySelectorAll(".drag-indicator").forEach((el) => el.remove());
    if (dragIdx < 0) return;
    const toIdx = getInsertIdx(e.clientY);
    if (toIdx === dragIdx) { dragIdx = -1; return; }
    const [moved] = editorElements.splice(dragIdx, 1);
    const adjusted = toIdx > dragIdx ? toIdx - 1 : toIdx;
    editorElements.splice(adjusted, 0, moved);
    dragIdx = -1;
    renderEditorItems();
  });
}

function getConfigV2SelectedRow() {
  if (!state.configV2SelectedId) return null;
  return state.files.find((row) => row.id === state.configV2SelectedId) || null;
}

function isConfigV2OutputRow(row) {
  return row && row.genStatus === "已完成";
}

function getConfigV2InputRows() {
  return state.files.filter((row) => !isConfigV2OutputRow(row));
}

function getConfigV2OutputRows() {
  return state.files.filter((row) => isConfigV2OutputRow(row));
}

function ensureConfigV2Selection() {
  const inputRows = getConfigV2InputRows();
  if (state.configV2SelectedId && inputRows.some((row) => row.id === state.configV2SelectedId)) return;
  state.configV2SelectedId = inputRows.length > 0 ? inputRows[0].id : "";
  configV2LoadedKey = "";
  configV2LoadingKey = "";
  configV2LoadErrorKey = "";
  configV2LoadErrorMessage = "";
  configV2Elements = [];
  configV2FocusedIdx = -1;
  configV2EditingIdx = -1;
  configV2Dirty = false;
  resetConfigV2History();
}

function configV2CacheKey(row) {
  if (!row || !row.cachePath) return "";
  return `${row.id}:${row.cachePath}`;
}

function renderConfigV2TemplateMenu(row) {
  if (!configV2TplTrigger || !configV2TemplateDropdown) return;
  const menu = configV2TemplateDropdown.querySelector(".tpl-menu");
  const label = configV2TplTrigger.querySelector(".config-v2-tpl-label");
  const template = row ? getTemplateById(row.templateId) : null;
  if (label) label.textContent = template ? template.label : "未选择";
  if (configV2TplDot) configV2TplDot.style.backgroundColor = template ? template.color : "#a1b3aa";
  configV2TplTrigger.disabled = !row || row.lockedTemplate;
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

function renderConfigV2InputTailActions() {
  return `
    <div class="config-v2-file-tail-row">
      <button class="config-v2-list-tail-btn icon" data-action="refresh" type="button" title="刷新" aria-label="刷新">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 6v5h-5"></path>
          <path d="M4 18v-5h5"></path>
          <path d="M18.5 9A7 7 0 0 0 6.8 6.1L4 8.7"></path>
          <path d="M5.5 15A7 7 0 0 0 17.2 17.9L20 15.3"></path>
        </svg>
      </button>
      <button class="config-v2-list-tail-btn" data-action="add-files" type="button">添加文件</button>
    </div>
    <button class="config-v2-list-tail-btn" data-action="open-inbox" type="button">打开导入目录</button>
  `;
}

function renderConfigV2PendingStat(count) {
  return `
    <div class="config-v2-inline-stat">
      <span>待处理文件</span>
      <strong>${count} 个</strong>
    </div>
  `;
}

function renderConfigV2ResultStat() {
  const dash = state.dashboardSummary || {};
  const done = normalizeCount(dash.doneCount);
  const errors = normalizeCount(dash.errorCount);
  return `
    <div class="config-v2-inline-stat">
      <span>本次结果</span>
      <strong class="${errors > 0 ? "workflow-bad" : "workflow-good"}">${done} / ${errors}</strong>
      <em>完成 / 异常</em>
    </div>
  `;
}

function renderConfigV2Files() {
  if (!configV2FilesBody) return;
  const rows = getConfigV2InputRows();
  if (configV2FileCountEl) configV2FileCountEl.textContent = `${rows.length} 个文件`;
  if (rows.length === 0) {
    configV2FilesBody.innerHTML = `
      <div class="config-v2-file-empty">
        <strong>暂无待处理文件</strong>
        <span>双击这里添加文件，或直接拖拽到窗口任意位置。</span>
      </div>
      ${renderConfigV2PendingStat(rows.length)}
      ${renderConfigV2InputTailActions()}
    `;
    bindConfigV2FileListActions();
    return;
  }
  configV2FilesBody.innerHTML = `${rows.map((row) => {
    const statusMeta = computeRowStatusMeta(row);
    const template = getTemplateById(row.templateId);
    const selected = row.id === state.configV2SelectedId ? " selected" : "";
    return `
      <div class="config-v2-file-card${selected}" data-id="${escapeHtml(row.id)}">
        <button class="config-v2-file-main" data-id="${escapeHtml(row.id)}" type="button">
          <span class="config-v2-file-name">${escapeHtml(getDisplayFileName(row.name))}</span>
          <span class="config-v2-file-sub">${escapeHtml(template ? template.label : "未选择模板")}</span>
          <span class="config-v2-file-status ${statusMeta.cls}">${escapeHtml(statusMeta.text)}</span>
        </button>
        <button class="config-v2-file-delete ghost small" data-id="${escapeHtml(row.id)}" title="移除文件" type="button">✕</button>
      </div>
    `;
  }).join("")}
    ${renderConfigV2PendingStat(rows.length)}
    ${renderConfigV2InputTailActions()}
  `;
  bindConfigV2FileListActions();
}

function bindConfigV2FileListActions() {
  if (!configV2FilesBody) return;
  configV2FilesBody.querySelectorAll(".config-v2-file-main").forEach((btn) => {
    btn.addEventListener("click", () => selectConfigV2Row(btn.getAttribute("data-id") || ""));
  });
  configV2FilesBody.querySelectorAll(".config-v2-file-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeConfigV2File(btn.getAttribute("data-id") || "");
    });
  });
  configV2FilesBody.querySelectorAll("[data-action='open-inbox']").forEach((btn) => {
    btn.addEventListener("click", openConfigV2InboxFolder);
  });
  configV2FilesBody.querySelectorAll("[data-action='add-files']").forEach((btn) => {
    btn.addEventListener("click", pickAndAddFiles);
  });
  configV2FilesBody.querySelectorAll("[data-action='refresh']").forEach((btn) => {
    btn.addEventListener("click", refreshLogsAndQueue);
  });
  configV2FilesBody.ondblclick = (e) => {
    if (e.target.closest("button") || e.target.closest(".config-v2-file-card")) return;
    pickAndAddFiles();
  };
}

function renderConfigV2OutputFiles() {
  if (!configV2OutputBody) return;
  const rows = getConfigV2OutputRows();
  if (configV2OutputCountEl) configV2OutputCountEl.textContent = `${rows.length} 个文件`;
  if (rows.length === 0) {
    configV2OutputBody.innerHTML = `
      <div class="config-v2-file-empty">
        <strong>暂无输出</strong>
        <span>处理完成的文件会自动进入这里。</span>
      </div>
      ${renderConfigV2ResultStat()}
      <button class="config-v2-list-tail-btn" data-action="open-output" type="button">打开输出目录</button>
    `;
    bindConfigV2OutputListActions();
    return;
  }
  configV2OutputBody.innerHTML = `${rows.map((row) => {
    const template = getTemplateById(row.templateId);
    return `
      <div class="config-v2-file-card config-v2-output-card" data-id="${escapeHtml(row.id)}">
        <div class="config-v2-file-main static">
          <span class="config-v2-file-name">${escapeHtml(getDisplayFileName(row.name))}</span>
          <span class="config-v2-file-sub">${escapeHtml(template ? template.label : "未选择模板")}</span>
          <span class="config-v2-file-status status-ok">已完成</span>
        </div>
        <button class="config-v2-move-back-btn ghost small" data-id="${escapeHtml(row.id)}" type="button">移回</button>
        <button class="config-v2-file-delete ghost small" data-id="${escapeHtml(row.id)}" title="移除文件" type="button">✕</button>
      </div>
    `;
  }).join("")}
    <button class="config-v2-list-tail-btn danger" data-action="clear-output" type="button">移除输出</button>
    ${renderConfigV2ResultStat()}
    <button class="config-v2-list-tail-btn" data-action="open-output" type="button">打开输出目录</button>
  `;
  bindConfigV2OutputListActions();
}

function bindConfigV2OutputListActions() {
  if (!configV2OutputBody) return;
  configV2OutputBody.querySelectorAll(".config-v2-move-back-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      moveConfigV2OutputBack(btn.getAttribute("data-id") || "");
    });
  });
  configV2OutputBody.querySelectorAll(".config-v2-file-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeConfigV2File(btn.getAttribute("data-id") || "");
    });
  });
  configV2OutputBody.querySelectorAll("[data-action='clear-output']").forEach((btn) => {
    btn.addEventListener("click", clearConfigV2OutputRows);
  });
  configV2OutputBody.querySelectorAll("[data-action='open-output']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api.openOutputFolder();
      } catch (err) {
        statusText.textContent = `打开输出目录失败: ${err}`;
      }
    });
  });
}

function cloneConfigV2Elements() {
  return configV2Elements.map((el) => cloneEditorElement(el));
}

function updateConfigV2HistoryButtons() {
  const row = getConfigV2SelectedRow();
  const canEdit = !!(row && row.cachePath && configV2LoadedKey === configV2CacheKey(row));
  if (configV2UndoBtn) configV2UndoBtn.disabled = !canEdit || configV2UndoStack.length === 0;
  if (configV2RedoBtn) configV2RedoBtn.disabled = !canEdit || configV2RedoStack.length === 0;
}

function resetConfigV2History() {
  configV2UndoStack = [];
  configV2RedoStack = [];
  updateConfigV2HistoryButtons();
}

function pushConfigV2History() {
  configV2UndoStack.push(cloneConfigV2Elements());
  if (configV2UndoStack.length > CONFIG_V2_HISTORY_LIMIT) {
    configV2UndoStack.shift();
  }
  configV2RedoStack = [];
  updateConfigV2HistoryButtons();
}

function canBreakAfterConfigV2Index(idx) {
  return Number.isInteger(idx) && idx >= 0 && idx < configV2Elements.length - 1;
}

function hasConfigV2BreakAfter(idx) {
  return canBreakAfterConfigV2Index(idx) && !!configV2Elements[idx + 1].page_break_before;
}

function setConfigV2BreakAfter(idx, enabled) {
  if (!canBreakAfterConfigV2Index(idx)) return false;
  if (enabled) configV2Elements[idx + 1].page_break_before = true;
  else delete configV2Elements[idx + 1].page_break_before;
  return true;
}

function clearConfigV2PageBreaks() {
  configV2Elements.forEach((el) => {
    if (el && typeof el === "object") delete el.page_break_before;
  });
}

function applyConfigV2PageBreakIndexes(indexes) {
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

function clampConfigV2BreakAfterIndex(idx) {
  const maxIdx = configV2Elements.length - 2;
  if (maxIdx < 0) return -1;
  if (idx < 0) return 0;
  if (idx > maxIdx) return maxIdx;
  return idx;
}

function undoConfigV2Editor() {
  const row = getConfigV2SelectedRow();
  if (!row || !row.cachePath) return;
  commitConfigV2TextEditor();
  if (configV2UndoStack.length === 0) return;
  configV2RedoStack.push(cloneConfigV2Elements());
  configV2Elements = configV2UndoStack.pop().map((el) => cloneEditorElement(el));
  configV2FocusedIdx = -1;
  configV2EditingIdx = -1;
  configV2Dirty = true;
  renderConfigV2EditorItems(row);
  renderConfigV2Editor();
  updateConfigV2HistoryButtons();
}

function redoConfigV2Editor() {
  const row = getConfigV2SelectedRow();
  if (!row || !row.cachePath) return;
  commitConfigV2TextEditor();
  if (configV2RedoStack.length === 0) return;
  configV2UndoStack.push(cloneConfigV2Elements());
  configV2Elements = configV2RedoStack.pop().map((el) => cloneEditorElement(el));
  configV2FocusedIdx = -1;
  configV2EditingIdx = -1;
  configV2Dirty = true;
  renderConfigV2EditorItems(row);
  renderConfigV2Editor();
  updateConfigV2HistoryButtons();
}

function updateConfigV2ZoomControls() {
  const percent = Math.round(configV2Zoom * 100);
  if (configV2ZoomValue) configV2ZoomValue.textContent = `${percent}%`;
  if (configV2ZoomOutBtn) configV2ZoomOutBtn.disabled = configV2Zoom <= CONFIG_V2_ZOOM_MIN;
  if (configV2ZoomInBtn) configV2ZoomInBtn.disabled = configV2Zoom >= CONFIG_V2_ZOOM_MAX;
  if (configV2ZoomResetBtn) configV2ZoomResetBtn.disabled = Math.abs(configV2Zoom - 1) < 0.001;
  updateConfigV2ZoomPosition();
}

function updateConfigV2ZoomPosition() {
  if (!configV2ZoomControls) return;
  const editor = configV2ZoomControls.closest(".config-v2-editor");
  if (!editor || state.activeTab !== "config2") {
    configV2ZoomControls.style.visibility = "hidden";
    return;
  }
  const rect = editor.getBoundingClientRect();
  const visible = rect.bottom > 0 && rect.top < window.innerHeight;
  if (!visible) {
    configV2ZoomControls.style.visibility = "hidden";
    return;
  }
  const controlWidth = configV2ZoomControls.offsetWidth || 160;
  const visibleBottom = Math.min(rect.bottom, window.innerHeight - 12);
  const left = Math.max(12, Math.min(rect.left + 16, window.innerWidth - controlWidth - 12));
  const bottom = Math.max(12, window.innerHeight - visibleBottom + 14);
  configV2ZoomControls.style.setProperty("--config-v2-zoom-left", `${Math.round(left)}px`);
  configV2ZoomControls.style.setProperty("--config-v2-zoom-bottom", `${Math.round(bottom)}px`);
  configV2ZoomControls.style.visibility = "visible";
}

function setConfigV2Zoom(nextZoom) {
  const clamped = Math.max(CONFIG_V2_ZOOM_MIN, Math.min(CONFIG_V2_ZOOM_MAX, nextZoom));
  configV2Zoom = Math.round(clamped * 10) / 10;
  const canvas = configV2EditorBody?.querySelector(".config-v2-editor-canvas");
  if (canvas) canvas.style.setProperty("--config-v2-zoom", String(configV2Zoom));
  updateConfigV2ZoomControls();
}

function commitConfigV2TextEditor(editor) {
  const activeEditor = editor || configV2EditorBody?.querySelector(".config-v2-text-editor");
  if (!activeEditor) return false;
  const idx = parseInt(activeEditor.dataset.index);
  let changed = false;
  if (!isNaN(idx) && configV2Elements[idx]) {
    const nextValue = activeEditor.value;
    if ((configV2Elements[idx].content || "") !== nextValue) {
      pushConfigV2History();
      configV2Elements[idx].content = nextValue;
      configV2Dirty = true;
      changed = true;
    }
  }
  configV2EditingIdx = -1;
  updateConfigV2HistoryButtons();
  return changed;
}

function normalizeConfigV2ElementsForSave(elements) {
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
    metadataKeys.forEach((key) => {
      if (!next[key] && defaults[key]) next[key] = defaults[key];
    });
    return next;
  });
}

function getSourcePathFromElements(elements) {
  const found = (elements || []).find((el) => el && typeof el === "object" && el.source_path);
  return found ? found.source_path : "";
}

function renderConfigV2EditorItems(row) {
  if (!configV2EditorBody) return;
  const previousScrollTop = configV2EditorBody.scrollTop;
  const headingLabels = getHeadingLabelsForTemplate(configV2Elements, row ? row.templateId : "");
  const allowPageBreak = supportsManualPageBreak(row ? row.templateId : "");
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
    const draggableAttr = isEditingText ? "false" : "true";
    const label = headingLabels[i] || "";
    const labelHtml = label ? `<div class="editor-label-col"><span class="editor-label-tag">${label}</span></div>` : `<div class="editor-label-col"></div>`;
    let contentHtml = "";
    if (type === "image") {
      contentHtml = `<div class="editor-item-content image"><img src="${API_BASE}/api/image?path=${encodeURIComponent(el.src || "")}" onerror="this.style.display='none'" /></div>`;
    } else if (configV2EditingIdx === i) {
      contentHtml = `<textarea class="editor-item-content text config-v2-text-editor" data-index="${i}">${escapeHtml(el.content || "")}</textarea>`;
    } else {
      contentHtml = `<div class="editor-item-content text">${escapeHtml((el.content || "").trim() || "\u200B")}</div>`;
    }
    const pageBreakHtml = hasBreakAfter ? `
      <div class="config-v2-page-break-marker" data-break-after-index="${i}" draggable="${isEditingText ? "false" : "true"}" title="拖拽调整分页位置">
        <span class="config-v2-page-break-line" aria-hidden="true"></span>
        <span class="config-v2-page-break-bubble" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M7 3h7l4 4v14H7z"></path>
            <path d="M14 3v5h5"></path>
            <path d="M9 13h8"></path>
          </svg>
        </span>
      </div>
    ` : "";
    const pageBreakIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"></path><path d="M14 3v5h5"></path><path d="M9 13h8"></path></svg>`;
    const pageBreakBtn = allowPageBreak && canBreakAfterConfigV2Index(i) ? `<button class="config-v2-item-page-break editor-item-page-break${hasBreakAfter ? " active" : ""}" data-index="${i}" title="${hasBreakAfter ? "取消下方分页" : "在下方分页"}" type="button">${pageBreakIcon}</button>` : "";
    return `
      <div class="config-v2-editor-row editor-row">
        ${labelHtml}
        <div class="config-v2-editor-item editor-item${focused}${editingClass}${breakClass}" data-index="${i}" draggable="${draggableAttr}">
          <span class="editor-item-handle">⠿</span>
          ${contentHtml}
          <div class="editor-item-actions">
            <button class="config-v2-item-add editor-item-add" data-index="${i}" title="在下方添加空行" type="button">+</button>
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
}

function renderConfigV2Editor() {
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
    [configV2AddLineBtn, configV2ReparseBtn, configV2ResetBreaksBtn, configV2SaveBtn, configV2UndoBtn, configV2RedoBtn].forEach((btn) => { if (btn) btn.disabled = true; });
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
  if (configV2SaveBtn) configV2SaveBtn.disabled = !row.cachePath || row.genStatus === "解析中" || cacheMissing;
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

function renderConfigV2() {
  if (!configV2FilesBody && !configV2EditorBody) return;
  ensureConfigV2Selection();
  renderConfigV2Files();
  renderConfigV2OutputFiles();
  renderConfigV2Editor();
  updateConfigV2ZoomControls();
}

async function openConfigV2InboxFolder() {
  try {
    const cfg = await api.getConfig();
    await api.openPath(`${cfg.project_root}/workspace/C_inputs/_inbox`);
  } catch (err) {
    statusText.textContent = `打开导入目录失败: ${err}`;
  }
}

function clearConfigV2OutputRows() {
  const before = state.files.length;
  state.files = state.files.filter((x) => x.genStatus !== "已完成");
  if (state.files.length === before) return;
  ensureConfigV2Selection();
  render();
  persistState();
  showFormatToast("已移除输出队列");
}

async function moveConfigV2OutputBack(rowId) {
  const row = state.files.find((item) => item.id === rowId);
  if (!row) return;
  const oldOutputPath = row.outputPath || "";
  if (oldOutputPath) {
    try {
      await api.deleteOutputFile(oldOutputPath);
    } catch (err) {
      window.alert(`移回失败：无法删除之前的导出文件。\n${err.message || err}`);
      return;
    }
  } else {
    const proceed = window.confirm("未记录之前的导出文件路径，无法自动删除。是否仅移回状态？");
    if (!proceed) return;
  }
  row.genStatus = row.cachePath ? "已解析" : "未处理";
  row.parseError = null;
  row.outputPath = null;
  row.outputDismissed = true;
  row.activeTaskId = null;
  state.configV2SelectedId = row.id;
  configV2Elements = [];
  configV2FocusedIdx = -1;
  configV2LoadedKey = "";
  configV2LoadingKey = "";
  configV2LoadErrorKey = "";
  configV2LoadErrorMessage = "";
  configV2Dirty = false;
  resetConfigV2History();
  render();
  persistState();
  showFormatToast("已移回待处理队列");
}

function removeConfigV2File(rowId) {
  if (!rowId) return;
  const before = state.files.length;
  state.files = state.files.filter((item) => item.id !== rowId);
  if (state.files.length === before) return;
  if (state.configV2SelectedId === rowId) {
    state.configV2SelectedId = "";
    configV2Elements = [];
    configV2FocusedIdx = -1;
    configV2EditingIdx = -1;
    configV2LoadedKey = "";
    configV2LoadingKey = "";
    configV2LoadErrorKey = "";
    configV2LoadErrorMessage = "";
    configV2Dirty = false;
    resetConfigV2History();
  }
  ensureConfigV2Selection();
  render();
  persistState();
  showFormatToast("已移除文件");
}

async function loadConfigV2Editor(row) {
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
    configV2EditingIdx = -1;
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
    renderConfigV2();
  }
}

function selectConfigV2Row(rowId) {
  if (!rowId || rowId === state.configV2SelectedId) return;
  commitConfigV2TextEditor();
  if (configV2Dirty && !confirm("当前文件有未保存调整，切换文件会丢失这些调整。是否继续？")) return;
  state.configV2SelectedId = rowId;
  configV2Elements = [];
  configV2FocusedIdx = -1;
  configV2EditingIdx = -1;
  configV2LoadedKey = "";
  configV2LoadingKey = "";
  configV2LoadErrorKey = "";
  configV2LoadErrorMessage = "";
  configV2Dirty = false;
  resetConfigV2History();
  renderConfigV2();
  persistState();
}

async function changeConfigV2Template(row, templateId) {
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
  configV2EditingIdx = -1;
  configV2LoadedKey = "";
  configV2LoadErrorKey = "";
  configV2LoadErrorMessage = "";
  configV2Dirty = false;
  resetConfigV2History();
  render();
  persistState();
  if (templateId) {
    await parseFileRow(row, true);
    if (row.id === state.configV2SelectedId && row.cachePath) await loadConfigV2Editor(row);
  }
}

async function reparseConfigV2Selected() {
  const row = getConfigV2SelectedRow();
  if (!row || !row.templateId) return;
  commitConfigV2TextEditor();
  if (configV2Dirty && !confirm("重新解析会丢失未保存的顺序调整。是否继续？")) return;
  configV2Elements = [];
  configV2FocusedIdx = -1;
  configV2EditingIdx = -1;
  configV2LoadedKey = "";
  configV2LoadErrorKey = "";
  configV2LoadErrorMessage = "";
  configV2Dirty = false;
  resetConfigV2History();
  await parseFileRow(row, true);
  if (row.cachePath) await loadConfigV2Editor(row);
}

async function saveConfigV2Editor() {
  const row = getConfigV2SelectedRow();
  if (!row || !row.cachePath) return;
  commitConfigV2TextEditor();
  if (configV2SaveBtn) configV2SaveBtn.disabled = true;
  try {
    configV2Elements = normalizeConfigV2ElementsForSave(configV2Elements);
    const result = await api.saveCacheJson(row.cachePath, configV2Elements);
    if (result.cache_path && result.cache_path !== row.cachePath) {
      row.cachePath = result.cache_path;
      configV2LoadedKey = configV2CacheKey(row);
      persistState();
    }
    configV2Dirty = false;
    showFormatToast("编辑内容已保存");
    renderConfigV2();
  } catch (err) {
    showFormatToast(`保存失败: ${err}`);
  } finally {
    if (configV2SaveBtn) configV2SaveBtn.disabled = false;
  }
}

async function resetConfigV2PageBreaksToAuto() {
  const row = getConfigV2SelectedRow();
  if (!row || !row.cachePath || !supportsManualPageBreak(row.templateId)) return;
  commitConfigV2TextEditor();
  if (configV2ResetBreaksBtn) configV2ResetBreaksBtn.disabled = true;
  try {
    const result = await api.getPageBreaks(row.cachePath);
    if (result.exists === false) {
      showFormatToast(result.message || "尚未记录自动分页，请先生成一次");
      return;
    }
    const indexes = Array.isArray(result.auto_break_indices) ? result.auto_break_indices : [];
    pushConfigV2History();
    applyConfigV2PageBreakIndexes(indexes);
    configV2FocusedIdx = -1;
    configV2EditingIdx = -1;
    configV2Dirty = true;
    renderConfigV2EditorItems(row);
    renderConfigV2Editor();
    showFormatToast(indexes.length > 0 ? `已恢复 ${indexes.length} 个自动分页点` : "已清空分页点");
  } catch (err) {
    showFormatToast(`重置分页失败: ${err.message || err}`);
  } finally {
    if (configV2ResetBreaksBtn) configV2ResetBreaksBtn.disabled = false;
  }
}

function addConfigV2Line(afterIdx = null) {
  const row = getConfigV2SelectedRow();
  if (!row || !row.cachePath) return;
  commitConfigV2TextEditor();
  pushConfigV2History();
  const baseIdx = Number.isInteger(afterIdx) ? afterIdx : configV2FocusedIdx;
  const insertAt = baseIdx >= 0 && baseIdx < configV2Elements.length ? baseIdx + 1 : configV2Elements.length;
  configV2Elements.splice(insertAt, 0, { type: "text", content: "" });
  configV2FocusedIdx = insertAt;
  configV2Dirty = true;
  renderConfigV2EditorItems(row);
}

function bindConfigV2EditorInteractions() {
  const body = configV2EditorBody;
  if (!body || body.dataset.configV2Bound === "1") return;
  body.dataset.configV2Bound = "1";
  let dragIdx = -1;
  let dragBreakAfterIdx = -1;
  let pointerDownInsideEditor = false;

  const getInsertIdx = (clientY) => {
    const rows = body.querySelectorAll(".config-v2-editor-row");
    for (let i = 0; i < rows.length; i += 1) {
      const rect = rows[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return rows.length;
  };

  const clearIndicators = () => document.querySelectorAll(".config-v2-drag-indicator").forEach((el) => el.remove());
  const clearMergeTargets = () => body.querySelectorAll(".config-v2-editor-item.merge-target").forEach((el) => el.classList.remove("merge-target"));
  const getMergeTargetItem = (target) => {
    const targetItem = target.closest(".config-v2-editor-item");
    if (!targetItem) return null;
    const targetIdx = parseInt(targetItem.dataset.index);
    const canMerge = !isNaN(targetIdx)
      && targetIdx !== dragIdx
      && isTextEditorElement(configV2Elements[dragIdx])
      && isTextEditorElement(configV2Elements[targetIdx]);
    return canMerge ? targetItem : null;
  };
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
    const hadStaleTextEditor = !!body.querySelector(".config-v2-text-editor");
    const addBtn = e.target.closest(".config-v2-item-add");
    if (addBtn) {
      const idx = parseInt(addBtn.dataset.index);
      if (!isNaN(idx)) addConfigV2Line(idx);
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
        configV2Elements.splice(idx, 1);
        configV2FocusedIdx = -1;
        configV2Dirty = true;
        renderConfigV2EditorItems(getConfigV2SelectedRow());
      }
      return;
    }
    const copyBtn = e.target.closest(".config-v2-item-copy");
    if (copyBtn) {
      const idx = parseInt(copyBtn.dataset.index);
      if (!isNaN(idx) && configV2Elements[idx]) {
        pushConfigV2History();
        configV2Elements.splice(idx + 1, 0, cloneEditorElement(configV2Elements[idx]));
        configV2FocusedIdx = idx + 1;
        configV2Dirty = true;
        renderConfigV2EditorItems(getConfigV2SelectedRow());
      }
      return;
    }
    const editBtn = e.target.closest(".config-v2-item-edit");
    if (editBtn) {
      const idx = parseInt(editBtn.dataset.index);
      if (!isNaN(idx) && isTextEditorElement(configV2Elements[idx])) {
        configV2EditingIdx = idx;
        configV2FocusedIdx = idx;
        renderConfigV2EditorItems(getConfigV2SelectedRow());
        const editor = body.querySelector(`.config-v2-text-editor[data-index="${idx}"]`);
        if (editor) {
          editor.focus();
          editor.setSelectionRange(editor.value.length, editor.value.length);
        }
      }
      return;
    }
    const item = e.target.closest(".config-v2-editor-item");
    if (!item) {
      configV2FocusedIdx = -1;
      if (hadStaleTextEditor) renderConfigV2EditorItems(getConfigV2SelectedRow());
      else body.querySelectorAll(".config-v2-editor-item").forEach((el) => el.classList.remove("focused"));
      return;
    }
    configV2FocusedIdx = parseInt(item.dataset.index);
    if (hadStaleTextEditor) {
      renderConfigV2EditorItems(getConfigV2SelectedRow());
    } else {
      body.querySelectorAll(".config-v2-editor-item").forEach((el) => el.classList.remove("focused"));
      item.classList.add("focused");
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

  body.addEventListener("dragstart", (e) => {
    if (configV2EditingIdx >= 0) return;
    const breakMarker = e.target.closest(".config-v2-page-break-marker");
    if (breakMarker) {
      dragBreakAfterIdx = parseInt(breakMarker.dataset.breakAfterIndex);
      breakMarker.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `break:${dragBreakAfterIdx}`);
      return;
    }
    const item = e.target.closest(".config-v2-editor-item");
    if (!item || e.target.closest(".config-v2-text-editor") || e.target.closest(".config-v2-item-add") || e.target.closest(".config-v2-item-page-break") || e.target.closest(".config-v2-item-delete") || e.target.closest(".config-v2-item-copy") || e.target.closest(".config-v2-item-edit")) return;
    dragIdx = parseInt(item.dataset.index);
    item.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(dragIdx));
  });

  body.addEventListener("dragend", () => {
    body.querySelectorAll(".config-v2-editor-item").forEach((el) => el.classList.remove("dragging"));
    body.querySelectorAll(".config-v2-page-break-marker").forEach((el) => el.classList.remove("dragging"));
    clearIndicators();
    clearMergeTargets();
    dragIdx = -1;
    dragBreakAfterIdx = -1;
  });

  body.addEventListener("dragover", (e) => {
    if (configV2EditingIdx >= 0 || (dragIdx < 0 && dragBreakAfterIdx < 0)) return;
    e.preventDefault();
    if (dragBreakAfterIdx >= 0) {
      clearMergeTargets();
      updateBreakIndicator(e.clientY);
      return;
    }
    const mergeTarget = getMergeTargetItem(e.target);
    clearMergeTargets();
    if (mergeTarget) {
      clearIndicators();
      mergeTarget.classList.add("merge-target");
      return;
    }
    updateIndicator(e.clientY);
  });

  body.addEventListener("dragleave", (e) => {
    if (body.contains(e.relatedTarget)) return;
    clearIndicators();
    clearMergeTargets();
  });

  body.addEventListener("drop", (e) => {
    if (configV2EditingIdx >= 0 || (dragIdx < 0 && dragBreakAfterIdx < 0)) return;
    e.preventDefault();
    clearIndicators();
    clearMergeTargets();
    if (dragBreakAfterIdx >= 0) {
      const toAfterIdx = getBreakAfterIdx(e.clientY);
      if (canBreakAfterConfigV2Index(toAfterIdx)) {
        pushConfigV2History();
        setConfigV2BreakAfter(dragBreakAfterIdx, false);
        setConfigV2BreakAfter(toAfterIdx, true);
        configV2FocusedIdx = toAfterIdx;
        configV2Dirty = true;
        renderConfigV2EditorItems(getConfigV2SelectedRow());
      }
      dragBreakAfterIdx = -1;
      return;
    }
    const targetItem = e.target.closest(".config-v2-editor-item");
    const targetIdx = targetItem ? parseInt(targetItem.dataset.index) : NaN;
    const canMerge = !isNaN(targetIdx)
      && targetIdx !== dragIdx
      && isTextEditorElement(configV2Elements[dragIdx])
      && isTextEditorElement(configV2Elements[targetIdx]);
    if (canMerge) {
      pushConfigV2History();
      mergeTextEditorElements(dragIdx, targetIdx);
      renderConfigV2EditorItems(getConfigV2SelectedRow());
      dragIdx = -1;
      return;
    }
    const toIdx = getInsertIdx(e.clientY);
    if (toIdx !== dragIdx) {
      const adjusted = toIdx > dragIdx ? toIdx - 1 : toIdx;
      if (adjusted === dragIdx) {
        dragIdx = -1;
        return;
      }
      pushConfigV2History();
      const [moved] = configV2Elements.splice(dragIdx, 1);
      configV2Elements.splice(adjusted, 0, moved);
      configV2FocusedIdx = adjusted;
      configV2Dirty = true;
      renderConfigV2EditorItems(getConfigV2SelectedRow());
    }
    dragIdx = -1;
  });
}

// 绑定编辑器按钮
document.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.getElementById("editorCloseBtn");
  const cancelBtn = document.getElementById("editorCancelBtn");
  const saveBtn = document.getElementById("editorSaveBtn");
  const addLineBtn = document.getElementById("editorAddLineBtn");
  const overlay = document.getElementById("editorOverlay");
  const tplDropdown = document.getElementById("editorTemplateDropdown");
  const tplTrigger = document.getElementById("editorTplTrigger");

  if (closeBtn) closeBtn.addEventListener("click", () => closeEditor(false));
  if (cancelBtn) cancelBtn.addEventListener("click", () => closeEditor(false));
  if (addLineBtn) addLineBtn.addEventListener("click", () => {
    const newEl = { type: "text", content: "" };
    let insertAt = 0;
    if (editorFocusedIdx >= 0 && editorFocusedIdx < editorElements.length) {
      insertAt = editorFocusedIdx + 1;
    }
    editorElements.splice(insertAt, 0, newEl);
    editorFocusedIdx = insertAt;
    renderEditorItems();
    const items = document.querySelectorAll(".editor-item");
    if (items[editorFocusedIdx]) items[editorFocusedIdx].scrollIntoView({ block: "center", behavior: "smooth" });
  });
  if (tplTrigger && tplDropdown) {
    tplTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      tplDropdown.classList.toggle("open");
    });
    document.addEventListener("click", () => tplDropdown.classList.remove("open"));
  }
  if (saveBtn) saveBtn.addEventListener("click", async () => {
    if (!editorCurrentRow) return;
    saveBtn.disabled = true;
    try {
      // 重新编号 index
      editorElements.forEach((el, i) => { el.index = i + 1; });
      const result = await api.saveCacheJson(editorCurrentRow.cachePath, editorElements);
      if (result.cache_path && result.cache_path !== editorCurrentRow.cachePath) {
        editorCurrentRow.cachePath = result.cache_path;
        persistState();
      }
      closeEditor(true);
      showFormatToast("顺序已保存");
    } catch (err) {
      showFormatToast(`保存失败: ${err}`);
    } finally {
      saveBtn.disabled = false;
    }
  });
  if (overlay) overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeEditor(false);
  });
});

async function parseFileRow(row, force = false) {
  if (!row.templateId) return;
  if (!force && row.cachePath) return;
  const sourcePath = row.sourcePath || row.path;
  if (!sourcePath) {
    row.genStatus = "解析失败";
    row.parseError = "缺少源文件路径";
    render();
    persistState();
    return;
  }
  row.genStatus = "解析中";
  row.parseError = null;
  render();
  try {
    const result = await api.parseFile(sourcePath, row.templateId);
      if (result.cache_path) {
        row.cachePath = result.cache_path;
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
  render();
  persistState();
}

function installDropEvents() {
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
  const showOverlay = () => {
    if (globalDropOverlay) globalDropOverlay.classList.remove("hidden");
    if (dropZone) dropZone.classList.add("dragging");
    if (dropHint) dropHint.textContent = "松开后导入并解析";
  };
  const hideOverlay = () => {
    globalDragDepth = 0;
    if (globalDropOverlay) globalDropOverlay.classList.add("hidden");
    if (dropZone) dropZone.classList.remove("dragging");
    if (dropHint) dropHint.textContent = "支持：docx / png / jpg / jpeg";
  };

  window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    globalDragDepth += 1;
    showOverlay();
  });
  window.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    showOverlay();
  });
  window.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    globalDragDepth = Math.max(0, globalDragDepth - 1);
    if (globalDragDepth === 0) hideOverlay();
  });
  window.addEventListener("drop", async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const dtFiles = Array.from(e.dataTransfer?.files || []);
    hideOverlay();
    await importBrowserFiles(dtFiles);
  });
}

async function refreshLogsAndQueue() {
  if (refreshLogsAndQueue._inFlight) return;
  refreshLogsAndQueue._inFlight = true;
  try {
    const data = await api.dashboard();
    dispatchLogEl.textContent = normalizeLogForDisplay(data.dispatch_log || "");
    watcherLogEl.textContent = normalizeLogForDisplay(data.watcher_log || "");
    pipelineLogEl.textContent = normalizeLogForDisplay(data.pipeline_log || "");

    // 验证文件是否存在，移除不存在的条目
    if (state.files.length > 0) {
      const rowsNeedingSource = state.files.filter((x) => !x.cachePath);
      const paths = rowsNeedingSource.map((x) => x.path);
      const validation = paths.length > 0 ? await api.validateFiles(paths) : [];
      if (paths.length > 0 && Array.isArray(validation)) {
        const validPaths = new Set(validation.filter((v) => v.exists).map((v) => v.path));
        const beforeCount = state.files.length;
        state.files = state.files.filter((x) => x.cachePath || validPaths.has(x.path));
        const removedCount = beforeCount - state.files.length;
        if (removedCount > 0) {
          showFormatToast(`已清理 ${removedCount} 个不存在的文件`);
        }
      }
    }

    const prevPending = normalizeCount(state.queueSnapshot.pending);
    const prevRunning = normalizeCount(state.queueSnapshot.running);
    const prevActive = (prevPending + prevRunning) > 0;
    const nowPending = normalizeCount(data.pending_count);
    const nowRunning = normalizeCount(data.running_count);
    const nowActive = (nowPending + nowRunning) > 0;

    if (prevActive && !nowActive) {
      const success = normalizeCount(data.last_success ?? data.done_count);
      const fail = normalizeCount(data.last_fail ?? data.error_count);
      const reportKey = data.last_task_id || `${success}_${fail}_${data.done_count || 0}_${data.error_count || 0}`;
      if (reportKey !== state.lastCheckReportKey) {
        state.lastCheckReportKey = reportKey;
        window.alert(`自动检查结果\n完成任务：${success}\n异常任务：${fail}`);
        persistState();
      }
    }

    state.queueSnapshot = { pending: nowPending, running: nowRunning };
    state.dashboardSummary = normalizeDashboardSummary(data);
    let fileResultsApplied = false;
    if (data.progress && Array.isArray(data.progress.results)) {
      fileResultsApplied = applyFileRunResults(data.progress.results, data.progress);
    }
    if (Array.isArray(data.last_file_results)) {
      fileResultsApplied = applyFileRunResults(data.last_file_results, {
        task_id: data.last_task_id,
        task_path: data.last_task_path
      }) || fileResultsApplied;
    }
    if (Date.now() - lastCacheReconcileAt > 60000) {
      await reconcileCachePaths();
    }

    if (watcherAliveStatusEl) {
      if (data.watcher_alive) {
        watcherAliveStatusEl.textContent = "运行中";
        watcherAliveStatusEl.style.color = "#6fba2c";
      } else if (state.watcherInstalled) {
        watcherAliveStatusEl.textContent = "未响应（心跳超时）";
        watcherAliveStatusEl.style.color = "#e05a5a";
      } else {
        watcherAliveStatusEl.textContent = "-";
        watcherAliveStatusEl.style.color = "";
      }
    }
    if (data.progress) {
      const prog = data.progress;
      const progressTaskId = getRunMetaTaskId(prog);
      const pendingFiles = state.files.filter((x) => (
        x.supported
        && x.templateId
        && (progressTaskId ? x.activeTaskId === progressTaskId : ["处理中", "已投递"].includes(x.genStatus))
      ));
      if (pendingFiles.length > 0 && prog.status === "processing") {
        pendingFiles.forEach((x) => { x.genStatus = "处理中"; });
        render();
      } else if (prog.status === "done" && !fileResultsApplied && normalizeCount(data.last_fail) === 0) {
        pendingFiles.forEach((x) => { x.genStatus = "已完成"; });
        render();
      }
    }
    if (fileResultsApplied) {
      render();
      persistState();
    }
    renderWorkflowOverview();
    await syncInputs();
  } catch (err) {
    statusText.textContent = `刷新失败: ${err}`;
  } finally {
    refreshLogsAndQueue._inFlight = false;
  }
}

async function clearSingleLog(kind) {
  const valid = new Set(["dispatch", "watcher", "pipeline"]);
  if (!valid.has(kind)) return;
  try {
    await api.clearLog(kind);
    await refreshLogsAndQueue();
    showFormatToast(`已清除 ${kind}.log`);
  } catch (err) {
    showFormatToast(`清除日志失败: ${err}`);
  }
}

async function startSelected() {
  if (startActionTestDisabled) { showFormatToast("F11 测试模式中：开始处理已禁用"); return; }
  startBtn.disabled = true;
  if (configV2StartBtn) configV2StartBtn.disabled = true;
  try {
    if (state.activeTab === "config2" && configV2Dirty) {
      await saveConfigV2Editor();
      if (configV2Dirty) {
        throw new Error("编辑内容保存失败，已停止处理");
      }
    }

    const candidates = state.files.filter((x) => x.cachePath && x.templateId && x.genStatus !== "已完成" && x.genStatus !== "缓存丢失");
    if (candidates.length === 0) {
      updateWorkStatusText("待处理", "warn", "没有已解析的文件");
      showFormatToast("请先选择模板等待解析完成");
      startBtn.disabled = false;
      if (configV2StartBtn) configV2StartBtn.disabled = false;
      return;
    }

    const diskInfo = await api.diskSpace();
    if (diskInfo.warning) {
      const proceed = confirm(`磁盘空间不足: 仅剩 ${diskInfo.available_mb}MB。是否继续执行？`);
      if (!proceed) {
        startBtn.disabled = false;
        if (configV2StartBtn) configV2StartBtn.disabled = false;
        return;
      }
    }

    candidates.forEach((x) => {
      x.genStatus = "处理中";
      x.outputDismissed = false;
      x.outputPath = null;
      x.activeTaskId = null;
    });
    render();

    const payload = candidates.map((x) => ({ cache_path: x.cachePath, template_id: x.templateId }));
    const result = await api.startPipeline(payload);
    state.lastRun = { accepted: result.accepted || 0, skipped: result.skipped || 0, errors: result.skipped_files || [] };
    const taskId = result.task_id ? String(result.task_id) : null;
    const acceptedFiles = Array.isArray(result.accepted_files) ? result.accepted_files : [];
    const acceptedCachePaths = new Set();
    if (acceptedFiles.length > 0) {
      acceptedFiles.forEach((item) => {
        const requested = item.requested_cache_path || "";
        const resolved = item.cache_path || "";
        if (!resolved) return;
        acceptedCachePaths.add(resolved);
        const row = state.files.find((x) => pathsMatch(x.cachePath, requested) || pathsMatch(x.cachePath, resolved));
        if (row) {
          row.cachePath = resolved;
          row.activeTaskId = taskId;
        }
      });
    } else if (result.accepted > 0) {
      candidates.forEach((x) => {
        if (x.cachePath) acceptedCachePaths.add(x.cachePath);
      });
    }

    if (result.accepted > 0) {
      candidates.forEach((x) => {
        if (acceptedCachePaths.has(x.cachePath)) {
          x.genStatus = "已投递";
          x.activeTaskId = taskId;
        } else if (x.genStatus === "处理中") {
          x.genStatus = x.cachePath ? "已解析" : "未处理";
        }
      });
      showFormatToast(`已投递 ${result.accepted} 个文件到队列`);
      state.queueSnapshot = { pending: 0, running: 1 };
    } else {
      candidates.forEach((x) => {
        if (x.genStatus === "处理中") x.genStatus = x.cachePath ? "已解析" : "未处理";
      });
    }

    if (Array.isArray(result.skipped_files) && result.skipped_files.length > 0) {
      result.skipped_files.forEach((line) => {
        const row = state.files.find((x) => x.cachePath && line.indexOf(x.cachePath) >= 0);
        if (row) {
          row.genStatus = "已跳过";
          row.activeTaskId = null;
        }
      });
    }

    updateWorkStatusText("待处理", "warn", "处理任务已投递，等待分发执行");
    await refreshLogsAndQueue();
  } catch (err) {
    updateWorkStatusText("错误", "bad", "启动失败，请检查日志");
    state.lastRun.errors = [String(err)];
    state.files.filter((x) => x.genStatus === "处理中").forEach((x) => {
      x.genStatus = "失败";
      x.activeTaskId = null;
    });
  } finally {
    startBtn.disabled = false;
    if (configV2StartBtn) configV2StartBtn.disabled = false;
    render();
    persistState();
  }
}

async function pickAndAddFiles() {
  try {
    const paths = await api.pickFiles();
    if (Array.isArray(paths) && paths.length > 0) {
      const result = upsertFiles(paths, { skipUnsupported: true });
      if (result.rejected > 0) showFormatToast(`已忽略 ${result.rejected} 个不支持格式文件`);
      if (state.activeTab === "config2") renderConfigV2();
    }
  } catch (err) {
    statusText.textContent = `选择文件失败: ${err}`;
  }
}

async function importBrowserFiles(fileList) {
  const files = Array.from(fileList || []);
  if (files.length === 0) return;
  let imported = 0;
  let rejected = 0;
  for (const f of files) {
    const ext = getExt(f.name || "");
    if (!SUPPORTED_EXTS.has(ext)) {
      rejected += 1;
      continue;
    }
    if (f.path) {
      const result = upsertFiles([f.path], { skipUnsupported: true });
      imported += result.added;
      rejected += result.rejected;
      continue;
    }
    try {
      const result = await api.upload(f, "");
      if (result.path) {
        const added = upsertFiles([result.path], { skipUnsupported: true });
        imported += added.added;
        rejected += added.rejected;
      }
    } catch (_) {
      rejected += 1;
    }
  }
  if (imported > 0) showFormatToast(`已导入 ${imported} 个文件`);
  if (rejected > 0) showFormatToast(`已忽略 ${rejected} 个文件`);
}

async function installWatcherFn() {
  installWatcherBtn.disabled = true;
  watcherActionStatusEl.textContent = "正在安装...";
  try {
    const msg = await api.installWatcher();
    watcherActionStatusEl.textContent = msg.message || "监听器安装完成";
    await checkWatcherFn();
  } catch (err) {
    watcherActionStatusEl.textContent = `监听器安装失败: ${err}`;
  } finally {
    installWatcherBtn.disabled = false;
  }
}

async function updateWatcherFn() {
  updateWatcherBtn.disabled = true;
  watcherActionStatusEl.textContent = "正在更新...";
  try {
    const msg = await api.installWatcher();
    watcherActionStatusEl.textContent = msg.message || "监听器更新完成，请重启 InDesign 生效";
    await checkWatcherFn();
  } catch (err) {
    watcherActionStatusEl.textContent = `监听器更新失败: ${err}`;
  } finally {
    updateWatcherBtn.disabled = false;
  }
}

async function uninstallWatcherFn() {
  uninstallWatcherBtn.disabled = true;
  watcherActionStatusEl.textContent = "正在卸载...";
  try {
    const msg = await api.uninstallWatcher();
    watcherActionStatusEl.textContent = msg.message || "监听器已卸载";
    await checkWatcherFn();
  } catch (err) {
    watcherActionStatusEl.textContent = `监听器卸载失败: ${err}`;
  } finally {
    uninstallWatcherBtn.disabled = false;
  }
}

async function checkWatcherFn() {
  checkWatcherBtn.disabled = true;
  try {
    const data = await api.watcherStatus();
    state.watcherInstalled = !!data.installed;
    if (watcherInstallStatusEl) {
      if (data.installed) {
        watcherInstallStatusEl.textContent = "已安装";
        watcherInstallStatusEl.style.color = "#6fba2c";
      } else {
        watcherInstallStatusEl.textContent = "未安装";
        watcherInstallStatusEl.style.color = "#e05a5a";
      }
    }
    if (watcherPathEl) watcherPathEl.textContent = data.installed ? data.path : "-";
    renderWorkflowOverview();
    render();
    persistState();
  } catch (err) {
    if (watcherInstallStatusEl) {
      watcherInstallStatusEl.textContent = `检查失败: ${err}`;
      watcherInstallStatusEl.style.color = "#e05a5a";
    }
  } finally {
    checkWatcherBtn.disabled = false;
  }
}

async function openStartupDir() {
  try {
    const data = await api.watcherStatus();
    if (data.installed && data.path) {
      const dir = data.path.substring(0, data.path.lastIndexOf("/"));
      await api.openPath(dir);
    } else {
      watcherActionStatusEl.textContent = "监听器未安装，无法打开目录";
    }
  } catch (err) {
    watcherActionStatusEl.textContent = `打开目录失败: ${err}`;
  }
}

async function loadConfig() {
  try {
    const data = await api.getConfig();
    if (configProjectRootEl) configProjectRootEl.textContent = data.project_root || "-";
    if (configFilePathEl) configFilePathEl.textContent = data.config_exists ? data.config_path : `${data.config_path}（未创建）`;
    if (configIndesignPathEl) configIndesignPathEl.textContent = data.indesign_app_path || "-";
    if (projectRootInput && !projectRootInput.value) projectRootInput.value = data.project_root || "";
    if (indesignAppPathInput && !indesignAppPathInput.value) indesignAppPathInput.value = data.indesign_app_path || "";
    if (data.polling_interval && typeof data.polling_interval === "number" && data.polling_interval >= 500) {
      pollingInterval = data.polling_interval;
    }
  } catch (err) {
    if (configProjectRootEl) configProjectRootEl.textContent = `读取失败: ${err}`;
  }
}

async function setProjectRoot() {
  const value = (projectRootInput?.value || "").trim();
  if (!value) { if (projectRootStatusEl) projectRootStatusEl.textContent = "请输入项目根目录路径"; return; }
  if (setProjectRootBtn) setProjectRootBtn.disabled = true;
  try {
    const result = await api.setConfig({ project_root: value });
    if (projectRootStatusEl) {
      projectRootStatusEl.textContent = "项目根目录已设置";
      projectRootStatusEl.style.color = "#6fba2c";
    }
    await loadConfig();
    await checkWatcherFn();
    await refreshLogsAndQueue();
  } catch (err) {
    if (projectRootStatusEl) { projectRootStatusEl.textContent = `设置失败: ${err}`; projectRootStatusEl.style.color = "#e05a5a"; }
  } finally {
    if (setProjectRootBtn) setProjectRootBtn.disabled = false;
  }
}

async function setIndesignAppPath() {
  const value = (indesignAppPathInput?.value || "").trim();
  if (!value) { if (indesignAppPathStatusEl) indesignAppPathStatusEl.textContent = "请输入 InDesign 应用路径"; return; }
  if (setIndesignAppPathBtn) setIndesignAppPathBtn.disabled = true;
  try {
    const result = await api.setConfig({ indesign_app_path: value });
    if (indesignAppPathStatusEl) {
      indesignAppPathStatusEl.textContent = "InDesign 应用路径已设置";
      indesignAppPathStatusEl.style.color = "#6fba2c";
    }
    await loadConfig();
  } catch (err) {
    if (indesignAppPathStatusEl) { indesignAppPathStatusEl.textContent = `设置失败: ${err}`; indesignAppPathStatusEl.style.color = "#e05a5a"; }
  } finally {
    if (setIndesignAppPathBtn) setIndesignAppPathBtn.disabled = false;
  }
}

function showGuidePage() {
  const guide = document.getElementById("guidePage");
  if (guide) guide.classList.remove("hidden");
}

function hideGuidePage() {
  const guide = document.getElementById("guidePage");
  if (guide) guide.classList.add("hidden");
}

async function checkAgentConnection() {
  try {
    const data = await api.health();
    agentOnline = true;
    hideGuidePage();
    return data;
  } catch {
    agentOnline = false;
    showGuidePage();
    return null;
  }
}

function bindEvents() {
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });
  phoneTabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.remove("is-tapping");
      void btn.offsetWidth;
      btn.classList.add("is-tapping");
      setTab(btn.dataset.tab);
    });
    btn.addEventListener("animationend", (e) => {
      if (e.animationName === "phoneIconTap") btn.classList.remove("is-tapping");
    });
  });

  refreshBtn.addEventListener("click", refreshLogsAndQueue);
  const cacheDirBtn = document.getElementById("cacheDirBtn");
  if (cacheDirBtn) {
    cacheDirBtn.addEventListener("click", async () => {
      try {
        const cfg = await api.getConfig();
        const dir = cfg.project_root + "/workspace/B_outputs/_cache";
        await api.openPath(dir);
      } catch (err) { statusText.textContent = `打开缓存目录失败: ${err}`; }
    });
  }
  openTemplateBtn.addEventListener("click", async () => {
    try {
      const cfg = await api.getConfig();
      const dir = cfg.project_root + "/workspace/A_templates";
      await api.openPath(dir);
    } catch (err) { statusText.textContent = `打开模板目录失败: ${err}`; }
  });
  openGeneratedBtn.addEventListener("click", async () => {
    try { await api.openOutputFolder(); } catch (err) { statusText.textContent = `打开目录失败: ${err}`; }
  });
  if (configOpenOutputBtn) {
    configOpenOutputBtn.addEventListener("click", async () => {
      try { await api.openOutputFolder(); } catch (err) { statusText.textContent = `打开目录失败: ${err}`; }
    });
  }
  if (configV2OpenOutputBtn) {
    configV2OpenOutputBtn.addEventListener("click", async () => {
      try { await api.openOutputFolder(); } catch (err) { statusText.textContent = `打开目录失败: ${err}`; }
    });
  }
  exportAllBtn.addEventListener("click", async () => {
    try { await api.openOutputFolder(); } catch (err) { statusText.textContent = `打开输出目录失败: ${err}`; }
  });
  clearLogButtons.forEach((btn) => {
    btn.addEventListener("click", () => { const kind = btn.getAttribute("data-log-kind") || ""; clearSingleLog(kind); });
  });

  clearInputBtn.addEventListener("click", async () => {
    state.files = [];
    state.configV2SelectedId = "";
    configV2Elements = [];
    configV2LoadedKey = "";
    configV2Dirty = false;
    resetConfigV2History();
    state.lastRun = { accepted: 0, skipped: 0, errors: [] };
    render();
    persistState();
    try { await api.clearInbox(); } catch (_) {}
  });

  const clearDoneBtn = document.getElementById("clearDoneBtn");
  if (clearDoneBtn) {
    clearDoneBtn.addEventListener("click", () => {
      state.files = state.files.filter((x) => x.genStatus !== "已完成");
      ensureConfigV2Selection();
      render();
      persistState();
      showFormatToast("已清空已完成条目");
    });
  }

  startBtn.addEventListener("click", startSelected);
  startBtn.addEventListener("pointerenter", () => startBtn.classList.add("is-hovering"));
  startBtn.addEventListener("pointerleave", () => startBtn.classList.remove("is-hovering"));
  installWatcherBtn.addEventListener("click", installWatcherFn);
  if (updateWatcherBtn) updateWatcherBtn.addEventListener("click", updateWatcherFn);
  if (uninstallWatcherBtn) uninstallWatcherBtn.addEventListener("click", uninstallWatcherFn);
  checkWatcherBtn.addEventListener("click", checkWatcherFn);
  if (openStartupDirBtn) openStartupDirBtn.addEventListener("click", openStartupDir);
  if (setProjectRootBtn) setProjectRootBtn.addEventListener("click", setProjectRoot);
  if (setIndesignAppPathBtn) setIndesignAppPathBtn.addEventListener("click", setIndesignAppPath);

  if (cleanupCheckBtn && cleanupResultEl) {
    cleanupCheckBtn.addEventListener("click", async () => {
      cleanupCheckBtn.disabled = true;
      cleanupResultEl.textContent = "检查中...";
      try {
        const report = await api.cleanup();
        const lines = [];
        lines.push(`恢复卡住任务: ${report.recovered} 个`);
        lines.push(`清理过期错误: ${report.stale_errors_cleaned} 个`);
        lines.push(`清理残留进度: ${report.progress_cleaned ? "是" : "否"}`);
        lines.push(`监听器安装: ${report.watcher_installed ? "已安装" : "未安装"}`);
        lines.push(`监听器运行: ${report.watcher_alive ? "正常" : "未响应"}`);
        if (report.issues && report.issues.length > 0) {
          lines.push("---");
          report.issues.forEach((i) => lines.push(`! ${i}`));
        }
        cleanupResultEl.textContent = lines.join("\n");
        await checkWatcherFn();
        await refreshLogsAndQueue();
      } catch (err) {
        cleanupResultEl.textContent = `清理检查失败: ${err}`;
      } finally {
        cleanupCheckBtn.disabled = false;
      }
    });
  }

  saveTemplateDirBtn.addEventListener("click", async () => {
    const next = (templateDirInput.value || "").trim();
    if (!next) { templateDirStatus.textContent = "模板目录不能为空"; return; }
    state.templateDir = next;
    templateDirStatus.textContent = `已保存：${next}`;
    await persistState();
  });

  const clearCacheBtn = document.getElementById("clearCacheBtn");
  const clearCacheResult = document.getElementById("clearCacheResult");
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener("click", async () => {
      const stats = await api.queueStats();
      if (normalizeCount(stats.pending) + normalizeCount(stats.running) > 0) {
        showFormatToast("有任务等待或执行中，请稍后再清理");
        return;
      }
      clearCacheBtn.disabled = true;
      clearCacheResult.textContent = "清理中...";
      try {
        const result = await api.clearCache();
        clearCacheResult.textContent = result.message || `已清理 ${result.cleared} 个文件`;
        await loadCacheStats();
      } catch (err) {
        clearCacheResult.textContent = `清理失败: ${err}`;
      } finally {
        clearCacheBtn.disabled = false;
      }
    });
  }

  async function loadCacheStats() {
    const el = document.getElementById("cacheStatsDisplay");
    if (!el) return;
    try {
      const stats = await api.cacheStats();
      const total = normalizeCount(stats.total_size_bytes);
      const dirs = Array.isArray(stats.dirs) ? stats.dirs : [];
      const colors = {
        "_cache": "#3f8efc",
        "_shared_images": "#ff9f1c",
        "logs": "#6c757d",
        "queue": "#00a870"
      };
      const labels = {
        "_cache": "_cache (编辑核心 JSON，保留)",
        "_shared_images": "_shared_images (编辑图片资源，保留)",
        "logs": "logs (日志)",
        "queue": "queue (任务队列)"
      };
      let barHtml = `<div style="margin-bottom:8px;"><strong>B_outputs</strong> 共 ${(total / 1024 / 1024).toFixed(1)}MB</div>`;
      barHtml += `<div style="display:flex;height:24px;border-radius:6px;overflow:hidden;margin-bottom:12px;background:#eee;">`;
      dirs.forEach((d) => {
        const sizeBytes = normalizeCount(d.size_bytes);
        if (sizeBytes > 0 && total > 0) {
          const pct = (sizeBytes / total) * 100;
          barHtml += `<div style="width:${pct}%;background:${colors[d.name] || '#a1b3aa'};position:relative;" title="${escapeHtml(d.name)}: ${(sizeBytes / 1024 / 1024).toFixed(1)}MB"></div>`;
        }
      });
      barHtml += `</div>`;
      dirs.forEach((d) => {
        const sizeBytes = normalizeCount(d.size_bytes);
        if (sizeBytes > 0) {
          const sz = sizeBytes > 1024 * 1024
            ? (sizeBytes / 1024 / 1024).toFixed(1) + "MB"
            : (sizeBytes / 1024).toFixed(0) + "KB";
          const pct = total > 0 ? ((sizeBytes / total) * 100).toFixed(1) : 0;
          barHtml += `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;font-size:12px;">
            <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${colors[d.name] || '#a1b3aa'};flex-shrink:0;"></span>
            <span style="flex:1;">${escapeHtml(labels[d.name] || d.name)}</span>
            <span style="color:#8a7a6a;">${normalizeCount(d.files)} 文件</span>
            <span style="min-width:70px;text-align:right;">${sz}</span>
            <span style="min-width:40px;text-align:right;color:#8a7a6a;">${pct}%</span>
          </div>`;
          if (Array.isArray(d.preserved) && d.preserved.length > 0) {
            barHtml += `<div style="padding-left:20px;margin:2px 0 6px;font-size:11px;color:#8a7a6a;line-height:1.5">`;
            d.preserved.forEach((p) => {
              barHtml += `<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">↳ ${escapeHtml(p)}</div>`;
            });
            barHtml += `</div>`;
          }
        }
      });
      el.innerHTML = barHtml;
    } catch (err) {
      el.textContent = `加载统计失败: ${err}`;
    }
  }

  const refreshCacheBtn = document.getElementById("refreshCacheBtn");
  if (refreshCacheBtn) {
    refreshCacheBtn.addEventListener("click", loadCacheStats);
  }

  const tabCleanup = document.getElementById("tab-cleanup");
  if (tabCleanup) {
    const obs = new MutationObserver(() => {
      if (tabCleanup.classList.contains("active")) loadCacheStats();
    });
    obs.observe(tabCleanup, { attributes: true, attributeFilter: ["class"] });
    if (tabCleanup.classList.contains("active")) loadCacheStats();
  }

  async function loadTemplateConfigs() {
    const el = document.getElementById("templateConfigList");
    if (!el) return;
    try {
      const templates = await api.getTemplates();
      if (!Array.isArray(templates) || templates.length === 0) {
        el.textContent = "暂无板块配置";
        return;
      }
      let html = "";
      for (const t of templates) {
        html += `<div style="margin-bottom:12px;padding:8px;background:rgba(255,255,255,0.5);border-radius:8px;">`;
        html += `<strong>${escapeHtml(t.id)}</strong>`;
        if (t.config) {
          const keys = Object.keys(t.config);
          for (const k of keys) {
            html += `<div style="display:flex;gap:8px;margin:4px 0;align-items:center;">
              <span style="min-width:140px;color:#8a7a6a;">${escapeHtml(k)}</span>
              <input class="tpl-cfg-input" data-template="${escapeHtml(t.id)}" data-key="${escapeHtml(k)}" value="${escapeHtml(t.config[k])}"
                style="flex:1;padding:4px 12px;border-radius:50px;border:2px solid #c4b89e;background:rgb(247,243,223);font-size:12px;height:32px;">
            </div>`;
          }
        }
        html += `</div>`;
      }
      html += `<button id="saveAllTplCfg" class="primary" style="padding:6px 16px;font-size:12px;height:32px;border-radius:50px;">保存全部</button>`;
      el.innerHTML = html;
      document.getElementById("saveAllTplCfg")?.addEventListener("click", async () => {
        const inputs = el.querySelectorAll(".tpl-cfg-input");
        const groups = {};
        inputs.forEach(inp => {
          const tid = inp.getAttribute("data-template");
          const key = inp.getAttribute("data-key");
          if (!groups[tid]) groups[tid] = {};
          groups[tid][key] = inp.value;
        });
        for (const [tid, cfg] of Object.entries(groups)) {
          await api.setTemplateConfig(tid, cfg);
        }
        showFormatToast("板块配置已保存");
      });
    } catch (err) {
      el.textContent = `加载失败: ${err}`;
    }
  }

  const tabTpl = document.getElementById("tab-templates");
  if (tabTpl) {
    const obs = new MutationObserver(() => {
      if (tabTpl.classList.contains("active")) loadTemplateConfigs();
    });
    obs.observe(tabTpl, { attributes: true, attributeFilter: ["class"] });
    if (tabTpl.classList.contains("active")) loadTemplateConfigs();
  }

  pickBtn.addEventListener("click", pickAndAddFiles);
  if (configV2AddFilesBtn) configV2AddFilesBtn.addEventListener("click", pickAndAddFiles);
  if (configV2RefreshBtn) configV2RefreshBtn.addEventListener("click", refreshLogsAndQueue);
  if (configV2StartBtn) configV2StartBtn.addEventListener("click", startSelected);
  if (configV2AddLineBtn) configV2AddLineBtn.addEventListener("click", addConfigV2Line);
  if (configV2UndoBtn) configV2UndoBtn.addEventListener("click", undoConfigV2Editor);
  if (configV2RedoBtn) configV2RedoBtn.addEventListener("click", redoConfigV2Editor);
  if (configV2ReparseBtn) configV2ReparseBtn.addEventListener("click", reparseConfigV2Selected);
  if (configV2ResetBreaksBtn) configV2ResetBreaksBtn.addEventListener("click", resetConfigV2PageBreaksToAuto);
  if (configV2SaveBtn) configV2SaveBtn.addEventListener("click", saveConfigV2Editor);
  if (configV2ZoomOutBtn) configV2ZoomOutBtn.addEventListener("click", () => setConfigV2Zoom(configV2Zoom - CONFIG_V2_ZOOM_STEP));
  if (configV2ZoomInBtn) configV2ZoomInBtn.addEventListener("click", () => setConfigV2Zoom(configV2Zoom + CONFIG_V2_ZOOM_STEP));
  if (configV2ZoomResetBtn) configV2ZoomResetBtn.addEventListener("click", () => setConfigV2Zoom(1));
  if (configV2CacheDirBtn) {
    configV2CacheDirBtn.addEventListener("click", async () => {
      try {
        const cfg = await api.getConfig();
        await api.openPath(`${cfg.project_root}/workspace/B_outputs/_cache`);
      } catch (err) { statusText.textContent = `打开缓存目录失败: ${err}`; }
    });
  }
  if (configV2ClearInputBtn) {
    configV2ClearInputBtn.addEventListener("click", async () => {
      state.files = [];
      state.configV2SelectedId = "";
      configV2Elements = [];
      configV2LoadedKey = "";
      configV2Dirty = false;
      resetConfigV2History();
      render();
      persistState();
      try { await api.clearInbox(); } catch (_) {}
    });
  }
  if (configV2ClearDoneBtn) {
    configV2ClearDoneBtn.addEventListener("click", () => {
      state.files = state.files.filter((x) => x.genStatus !== "已完成");
      ensureConfigV2Selection();
      render();
      persistState();
      showFormatToast("已清空已完成条目");
    });
  }
  if (configV2TplTrigger && configV2TemplateDropdown) {
    configV2TplTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!configV2TplTrigger.disabled) configV2TemplateDropdown.classList.toggle("open");
    });
    document.addEventListener("click", () => configV2TemplateDropdown.classList.remove("open"));
  }
  document.addEventListener("keydown", (e) => {
    if (state.activeTab !== "config2") return;
    const target = e.target;
    if (target && (target.closest?.("textarea, input, [contenteditable='true']"))) return;
    const modifier = e.metaKey || e.ctrlKey;
    if (!modifier) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      undoConfigV2Editor();
    } else if ((key === "z" && e.shiftKey) || key === "y") {
      e.preventDefault();
      redoConfigV2Editor();
    }
  });
  filePicker.addEventListener("change", async () => {
    await importBrowserFiles(filePicker.files || []);
    filePicker.value = "";
  });

  const snapExportBtn = document.getElementById("snapExportBtn");
  const snapCompareBtn = document.getElementById("snapCompareBtn");
  const snapPromoteBtn = document.getElementById("snapPromoteBtn");
  const snapRefreshBtn = document.getElementById("snapRefreshBtn");
  const snapOpenOutputBtn = document.getElementById("snapOpenOutputBtn");
  const snapExportStatus = document.getElementById("snapExportStatus");
  const snapCompareResult = document.getElementById("snapCompareResult");
  const snapGoldenList = document.getElementById("snapGoldenList");

  function setSnapButtonsEnabled(enabled) {
    [snapExportBtn, snapCompareBtn, snapPromoteBtn, snapRefreshBtn].forEach((btn) => {
      if (btn) btn.disabled = !enabled;
    });
  }

  function colorizeSnapReport(text) {
    return escapeHtml(text)
      .replace(/(通过|全部通过|已完成|成功)/g, '<span class="pass">$1</span>')
      .replace(/(失败|差异|错误|不匹配|缺失)/g, '<span class="fail">$1</span>');
  }

  if (snapExportBtn) {
    snapExportBtn.addEventListener("click", async () => {
      setSnapButtonsEnabled(false);
      snapExportStatus.textContent = "正在导出快照（请等待 InDesign 完成）...";
      snapCompareResult.textContent = "";
      try {
        const result = await api.snapshotExport();
        snapExportStatus.textContent = result.message || "完成";
        if (result.details) snapExportStatus.textContent += "\n" + result.details;
      } catch (err) {
        snapExportStatus.textContent = `导出失败: ${err}`;
      } finally {
        setSnapButtonsEnabled(true);
      }
    });
  }

  if (snapCompareBtn) {
    snapCompareBtn.addEventListener("click", async () => {
      setSnapButtonsEnabled(false);
      snapCompareResult.innerHTML = "正在对比...";
      snapExportStatus.textContent = "";
      try {
        const result = await api.snapshotCompare();
        snapCompareResult.innerHTML = colorizeSnapReport(result.details || result.message);
      } catch (err) {
        snapCompareResult.innerHTML = `<span class="fail">${escapeHtml(`对比失败: ${err}`)}</span>`;
      } finally {
        setSnapButtonsEnabled(true);
      }
    });
  }

  if (snapPromoteBtn) {
    snapPromoteBtn.addEventListener("click", async () => {
      setSnapButtonsEnabled(false);
      snapCompareResult.innerHTML = "正在更新金标...";
      try {
        const result = await api.snapshotPromote();
        snapCompareResult.innerHTML = colorizeSnapReport(result.details || result.message);
        if (snapGoldenList && snapRefreshBtn) snapRefreshBtn.click();
      } catch (err) {
        snapCompareResult.innerHTML = `<span class="fail">${escapeHtml(`更新金标失败: ${err}`)}</span>`;
      } finally {
        setSnapButtonsEnabled(true);
      }
    });
  }

  if (snapRefreshBtn) {
    snapRefreshBtn.addEventListener("click", async () => {
      if (!snapGoldenList) return;
      snapGoldenList.textContent = "刷新中...";
      try {
        const dirs = await api.snapshotDirs();
        if (Array.isArray(dirs) && dirs.length > 0) {
          snapGoldenList.textContent = dirs.join("\n");
        } else {
          snapGoldenList.textContent = "暂无金标/快照目录";
        }
      } catch (err) {
        snapGoldenList.textContent = `刷新失败: ${err}`;
      }
    });
  }

  if (snapOpenOutputBtn) {
    snapOpenOutputBtn.addEventListener("click", async () => {
      try { await api.openOutputFolder(); } catch (err) { statusText.textContent = `打开目录失败: ${err}`; }
    });
  }

  const dlMacBtn = document.getElementById("dlMacBtn");
  const dlWinBtn = document.getElementById("dlWinBtn");
  const guideStatus = document.getElementById("guideStatus");
  if (dlMacBtn) dlMacBtn.addEventListener("click", () => {
    window.open("https://github.com/mei/autoRainbow/releases/latest/download/autorainbow-agent-macos", "_blank");
    showFormatToast("正在下载 macOS 版，下载后双击运行即可");
  });
  if (dlWinBtn) dlWinBtn.addEventListener("click", () => {
    window.open("https://github.com/mei/autoRainbow/releases/latest/download/autorainbow-agent-win.exe", "_blank");
    showFormatToast("正在下载 Windows 版，下载后双击运行即可");
  });

  installDropEvents();
  bindStatusPreviewHotkeys();
}

let timer = null;
let pollingInterval = 2000;
let lastCacheReconcileAt = 0;

function startPolling() {
  if (timer) return;
  timer = setInterval(async () => {
    if (!agentOnline) return;
    await refreshLogsAndQueue();
  }, pollingInterval);
}

function stopPolling() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

async function syncInputs() {
  try {
    const inputs = await api.getInputs();
    if (!Array.isArray(inputs)) return;
    const inboxPaths = new Set(inputs.map((f) => f.path));
    let changed = false;
    state.files = state.files.filter((x) => {
      if (!x.cachePath && isInboxPath(x.path) && !inboxPaths.has(x.path)) { changed = true; return false; }
      return true;
    });
    const existingPaths = new Set(state.files.map((x) => x.path));
    inputs.forEach((f) => {
      if (existingPaths.has(f.path)) return;
      const imageFile = isImageExt(f.ext);
      state.files.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        path: f.path,
        name: f.name,
        ext: f.ext,
        supported: true,
        sourceDir: f.path.substring(0, f.path.lastIndexOf("/")),
        templateId: imageFile ? "4_一句话" : "",
        lockedTemplate: imageFile,
        genStatus: "未处理",
        cachePath: null,
        sourcePath: null,
        outputPath: null,
        outputDismissed: false,
        activeTaskId: null,
        parseError: null
      });
      changed = true;
    });
    if (changed) { render(); persistState(); }
  } catch (_) {}
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) { stopPolling(); }
  else { startPolling(); refreshLogsAndQueue(); syncInputs(); }
});

function updatePhoneClock() {
  if (!phoneClockEl) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  phoneClockEl.textContent = `${hh}:${mm}`;
}

async function bootstrap() {
  await loadState();
  const tabOverride = new URLSearchParams(window.location.search).get("tab");
  if (tabOverride && panes[tabOverride]) state.activeTab = tabOverride === "config" ? "config2" : tabOverride;
  if (templateDirInput) templateDirInput.value = state.templateDir || "";
  if (templateDirStatus) templateDirStatus.textContent = `当前模板目录：${state.templateDir || ""}`;
  if (lastUpdate) lastUpdate.textContent = `构建 ${BUILD_TIME}`;
  updatePhoneClock();
  bindEvents();
  setTab(state.activeTab || "config2", true);
  render();

  const health = await checkAgentConnection();
  if (health) {
    await reconcileCachePaths();
    await refreshLogsAndQueue();
    await checkWatcherFn();
    await loadConfig();
    await syncInputs();
  }

  startPolling();
  setInterval(checkAgentConnection, 5000);
  setInterval(updatePhoneClock, 30000);
  bindCustomScrollbar();
  updateCustomScrollbar();
}

bootstrap();
