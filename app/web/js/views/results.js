// 结果页与工作状态渲染（"结果" tab 统计 + 页头"工作状态"栏）
// 依赖：state.js / utils.js / queue.js。被 main.js(app.js) 引用。

import { state } from "../state.js";
import { normalizeCount } from "../utils.js";
import { getConfigV2InputRows } from "../queue.js";

const resultSummary = document.getElementById("resultSummary");
const resultErrors = document.getElementById("resultErrors");
const configV2WatcherStatusEl = document.getElementById("configV2WatcherStatus");
const configV2WatcherHintEl = document.getElementById("configV2WatcherHint");
const configV2PendingStatusEl = document.getElementById("configV2PendingStatus");
const configV2PendingHintEl = document.getElementById("configV2PendingHint");
const configV2QueueStatusEl = document.getElementById("configV2QueueStatus");
const configV2QueueHintEl = document.getElementById("configV2QueueHint");
const configV2ResultStatusEl = document.getElementById("configV2ResultStatus");
const configV2ResultHintEl = document.getElementById("configV2ResultHint");

export function renderResults() {
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

export function renderWorkflowOverview() {
  const pending = normalizeCount(state.queueSnapshot.pending);
  const running = normalizeCount(state.queueSnapshot.running);
  const activeCount = pending + running;
  const dash = state.dashboardSummary || {};
  const todo = state.files.filter((x) => x.supported && x.templateId && x.genStatus !== "已完成").length;
  const v2Pending = getConfigV2InputRows().length;
  const watcherTargets = [
    { status: configV2WatcherStatusEl, hint: configV2WatcherHintEl }
  ];
  const queueTargets = [
    { status: configV2QueueStatusEl, hint: configV2QueueHintEl }
  ];
  const resultTargets = [
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