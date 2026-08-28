// 全局事件绑定（bindings）——2026-08-22 拆分自 app.js（批 3）
// tab 切换、全局图标面板、状态预览热键（F9/F10/F11/F12）、浮动控件、
// 拖放导入、以及配置页/结果/日志/watcher/清理等按钮绑定。
// 依赖 app.js 的 render() 通过 setBindingsHooks 注入（避免循环依赖与过渡环双实例）。

import { CONFIG_V2_ZOOM_STEP } from "../constants.js";
import { api } from "../api.js";
import { state, persistState } from "../state.js";
import { updateWorkStatusText, showFormatToast } from "../ui.js";
import { refreshLogsAndQueue, clearSingleLog } from "../polling.js";
import { bindRunLockControls } from "../runlock.js";
import { installWatcherFn, updateWatcherFn, uninstallWatcherFn, checkWatcherFn, openStartupDir } from "../watcher.js";
import { setProjectRoot, setIndesignAppPath } from "../setup.js";
import {
  addConfigV2Line, bindConfigV2ImagePanel, bindConfigV2PageTrimToggle, ensureConfigV2Selection,
  getConfigV2Zoom, redoConfigV2Editor, reparseConfigV2Selected, resetConfigV2EditorState,
  resetConfigV2PageBreaksToAuto, setConfigV2Zoom, undoConfigV2Editor,
  updateConfigV2ImageDropdownHeight, updateConfigV2ImageFloaterPosition, updateConfigV2ZoomPosition
} from "../configV2/editor.js";
import { importBrowserFiles, pickAndAddFiles, startCurrent, setStartActionTestDisabled, isStartActionTestDisabled } from "../dispatch.js";
import { setTab, tabButtons, phoneTabButtons } from "./nav.js";
import { getGlobalStatus } from "../status.js";
import { escapeHtml, normalizeCount } from "../utils.js";

// ===== DOM 常量（与 app.js 各自独立声明同一 id）=====
const checkWatcherBtn = document.getElementById("checkWatcherBtn")
const clearLogButtons = Array.from(document.querySelectorAll(".clear-log-btn"))
const cleanupCheckBtn = document.getElementById("cleanupCheckBtn")
const cleanupResultEl = document.getElementById("cleanupResult")
const configV2AddFilesBtn = document.getElementById("configV2AddFilesBtn")
const configV2AddLineBtn = document.getElementById("configV2AddLineBtn")
const configV2CacheDirBtn = document.getElementById("configV2CacheDirBtn")
const configV2ClearDoneBtn = document.getElementById("configV2ClearDoneBtn")
const configV2ClearInputBtn = document.getElementById("configV2ClearInputBtn")
const configV2EditorBody = document.getElementById("configV2EditorBody")
const configV2OpenOutputBtn = document.getElementById("configV2OpenOutputBtn")
const configV2ProcessCurrentBtn = document.getElementById("configV2ProcessCurrentBtn")
const configV2RedoBtn = document.getElementById("configV2RedoBtn")
const configV2RefreshBtn = document.getElementById("configV2RefreshBtn")
const configV2ReparseBtn = document.getElementById("configV2ReparseBtn")
const configV2ResetBreaksBtn = document.getElementById("configV2ResetBreaksBtn")
const configV2TemplateDropdown = document.getElementById("configV2TemplateDropdown")
const configV2TplTrigger = document.getElementById("configV2TplTrigger")
const configV2UndoBtn = document.getElementById("configV2UndoBtn")
const configV2ZoomInBtn = document.getElementById("configV2ZoomInBtn")
const configV2ZoomOutBtn = document.getElementById("configV2ZoomOutBtn")
const configV2ZoomResetBtn = document.getElementById("configV2ZoomResetBtn")
const exportAllBtn = document.getElementById("exportAllBtn")
const globalAppPanel = document.getElementById("globalAppPanel")
const globalAppPanelBtn = document.getElementById("globalAppPanelBtn")
const globalAppPanelClose = document.getElementById("globalAppPanelClose")
const globalDropOverlay = document.getElementById("globalDropOverlay")
const installWatcherBtn = document.getElementById("installWatcherBtn")
const openGeneratedBtn = document.getElementById("openGeneratedBtn")
const openStartupDirBtn = document.getElementById("openStartupDirBtn")
const openTemplateBtn = document.getElementById("openTemplateBtn")
const setIndesignAppPathBtn = document.getElementById("setIndesignAppPathBtn")
const setProjectRootBtn = document.getElementById("setProjectRootBtn")
const statusText = document.getElementById("statusText")
const uninstallWatcherBtn = document.getElementById("uninstallWatcherBtn")
const updateWatcherBtn = document.getElementById("updateWatcherBtn")

// ===== 模块级状态（原 app.js）=====
let globalDragDepth = 0;
let statusHotkeyArmed = false;
let statusHotkeyTimer = null;

// ===== 钩子注入：app.js bootstrap 调用 setBindingsHooks({ render }) =====
let renderHook = () => {};
export function setBindingsHooks(hooks) {
  if (hooks && typeof hooks.render === "function") renderHook = hooks.render;
}

// ===== 函数体（原样搬移，render() → renderHook()）=====
export function bindStatusPreviewHotkeys() {
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
      setStartActionTestDisabled(!isStartActionTestDisabled());
      showFormatToast(isStartActionTestDisabled() ? "开始处理已禁用（测试）" : "开始处理已恢复");
      const processAllBtn = document.querySelector("[data-action='process-all']");
      if (processAllBtn) {
        processAllBtn.textContent = isStartActionTestDisabled() ? "处理全部（测试禁用）" : "处理全部";
      }
      updateWorkStatusText(
        isStartActionTestDisabled() ? "测试模式" : "空闲",
        isStartActionTestDisabled() ? "warn" : "good",
        isStartActionTestDisabled() ? "已按 F11 禁用「开始处理」" : "正常"
      );
      return;
    }

    if (!statusHotkeyArmed) return;
    if (e.key >= "0" && e.key <= "6") {
      e.preventDefault();
      statusHotkeyArmed = false;
      if (statusHotkeyTimer) { clearTimeout(statusHotkeyTimer); statusHotkeyTimer = null; }
      state.statusPreviewKey = e.key === "0" ? "" : e.key;
      renderHook();
      persistState();
    }
  });
}

export function bindConfigV2FloatingControls() {
  window.addEventListener("scroll", () => {
    updateConfigV2ZoomPosition();
    updateConfigV2ImageFloaterPosition();
  }, { passive: true });
  window.addEventListener("resize", () => {
    updateConfigV2ZoomPosition();
    updateConfigV2ImageFloaterPosition();
    updateConfigV2ImageDropdownHeight();
  }, { passive: true });
  configV2EditorBody?.addEventListener("scroll", updateConfigV2ZoomPosition, { passive: true });
}

export function installDropEvents() {
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
  const showOverlay = () => {
    if (globalDropOverlay) globalDropOverlay.classList.remove("hidden");
  };
  const hideOverlay = () => {
    globalDragDepth = 0;
    if (globalDropOverlay) globalDropOverlay.classList.add("hidden");
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

export function bindEvents() {
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

  // 2026-08-22 全局图标面板：左上角按钮开/关，点遮罩或 ✕ 关闭，切 tab 后自动收起（nav.js setTab）
  if (globalAppPanelBtn && globalAppPanel) {
    globalAppPanelBtn.addEventListener("click", () => {
      globalAppPanel.classList.toggle("hidden");
    });
    globalAppPanel.addEventListener("click", (e) => {
      if (e.target === globalAppPanel) globalAppPanel.classList.add("hidden");
    });
  }
  if (globalAppPanelClose) {
    globalAppPanelClose.addEventListener("click", () => {
      if (globalAppPanel) globalAppPanel.classList.add("hidden");
    });
  }

  // Phase 3 运行锁定：收起遮罩 / 恢复遮罩（绑定在 runlock.js）
  bindRunLockControls();

  openTemplateBtn.addEventListener("click", async () => {
    try {
      const cfg = await api.getConfig();
      const dir = cfg.project_root + "/workspace/templates";
      await api.openPath(dir);
    } catch (err) { statusText.textContent = `打开模板目录失败: ${err}`; }
  });
  openGeneratedBtn.addEventListener("click", async () => {
    try { await api.openOutputFolder(); } catch (err) { statusText.textContent = `打开目录失败: ${err}`; }
  });
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
        "caches": "#3f8efc",
        "images": "#ff9f1c",
        "logs": "#6c757d",
        "queue": "#00a870"
      };
      const labels = {
        "caches": "caches (编辑核心 JSON，保留)",
        "images": "images (编辑图片资源，保留)",
        "logs": "logs (日志)",
        "queue": "queue (任务队列)"
      };
      let barHtml = `<div style="margin-bottom:8px;"><strong>outputs</strong> 共 ${(total / 1024 / 1024).toFixed(1)}MB</div>`;
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
        html += `<button class="extract-style-btn ghost" data-template="${escapeHtml(t.id)}" type="button" style="margin-left:12px;padding:2px 12px;font-size:12px;height:28px;border-radius:50px;">提取样式</button>`;
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
      el.querySelectorAll(".extract-style-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const tid = btn.getAttribute("data-template");
          btn.disabled = true;
          btn.textContent = "提取中...";
          try {
            const result = await api.extractTemplateStyle(tid);
            if (result.success) {
              showFormatToast(`「${tid}」样式提取完成: ${result.object_count || 0} 个对象，正文起始Y=${result.start_y}`);
            } else {
              showFormatToast(`「${tid}」提取失败: ${result.message || ""} ${result.details || ""}`);
            }
          } catch (err) {
            showFormatToast(`「${tid}」提取失败: ${err}`);
          } finally {
            btn.disabled = false;
            btn.textContent = "提取样式";
          }
        });
      });
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

  if (configV2AddFilesBtn) configV2AddFilesBtn.addEventListener("click", pickAndAddFiles);
  if (configV2RefreshBtn) configV2RefreshBtn.addEventListener("click", refreshLogsAndQueue);
  if (configV2ProcessCurrentBtn) configV2ProcessCurrentBtn.addEventListener("click", startCurrent);
  if (configV2AddLineBtn) configV2AddLineBtn.addEventListener("click", addConfigV2Line);
  if (configV2UndoBtn) configV2UndoBtn.addEventListener("click", undoConfigV2Editor);
  if (configV2RedoBtn) configV2RedoBtn.addEventListener("click", redoConfigV2Editor);
  if (configV2ReparseBtn) configV2ReparseBtn.addEventListener("click", reparseConfigV2Selected);
  bindConfigV2ImagePanel();
  bindConfigV2PageTrimToggle();
  window.addEventListener("resize", updateConfigV2ImageDropdownHeight);
  if (configV2ResetBreaksBtn) configV2ResetBreaksBtn.addEventListener("click", resetConfigV2PageBreaksToAuto);
  if (configV2ZoomOutBtn) configV2ZoomOutBtn.addEventListener("click", () => setConfigV2Zoom(getConfigV2Zoom() - CONFIG_V2_ZOOM_STEP));
  if (configV2ZoomInBtn) configV2ZoomInBtn.addEventListener("click", () => setConfigV2Zoom(getConfigV2Zoom() + CONFIG_V2_ZOOM_STEP));
  if (configV2ZoomResetBtn) configV2ZoomResetBtn.addEventListener("click", () => setConfigV2Zoom(1));
  if (configV2CacheDirBtn) {
    configV2CacheDirBtn.addEventListener("click", async () => {
      try {
        const cfg = await api.getConfig();
        await api.openPath(`${cfg.project_root}/workspace/outputs/work/caches`);
      } catch (err) { statusText.textContent = `打开缓存目录失败: ${err}`; }
    });
  }
  if (configV2ClearInputBtn) {
    configV2ClearInputBtn.addEventListener("click", async () => {
      state.files = [];
      state.configV2SelectedId = "";
      resetConfigV2EditorState();
      renderHook();
      persistState();
      try { await api.clearInbox(); } catch (_) {}
    });
  }
  if (configV2ClearDoneBtn) {
    configV2ClearDoneBtn.addEventListener("click", () => {
      state.files = state.files.filter((x) => x.genStatus !== "已完成");
      ensureConfigV2Selection();
      renderHook();
      persistState();
      showFormatToast("已清空已完成条目");
    });
  }
  if (configV2TplTrigger && configV2TemplateDropdown) {
    configV2TplTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (configV2TplTrigger.disabled) {
        showFormatToast(configV2TplTrigger.title || "当前不可切换模板");
        return;
      }
      configV2TemplateDropdown.classList.toggle("open");
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
