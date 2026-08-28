// 轮询与日志/队列刷新（ES Module 拆分）
// 依赖：api / state / ui / utils / tasks / views。
// 2026-08-22 修复：不再 import app.js（过渡环会导致 app.js 被浏览器当作第二个模块加载，
// 顶层 bootstrap 执行两次 → 事件重复绑定）。改为由 app.js 通过 setRefreshHooks 注入回调。

import { api } from "./api.js";
import { state, persistState } from "./state.js";
import { showFormatToast } from "./ui.js";
import { normalizeLogForDisplay, normalizeCount, normalizeDashboardSummary, getRunMetaTaskId } from "./utils.js";
import { applyFileRunResults } from "./tasks.js";
import { renderWorkflowOverview } from "./views/results.js";

// app.js 注入的渲染/缓存核对回调（默认空实现，注入前不触发）
let refreshHooks = {
  render: () => {},
  reconcileCachePaths: async () => false,
  lastCacheReconcileAt: () => 0,
};

export function setRefreshHooks(hooks) {
  refreshHooks = { ...refreshHooks, ...hooks };
}

const dispatchLogEl = document.getElementById("dispatchLog");
const watcherLogEl = document.getElementById("watcherLog");
const pipelineLogEl = document.getElementById("pipelineLog");
const watcherAliveStatusEl = document.getElementById("watcherAliveStatus");
const statusText = document.getElementById("statusText");

export async function refreshLogsAndQueue() {
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

    // 自动恢复卡死任务提示：后端定时扫描 running，卡死任务移回 pending 并写事件，
    // 前端轮询发现新事件时提示（InDesign 闪退/dispatch 未执行导致的任务卡死）
    const recovered = data.recovered_recent;
    if (recovered && recovered.at && String(recovered.at) !== state.lastRecoveredAt) {
      state.lastRecoveredAt = String(recovered.at);
      // Phase 3（2026-08-25）：InDesign 卡住导致任务卡死被自动恢复时，
      // 队列仍 active（pending>0），active→idle 解除条件不会触发 → 遮罩一直挂着。
      // 此时自动解除运行锁定并提示，用户可重新投递。
      if (state.runLockActive) {
        state.runLockActive = false;
        state.runLockMinimized = false;
        persistState();
        refreshHooks.render();
        showFormatToast(`InDesign 卡住，已自动恢复 ${recovered.count} 个卡死任务（遮罩已解除，可重新投递）`);
      } else {
        persistState();
        showFormatToast(`已自动恢复 ${recovered.count} 个卡死任务（移至待处理队列）`);
      }
      // 2026-08-25：行状态随恢复重置——仅当 watcher 掉线（InDesign 未运行，恢复的任务不会
      // 被执行）时，把"已投递/处理中"的行恢复为"已解析"（activeTaskId 清空），否则重新投递
      // 会被 candidates 过滤排除（"没有可处理的文件"）。
      // watcher 活着时**不重置**：恢复的任务会继续执行，结果仍会被 applyFileRunResults
      // 应用（重置为已解析会因 rowAcceptsRunResult 拒绝而丢失成功结果）。
      if (data.watcher_alive === false) {
        let resetRows = 0;
        state.files.forEach((row) => {
          if (row.genStatus === "已投递" || row.genStatus === "处理中") {
            row.genStatus = row.cachePath ? "已解析" : "未处理";
            row.activeTaskId = null;
            resetRows += 1;
          }
        });
        if (resetRows > 0) {
          persistState();
          refreshHooks.render();
        }
      }
    }

    if (prevActive && !nowActive) {
      const success = normalizeCount(data.last_success ?? data.done_count);
      const fail = normalizeCount(data.last_fail ?? data.error_count);
      const reportKey = data.last_task_id || `${success}_${fail}_${data.done_count || 0}_${data.error_count || 0}`;
      if (reportKey !== state.lastCheckReportKey) {
        state.lastCheckReportKey = reportKey;
        // Phase 3 运行锁定：手动投递（遮罩激活）完成 → 解除锁定 + 完成卡片；
        // 非手动投递（如 watcher 自动处理）保留原有 alert。
        if (state.runLockActive) {
          state.runLockActive = false;
          state.runLockMinimized = false;
          state.runLockJustDone = { success, fail };
          persistState();
          refreshHooks.render();
        } else {
          window.alert(`自动检查结果\n完成任务：${success}\n异常任务：${fail}`);
          persistState();
        }
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
    if (Date.now() - refreshHooks.lastCacheReconcileAt() > 60000) {
      await refreshHooks.reconcileCachePaths();
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
        refreshHooks.render();
      } else if (prog.status === "done" && !fileResultsApplied && normalizeCount(data.last_fail) === 0) {
        pendingFiles.forEach((x) => { x.genStatus = "已完成"; });
        refreshHooks.render();
      }
    }
    if (fileResultsApplied) {
      refreshHooks.render();
      persistState();
    }
    renderWorkflowOverview();
  } catch (err) {
    statusText.textContent = `刷新失败: ${err}`;
  } finally {
    refreshLogsAndQueue._inFlight = false;
  }
}

export async function clearSingleLog(kind) {
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

let timer = null;
let pollingInterval = 2000;

// 2026-08-22 批 3：setup.js 按服务端配置更新轮询间隔（原 app.js 直接赋值未声明变量，strict mode 会 ReferenceError）
export function setPollingInterval(ms) {
  if (typeof ms === "number" && ms >= 500) pollingInterval = ms;
}

export function startPolling() {
  if (timer) return;
  timer = setInterval(async () => {
    if (!state.agentOnline) return;
    await refreshLogsAndQueue();
  }, pollingInterval);
}

export function stopPolling() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) { stopPolling(); }
  else { startPolling(); refreshLogsAndQueue(); }
});