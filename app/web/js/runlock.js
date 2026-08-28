// 运行锁定叠层（Phase 3）——2026-08-22 拆分自 app.js
// 投递成功 → 全屏遮罩；左上角收起 → 左下角小胶囊条（可恢复）；完成 → 完成卡片。
// 纯前端 DOM 层，不触碰 InDesign 聚焦/激活。状态存 state.runLock*（不持久化，刷新即解除）。
// 注意：不得 import app.js（过渡环教训——会造成双实例、事件重复绑定）。

import { state } from "./state.js";
import { normalizeCount } from "./utils.js";
import { showFormatToast } from "./ui.js";

const runLockOverlay = document.getElementById("runLockOverlay");
const runLockStatus = document.getElementById("runLockStatus");
const runLockWatcher = document.getElementById("runLockWatcher");
const runLockMini = document.getElementById("runLockMini");
const runLockMiniText = document.getElementById("runLockMiniText");
const runLockDone = document.getElementById("runLockDone");
const runLockDoneDetail = document.getElementById("runLockDoneDetail");

let runLockDoneTimer = null;
let lastRunLockActive = false;

// 投递按钮锁定：运行锁定期间（遮罩/小条）始终禁用，防重复投递
export function setProcessButtonsDisabled(disabled) {
  const locked = disabled || !!state.runLockActive;
  const allBtn = document.querySelector("[data-action='process-all']");
  if (allBtn) allBtn.disabled = locked;
  const currentBtn = document.getElementById("configV2ProcessCurrentBtn");
  if (currentBtn) currentBtn.disabled = locked;
  const tailCurrentBtn = document.querySelector("[data-action='process-current']");
  if (tailCurrentBtn) tailCurrentBtn.disabled = locked;
}

export function renderRunLock() {
  if (!runLockOverlay || !runLockMini) return;
  const active = !!state.runLockActive;
  const minimized = !!state.runLockMinimized;
  runLockOverlay.classList.toggle("hidden", !active || minimized);
  runLockMini.classList.toggle("hidden", !active || !minimized);

  // 仅在"锁定解除"这一瞬间恢复投递按钮（避免投递中途 render 把按钮解禁导致重复投递）
  if (lastRunLockActive && !active) {
    setProcessButtonsDisabled(false);
  }
  lastRunLockActive = active;

  // 遮罩/小条上的状态文本
  if (active) {
    const snap = state.queueSnapshot || {};
    const pending = normalizeCount(snap.pending);
    const running = normalizeCount(snap.running);
    let text;
    if (running > 0) text = `正在排版 ${running} 个文件${pending > 0 ? `，${pending} 个排队` : ""}…`;
    else if (pending > 0) text = `等待任务分发（${pending} 个排队）…`;
    else text = "等待任务分发…";
    if (runLockStatus) runLockStatus.textContent = text;
    if (runLockMiniText) runLockMiniText.textContent = `InDesign 处理中… ${running > 0 ? running : pending} 个文件`;

    // watcher 掉线提示
    const watcherDead = state.dashboardSummary && state.dashboardSummary.watcherAlive === false;
    if (runLockWatcher) {
      runLockWatcher.classList.toggle("hidden", !watcherDead);
      if (watcherDead) runLockWatcher.textContent = "⚠ InDesign 未响应，任务可能卡住（可在右上角查看队列）";
    }
    const dot = runLockMini && runLockMini.querySelector(".run-lock-mini-dot");
    if (dot) dot.classList.toggle("dead", watcherDead);
  }

  // 完成卡片
  if (runLockDone && state.runLockJustDone) {
    const info = state.runLockJustDone;
    runLockDoneDetail.textContent = `完成 ${info.success} · 异常 ${info.fail}`;
    runLockDone.classList.remove("hidden");
    if (runLockDoneTimer) clearTimeout(runLockDoneTimer);
    runLockDoneTimer = setTimeout(() => {
      runLockDone.classList.add("hidden");
      state.runLockJustDone = null;
    }, 4000);
  }
}

export function activateRunLock() {
  state.runLockActive = true;
  state.runLockMinimized = false;
  renderRunLock();
}

export function minimizeRunLock() {
  if (!state.runLockActive) return;
  state.runLockMinimized = true;
  renderRunLock();
  showFormatToast("已收起遮罩，任务在后台继续，完成时会提示");
}

// 收起/恢复按钮绑定（app.js bindEvents 调用）
export function bindRunLockControls() {
  const minimizeBtn = document.getElementById("runLockMinimizeBtn");
  if (minimizeBtn) minimizeBtn.addEventListener("click", minimizeRunLock);
  const restoreBtn = document.getElementById("runLockRestoreBtn");
  if (restoreBtn) {
    restoreBtn.addEventListener("click", () => {
      if (!state.runLockActive) return;
      state.runLockMinimized = false;
      renderRunLock();
    });
  }
}