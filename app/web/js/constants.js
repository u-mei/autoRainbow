// 常量与模板配置（ES Module 拆分 Phase 0）
// 依赖：无。被 utils.js / main.js(app.js) 引用。

export const TEMPLATES = [
  { id: "1_本周头条", label: "本周头条", color: "#3f8efc", layoutMode: "templateA" },
  { id: "2_直播精选", label: "直播精选", color: "#00a870", layoutMode: "templateA" },
  { id: "3_彩虹综艺", label: "彩虹综艺", color: "#ff9f1c", layoutMode: "templateA" },
  { id: "4_一句话", label: "一句话", color: "#9b5de5", layoutMode: "templateB", charsPerLine: { 1: 23, 2: 11, 3: 7 } },
  { id: "5_音乐专题", label: "音乐专题", color: "#e05a5a", layoutMode: "templateA" },
  { id: "6_新衣披露", label: "新衣披露", color: "#2a9d8f", layoutMode: "templateC" },
  { id: "7_周边", label: "周边", color: "#6c757d", layoutMode: "templateD", charsPerLine: { 1: 26, 2: 13, 3: 8 } }
];

// 2026-08-16：每行字数配置兜底（模板级 chars_per_line → 前端默认 → 全局默认）。
// 服务端 /api/config 会下发模板配置里的 chars_per_line，loadConfig 时合并覆盖。
export function getCharsPerLine(templateId) {
  const tmpl = getTemplateById(templateId);
  const cpl = tmpl && tmpl.charsPerLine ? tmpl.charsPerLine : null;
  if (cpl && cpl[1]) return cpl;
  return { 1: 26, 2: 13, 3: 8 };
}

export const SUPPORTED_EXTS = new Set(["docx", "png", "jpg", "jpeg"]);

export function getTemplateById(id) {
  return TEMPLATES.find((x) => x.id === id) || null;
}

export function supportsManualPageBreak(templateId) {
  const tmpl = getTemplateById(templateId);
  return !!tmpl && tmpl.layoutMode !== "templateC";
}

// 行内最大格数（用户确认：最多 3 列）
export const CONFIG_V2_MAX_COLS = 3;
// 编辑器历史/缩放常量（2026-08-22 批 2 拆分：app.js 与 configV2/editor.js 共享）
export const CONFIG_V2_HISTORY_LIMIT = 80;
export const CONFIG_V2_ZOOM_MIN = 0.6;
export const CONFIG_V2_ZOOM_MAX = 1.8;
export const CONFIG_V2_ZOOM_STEP = 0.1;
