// 投递（dispatch）——2026-08-22 拆分自 app.js（批 3）
// 处理全部/处理当前投递、选择文件、浏览器导入。
// 依赖 app.js 的 render/renderConfigV2 通过 setDispatchHooks 注入
// （避免循环依赖与过渡环双实例）。

import { api, API_BASE } from "./api.js";
import { SUPPORTED_EXTS } from "./constants.js";
import { state, persistState } from "./state.js";
import { updateWorkStatusText, showFormatToast } from "./ui.js";
import { refreshLogsAndQueue } from "./polling.js";
import { activateRunLock, setProcessButtonsDisabled } from "./runlock.js";
import { upsertFiles, addImageFilesToQueue } from "./configV2/files.js";
import { getConfigV2SelectedRow, isConfigV2Dirty, saveConfigV2Editor } from "./configV2/editor.js";
import { getExt, isImageExt, pathsMatch } from "./utils.js";

const statusText = document.getElementById("statusText");

// F11 测试模式（原 app.js 模块级变量）
let startActionTestDisabled = false;
export function isStartActionTestDisabled() { return startActionTestDisabled; }
export function setStartActionTestDisabled(v) { startActionTestDisabled = !!v; }

// ===== 钩子注入：app.js bootstrap 调用 setDispatchHooks({ render, renderConfigV2 }) =====
const hooks = { render: () => {}, renderConfigV2: () => {} };
export function setDispatchHooks(h) {
  if (h && typeof h.render === "function") hooks.render = h.render;
  if (h && typeof h.renderConfigV2 === "function") hooks.renderConfigV2 = h.renderConfigV2;
}

// ===== 函数体（原样搬移，render/renderConfigV2 → hooks）=====
export async function startAll() {
  const dbg = (step, extra = "") => {
    try {
      fetch(`${API_BASE}/api/health?dbg=start&step=${encodeURIComponent(step)}&t=${isStartActionTestDisabled() ? 1 : 0}&d=${isConfigV2Dirty() ? 1 : 0}${extra}`, { signal: AbortSignal.timeout(2000) }).catch(() => {});
    } catch (_) {}
  };
  try {
    dbg("enter");
    if (isStartActionTestDisabled()) { dbg("test-mode"); showFormatToast("F11 测试模式中：开始处理已禁用"); return; }
    setProcessButtonsDisabled(true);
    dbg("try-start");
    if (state.activeTab === "config2" && isConfigV2Dirty()) {
      dbg("saving");
      await saveConfigV2Editor();
      if (isConfigV2Dirty()) {
        throw new Error("编辑内容保存失败，已停止处理");
      }
    }

    dbg("filter-start", `&n=${Array.isArray(state.files) ? state.files.length : "NA"}`);
    // 单队列：在队列里 = 未处理完成，已完成的行也重新排版覆盖；
    // 跳过进行中（处理中/已投递，防重复投递）与缓存丢失的行。
    const candidates = state.files.filter((x) => x.cachePath && x.templateId && x.genStatus !== "处理中" && x.genStatus !== "已投递" && x.genStatus !== "缓存丢失");
    const skippedUnparsed = state.files.filter((x) => x.templateId && !x.cachePath && x.genStatus !== "缓存丢失").length;
    dbg("candidates", `&c=${candidates.length}&n=${state.files.length}`);
    if (candidates.length === 0) {
      updateWorkStatusText("待处理", "warn", "没有可处理的文件");
      showFormatToast(skippedUnparsed > 0 ? "没有可处理的文件（未解析的文件需先解析）" : "没有可处理的文件");
      setProcessButtonsDisabled(false);
      return;
    }
    const proceed = confirm(`本次处理 ${candidates.length} 个文件${skippedUnparsed > 0 ? `，跳过 ${skippedUnparsed} 个未解析` : ""}。是否继续？`);
    if (!proceed) {
      setProcessButtonsDisabled(false);
      return;
    }

    const diskInfo = await api.diskSpace();
    dbg("disk", `&w=${diskInfo.warning ? 1 : 0}`);
    if (diskInfo.warning) {
      const diskProceed = confirm(`磁盘空间不足: 仅剩 ${diskInfo.available_mb}MB。是否继续执行？`);
      if (!diskProceed) {
          setProcessButtonsDisabled(false);
        return;
      }
    }

    candidates.forEach((x) => {
      x.genStatus = "处理中";
      x.outputDismissed = false;
      x.outputPath = null;
      x.activeTaskId = null;
    });
    hooks.render();

    const payload = candidates.map((x) => ({ cache_path: x.cachePath, template_id: x.templateId }));
    let result = await api.startPipeline(payload);

    // 2026-08-16：done 重名冲突——后端预检返回 conflict，弹窗让用户决定是否覆写
    if (result && result.conflict) {
      const conflicts = Array.isArray(result.conflicts) ? result.conflicts : [];
      const names = conflicts.map((c) => c.output_name || "?").join("\n");
      const conflictProceed = confirm(`以下输出文件已存在，继续将覆写：\n\n${names}\n\n是否继续？`);
      if (!conflictProceed) {
        candidates.forEach((x) => {
          if (x.genStatus === "处理中") x.genStatus = x.cachePath ? "已解析" : "未处理";
        });
        showFormatToast("已取消处理：存在同名输出文件");
        setProcessButtonsDisabled(false);
        hooks.render();
        persistState();
        return;
      }
      result = await api.startPipeline(payload, true);
    }

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
      showFormatToast(`已投递 ${result.accepted} 个文件到队列${skippedUnparsed > 0 ? `，跳过 ${skippedUnparsed} 个未解析` : ""}`);
      state.queueSnapshot = { pending: 0, running: 1 };
      activateRunLock();
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
    dbg("catch", `&err=${encodeURIComponent(String(err).slice(0, 120))}`);
    updateWorkStatusText("错误", "bad", "启动失败，请检查日志");
    state.lastRun.errors = [String(err)];
    state.files.filter((x) => x.genStatus === "处理中").forEach((x) => {
      x.genStatus = "失败";
      x.activeTaskId = null;
    });
  } finally {
    dbg("finally");
    setProcessButtonsDisabled(false);
    hooks.render();
    persistState();
  }
}

export async function startCurrent() {
  if (isStartActionTestDisabled()) { showFormatToast("F11 测试模式中：处理已禁用"); return; }
  const row = getConfigV2SelectedRow();
  if (!row) {
    showFormatToast("请先在队列中选择一个文件");
    return;
  }
  if (!row.cachePath || !row.templateId) {
    showFormatToast("该文件未解析或未选择模板，无法处理");
    return;
  }
  if (row.genStatus === "处理中" || row.genStatus === "已投递") {
    showFormatToast("该文件正在处理中，请稍候");
    return;
  }
  if (row.genStatus === "缓存丢失") {
    showFormatToast("该文件缓存丢失，请先重新解析");
    return;
  }
  setProcessButtonsDisabled(true);
  try {
    if (state.activeTab === "config2" && isConfigV2Dirty()) {
      await saveConfigV2Editor();
      if (isConfigV2Dirty()) {
        throw new Error("编辑内容保存失败，已停止处理");
      }
    }
    const payload = [{ cache_path: row.cachePath, template_id: row.templateId }];
    row.genStatus = "处理中";
    row.outputDismissed = false;
    row.outputPath = null;
    row.activeTaskId = null;
    hooks.render();
    let result = await api.startPipeline(payload);
    if (result && result.conflict) {
      const conflicts = Array.isArray(result.conflicts) ? result.conflicts : [];
      const names = conflicts.map((c) => c.output_name || "?").join("\n");
      const proceed = confirm(`以下输出文件已存在，继续将覆写：\n\n${names}\n\n是否继续？`);
      if (!proceed) {
        row.genStatus = "已解析";
        showFormatToast("已取消处理：存在同名输出文件");
        hooks.render();
        persistState();
        return;
      }
      result = await api.startPipeline(payload, true);
    }
    if (result.accepted > 0) {
      row.genStatus = "已投递";
      const taskId = result.task_id ? String(result.task_id) : null;
      if (taskId) row.activeTaskId = taskId;
      showFormatToast("已投递当前文件到队列");
      state.queueSnapshot = { pending: 0, running: 1 };
      activateRunLock();
    } else {
      row.genStatus = "已解析";
      showFormatToast("投递失败：请查看日志");
    }
    await refreshLogsAndQueue();
  } catch (err) {
    updateWorkStatusText("错误", "bad", "启动失败，请检查日志");
    state.lastRun.errors = [String(err)];
    row.genStatus = "失败";
    row.activeTaskId = null;
  } finally {
    setProcessButtonsDisabled(false);
    hooks.render();
    persistState();
  }
}

export async function pickAndAddFiles() {
  try {
    const paths = await api.pickFiles();
    if (Array.isArray(paths) && paths.length > 0) {
      const result = upsertFiles(paths, { skipUnsupported: true });
      if (result.rejected > 0) showFormatToast(`已忽略 ${result.rejected} 个不支持格式文件`);
      if (state.activeTab === "config2") hooks.renderConfigV2();
    }
  } catch (err) {
    statusText.textContent = `选择文件失败: ${err}`;
  }
}

export async function importBrowserFiles(fileList) {
  const files = Array.from(fileList || []);
  if (files.length === 0) return;
  let imported = 0;
  let rejected = 0;
  const imageFiles = files.filter((f) => isImageExt(getExt(f.name || "")));
  const otherFiles = files.filter((f) => !imageFiles.includes(f));
  for (const f of otherFiles) {
    const ext = getExt(f.name || "");
    if (!SUPPORTED_EXTS.has(ext)) {
      rejected += 1;
      continue;
    }
    // 2026-08-16：移除 f.path 分支——所有文件统一上传拷贝到 workspace/inputs/
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
  if (imageFiles.length > 0) {
    const uploaded = [];
    for (const f of imageFiles) {
      try {
        const result = await api.upload(f, "");
        if (result.path) uploaded.push(result.path);
        else rejected += 1;
      } catch (_) {
        rejected += 1;
      }
    }
    if (uploaded.length > 0) {
      addImageFilesToQueue(uploaded);
      imported += 1;
    }
  }
  if (imported > 0) showFormatToast(`已导入 ${imported} 个文件`);
  if (rejected > 0) showFormatToast(`已忽略 ${rejected} 个文件`);
}
