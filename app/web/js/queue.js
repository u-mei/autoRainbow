// 队列行分类（Phase 1 单队列：固定清单，无"输出队列"概念）
// 依赖：state.js。被 main.js(app.js) 与 views/results.js 引用。

import { state } from "./state.js";

// 单队列模型（2026-08-22 用户确认）：所有文件是一个固定列表，
// 只要在队列里就默认"未处理完成"；完成与否由用户自行判断并手动移除。
export function getConfigV2InputRows() {
  return state.files.slice();
}