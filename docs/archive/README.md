# AutoRainbow Tauri 控制台

这个目录是给当前批处理流程准备的最小前端。

## 1. 功能

- 一键执行 `run_pipeline.command`
- 实时查看 `dispatch.log / watcher.log / pipeline.log`
- 查看队列状态（pending/running/done/error）
- 查看最近输出的 `.indd` 文件
- 一键打开 `B_outputs` 目录

## 2. 运行

```bash
cd /Users/mei/AiWorks/autoRainbow/app/tauri_console
npm install
npm run tauri:dev
```

## 3. 依赖说明

- Node.js（用于安装 tauri cli）
- Rust toolchain（Tauri 后端）
- macOS WebKit（系统自带）

## 4. 后续建议

- 可在 `read_dashboard_data` 增加失败明细结构，用于前端“失败重试单条”按钮。
- 可补一个“模板配置编辑器”页，直接写入 `workspace/A_templates/*/config.json`。
