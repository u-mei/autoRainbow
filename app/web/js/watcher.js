// watcher（监听器）操作——2026-08-22 拆分自 app.js（批 3）
// 安装/更新/卸载/检查 InDesign watcher 监听器 + 打开 Startup 目录。
// 依赖 app.js 的 render() 通过 setWatcherHooks 注入（避免循环依赖与过渡环双实例）。

import { api } from "./api.js";
import { state, persistState } from "./state.js";
import { renderWorkflowOverview } from "./views/results.js";

const installWatcherBtn = document.getElementById("installWatcherBtn");
const updateWatcherBtn = document.getElementById("updateWatcherBtn");
const uninstallWatcherBtn = document.getElementById("uninstallWatcherBtn");
const checkWatcherBtn = document.getElementById("checkWatcherBtn");
const watcherInstallStatusEl = document.getElementById("watcherInstallStatus");
const watcherPathEl = document.getElementById("watcherPath");
const watcherActionStatusEl = document.getElementById("watcherActionStatus");

let renderHook = () => {};
export function setWatcherHooks(hooks) {
  if (hooks && typeof hooks.render === "function") renderHook = hooks.render;
}

export async function installWatcherFn() {
  installWatcherBtn.disabled = true;
  watcherActionStatusEl.textContent = "正在安装...";
  try {
    const msg = await api.installWatcher();
    watcherActionStatusEl.textContent = msg.message || "监听器安装完成";
    await checkWatcherFn();
  } catch (err) {
    watcherActionStatusEl.textContent = `监听器安装失败: ${err}`;
  } finally {
    installWatcherBtn.disabled = false;
  }
}

export async function updateWatcherFn() {
  updateWatcherBtn.disabled = true;
  watcherActionStatusEl.textContent = "正在更新...";
  try {
    const msg = await api.installWatcher();
    watcherActionStatusEl.textContent = msg.message || "监听器更新完成，请重启 InDesign 生效";
    await checkWatcherFn();
  } catch (err) {
    watcherActionStatusEl.textContent = `监听器更新失败: ${err}`;
  } finally {
    updateWatcherBtn.disabled = false;
  }
}

export async function uninstallWatcherFn() {
  uninstallWatcherBtn.disabled = true;
  watcherActionStatusEl.textContent = "正在卸载...";
  try {
    const msg = await api.uninstallWatcher();
    watcherActionStatusEl.textContent = msg.message || "监听器已卸载";
    await checkWatcherFn();
  } catch (err) {
    watcherActionStatusEl.textContent = `监听器卸载失败: ${err}`;
  } finally {
    uninstallWatcherBtn.disabled = false;
  }
}

export async function checkWatcherFn() {
  checkWatcherBtn.disabled = true;
  try {
    const data = await api.watcherStatus();
    state.watcherInstalled = !!data.installed;
    if (watcherInstallStatusEl) {
      if (data.installed) {
        watcherInstallStatusEl.textContent = "已安装";
        watcherInstallStatusEl.style.color = "#6fba2c";
      } else {
        watcherInstallStatusEl.textContent = "未安装";
        watcherInstallStatusEl.style.color = "#e05a5a";
      }
    }
    if (watcherPathEl) watcherPathEl.textContent = data.installed ? data.path : "-";
    renderWorkflowOverview();
    renderHook();
    persistState();
  } catch (err) {
    if (watcherInstallStatusEl) {
      watcherInstallStatusEl.textContent = `检查失败: ${err}`;
      watcherInstallStatusEl.style.color = "#e05a5a";
    }
  } finally {
    checkWatcherBtn.disabled = false;
  }
}

export async function openStartupDir() {
  try {
    const data = await api.watcherStatus();
    if (data.installed && data.path) {
      const dir = data.path.substring(0, data.path.lastIndexOf("/"));
      await api.openPath(dir);
    } else {
      watcherActionStatusEl.textContent = "监听器未安装，无法打开目录";
    }
  } catch (err) {
    watcherActionStatusEl.textContent = `打开目录失败: ${err}`;
  }
}