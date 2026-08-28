// 配置页队列文件模块——2026-08-22 拆分自 app.js（批 3）
// 队列文件列表渲染/绑定、文件添加/导入、缓存路径核对（reconcileCachePaths）。
// 依赖 app.js 的 render/renderConfigV2 与投递入口 startAll/pickAndAddFiles
// 通过 setFilesHooks 注入（避免 files ↔ dispatch 循环依赖与过渡环双实例）。

import { api } from "../api.js";
import { state, persistState } from "../state.js";
import {
  getExt, getFileName, getDisplayFileName, getDirName, isImageExt, evaluateSupport, escapeHtml
} from "../utils.js";
import { getTemplateById } from "../constants.js";
import { getConfigV2InputRows } from "../queue.js";
import { showFormatToast } from "../ui.js";
import {
  parseFileRow, removeConfigV2File, resetConfigV2EditorState, resetConfigV2LoadState,
  selectConfigV2Row, renderConfigV2PendingStat, renderConfigV2InputTailActions
} from "./editor.js";

let lastCacheReconcileAt = 0;
export function getLastCacheReconcileAt() {
  return lastCacheReconcileAt;
}

const configV2FileCountEl = document.getElementById("configV2FileCount");
const configV2FilesBody = document.getElementById("configV2FilesBody");
const statusText = document.getElementById("statusText");

// ===== 钩子注入：app.js bootstrap 调用 setFilesHooks({ render, renderConfigV2, startAll, pickAndAddFiles, startCurrent }) =====
const hooks = { render: () => {}, renderConfigV2: () => {}, startAll: () => {}, pickAndAddFiles: () => {}, startCurrent: () => {} };
export function setFilesHooks(h) {
  if (h && typeof h.render === "function") hooks.render = h.render;
  if (h && typeof h.renderConfigV2 === "function") hooks.renderConfigV2 = h.renderConfigV2;
  if (h && typeof h.startAll === "function") hooks.startAll = h.startAll;
  if (h && typeof h.pickAndAddFiles === "function") hooks.pickAndAddFiles = h.pickAndAddFiles;
  if (h && typeof h.startCurrent === "function") hooks.startCurrent = h.startCurrent;
}

// ===== 函数体（原样搬移，render/renderConfigV2/startAll/pickAndAddFiles → hooks）=====
export function upsertFiles(paths, options = {}) {
  const skipUnsupported = !!options.skipUnsupported;
  if (!Array.isArray(paths) || paths.length === 0) {
    statusText.textContent = "未读取到可用文件路径，请改用选择文件按钮重试";
    return { added: 0, rejected: 0 };
  }
  let changed = false;
  let added = 0;
  let rejected = 0;
  const imagePaths = [];
  paths.forEach((pathText) => {
    const exists = state.files.some((x) => x.path === pathText);
    if (exists) return;
    const name = getFileName(pathText);
    const sourceDir = getDirName(pathText);
    const { ext, supported } = evaluateSupport(pathText);
    if (skipUnsupported && !supported) { rejected += 1; return; }
    if (isImageExt(ext)) {
      // 图片不单独成行：统一加入 4_一句话 项目（有项目追加 / 无项目新建）
      imagePaths.push(pathText);
      return;
    }
    const row = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      path: pathText,
      name,
      ext,
      supported,
      sourceDir,
      templateId: "",
      lockedTemplate: false,
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
  if (changed) { hooks.render(); persistState(); }
  // 自动解析 docx（图片走项目队列）
  state.files.forEach((row) => {
    if (row.supported && row.templateId && !row.cachePath) {
      parseFileRow(row);
    }
  });
  if (imagePaths.length > 0) addImageFilesToQueue(imagePaths);
  return { added, rejected };
}

export async function addImageFilesToQueue(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return;
  sentenceProjectQueue.push(...paths);
  if (sentenceProjectBusy) return;
  sentenceProjectBusy = true;
  try {
    while (sentenceProjectQueue.length > 0) {
      const batch = sentenceProjectQueue.splice(0, sentenceProjectQueue.length);
      await doAddImages(batch);
    }
  } finally {
    sentenceProjectBusy = false;
  }
}

export async function doAddImages(paths) {
  // 项目行判定：有缓存或有待解析图片列表都算存在（解析完成前 cachePath 为空，
  // 轮询期间不得因此新建第二个项目）
  const project = state.files.find((r) => r.templateId === "4_一句话" && (r.cachePath || (Array.isArray(r.images) && r.images.length > 0)));
  try {
    if (project) {
      if (project.cachePath) {
        const result = await api.parseImages(paths, "4_一句话", project.cachePath);
        if (result.cache_path) {
          if (result.added > 0) {
            // 同步索引：新增的图加入 project.images（否则刷新后索引缺失，reparse 会把新图移除）
            const fresh = paths.filter((p) => !project.images.includes(p));
            if (fresh.length > 0) project.images.push(...fresh);
            showFormatToast(`已追加 ${result.added} 张图片到一句话项目`);
          }
          if (result.added > 0 && project.genStatus === "已完成") {
            // 有新内容未排版：回到待处理区（避免留在完成区造成"完成区项目被触发"的困惑）
            project.genStatus = "已解析";
            project.outputPath = null;
            project.outputDismissed = false;
            project.activeTaskId = null;
          }
          if (state.configV2SelectedId === project.id) {
            resetConfigV2LoadState();
            hooks.renderConfigV2();
          }
          hooks.render();
          persistState();
        } else if (result.error) {
          showFormatToast(`追加失败: ${result.error}`);
        }
      } else {
        // 解析中/未解析：合并进 images，等待本次解析（parseFileRow 会用全部 images 新建缓存）
        const merged = paths.filter((p) => !project.images.includes(p));
        if (merged.length > 0) {
          project.images.push(...merged);
          hooks.render();
          persistState();
        }
        if (!project.cachePath && project.genStatus !== "解析中" && project.genStatus !== "已解析") {
          parseFileRow(project);
        }
      }
    } else {
      const row = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        path: paths[0],
        name: "一句话项目",
        ext: getExt(paths[0]),
        supported: true,
        sourceDir: getDirName(paths[0]),
        templateId: "4_一句话",
        lockedTemplate: true,
        images: paths,
        genStatus: "未处理",
        cachePath: null,
        sourcePath: null,
        outputPath: null,
        outputDismissed: false,
        activeTaskId: null,
        parseError: null
      };
      state.files.push(row);
      if (!state.configV2SelectedId) state.configV2SelectedId = row.id;
      hooks.render();
      persistState();
      parseFileRow(row);
    }
  } catch (err) {
    showFormatToast(`图片加入失败: ${err}`);
  }
}

export async function reconcileCachePaths() {
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
          resetConfigV2EditorState();
        }
        changed = true;
      }
    });
    if (changed) {
      hooks.render();
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

export function renderConfigV2Files() {
  if (!configV2FilesBody) return;
  const rows = getConfigV2InputRows();
  if (configV2FileCountEl) configV2FileCountEl.textContent = `${rows.length} 个文件`;
  if (rows.length === 0) {
    configV2FilesBody.innerHTML = `
      <div class="config-v2-file-empty">
        <strong>暂无文件</strong>
        <span>双击这里添加文件，或直接拖拽到窗口任意位置。</span>
      </div>
      ${renderConfigV2PendingStat(rows.length)}
      ${renderConfigV2InputTailActions()}
    `;
    bindConfigV2FileListActions();
    return;
  }
  // 2026-08-22 单队列模型：卡片只显示文件名 + 模板，不显示任何状态徽章；
  // 在队列里 = 默认未处理完成，完成与否由用户自行判断（看 outputs/done）并手动移除。
  configV2FilesBody.innerHTML = `${rows.map((row) => {
    const template = getTemplateById(row.templateId);
    const selected = row.id === state.configV2SelectedId ? " selected" : "";
    return `
      <div class="config-v2-file-card${selected}" data-id="${escapeHtml(row.id)}">
        <button class="config-v2-file-main" data-id="${escapeHtml(row.id)}" type="button">
          <span class="config-v2-file-name">${escapeHtml(getDisplayFileName(row.name))}</span>
          <span class="config-v2-file-sub">${escapeHtml(template ? template.label : "未选择模板")}</span>
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

export function bindConfigV2FileListActions() {
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
  configV2FilesBody.querySelectorAll("[data-action='add-files']").forEach((btn) => {
    btn.addEventListener("click", hooks.pickAndAddFiles);
  });
  configV2FilesBody.querySelectorAll("[data-action='process-current']").forEach((btn) => {
    btn.addEventListener("click", hooks.startCurrent);
  });
  configV2FilesBody.querySelectorAll("[data-action='process-all']").forEach((btn) => {
    btn.addEventListener("click", hooks.startAll);
  });
  configV2FilesBody.ondblclick = (e) => {
    if (e.target.closest("button") || e.target.closest(".config-v2-file-card")) return;
    hooks.pickAndAddFiles();
  };
}
