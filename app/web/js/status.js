// 全局状态预览（F9/F12 状态预览的数据与推导）
// 依赖：state.js。被 main.js(app.js) 引用。

import { state } from "./state.js";

export const STATUS_PREVIEW_MAP = {
  "1": { text: "未安装环境", cls: "env", detail: "监听器未配置（预览）" },
  "2": { text: "错误", cls: "bad", detail: "存在异常情况，请检查日志（预览）" },
  "3": { text: "待配置", cls: "unassigned", detail: "有文件未指定使用模板（预览）" },
  "4": { text: "待处理", cls: "warn", detail: "存在待处理文件（预览）" },
  "5": { text: "空闲", cls: "idle", detail: "" },
  "6": { text: "已完成", cls: "done", detail: "所有文件均已处理（预览）" }
};

export function getGlobalStatus() {
  if (state.statusPreviewKey && STATUS_PREVIEW_MAP[state.statusPreviewKey]) {
    return STATUS_PREVIEW_MAP[state.statusPreviewKey];
  }
  if (state.watcherInstalled === false) {
    return { text: "未安装环境", cls: "env", detail: "监听器未配置" };
  }

  const hasFail = state.files.some((x) => x.genStatus === "失败")
    || (Array.isArray(state.lastRun.errors) && state.lastRun.errors.length > 0);
  if (hasFail) return { text: "错误", cls: "bad", detail: "存在异常情况，请检查日志" };

  if (state.files.length === 0) return { text: "空闲", cls: "idle", detail: "" };

  const hasNeedTemplate = state.files.some((x) => x.supported && !x.templateId);
  if (hasNeedTemplate) {
    const unassignedRows = state.files.filter((x) => x.supported && !x.templateId);
    const names = unassignedRows.map((x) => `- ${x.name}`).join("\n");
    return { text: "待配置", cls: "unassigned", detail: `以下文件未指定使用模板：\n${names}` };
  }

  const pendingRows = state.files.filter((x) => (
    x.supported
    && x.templateId
    && ["未处理", "已解析", "已投递", "处理中", "解析中"].includes(x.genStatus)
  ));
  const hasPending = pendingRows.length > 0;
  if (hasPending) {
    const names = pendingRows.map((x) => `- ${x.name}`).join("\n");
    return { text: "待处理", cls: "warn", detail: `以下文件待处理：\n${names}` };
  }

  const allDone = state.files.length > 0 && state.files.every((x) => ["已完成", "已跳过", "不匹配"].includes(x.genStatus));
  if (allDone) return { text: "已完成", cls: "done", detail: "所有文件均已处理" };

  return { text: "待处理", cls: "warn", detail: "" };
}