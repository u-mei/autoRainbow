// 事件面板（待办 1b：待处理事件队列）——2026-08-22 拆分自 app.js
// 左栏问题列表：渲染真实事件（类型标签/文件/详情/时间/次数/状态徽章）、
// 「定位」跳转（locate 钩子由 app.js 注入，避免循环依赖）、「忽略/恢复」切换。
// 注意：不得 import app.js（过渡环教训——会造成双实例、事件重复绑定）。

import { api } from "./api.js";
import { state } from "./state.js";
import { pathsMatch, escapeHtml } from "./utils.js";
import { showFormatToast } from "./ui.js";
import { setTab } from "./views/nav.js";

const EVENT_TYPE_META = {
  parse_fail: { label: "解析失败", cls: "parse-fail" },
  layout_fail: { label: "排版失败", cls: "layout-fail" },
  broken_image: { label: "坏图", cls: "broken-image" },
  stuck_recovery: { label: "卡死恢复", cls: "stuck-recovery" },
  missing_glyph: { label: "缺字", cls: "missing-glyph" },
};

const configV2EventsBody = document.getElementById("configV2EventsBody");

let lastEventsFetchAt = 0;

function eventTimeText(ts) {
  const diff = Math.floor(Date.now() / 1000) - (ts || 0);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return new Date(ts * 1000).toLocaleDateString();
}

export async function renderConfigV2Events(handlers = {}) {
  const body = configV2EventsBody;
  if (!body) return;
  if (Date.now() - lastEventsFetchAt < 1500) return; // 轮询/操作频繁，防抖
  lastEventsFetchAt = Date.now();
  let events = [];
  try {
    const data = await api.getEvents();
    events = Array.isArray(data.events) ? data.events : [];
  } catch (err) {
    lastEventsFetchAt = 0; // 失败下次再试
    return;
  }
  if (body !== configV2EventsBody) return;
  if (events.length === 0) {
    body.innerHTML = `<div class="config-v2-file-empty"><strong>暂无通知</strong><span>解析失败、排版失败、坏图等事件会显示在这里。</span></div>`;
    return;
  }
  body.innerHTML = events.map((ev) => {
    const meta = EVENT_TYPE_META[ev.type] || { label: ev.type, cls: "unknown" };
    const done = ev.status === "resolved";
    const ignored = ev.status === "ignored";
    const countText = (ev.count || 1) > 1 ? ` · 第 ${ev.count} 次` : "";
    const statusBadge = done
      ? '<span class="config-v2-event-badge done">已处理</span>'
      : ignored
        ? '<span class="config-v2-event-badge ignored">已忽略</span>'
        : "";
    return `<div class="config-v2-event-card ${done ? "done" : ""} ${ignored ? "ignored" : ""}" data-event-id="${escapeHtml(ev.id || "")}">
      <div class="config-v2-event-head">
        <span class="config-v2-event-type ${meta.cls}">${meta.label}</span>
        <em>${eventTimeText(ev.updatedAt)}${countText}</em>
      </div>
      <strong class="config-v2-event-name">${escapeHtml(ev.file || "（无文件）")}</strong>
      <span class="config-v2-event-detail">${escapeHtml(ev.detail || "")}</span>
      <div class="config-v2-event-actions">
        ${statusBadge}
        <button type="button" data-event-locate>定位</button>
        ${!done ? `<button type="button" data-event-ignore>${ignored ? "恢复" : "忽略"}</button>` : ""}
      </div>
    </div>`;
  }).join("");

  const locateRow = typeof handlers.locate === "function" ? handlers.locate : () => {};

  // 事件关联文件是否仍在队列（匹配行 path / cachePath / row.images 图片路径）
  function eventFileInQueue(cachePath, filePath) {
    return (cachePath || filePath) && state.files.some(
      (x) =>
        (cachePath && pathsMatch(x.cachePath, cachePath)) ||
        (filePath && pathsMatch(x.path, filePath)) ||
        (filePath && Array.isArray(x.images) && x.images.some((img) => pathsMatch(img, filePath)))
    );
  }

  body.querySelectorAll("[data-event-locate]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".config-v2-event-card");
      const evId = card && card.dataset.eventId;
      const ev = events.find((e) => String(e.id) === String(evId));
      if (!ev) return;
      const cachePath = ev.cachePath || "";
      const filePath = ev.path || "";
      const row = state.files.find(
        (x) =>
          (cachePath && pathsMatch(x.cachePath, cachePath)) ||
          (filePath && pathsMatch(x.path, filePath)) ||
          (filePath && Array.isArray(x.images) && x.images.some((img) => pathsMatch(img, filePath)))
      );
      if (row) {
        locateRow(row.id);
        setTab("config2");
        showFormatToast(`已定位到 ${row.name}`);
      } else if (!cachePath && !filePath) {
        // 无文件事件（如卡死恢复）——兜底提醒
        showFormatToast("该事件不关联文件，无法定位");
      } else {
        showFormatToast("该事件对应的文件不在当前队列中");
      }
    });
  });
  body.querySelectorAll("[data-event-ignore]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".config-v2-event-card");
      const evId = card && card.dataset.eventId;
      const ev = events.find((e) => String(e.id) === String(evId));
      if (!ev) return;
      // 恢复：ignored → pending（问题场景仍存在时）
      if (ev.status === "ignored") {
        api.updateEvent(ev.id, "pending").then(() => {
          lastEventsFetchAt = 0;
          renderConfigV2Events(handlers);
        });
        return;
      }
      // 忽略：判断问题场景是否已过时/断开
      // 关联文件不在当前队列（或被移除）或无文件（系统一次性事件）→ 彻底移除；
      // 关联文件仍在队列 → 仅忽略（淡灰保留，可恢复）。
      const cachePath = ev.cachePath || "";
      const filePath = ev.path || "";
      const stillExists = eventFileInQueue(cachePath, filePath);
      const action = stillExists ? api.updateEvent(ev.id, "ignored") : api.removeEvent(ev.id);
      action.then(() => {
        lastEventsFetchAt = 0;
        renderConfigV2Events(handlers);
      });
    });
  });
}