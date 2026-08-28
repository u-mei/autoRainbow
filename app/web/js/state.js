// 全局状态与持久化（ES Module 拆分 Phase 0）
// 依赖：api.js / utils.js。被 ui.js / main.js(app.js) 引用。

import { api } from "./api.js";
import {
  getFileName, getDirName, evaluateSupport, isImageExt,
  normalizeQueueSnapshot, normalizeDashboardSummary
} from "./utils.js";

export const state = {
  activeTab: "config2",
  files: [],
  watcherInstalled: null,
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
  lastAppliedTaskId: "",
  lastRun: {
    accepted: 0,
    skipped: 0,
    errors: []
  },
  configV2SelectedId: "",
  pageTrimEnabled: true,
  lastRecoveredAt: "",
  agentOnline: false,
  // Phase 3 运行锁定叠层：不持久化（刷新页面即解除锁定）
  runLockActive: false,
  runLockMinimized: false,
  runLockJustDone: null
};

let persistStateQueue = Promise.resolve();

const statusText = document.getElementById("statusText");

// 与 app.js 的 panes 注册表保持一致（tab 面板 id 白名单）
const TAB_IDS = ["config2", "result", "logs", "watcher", "env", "cleanup", "templates", "snapshot", "components"];

export function persistState() {
  const snapshot = JSON.stringify(state);
  persistStateQueue = persistStateQueue
    .catch(() => {})
    .then(() => api.saveState(snapshot))
    .catch((err) => {
      statusText.textContent = `状态保存失败: ${err}`;
    });
  return persistStateQueue;
}

export async function loadState() {
  try {
    const data = await api.getState();
    const savedTab = data.activeTab === "config" ? "config2" : data.activeTab;
    state.activeTab = TAB_IDS.includes(savedTab) ? savedTab : "config2";
    state.watcherInstalled = typeof data.watcherInstalled === "boolean" ? data.watcherInstalled : null;
    state.showStateHint = !!data.showStateHint;
    state.queueSnapshot = normalizeQueueSnapshot(data.queueSnapshot || state.queueSnapshot);
    state.dashboardSummary = normalizeDashboardSummary(data.dashboardSummary || state.dashboardSummary);
    state.lastCheckReportKey = data.lastCheckReportKey || "";
    state.lastAppliedTaskId = data.lastAppliedTaskId || "";
    state.configV2SelectedId = data.configV2SelectedId || "";
    state.lastRecoveredAt = data.lastRecoveredAt || "";
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
        parseError: row.parseError || null,
        images: Array.isArray(row.images) ? row.images.slice() : (isImageExt(row.ext || support.ext) ? [] : undefined),
        name: isImageExt(row.ext || support.ext) ? "一句话项目" : name
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