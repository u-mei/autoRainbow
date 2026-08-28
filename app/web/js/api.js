// API 客户端（ES Module 拆分 Phase 0）
// 依赖：无。被 main.js(app.js) 引用。

export const API_BASE = "http://localhost:8800";

async function fetchJsonChecked(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(data.error || `请求失败: ${response.status}`);
  }
  return data;
}

export const api = {
  async health() { return fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(2000) }).then(r => r.json()); },
  async dashboard() { return fetch(`${API_BASE}/api/dashboard`).then(r => r.json()); },
  async getEvents() { return fetch(`${API_BASE}/api/events`).then(r => r.json()); },
  async updateEvent(id, status) { return fetch(`${API_BASE}/api/events/update`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }).then(r => r.json()); },
  async removeEvent(id) { return fetch(`${API_BASE}/api/events/remove`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).then(r => r.json()); },
  async removeEventsByFile(paths) { return fetch(`${API_BASE}/api/events/remove-by-file`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths }) }).then(r => r.json()); },
  async getState() { return fetch(`${API_BASE}/api/state`).then(r => r.json()); },
  async saveState(content) {
    const data = typeof content === "string" ? { content } : content;
    return fetch(`${API_BASE}/api/state`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json());
  },
  async pickFiles() { return fetch(`${API_BASE}/api/pick-files`).then(r => r.json()); },
  async startPipeline(rows, confirmOverwrite = false) { return fetchJsonChecked(`${API_BASE}/api/pipeline/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows, confirm_overwrite: !!confirmOverwrite }) }); },
  async recoverTasks() { return fetch(`${API_BASE}/api/pipeline/recover`, { method: "POST" }).then(r => r.json()); },
  async openPath(path) { return fetch(`${API_BASE}/api/open-path`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) }); },
  async openOutputFolder() { return fetch(`${API_BASE}/api/open-output-folder`, { method: "POST" }); },
  async deleteOutputFile(path) { return fetchJsonChecked(`${API_BASE}/api/output/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) }); },
  async watcherStatus() { return fetch(`${API_BASE}/api/watcher/status`).then(r => r.json()); },
  async installWatcher() { return fetch(`${API_BASE}/api/watcher/install`, { method: "POST" }).then(r => r.json()); },
  async uninstallWatcher() { return fetch(`${API_BASE}/api/watcher/uninstall`, { method: "POST" }).then(r => r.json()); },
  async getConfig() { return fetch(`${API_BASE}/api/config`).then(r => r.json()); },
  async postConfig(update) { return fetch(`${API_BASE}/api/config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update || {}) }).then(r => r.json()); },
  async setConfig(data) { return fetch(`${API_BASE}/api/config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()); },
  async clearLog(kind) { return fetch(`${API_BASE}/api/log/clear`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) }).then(r => r.json()); },
  async cleanup() { return fetch(`${API_BASE}/api/cleanup`, { method: "POST" }).then(r => r.json()); },
  async clearCache() { return fetch(`${API_BASE}/api/cache/clear`, { method: "POST" }).then(r => r.json()); },
  async diskSpace() { return fetch(`${API_BASE}/api/disk-space`).then(r => r.json()); },
  async snapshotExport() { return fetch(`${API_BASE}/api/snapshot/export`, { method: "POST" }).then(r => r.json()); },
  async snapshotCompare() { return fetch(`${API_BASE}/api/snapshot/compare`, { method: "POST" }).then(r => r.json()); },
  async snapshotPromote() { return fetch(`${API_BASE}/api/snapshot/promote`, { method: "POST" }).then(r => r.json()); },
  async snapshotDirs() { return fetch(`${API_BASE}/api/snapshot/dirs`).then(r => r.json()); },
  async getTemplates() { return fetch(`${API_BASE}/api/templates`).then(r => r.json()); },
  async getTemplateConfig(id) { return fetch(`${API_BASE}/api/templates/${id}/config`).then(r => r.json()); },
  async setTemplateConfig(id, config) { return fetch(`${API_BASE}/api/templates/${id}/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) }).then(r => r.json()); },
  async autoDetect() { return fetch(`${API_BASE}/api/config/auto-detect`, { method: "POST" }).then(r => r.json()); },
  async queueStats() { return fetch(`${API_BASE}/api/queue/stats`).then(r => r.json()); },
  async openWatcherFolder() { return fetch(`${API_BASE}/api/watcher/open-folder`, { method: "POST" }).then(r => r.json()); },
  async stopAgent() { return fetch(`${API_BASE}/api/stop`, { method: "POST" }).then(r => r.json()); },
  async openTemplateFolder(id) { return fetch(`${API_BASE}/api/templates/${id}/open-folder`, { method: "POST" }).then(r => r.json()); },
  async extractTemplateStyle(id) { return fetch(`${API_BASE}/api/templates/${id}/extract-style`, { method: "POST" }).then(r => r.json()); },
  async upload(file, templateId) {
    const url = `${API_BASE}/api/upload?filename=${encodeURIComponent(file.name)}&template_id=${encodeURIComponent(templateId || "")}`;
    return fetch(url, { method: "POST", body: file }).then(r => r.json());
  },
  async clearInbox() { return fetch(`${API_BASE}/api/input/clear`, { method: "POST" }).then(r => r.json()); },
  async removeInput(path) { return fetch(`${API_BASE}/api/input/remove`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) }).then(r => r.json()); },
  async validateFiles(paths) { return fetch(`${API_BASE}/api/validate-files`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths }) }).then(r => r.json()); },
  async cacheStats() { return fetch(`${API_BASE}/api/cache-stats`).then(r => r.json()); },
  async parseFile(path, templateId) { return fetch(`${API_BASE}/api/parse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, template_id: templateId }) }).then(r => r.json()); },
  async parseImages(paths, templateId, appendTo) { return fetch(`${API_BASE}/api/parse-images`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths, template_id: templateId, append_to: appendTo || "" }) }).then(r => r.json()); },
  async reparse(cachePath, templateId, images) { return fetch(`${API_BASE}/api/reparse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cache_path: cachePath, template_id: templateId, images: images || null }) }).then(r => r.json()); },
  async getCacheJson(path) { return fetchJsonChecked(`${API_BASE}/api/cache?path=${encodeURIComponent(path)}`); },
  async checkImage(path) { return fetchJsonChecked(`${API_BASE}/api/image/check?path=${encodeURIComponent(path)}`); },
  async getPageBreaks(path) { return fetchJsonChecked(`${API_BASE}/api/page-breaks?path=${encodeURIComponent(path)}`); },
  async recalculatePageBreaks(path, templateId) { return fetchJsonChecked(`${API_BASE}/api/page-breaks/recalculate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, template_id: templateId }) }); },
  async resolveCaches(paths) { return fetchJsonChecked(`${API_BASE}/api/cache/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths }) }); },
  async saveCacheJson(path, elements) { return fetchJsonChecked(`${API_BASE}/api/cache`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, elements }) }); },
};