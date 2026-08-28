// 导航：tab 面板切换 + 手机时钟（ES Module 拆分）
// 依赖：state.js。被 main.js(app.js) 引用。

import { state, persistState } from "../state.js";

const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const phoneTabButtons = Array.from(document.querySelectorAll(".phone-app"));
const phoneClockEl = document.getElementById("phoneClock");

export { tabButtons, phoneTabButtons };

export const panes = {
  config2: document.getElementById("tab-config2"),
  result: document.getElementById("tab-result"),
  logs: document.getElementById("tab-logs"),
  watcher: document.getElementById("tab-watch"),
  env: document.getElementById("tab-env"),
  cleanup: document.getElementById("tab-cleanup"),
  templates: document.getElementById("tab-templates"),
  snapshot: document.getElementById("tab-snapshot"),
  components: document.getElementById("tab-components")
};

let tabSwitchToken = 0;

export async function setTab(tabId, force = false) {
  if (tabId === "config") tabId = "config2";
  const previousTabId = state.activeTab;
  if (!panes[tabId] || (previousTabId === tabId && !force)) return;
  const currentPane = panes[previousTabId];
  const nextPane = panes[tabId];
  const switchToken = ++tabSwitchToken;

  state.activeTab = tabId;
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  phoneTabButtons.forEach((btn) => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle("active", active);
    if (active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  document.body.classList.toggle("config-v2-active", tabId === "config2");

  // 2026-08-22：全局图标面板——任何 tab 切换后自动收起
  const appPanel = document.getElementById("globalAppPanel");
  if (appPanel) appPanel.classList.add("hidden");

  if (currentPane && currentPane.classList.contains("active")) {
    Array.from(currentPane.children).forEach((el) => { el.style.transition = ""; el.style.opacity = ""; });
  }
  Object.keys(panes).forEach((id) => {
    panes[id].classList.toggle("active", id === tabId);
  });

  Array.from((nextPane || {children: []}).children).forEach((el) => {
    el.style.opacity = "0";
    el.style.transition = "opacity 150ms ease";
    requestAnimationFrame(() => { el.style.opacity = "1"; });
    setTimeout(() => {
      el.style.transition = "";
      el.style.opacity = "";
    }, 150);
  });

  persistState();
}

export function updatePhoneClock() {
  if (!phoneClockEl) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  phoneClockEl.textContent = `${hh}:${mm}`;
}