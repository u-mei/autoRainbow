// 启动/配置（setup）——2026-08-22 拆分自 app.js（批 3）
// 读取/设置项目根目录与 InDesign 路径、引导页显示、agent 连接检查。
// loadConfig 里服务端模板级 chars_per_line 合并 + 轮询间隔更新。

import { api } from "./api.js";
import { state } from "./state.js";
import { TEMPLATES } from "./constants.js";
import { refreshLogsAndQueue, setPollingInterval } from "./polling.js";
import { checkWatcherFn } from "./watcher.js";

const configProjectRootEl = document.getElementById("configProjectRoot");
const configFilePathEl = document.getElementById("configFilePath");
const configIndesignPathEl = document.getElementById("configIndesignPath");
const projectRootInput = document.getElementById("projectRootInput");
const indesignAppPathInput = document.getElementById("indesignAppPathInput");
const projectRootStatusEl = document.getElementById("projectRootStatus");
const setProjectRootBtn = document.getElementById("setProjectRootBtn");
const indesignAppPathStatusEl = document.getElementById("indesignAppPathStatus");
const setIndesignAppPathBtn = document.getElementById("setIndesignAppPathBtn");

export async function loadConfig() {
  try {
    const data = await api.getConfig();
    if (configProjectRootEl) configProjectRootEl.textContent = data.project_root || "-";
    if (configFilePathEl) configFilePathEl.textContent = data.config_exists ? data.config_path : `${data.config_path}（未创建）`;
    if (configIndesignPathEl) configIndesignPathEl.textContent = data.indesign_app_path || "-";
    if (projectRootInput && !projectRootInput.value) projectRootInput.value = data.project_root || "";
    if (indesignAppPathInput && !indesignAppPathInput.value) indesignAppPathInput.value = data.indesign_app_path || "";
    if (data.polling_interval && typeof data.polling_interval === "number" && data.polling_interval >= 500) {
      setPollingInterval(data.polling_interval);
    }
    // 2026-08-16：合并服务端模板级 chars_per_line（覆盖前端默认）
    if (data.templates && typeof data.templates === "object") {
      TEMPLATES.forEach((tmpl) => {
        const serverTpl = data.templates[tmpl.id];
        if (serverTpl && serverTpl.chars_per_line) {
          const cpl = serverTpl.chars_per_line;
          tmpl.charsPerLine = {
            1: Number(cpl["1"]) || 26,
            2: Number(cpl["2"]) || 13,
            3: Number(cpl["3"]) || 8
          };
        }
      });
    }
  } catch (err) {
    if (configProjectRootEl) configProjectRootEl.textContent = `读取失败: ${err}`;
  }
}

export async function setProjectRoot() {
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

export async function setIndesignAppPath() {
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

export function showGuidePage() {
  const guide = document.getElementById("guidePage");
  if (guide) guide.classList.remove("hidden");
}

export function hideGuidePage() {
  const guide = document.getElementById("guidePage");
  if (guide) guide.classList.add("hidden");
}

export async function checkAgentConnection() {
  try {
    const data = await api.health();
    state.agentOnline = true;
    hideGuidePage();
    return data;
  } catch {
    state.agentOnline = false;
    showGuidePage();
    return null;
  }
}