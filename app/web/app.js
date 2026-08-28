import {
  TEMPLATES, SUPPORTED_EXTS, getCharsPerLine, getTemplateById, supportsManualPageBreak, CONFIG_V2_MAX_COLS,
  CONFIG_V2_ZOOM_STEP
} from "./js/constants.js";
import { api, API_BASE } from "./js/api.js";
import {
  getExt, getFileName, getDisplayFileName, getDirName, isInputsPath, isImageExt, evaluateSupport,
  computeRowStatusMeta, splitSupportedPaths, normalizeCount, normalizeQueueSnapshot, normalizeDashboardSummary,
  pathsMatch, getRunMetaTaskId, rowAcceptsRunResult, nowTimestampText, normalizeLogForDisplay, escapeHtml,
  cloneEditorElement, normalizeTextElement, getTextCols, getTextCellContent, setTextCellContent,
  getTextColCount, isTextEditorElement, trimTrailingLineBreaks
} from "./js/utils.js";
import { state, persistState, loadState } from "./js/state.js";
import {
  updateWorkStatusText, updateCustomScrollbar, showCustomScrollbarTemporarily, bindCustomScrollbar, showFormatToast
} from "./js/ui.js";
import { renderComponents } from "./js/views/components.js";
import { STATUS_PREVIEW_MAP, getGlobalStatus } from "./js/status.js";
import { getConfigV2InputRows } from "./js/queue.js";
import { renderResults, renderWorkflowOverview } from "./js/views/results.js";
import { setTab, updatePhoneClock, panes, tabButtons, phoneTabButtons } from "./js/views/nav.js";
import { applyFileRunResults } from "./js/tasks.js";
import { refreshLogsAndQueue, clearSingleLog, startPolling, stopPolling, setRefreshHooks } from "./js/polling.js";
import { renderRunLock, activateRunLock, minimizeRunLock, setProcessButtonsDisabled, bindRunLockControls } from "./js/runlock.js";
import { renderConfigV2Events } from "./js/events.js";
import {
  addConfigV2Line, bindConfigV2ImagePanel, bindConfigV2PageTrimToggle, cloneConfigV2Elements,
  ensureConfigV2Selection, getConfigV2SelectedRow, isConfigV2Dirty, parseFileRow,
  redoConfigV2Editor, removeConfigV2File, renderConfigV2Editor, renderConfigV2ImagePanel,
  renderConfigV2InputTailActions, renderConfigV2PendingStat,
  reparseConfigV2Selected, resetConfigV2Editing, resetConfigV2History,
  resetConfigV2EditorState, resetConfigV2LoadState, resetConfigV2PageBreaksToAuto,
  saveConfigV2Editor, selectConfigV2Row, setConfigV2Zoom, getConfigV2Zoom,
  setEditorHooks, undoConfigV2Editor, updateConfigV2ImageDropdownHeight,
  updateConfigV2ImageFloaterPosition, updateConfigV2PageTrimVisibility,
  updateConfigV2ZoomControls, updateConfigV2ZoomPosition
} from "./js/configV2/editor.js";
import { installWatcherFn, updateWatcherFn, uninstallWatcherFn, checkWatcherFn, openStartupDir, setWatcherHooks } from "./js/watcher.js";
import { loadConfig, setProjectRoot, setIndesignAppPath, showGuidePage, hideGuidePage, checkAgentConnection } from "./js/setup.js";
import { upsertFiles, addImageFilesToQueue, doAddImages, reconcileCachePaths, renderConfigV2Files, bindConfigV2FileListActions, setFilesHooks, getLastCacheReconcileAt } from "./js/configV2/files.js";
import { startAll, startCurrent, pickAndAddFiles, importBrowserFiles, setDispatchHooks, setStartActionTestDisabled, isStartActionTestDisabled } from "./js/dispatch.js";
import { bindStatusPreviewHotkeys, bindConfigV2FloatingControls, installDropEvents, bindEvents, setBindingsHooks } from "./js/views/bindings.js";

const BUILD_TIME = "2026-06-18 16:00";

const lastUpdate = document.getElementById("lastUpdate");
const statusText = document.getElementById("statusText");
const stateDot = document.getElementById("stateDot");
const stateText = document.getElementById("stateText");
const allStateDots = [stateDot].filter(Boolean);
const allStateTexts = [stateText].filter(Boolean);
const allStateHints = [];
const formatToast = document.getElementById("formatToast");
const globalAppPanelBtn = document.getElementById("globalAppPanelBtn");
const globalAppPanel = document.getElementById("globalAppPanel");
const globalAppPanelClose = document.getElementById("globalAppPanelClose");

const resultSummary = document.getElementById("resultSummary");
const resultErrors = document.getElementById("resultErrors");

const dispatchLogEl = document.getElementById("dispatchLog");
const watcherLogEl = document.getElementById("watcherLog");
const pipelineLogEl = document.getElementById("pipelineLog");

const openTemplateBtn = document.getElementById("openTemplateBtn");
const openGeneratedBtn = document.getElementById("openGeneratedBtn");
const exportAllBtn = document.getElementById("exportAllBtn");
const installWatcherBtn = document.getElementById("installWatcherBtn");
const updateWatcherBtn = document.getElementById("updateWatcherBtn");
const uninstallWatcherBtn = document.getElementById("uninstallWatcherBtn");
const checkWatcherBtn = document.getElementById("checkWatcherBtn");
const openStartupDirBtn = document.getElementById("openStartupDirBtn");
const customScrollbar = document.getElementById("customScrollbar");
const customScrollbarThumb = document.getElementById("customScrollbarThumb");
const clearLogButtons = Array.from(document.querySelectorAll(".clear-log-btn"));
const cleanupCheckBtn = document.getElementById("cleanupCheckBtn");
const cleanupResultEl = document.getElementById("cleanupResult");
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
const configV2EditorTitle = document.getElementById("configV2EditorTitle");
const configV2EditorMeta = document.getElementById("configV2EditorMeta");
const configV2EditorBody = document.getElementById("configV2EditorBody");
const configV2AddFilesBtn = document.getElementById("configV2AddFilesBtn");
const configV2ProcessCurrentBtn = document.getElementById("configV2ProcessCurrentBtn");
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
const configV2PageTrimToggle = document.getElementById("configV2PageTrimToggle");
const configV2PageTrimCheck = document.getElementById("configV2PageTrimCheck");
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

let previousRowTopById = new Map();
let statusHotkeyArmed = false;
let statusHotkeyTimer = null;
let globalDragDepth = 0;
// 与 polling.js 共享的缓存路径核对节流（polling 只读，reconcileCachePaths 写入）



function render() {
  renderResults();
  renderWorkflowOverview();
  renderConfigV2();
  renderComponents();
  renderConfigV2Events({ locate: selectConfigV2Row });
  const global = getGlobalStatus();
  updateWorkStatusText(global.text, global.cls, global.detail);
  updateCustomScrollbar();
  updateConfigV2ZoomPosition();
  renderRunLock();
}


let sentenceProjectBusy = false;
const sentenceProjectQueue = [];




// 2026-08-16：行编辑状态统一重置（元素 index + 格 col）



















// 2026-08-22 用户确认：分页标签独立——锚定"间隔位置"而非元素。
// 间隔 i = 元素 i 与元素 i+1 之间；数组变更（拖拽/增删/插入）后按
// remove/insert 序列重映射，让分页线留在原来的间隔处，不随块元素移动。














// 2026-08-09：移除"组"概念后，生日页边界由第一个分页标记界定。
// 第一个分页标记（第一个 page_break_before 之前的标记）显示蛋糕图标。



function renderConfigV2() {
  if (!configV2FilesBody && !configV2EditorBody) return;
  ensureConfigV2Selection();
  renderConfigV2Files();
  renderConfigV2Editor();
  renderConfigV2ImagePanel();
  updateConfigV2PageTrimVisibility();
  updateConfigV2ZoomControls();
}

// 2026-08-22 右栏属性面板：先做静态占位（选中块时显示基本信息，可编辑控件后做）
























// 2026-08-22 单队列模型：双处理入口。
// 「处理全部」投递全部候选（含已完成 → 重新排版覆盖，用户确认过）；
// 「处理当前」只投递当前选中行。

// 「处理当前」：只投递当前选中/编辑的行





async function bootstrap() {
  // 2026-08-22：解除过渡环——把渲染/缓存核对回调注入 polling.js，
  // 避免 polling.js import app.js 造成模块双重加载（事件重复绑定）
  setRefreshHooks({
    render,
    reconcileCachePaths,
    lastCacheReconcileAt: getLastCacheReconcileAt,
  });
  // 2026-08-22 批 2：编辑器模块（configV2/editor.js）需要 render/renderConfigV2，同样钩子注入
  setEditorHooks({ render, renderConfigV2 });
  // 2026-08-22 批 3：watcher 模块需要 render()
  setWatcherHooks({ render });
  // 2026-08-22 批 3：队列文件模块需要 render/renderConfigV2 + 投递入口（避免循环依赖）
  setFilesHooks({ render, renderConfigV2, startAll, pickAndAddFiles, startCurrent });
  // 2026-08-22 批 3：投递模块需要 render/renderConfigV2
  setDispatchHooks({ render, renderConfigV2 });
  // 2026-08-22 批 3：全局绑定模块需要 render()
  setBindingsHooks({ render });
  await loadState();
  const tabOverride = new URLSearchParams(window.location.search).get("tab");
  if (tabOverride && panes[tabOverride]) state.activeTab = tabOverride === "config" ? "config2" : tabOverride;
  if (lastUpdate) lastUpdate.textContent = `构建 ${BUILD_TIME}`;
  updatePhoneClock();
  bindEvents();
  bindConfigV2FloatingControls();
  setTab(state.activeTab || "config2", true);
  render();

  const health = await checkAgentConnection();
  if (health) {
    await reconcileCachePaths();
    await refreshLogsAndQueue();
    await checkWatcherFn();
    await loadConfig();
  }

  startPolling();
  setInterval(checkAgentConnection, 5000);
  setInterval(updatePhoneClock, 30000);
  bindCustomScrollbar();
  updateCustomScrollbar();
}

bootstrap();

// 2026-08-22：过渡环已解除（polling.js 不再 import app.js，改为 setRefreshHooks 注入）。
// 无其他模块导入这些导出，保留无害。
