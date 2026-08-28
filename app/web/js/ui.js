// UI 基础工具：状态文字/Toast/自定义滚动条（ES Module 拆分 Phase 0）
// 依赖：state.js。被 main.js(app.js) 引用。

import { state } from "./state.js";

const statusText = document.getElementById("statusText");
const stateDot = document.getElementById("stateDot");
const stateText = document.getElementById("stateText");
const allStateDots = [stateDot].filter(Boolean);
const allStateTexts = [stateText].filter(Boolean);
const allStateHints = [];
const formatToast = document.getElementById("formatToast");
const customScrollbar = document.getElementById("customScrollbar");
const customScrollbarThumb = document.getElementById("customScrollbarThumb");

let formatToastTimer = null;
let scrollbarDragging = false;
let scrollbarDragStartY = 0;
let scrollbarDragStartTop = 0;
let scrollbarHideTimer = null;
const CUSTOM_SCROLLBAR_ENABLED = false;

export function updateWorkStatusText(text, cls, detail) {
  statusText.textContent = text;
  const fadeUpdate = (el, nextText) => {
    if (!el) return;
    if (el.textContent === nextText) return;
    if (el._fadeTimer) clearTimeout(el._fadeTimer);
    el.style.opacity = "0";
    el._fadeTimer = setTimeout(() => {
      el.textContent = nextText;
      el.style.opacity = "1";
      el._fadeTimer = null;
    }, 120);
  };
  allStateTexts.forEach((el) => fadeUpdate(el, text));
  const fadeHint = (el, nextText) => {
    if (!el) return;
    const show = state.showStateHint && !!(nextText && String(nextText).trim());
    if (el._fadeTimer) clearTimeout(el._fadeTimer);
    el.style.opacity = "0";
    el._fadeTimer = setTimeout(() => {
      let textNode = el.querySelector(".state-hint-text");
      if (!textNode) {
        textNode = document.createElement("span");
        textNode.className = "state-hint-text";
        el.appendChild(textNode);
      }
      textNode.textContent = show ? nextText : "";
      el.classList.toggle("hidden", !show);
      el.style.opacity = show ? "1" : "0";
      el._fadeTimer = null;
    }, 120);
  };
  allStateHints.forEach((el) => fadeHint(el, detail || ""));
  allStateDots.forEach((el) => {
    el.className = `dot js-state-dot ${cls || ""}`.trim();
  });
}

export function updateCustomScrollbar() {
  if (!CUSTOM_SCROLLBAR_ENABLED) {
    if (customScrollbar) { customScrollbar.classList.add("hidden"); customScrollbar.classList.remove("is-active"); }
    return;
  }
  if (!customScrollbar || !customScrollbarThumb) return;
  const doc = document.documentElement;
  const viewport = window.innerHeight || doc.clientHeight || 0;
  const content = Math.max(doc.scrollHeight, document.body.scrollHeight);
  const maxScroll = Math.max(content - viewport, 0);
  if (maxScroll <= 1) {
    customScrollbar.classList.add("hidden");
    customScrollbar.classList.remove("is-active");
    return;
  }
  customScrollbar.classList.remove("hidden");
  const trackHeight = customScrollbar.clientHeight;
  const rawThumbHeight = Math.max((viewport / content) * trackHeight, 36);
  const thumbHeight = Math.min(rawThumbHeight, trackHeight);
  const maxThumbTop = Math.max(trackHeight - thumbHeight, 0);
  const scrollTop = window.scrollY || doc.scrollTop || 0;
  const ratio = maxScroll > 0 ? (scrollTop / maxScroll) : 0;
  const thumbTop = maxThumbTop * ratio;
  customScrollbarThumb.style.height = `${thumbHeight}px`;
  customScrollbarThumb.style.top = `${thumbTop}px`;
}

export function showCustomScrollbarTemporarily() {
  if (!CUSTOM_SCROLLBAR_ENABLED) return;
  if (!customScrollbar || customScrollbar.classList.contains("hidden")) return;
  customScrollbar.classList.add("is-active");
  if (scrollbarHideTimer) { clearTimeout(scrollbarHideTimer); scrollbarHideTimer = null; }
  scrollbarHideTimer = setTimeout(() => {
    if (scrollbarDragging) return;
    customScrollbar.classList.remove("is-active");
    scrollbarHideTimer = null;
  }, 700);
}

export function bindCustomScrollbar() {
  if (!CUSTOM_SCROLLBAR_ENABLED) {
    if (customScrollbar) { customScrollbar.classList.add("hidden"); customScrollbar.classList.remove("is-active"); }
    return;
  }
  if (!customScrollbar || !customScrollbarThumb) return;
  const onPointerMove = (e) => {
    if (!scrollbarDragging) return;
    const trackHeight = customScrollbar.clientHeight;
    const thumbHeight = customScrollbarThumb.clientHeight;
    const maxThumbTop = Math.max(trackHeight - thumbHeight, 0);
    const nextTop = Math.min(Math.max(scrollbarDragStartTop + (e.clientY - scrollbarDragStartY), 0), maxThumbTop);
    const ratio = maxThumbTop > 0 ? (nextTop / maxThumbTop) : 0;
    const doc = document.documentElement;
    const viewport = window.innerHeight || doc.clientHeight || 0;
    const content = Math.max(doc.scrollHeight, document.body.scrollHeight);
    const maxScroll = Math.max(content - viewport, 0);
    window.scrollTo(0, ratio * maxScroll);
  };
  const stopDragging = () => {
    scrollbarDragging = false;
    showCustomScrollbarTemporarily();
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointercancel", stopDragging);
  };
  customScrollbarThumb.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    scrollbarDragging = true;
    scrollbarDragStartY = e.clientY;
    scrollbarDragStartTop = parseFloat(customScrollbarThumb.style.top || "0") || 0;
    showCustomScrollbarTemporarily();
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", stopDragging);
    document.addEventListener("pointercancel", stopDragging);
  });
  customScrollbar.addEventListener("pointerdown", (e) => {
    if (e.target === customScrollbarThumb) return;
    const rect = customScrollbar.getBoundingClientRect();
    const thumbHeight = customScrollbarThumb.clientHeight;
    const maxThumbTop = Math.max(rect.height - thumbHeight, 0);
    const targetTop = Math.min(Math.max(e.clientY - rect.top - thumbHeight / 2, 0), maxThumbTop);
    const ratio = maxThumbTop > 0 ? (targetTop / maxThumbTop) : 0;
    const doc = document.documentElement;
    const viewport = window.innerHeight || doc.clientHeight || 0;
    const content = Math.max(doc.scrollHeight, document.body.scrollHeight);
    const maxScroll = Math.max(content - viewport, 0);
    window.scrollTo({ top: ratio * maxScroll, behavior: "smooth" });
    showCustomScrollbarTemporarily();
  });
  window.addEventListener("scroll", () => {
    updateCustomScrollbar();
    showCustomScrollbarTemporarily();
  }, { passive: true });
  window.addEventListener("wheel", showCustomScrollbarTemporarily, { passive: true });
  window.addEventListener("resize", updateCustomScrollbar, { passive: true });
  updateCustomScrollbar();
}

export function showFormatToast(text) {
  if (!formatToast) return;
  formatToast.textContent = text;
  formatToast.classList.remove("hidden");
  if (formatToastTimer) { clearTimeout(formatToastTimer); }
  formatToastTimer = setTimeout(() => {
    formatToast.classList.add("hidden");
    formatToastTimer = null;
  }, 1800);
}

// 2026-08-25：带操作按钮的通知（如"已移除 [撤销]"）——duration 内点按钮走 onAction，超时走 onTimeout
// 2026-08-26：定时器局部化——连续多个操作通知时，后一个不得 clearTimeout 掉前一个的
// onTimeout（否则前一个"移除文件"的超时删除被取消，磁盘文件残留）。
export function showFormatToastAction(text, { actionLabel, duration = 10000, onAction, onTimeout }) {
  if (!formatToast) return;
  formatToast.textContent = "";
  const span = document.createElement("span");
  span.textContent = text;
  formatToast.appendChild(span);
  let actionTimer = null;
  if (actionLabel && onAction) {
    const btn = document.createElement("button");
    btn.className = "format-toast-action";
    btn.type = "button";
    btn.textContent = actionLabel;
    btn.addEventListener("click", () => {
      if (actionTimer) clearTimeout(actionTimer);
      formatToast.classList.add("hidden");
      actionTimer = null;
      onAction();
    });
    formatToast.appendChild(btn);
  }
  formatToast.classList.remove("hidden");
  // 清掉普通 toast 的隐藏定时器，避免 1.8s 后把本通知提前藏掉
  if (formatToastTimer) clearTimeout(formatToastTimer);
  actionTimer = setTimeout(() => {
    formatToast.classList.add("hidden");
    actionTimer = null;
    if (onTimeout) onTimeout();
  }, duration);
}