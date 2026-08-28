// 任务结果回填（流水线执行结果 → 行状态）
// 依赖：state.js / utils.js。被 main.js(app.js) 引用。

import { state, persistState } from "./state.js";
import { getRunMetaTaskId, pathsMatch, rowAcceptsRunResult } from "./utils.js";

export function applyFileRunResults(results, meta = {}) {
  if (!Array.isArray(results) || results.length === 0) return false;
  const taskId = getRunMetaTaskId(meta);
  // 2026-08-24：任务结果按 task_id 只应用一次——后端 dashboard 会持续回放最近任务的
  // last_file_results，若行状态被重置（如手动清理后），旧结果会再次覆盖（把已解析改回
  // 失败/已完成）。同一任务的结果应用一次即可，防止旧结果污染新状态。
  if (taskId && taskId === state.lastAppliedTaskId) return false;
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
  if (changed && taskId) {
    state.lastAppliedTaskId = taskId;
    persistState();
  }
  return changed;
}