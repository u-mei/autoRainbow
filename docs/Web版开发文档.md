# AutoRainbow Web 版开发文档

> 本文档是项目唯一的开发参考文档。
> 记录从 Tauri 桌面应用迁移到「远端静态前端 + 本地 Agent」架构的全部设计决策、技术细节、实现状态和待办事项。
> 供后续开发、调试、功能扩展时参考，避免丢失上下文。

---

## 一、项目概述

### 1.1 定位

将 `.docx` 文档（及图片）自动转换为 Adobe InDesign 排版文件 (`.indd`)。运营同事只需把文档放入输入目录，运行批处理即可。

### 1.2 核心流程

```
.docx / 图片  →  Python解析  →  JSON数据  →  InDesign排版(JSX)  →  .indd文件
```

### 1.3 七大板块与模板映射

| 板块 | 目录名 | 模板类型 | 执行脚本 | 特点 |
|------|--------|---------|---------|------|
| 本周头条 | `1_本周头条` | templateA | create_layout_templateA.jsx | 标准图文混排 |
| 直播精选 | `2_直播精选` | templateA | create_layout_templateA.jsx | 标准图文混排 |
| 彩虹综艺 | `3_彩虹综艺` | templateA | create_layout_templateA.jsx | 标准图文混排 |
| 一句话 | `4_一句话` | templateB | create_layout_templateB.jsx | 图片+文本成对，装饰卡片 |
| 音乐专题 | `5_音乐专题` | templateA | create_layout_templateA.jsx | 标准图文混排 |
| 新衣披露 | `6_新衣披露` | templateC | create_layout_templateC.jsx | 标题区+图文+相框区 |
| 周边 | `7_周边` | templateD | create_layout_templateD.jsx | 双页双模板（网格+纵排） |

templateB/C/D 均为薄封装（约57行，含 JSON 兼容 safeParseJSON/safeStringifyJSON shim），通过 `$.evalFile()` 加载 templateA 并用 `_pipeline_params.json` 文件传参强制切换模式。

### 1.4 关键文件

| 文件 | 行数 | 职责 | 语言 |
|------|------|------|------|
| `pipeline/python/docx_list_to_json.py` | ~800 | docx → JSON | Python |
| `pipeline/jsx/create_layout_startup_watcher.jsx` | ~280 | InDesign idleTask 轮询 | ExtendScript |
| `pipeline/jsx/create_layout_dispatch.jsx` | ~838 | 任务分发调度 | ExtendScript |
| `pipeline/jsx/create_layout_templateA.jsx` | ~2467 | 核心排版引擎 | ExtendScript |
| `pipeline/jsx/create_layout_templateB/C/D.jsx` | 各~57 | 薄封装（含 JSON 兼容 shim） | ExtendScript |
| `pipeline/python/agent/server.py` | ~89 | HTTP 入口 + 静态文件 | Python |
| `pipeline/python/agent/routes.py` | ~821 | API 路由 | Python |
| `pipeline/python/agent/platform_adapter.py` | ~157 | 平台适配 | Python |
| `pipeline/python/agent/indesign.py` | ~111 | InDesign 封装 | Python |
| `pipeline/python/agent/config.py` | ~79 | 配置管理 | Python |
| `app/web/app.js` | ~1487 | Web 前端 | JavaScript |

---

## 二、架构演进

### 2.1 原架构（Tauri 桌面应用，已移除）

```
app/tauri_console/
  ├── index.html / app.js / styles.css   ← 前端（~1589行）
  └── src-tauri/src/main.rs              ← Rust 后端（~1450行，22个 Tauri 命令）
```

- 该旧工程已从当前仓库移除；以下内容仅作为迁移背景记录。
- 前端通过 `window.__TAURI__.core.invoke()` 调用 Rust 后端
- Rust 后端负责：文件读写、调 Python、调 InDesign（AppleScript）、配置管理
- 用户双击 .app 启动桌面窗口

### 2.2 迁移评估

评估了三种方案：

| 方案 | 描述 | 结论 |
|------|------|------|
| A. Web 前端 + 本地 Worker | 网页操作，本地 Agent 执行 | ✅ 采纳 |
| B. Web 前端 + 云端 InDesign Worker | 云端虚拟机跑 InDesign | ❌ 许可证成本高，维护复杂 |
| C. 抛弃 InDesign 重写排版引擎 | Puppeteer/LaTeX 替代 | ❌ 2467行引擎全部重写，质量下降 |

### 2.3 新架构（远端前端 + 本地 Agent）

```
远端（GitHub Pages）
  └── app/web/（HTML/JS/CSS）→ 浏览器加载

本地
  └── Agent（Python HTTP 服务，localhost:8800）
       ├── 静态文件服务（托管 app/web/）
       ├── REST API（替代 Tauri invoke）
       ├── 平台适配层（macOS / Windows）
       ├── 文件操作 / 调 Python / 调 InDesign
       └── 配置管理（~/autorainbow_config.json）
```

### 2.4 迁移原因

- 前端更新不需要重新打包桌面应用
- 去掉 Rust 编译链依赖，降低开发门槛
- 前端代码基本不变，只是传输层从 invoke 换成 fetch
- 为后续双平台（macOS + Windows）铺路

### 2.5 Mixed Content 问题与解决

| 问题 | 说明 |
|------|------|
| 根因 | GitHub Pages 是 HTTPS，fetch localhost HTTP 被浏览器拦截 |
| 方案一 | Agent 提供同域静态文件服务，用户访问 localhost:8800 |
| 方案二（可选） | Agent 做反向代理，从 GitHub Pages 拉前端 |

**当前采用方案一**：Agent 的 `_serve_static()` 托管 `app/web/` 目录，用户始终访问 `localhost:8800`，无跨域、无 Mixed Content。

---

## 三、组件清单

### 3.1 文件结构

```
autoRainbow/
├── pipeline/
│   ├── python/
│   │   ├── docx_list_to_json.py        # docx → JSON（零改动）
│   │   ├── compare_snapshot.py         # 快照对比（零改动）
│   │   └── agent/                      # 新增：Agent 服务
│   │       ├── server.py               # HTTP 入口 + 静态文件服务
│   │       ├── routes.py               # API 路由（~800行）
│   │       ├── config.py               # 配置读写
│   │       ├── indesign.py             # InDesign 操作封装
│   │       ├── platform_adapter.py     # macOS/Windows 适配层
│   │       ├── requirements.txt        # python-docx, pillow, pywin32(win32)
│   │       └── __init__.py
│   └── jsx/                            # 零改动（除心跳间隔+JSON兼容）
│       ├── create_layout_startup_watcher.jsx
│       ├── create_layout_dispatch.jsx
│       ├── create_layout_templateA.jsx
│       ├── create_layout_templateB/C/D.jsx
│       └── export_page_snapshot.jsx
├── app/
│   └── web/                            # Web 前端
│       ├── index.html                  # 含引导页
│       ├── app.js                      # invoke → fetch 改造
│       ├── styles.css                  # 不变
│       └── assets/                     # 字体、图标
├── workspace/                          # 工作区
│   ├── A_templates/                   # 7个板块模板 .indd（配置已合并到 autorainbow_config.json）
│   ├── B_outputs/                     # 输出目录（扁平化结构，见下方）
│   └── C_inputs/                      # 输入目录
├── AutoRainbow.command                 # macOS 启动器（前台运行）
├── AutoRainbow.bat                     # Windows 启动器
├── build/
│   ├── build_macos.sh                  # PyInstaller 打包
│   └── build_windows.bat
└── docs/
    ├── archive/                       # 旧文档归档
    └── Web版开发文档.md                # 本文档
```

### 3.2 数据流

```
用户双击 AutoRainbow.command
  → Agent 启动（localhost:8800）
  → 浏览器打开 http://localhost:8800
  → Agent 返回 app/web/ 静态文件
  → 前端 API 调用 /api/* → Agent 本地处理
  → Agent 调 Python 解析 / 调 InDesign 排版
  → 输出 .indd 到 workspace/B_outputs/
```

### 3.3 完整调用链

```
                        ┌─────────────────────────────────┐
                        │   浏览器（前端）                   │
                        │   fetch → localhost:8800/api/*   │
                        └─────────────────────────────────┘
                                    │
                                    ▼
                        ┌─────────────────────────────────┐
                        │   Agent（Python HTTP 服务）       │
                        │   routes.py → 文件读写/配置管理    │
                        │   indesign.py → InDesign 操作     │
                        │   platform_adapter.py → 平台差异   │
                        └─────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
          ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
          │ Python 解析   │ │ AppleScript  │ │ JSX 排版引擎  │
          │ docx→JSON    │ │ / COM        │ │ templateA    │
          │              │ │ 调起 InDesign │ │ dispatch     │
          └──────────────┘ └──────────────┘ └──────────────┘
                                    │
                                    ▼
                        ┌─────────────────────────────────┐
                        │   InDesign 进程                   │
                        │   Watcher (idleTask, 1s 轮询)    │
                        │   打开模板 → evalFile → 保存 .indd │
                        └─────────────────────────────────┘
```

---

## 四、Agent 服务详细设计

### 4.1 server.py

- 基于 Python 标准库 `http.server`，零额外依赖
- 监听 `127.0.0.1:8800`（仅本地，不暴露局域网）
- 非 `/api/` 请求走静态文件服务（`_serve_static()`）
- 静态文件目录：`app/web/`
- 路径穿越防护：`resolved` 路径必须在 `_static_dir` 内

### 4.2 API 清单

| 方法 | 路径 | 功能 | 备注 |
|------|------|------|------|
| GET | `/api/health` | 健康检查 | 返回 version, platform |
| GET | `/api/config` | 读取配置 | |
| POST | `/api/config` | 更新配置 | 含路径存在性校验 |
| POST | `/api/config/auto-detect` | 自动检测 InDesign | |
| GET | `/api/dashboard` | 仪表板数据 | 队列统计 + 日志 + 进度 |
| GET | `/api/queue/stats` | 队列统计 | |
| GET | `/api/state` | 读取 UI 状态 | |
| POST | `/api/state` | 保存 UI 状态 | |
| GET | `/api/pick-files` | 弹系统文件选择框 | 异步线程，不阻塞 HTTP |
| POST | `/api/open-path` | 打开目录 | |
| POST | `/api/open-output-folder` | 打开输出目录 | |
| POST | `/api/pipeline/start` | 选中文件启动 | Python 解析用 Popen 异步 |
| POST | `/api/pipeline/full` | 完整流水线 | |
| POST | `/api/pipeline/recover` | 恢复卡住任务 | |
| GET | `/api/watcher/status` | Watcher 状态 | installed + alive |
| POST | `/api/watcher/install` | 安装 Watcher | |
| POST | `/api/watcher/uninstall` | 卸载 Watcher | |
| POST | `/api/watcher/open-folder` | 打开 Startup 目录 | |
| POST | `/api/log/clear` | 清空日志 | |
| GET | `/api/disk-space` | 磁盘空间 | |
| POST | `/api/cleanup` | 综合清理 | |
| POST | `/api/cache/clear` | 清理缓存目录 | 清理 `_cache/` 中间产物 |
| POST | `/api/stop` | 关闭服务 | 优雅关闭 |
| GET | `/api/templates` | 列出所有模板 | |
| GET | `/api/templates/{id}/config` | 读取板块配置 | |
| PUT | `/api/templates/{id}/config` | 更新板块配置 | |
| POST | `/api/templates/{id}/open-folder` | 打开板块目录 | |
| POST | `/api/snapshot/export` | 导出快照 | |
| POST | `/api/snapshot/compare` | 对比金标 | |
| POST | `/api/snapshot/promote` | 更新金标 | |
| GET | `/api/snapshot/dirs` | 列出快照目录 | |

### 4.3 配置管理

配置文件路径：`~/autorainbow_config.json`

> **关键决策**：不用 `~/.autorainbow/config.json`（隐藏目录），因为 ExtendScript 的 `File()` 对隐藏目录支持有缺陷，`File.exists` 可能返回 false。经过三轮修复（改路径 → 加双路径回退 → 加 .txt 回退），最终确认根因是 ExtendScript 无法处理隐藏目录，改回非隐藏路径一步解决。

```json
{
  "project_root": "/Users/mei/AiWorks/autoRainbow",
  "indesign_app_path": "/Applications/Adobe InDesign 2026/Adobe InDesign 2026.app",
  "polling_interval": 2000,
  "watcher_heartbeat_interval": 3,
  "watcher_alive_timeout": 10,
  "templates": {
    "1_本周头条": { "label": "本周头条", "layout_mode": "templateA", ... },
    "2_直播精选": { "label": "直播精选", "layout_mode": "templateA", ... },
    ...
  }
}
```

完整配置示例见第九节。

- 两个平台统一用 `~/autorainbow_config.json`
- Agent 写入，JSX（watcher/dispatch）也读这个路径
- 自动检测 InDesign 时排序取最新版本
- 所有板块模板配置合并在此文件中

### 4.4 平台适配层（platform_adapter.py）

```python
class PlatformAdapter(ABC):
    open_app(app_path)           # 启动应用
    pick_files(prompt, exts)     # 弹文件选择框
    open_folder(path)            # 打开目录
    execute_jsx(script, app)     # 执行 JSX 脚本
    find_indesign_startup_dir()  # 找 Startup Scripts 目录
    get_disk_space(path)         # 磁盘空间
    find_indesign_app()          # 自动检测 InDesign
```

| 方法 | macOS | Windows |
|------|-------|---------|
| `open_app` | `open <path>` | `start "" <path>` |
| `pick_files` | osascript `choose file` | tkinter `filedialog` |
| `open_folder` | `open <path>` | `explorer <path>` (shell=False) |
| `execute_jsx` | osascript `tell application` | COM `win32com.client` |
| `find_indesign_startup_dir` | `~/Library/Preferences/Adobe InDesign/...` | `%APPDATA%\Adobe\InDesign\...` |
| `get_disk_space` | `shutil.disk_usage()` | `shutil.disk_usage()` |
| `find_indesign_app` | glob `/Applications/Adobe InDesign*` | glob `C:\Program Files\Adobe\...` |

### 4.5 关键设计决策

| 决策 | 原因 |
|------|------|
| `pick_files` 用异步线程 | 弹系统对话框会阻塞，不能阻塞 HTTP 线程 |
| Python 解析用 `Popen` | 解析可能耗时，不阻塞 HTTP 请求 |
| `stop` 用 `_server_instance.shutdown()` | 优雅关闭，不用 `os._exit(0)` |
| 静态文件服务加路径穿越检查 | 安全，防止 `../../` 访问系统文件 |
| 配置路径用非隐藏文件 | ExtendScript 读隐藏目录有 bug |
| `open_folder` Windows 用 `shell=False` | 路径含空格时 `shell=True` 可能失败 |

---

## 五、前端改造详细设计

### 5.1 通信层替换

所有 `window.__TAURI__.core.invoke("xxx", { ... })` 替换为 `fetch("http://localhost:8800/api/xxx")`。

封装为 `api` 对象（31 个方法）：
```javascript
const API_BASE = "http://localhost:8800";
const api = {
  async health() { ... },
  async dashboard() { ... },
  async pickFiles() { ... },
  // ... 全部 31 个 API
};
```

### 5.2 引导页

Agent 未连接时显示全屏引导页：
- 检测 OS → 显示对应下载按钮（macOS / Windows）
- 每 5 秒轮询 `/api/health`
- 连接成功后自动隐藏引导页，进入主界面
- 下载按钮跳转到 GitHub Releases

### 5.3 文件选择

浏览器拖拽和 `<input type="file">` 拿不到真实路径（安全沙箱限制）。

处理方式：
- 拖拽时检测 `f.path`，有值则使用（Electron 等环境），无值则提示用"手动选择文件"按钮
- "手动选择文件"按钮调用 `api.pickFiles()` → Agent 弹系统原生对话框
- `<input type="file">` 作为 fallback，如果 `f.path` 为空则 fallback 到 `api.pickFiles()`

### 5.4 Agent 连接检测

```javascript
async function checkAgentConnection() {
  try {
    const data = await api.health();
    agentOnline = true;
    hideGuidePage();
    return data;
  } catch {
    agentOnline = false;
    showGuidePage();
    return null;
  }
}
// 启动时检查一次 + 每 5 秒轮询
```

### 5.5 最后更新时间

右上角显示「最后更新 HH:MM:SS」，每次 dashboard 拉取成功后更新。

---

## 六、JSX 脚本变更

### 6.1 心跳间隔

`create_layout_startup_watcher.jsx`：
- 心跳写入间隔：10s → **3s**（`if (now - lastHeartbeatTime < 3000)`）
- 前端超时判定：30s → **10s**（在 config.json 中可配 `watcher_alive_timeout`）

### 6.2 JSON 兼容

ExtendScript 没有原生 JSON 对象，所有 `JSON.parse` / `JSON.stringify` 直接调用抛 `ReferenceError`。

修复：6 个 JSX 文件注入 `safeParseJSON` / `safeStringifyJSON`：
- 先检查 `typeof JSON`
- 不可用时 fallback 到 `eval()`

### 6.3 配置路径

所有 JSX 读配置的路径统一为 `~/autorainbow_config.json`（第一优先级），和 Agent 写入路径一致。`.autorainbow/config.json`（隐藏目录）作为第二优先级回退。

涉及文件：
- `create_layout_startup_watcher.jsx`（1 处）
- `create_layout_dispatch.jsx`（2 处：collectConfigCandidates + writeProgress）

---

## 七、InDesign 脚本执行标准

### 7.1 ExtendScript 基础

InDesign 脚本使用 **ExtendScript**（Adobe 自家的 JavaScript 方言，基于 ES3），文件后缀为 `.jsx`。

关键指令：

| 指令 | 作用 | 当前使用 |
|------|------|---------|
| `#target "InDesign"` | 声明脚本目标应用 | **⚠️ 已在 InDesign 2026 中失效**，所有 `.jsx` 中已移除 |
| `#targetengine "xxx"` | 创建持久化引擎，脚本执行完后全局变量和事件监听不被销毁 | watcher 使用 `"autoRainbowWatcherEngine"` |
| 无 target 指令 | 脚本在默认引擎中运行，执行完毕即销毁 | dispatch、templateB/C/D 使用此方式 |

### 7.2 脚本类型与安装位置

| 类型 | 目录 | 执行时机 | 适用场景 |
|------|------|---------|---------|
| **Startup Scripts** | `~/Library/Preferences/Adobe InDesign/Version*/<lang>/Scripts/Startup Scripts/` | InDesign 启动时自动执行一次 | watcher（需要常驻监听队列） |
| **Scripts Panel** | `~/Library/Preferences/Adobe InDesign/Version*/<lang>/Scripts/Scripts Panel/` | 用户从脚本面板双击手动执行 | 调试/工具脚本 |
| **临时脚本** | 任意位置 | 通过 `$.evalFile()` 或 AppleScript `do script` 加载执行 | dispatch、template 脚本 |

> **重要：** Startup Scripts 只在 InDesign 启动时加载执行。安装/修改脚本后，必须重启 InDesign 才生效。

### 7.3 Persistence 机制

```
#targetengine "autoRainbowWatcherEngine"
  └── 创建命名引擎，脚本执行完不销毁
       └── $.global.__AUTO_RAINBOW_WATCHER_INSTALLED__ = true
             └── 防止重复初始化
        └── app.idleTasks.add({ name: "AutoRainbowDispatchWatcher", sleep: 1000 })
            └── 注册 idle task，每 1000ms 回调一次 handler
                 └── handler 检查 pending/ 目录 → 有任务则处理
```

关键点：
- 没有 `#targetengine` → idle task 会被垃圾回收 → watcher 不工作
- 没有 `$.global.__INSTALLED__` 检查 → 脚本被 eval 多次时会注册多个 idle task
- idle task 的 `sleep: 1000` 是最小间隔，实际触发频率受 InDesign 主线程空闲程度影响

### 7.4 `$.evalFile` 调用链

```
$.evalFile(scriptFile)
  └── 在当前引擎中同步执行目标文件
  └── 被 eval 的脚本不创建新引擎
  └── 被 eval 的脚本中的 #target / #targetengine 指令被忽略
  └── 可以访问调用者的全局变量和函数
```

### 7.5 参数传递机制

**当前方案：`_pipeline_params.json` 文件**

dispatch 写入参数文件，template 脚本从文件读取：

```json
{
  "pipeline_batch_mode": "1",
  "pipeline_input_json": "/path/to/output.json",
  "pipeline_output_indd": "/path/to/result.indd",
  "pipeline_target_template_id": "1_本周头条",
  "pipeline_template_indd": "/path/to/template.indd",
  "pipeline_config_path": "/path/to/config.json"
}
```

> **历史问题：** 旧方案使用 `app.scriptArgs`（进程级全局变量），有竞态问题，已废弃。

### 7.6 InDesign 2026 特殊性问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| `#target "InDesign"` 导致脚本静默失败 | Adobe 移除了 BridgeTalk/ExtendScript 通信层 | 移除该指令（已执行） |
| Startup Scripts 偏好设置丢失 | Adobe 更新或偏好重置 | 安装脚本后需重启 InDesign 验证 |
| AppleScript `do script` 始终可用 | macOS 级别的脚本接口，不依赖 ExtendScript 组件 | 可作为备用方案 |

### 7.7 JSX 编码规范

| 规范 | 说明 |
|------|------|
| 移除 `#target` | 所有 `.jsx` 不得包含 `#target "InDesign"` |
| `#targetengine` | 仅 watcher 使用，引擎名用项目前缀 `autoRainbow_xxx` |
| 参数传递 | 使用 `_pipeline_params.json` 文件，禁用 `app.scriptArgs` |
| 错误处理 | 所有 InDesign 操作需 try-catch，使用 `formatError()` 模式 |
| 日志 | 关键步骤记录日志（writeLog / writeln） |
| 配置 | 所有配置项从 JSON 读取，代码中不出现硬编码数值 |

### 7.8 调试指引

| 日志文件 | 路径 |
|---------|------|
| Watcher 日志 | `workspace/B_outputs/logs/watcher.log` |
| Dispatch 日志 | `workspace/B_outputs/logs/dispatch.log` |
| Pipeline 日志 | `workspace/B_outputs/logs/pipeline.log` |

手动测试：用 AppleScript `do script` 执行单个 JSX 文件：
```bash
osascript -e 'set f to POSIX file "/path/to/script.jsx"' \
          -e 'tell application "Adobe InDesign 2026"' \
          -e 'do script f language javascript' \
          -e 'end tell'
```

---

## 八、队列系统与输出结构

### 8.1 输出目录结构（扁平化）

```
workspace/B_outputs/
  ├── _cache/                        # 中间产物（待设计清空逻辑）
  │   ├── 1_本周头条_新闻_q5x8f.json  # Python 解析结果（含板块前缀，避免跨板块同名冲突）
  │   └── 2_直播精选_综艺_q5x9a.json
  ├── logs/                          # 日志目录
  │   ├── dispatch.log
  │   ├── watcher.log
  │   └── pipeline.log
  ├── queue/                         # 任务队列
  │   ├── pending/
  │   ├── running/
  │   ├── done/
  │   ├── error/
  │   ├── progress.json
  │   └── .watcher_heartbeat
  ├── _shared_images/                # docx 中提取的图片
  ├── 1_本周头条/                     # 按板块分目录
  │   ├── 新闻_q5x8f.indd            # 最终输出（Base36 时间戳）
  │   └── 综艺_q5x9a.indd
  └── 2_直播精选/
      └── 新闻_q5x8f.indd
```

**扁平化设计要点：**
- 按板块分目录，板块内文件平铺（不再嵌套文档子目录）
- `output.json` 移至 `_cache/` 目录，是 Python → dispatch 的中间产物
- `_cache/` 中文件名带板块前缀（`板块_文件名_时间戳.json`），避免跨板块同名冲突
- 最终输出 `.indd` 按板块分目录存放，文件名不带板块前缀（`文件名_时间戳.indd`）

### 8.2 文件命名规则

**格式：** `原文件名_BASE36时间戳`

文件已按板块分目录存放，文件名不需要再带板块前缀。

**示例：**
- `1_本周头条/新闻_q5x8f.indd`
- `2_直播精选/综艺精选_q5x9a.indd`

**Base36 时间戳生成：**
```python
def short_timestamp():
    """Unix 分钟数转 Base36，约 5 位字符"""
    minutes = int(time.time() // 60)
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    result = ""
    while minutes:
        result = chars[minutes % 36] + result
        minutes //= 36
    return result  # 如 "q5x8f"
```

**特点：**
- 短（约 5 位字符）
- 无冲突（每分钟唯一）
- 不可读但足够唯一

### 8.3 缓存目录（_cache/）

`_cache/` 存放 Python 解析的中间产物（output.json），dispatch 读取后不再需要。

**清空逻辑（待设计）：**
- 流水线启动时清空？
- 每次任务完成后清空？
- 定期清理（如超过 24 小时）？
- 前端提供手动清理按钮？

> 注意：清空逻辑需要后续专门设计，考虑并发安全、错误恢复等场景。

### 8.4 队列目录结构

```
workspace/B_outputs/queue/
  ├── pending/      # 待处理任务
  ├── running/      # 正在执行的任务
  ├── done/         # 已完成任务
  ├── error/        # 失败任务
  ├── progress.json           # 实时进度（供前端读取）
  └── .watcher_heartbeat      # Watcher 心跳文件
```

### 8.5 任务文件格式

```json
{
  "task_type": "dispatch_all",
  "created_at": 1718708460,
  "source": "agent"
}
```

### 8.6 状态流转

```
pending/ → running/ → done/
                   → error/
```

- Agent 创建任务文件到 `pending/`
- Watcher 每秒轮询 `pending/`，取最旧任务移到 `running/`
- 执行成功 → 移到 `done/`
- 执行失败 → 移到 `error/`

### 8.7 进度文件

`progress.json` 由 dispatch 实时更新：

```json
{
  "total": 5,
  "current": 2,
  "current_doc": "文档名",
  "status": "processing",
  "ok": 1,
  "fail": 0,
  "results": [...]
}
```

### 8.8 心跳机制

- Watcher 每 3 秒写入一次心跳文件
- 前端通过 Agent API 读取心跳文件修改时间
- 超过 10 秒未更新 → 判定 Watcher 未响应

---

## 九、配置系统

### 9.1 统一配置文件

路径：`~/autorainbow_config.json`

所有配置合并为一个文件，包括 Agent 配置、全局设置和所有板块模板配置。

```json
{
  "project_root": "/Users/mei/AiWorks/autoRainbow",
  "indesign_app_path": "/Applications/Adobe InDesign 2026/Adobe InDesign 2026.app",
  "polling_interval": 2000,
  "watcher_heartbeat_interval": 3,
  "watcher_alive_timeout": 10,
  "templates": {
    "1_本周头条": {
      "label": "本周头条",
      "layout_mode": "templateA",
      "layout_script": "create_layout_templateA.jsx",
      "source_page_index": 0,
      "body_text_proto_label": "proto_text",
      "body_image_proto_label": "proto_image",
      "content_bottom_soft": 700,
      "content_bottom_hard": 750,
      "main_heading_label": "main_heading",
      "sub_heading_label": "sub_heading",
      "column_space_label": "column_space"
    },
    "2_直播精选": {
      "label": "直播精选",
      "layout_mode": "templateA",
      "layout_script": "create_layout_templateA.jsx",
      "source_page_index": 0,
      "body_text_proto_label": "proto_text",
      "body_image_proto_label": "proto_image",
      "content_bottom_soft": 700,
      "content_bottom_hard": 750
    },
    "3_彩虹综艺": {
      "label": "彩虹综艺",
      "layout_mode": "templateA",
      "layout_script": "create_layout_templateA.jsx",
      "source_page_index": 0,
      "body_text_proto_label": "proto_text",
      "body_image_proto_label": "proto_image",
      "content_bottom_soft": 700,
      "content_bottom_hard": 750
    },
    "4_一句话": {
      "label": "一句话",
      "layout_mode": "templateB",
      "layout_script": "create_layout_templateB.jsx",
      "source_page_index": 0,
      "body_text_proto_label": "proto_text",
      "body_image_proto_label": "proto_image",
      "content_bottom_soft": 700,
      "content_bottom_hard": 750
    },
    "5_音乐专题": {
      "label": "音乐专题",
      "layout_mode": "templateA",
      "layout_script": "create_layout_templateA.jsx",
      "source_page_index": 0,
      "body_text_proto_label": "proto_text",
      "body_image_proto_label": "proto_image",
      "content_bottom_soft": 700,
      "content_bottom_hard": 750
    },
    "6_新衣披露": {
      "label": "新衣披露",
      "layout_mode": "templateC",
      "layout_script": "create_layout_templateC.jsx",
      "source_page_index": 0,
      "body_text_proto_label": "proto_text",
      "body_image_proto_label": "proto_image",
      "content_bottom_soft": 700,
      "content_bottom_hard": 750
    },
    "7_周边": {
      "label": "周边",
      "layout_mode": "templateD",
      "layout_script": "create_layout_templateD.jsx",
      "source_page_index": 0,
      "body_text_proto_label": "proto_text",
      "body_image_proto_label": "proto_image",
      "content_bottom_soft": 700,
      "content_bottom_hard": 750
    }
  }
}
```

### 9.2 配置字段说明

#### Agent 配置

| 字段 | 说明 |
|------|------|
| `project_root` | 项目根目录绝对路径 |
| `indesign_app_path` | InDesign 应用路径 |
| `polling_interval` | 前端轮询间隔（毫秒） |
| `watcher_heartbeat_interval` | Watcher 心跳写入间隔（秒） |
| `watcher_alive_timeout` | Watcher 超时判定（秒） |

#### 板块模板配置

| 字段 | 说明 |
|------|------|
| `label` | 板块显示名称 |
| `layout_mode` | 模板类型（templateA/B/C/D） |
| `layout_script` | 执行脚本文件名 |
| `source_page_index` | 模板页索引 |
| `body_text_proto_label` | 文本原型框标签 |
| `body_image_proto_label` | 图片原型框标签 |
| `content_bottom_soft` | 分页软阈值 |
| `content_bottom_hard` | 分页硬阈值 |
| `main_heading_label` | 主标题标签 |
| `sub_heading_label` | 副标题标签 |
| `column_space_label` | 分栏间距标签 |

### 9.3 配置迁移

**旧配置位置（已废弃）：**
- `~/autorainbow_config.json` — 仅 Agent 配置
- `workspace/A_templates/config.json` — 全局模板配置
- `workspace/A_templates/{板块}/config.json` — 板块配置 ×7

**新配置位置：**
- `~/autorainbow_config.json` — 所有配置合并

**迁移步骤：**
1. 读取旧配置
2. 合并到 `templates` 字段
3. 删除旧配置文件
4. Agent 和 JSX 统一读取新配置

### 9.4 配置读写

- **Agent**：读写 `~/autorainbow_config.json`
- **JSX（watcher/dispatch）**：读取 `~/autorainbow_config.json`
- **前端**：通过 Agent API 读写配置

### 9.5 前端配置管理

前端设置页可直接编辑板块配置：
- 列出所有板块
- 每个板块可修改模板类型、原型框标签、分页阈值等
- 修改后保存到 `~/autorainbow_config.json`

---

## 十、待实现功能设计（已讨论，未开发）

> 以下功能因本地调试需要，暂缓实现。

### 10.1 Agent 自更新

#### 流程

```
Agent 启动 → 检查 GitHub latest release
  │
  ├─ 无更新 → 正常启动
  │
  └─ 有更新 → 后台下载新版本到 ~/.autorainbow/update/
       │
       ├─ 前端轮询 /api/update/status → 更新页显示进度
       ├─ 终端打印下载日志（速度、进度）
       │
       └─ 下载完成 → 前端显示"即将重启..."
            │
            └─ Agent 写更新脚本 → 退出 → 脚本替换文件 → 重启
```

#### 更新页 UI

全屏覆盖，不进入主界面：

```
┌─────────────────────────────────────┐
│         🦋 autoRainbow              │
│     发现新版本 v1.2.0（当前 v1.0.0）  │
│                                     │
│     [████████████░░░░]  65%         │
│     正在下载 2.3MB / 3.5MB          │
│     速度 512KB/s                    │
│                                     │
│     下载完成后将自动安装重启          │
└─────────────────────────────────────┘
```

进度两边都显示：
- **网页**：进度条 + 百分比 + 速度（用户主要看网页）
- **终端**：下载日志（终端已前台运行，顺手的事）

#### API 设计

```
GET /api/update/status
→ { "available": true, "version": "1.2.0", "downloading": true, "progress": 65, "speed": 512000 }
→ { "available": true, "version": "1.2.0", "downloading": false, "ready": true }
```

#### 更新脚本（macOS 示例）

```bash
#!/bin/bash
sleep 2  # 等 Agent 进程完全退出
cp ~/.autorainbow/update/autorainbow-agent /usr/local/bin/autorainbow-agent
open -a AutoRainbow
```

### 10.2 前端强制版本检查

```javascript
const MIN_AGENT_VERSION = "1.2.0";  // 前端要求的最低 Agent 版本

const health = await api.health();
if (health.version < MIN_AGENT_VERSION) {
  // 只显示更新页，不进入主界面
}
```

- 前端用到了 Agent 新 API 时才改 `MIN_AGENT_VERSION`
- Agent 只加不删 API，前端设门槛
- 版本不匹配 = 不更新就用不了，避免兼容性 bug

### 10.3 模板 GitHub 同步

#### 远端结构

```
GitHub 仓库
  └── templates/
      ├── templates_version.json
      ├── 1_本周头条/
      │   ├── config.json
      │   └── 模板.indd
      └── ...
```

#### templates_version.json

```json
{
  "version": "2026.06.18",
  "templates": {
    "1_本周头条": { "hash": "abc123", "updated": "2026-06-18" },
    "2_直播精选": { "hash": "def456", "updated": "2026-06-15" }
  }
}
```

#### 同步机制

| 触发方式 | 说明 |
|---------|------|
| Agent 启动时 | 检查 `templates_version.json`，hash 对比，只下载变化的文件 |

#### 本地修改保护

- 用户本地改过的模板不覆盖，标记为"本地修改"
- 本地 hash 记录在 `~/.autorainbow/template_hashes.json`

### 10.4 Agent 反向代理（可选）

```
用户访问 http://localhost:8800
  → Agent 代理请求 → GitHub Pages 拉取 HTML/JS/CSS
  → 前端 API 调用 /api/* → Agent 本地处理
```

- 加本地缓存（5 分钟 TTL）
- 首次无网络时用上次缓存
- 目的：前端代码推 GitHub 即更新，不需要用户刷新

### 10.5 各组件更新机制汇总

| 组件 | 托管 | 更新方式 | 需要版本检查 |
|------|------|---------|:---:|
| 前端 HTML/JS/CSS | GitHub Pages | git push 即生效 | ❌ |
| Agent 二进制 | GitHub Releases | Agent 自更新 | ✅ |
| 模板 (.indd + config) | GitHub 仓库 | Agent 启动时同步 | ✅ |
| JSX 脚本 | 打包在 Agent 内 | 随 Agent 更新 | ❌ |
| Python 解析 | 打包在 Agent 内 | 随 Agent 更新 | ❌ |

版本检查时机：页面加载时一次，不轮询。更新频率很低，不打扰用户。

---

## 十一、已修复问题清单

### 11.1 第一轮（18 个）

| # | 问题 | 修复 |
|---|------|------|
| 1 | `host="0.0.0.0"` 安全风险 | 改为 `127.0.0.1` |
| 2 | 配置路径计算错误 | 改用 `get_config_path()` |
| 3 | `try_open_indesign` 冗余分支 | 删除 if/else |
| 4 | `pywin32` 未声明 | requirements.txt 添加条件依赖 |
| 5 | 浏览器拖拽拿不到路径 | 检测 `f.path`，无路径时提示 |
| 6 | `<input type="file">` fallback 无效 | fallback 到 `api.pickFiles()` |
| 7 | `getOutputDir()` 硬编码路径 | 已删除 |
| 8 | `pick_files()` 阻塞 HTTP | 改为 `threading.Thread` |
| 9 | `subprocess.run` 阻塞请求 | 改为 `subprocess.Popen` |
| 10 | `os._exit(0)` 强制退出 | 改为 `_server_instance.shutdown()` |
| 11 | Windows `open_folder` 空格问题 | 改为 `shell=False` |
| 12 | 多版本 InDesign 只取第一个 | `matches.sort(reverse=True)` |
| 13 | build 脚本路径错误 | 改用 `$PROJECT_ROOT` 绝对路径 |
| 14 | 下载按钮无实际链接 | 改为 `window.open()` |
| 15 | `.command` 缺执行权限 | `chmod +x` |
| 16 | JSON 解析缺 try-catch | `read_body()` 已有 fallback |
| 17 | 配置路径不匹配 JSX | 改回 `~/autorainbow_config.json` |
| 18 | 文案"10秒超时" | 已更新 |

### 11.2 第二轮（JSX 专项）

| # | 问题 | 修复 |
|---|------|------|
| 19 | ExtendScript 无原生 JSON 对象 | 6 个 JSX 注入 safeParseJSON/safeStringifyJSON |
| 20 | JSX 读隐藏目录 `.autorainbow/` 失败 | 配置路径统一为 `~/autorainbow_config.json` |
| 21 | Watcher 心跳 10s 太慢 | 改为 3s，超时 10s |

---

## 十二、开发进度

### 12.1 当前阶段：架构优化

| # | 任务 | 状态 |
|---|------|:---:|
| 1 | 配置合并：Agent 端合并 9 个配置文件为 1 个 `~/autorainbow_config.json` | ✅ Agent 完成 |
| 2 | 输出扁平化：B_outputs 按板块分目录，文件平铺（去掉文档子目录） | ⏳ 待做 |
| 3 | 文件命名：Base36 时间戳函数已定义 | ✅ 函数就绪 |
| 4 | 缓存目录：_cache/ 目录已建 + 清理 API | ✅ 基础设施就绪 |
| 5 | JSX 适配：dispatch 写入扁平路径 + 扫描 `_cache/` | ✅ 完成 |
| 6 | Python 解析脚本：输出到 `_cache/` + Base36 时间戳 | ✅ 完成 |
| 7 | 前端适配：模板配置编辑 UI（设置页可编辑板块参数） | ✅ 完成 |

### 12.2 后续阶段：本地调试

| # | 任务 | 状态 |
|---|------|:---:|
| 8 | 端到端联调：Agent → 浏览器 → 选文件 → 排版 → 验证 .indd | 待做 |
| 9 | JSX 全链路验证：watcher + dispatch + templateA/B/C/D | 待做 |
| 10 | 修复联调中发现的问题 | 待做 |

### 12.3 后续阶段：跨平台 + 打包

| # | 任务 | 状态 |
|---|------|:---:|
| 11 | Windows 适配测试（WindowsAdapter 实机验证） | 待做 |
| 12 | PyInstaller 双平台打包（macOS + Windows） | 待做 |

### 12.4 后续阶段：部署 + 更新

| # | 任务 | 状态 |
|---|------|:---:|
| 13 | GitHub 仓库创建 + Pages 配置（指向 app/web/） | 待做 |
| 14 | GitHub Releases 首次上传 Agent 二进制 | 待做 |
| 15 | Agent 自更新（启动时检查 GitHub Release → 下载 → 提示重启） | 待做 |
| 16 | 更新页 UI（全屏进度页：版本号 + 进度条 + 速度） | 待做 |
| 17 | 前端强制版本检查（MIN_AGENT_VERSION，不匹配只显示更新页） | 待做 |
| 18 | 模板 GitHub 同步（Agent 启动时拉取，hash 增量更新） | 待做 |
| 19 | Agent 反向代理 + 缓存（从 GitHub Pages 拉前端） | 待做 |

### 12.5 已完成

- [x] Python Agent 服务（HTTP API + 静态文件服务）
- [x] 平台适配层（macOS / Windows）
- [x] 前端改造（Tauri invoke → fetch API）
- [x] 引导页 + Agent 连接检测
- [x] 配置持久化（~/autorainbow_config.json）
- [x] 双平台启动器（AutoRainbow.command / .bat）
- [x] 双平台打包脚本（build_macos.sh / build_windows.bat）
- [x] 21 个已知 bug 全部修复
- [x] JSX JSON 兼容（ExtendScript 无原生 JSON 对象）
- [x] Watcher 心跳间隔 10s → 3s，超时 30s → 10s
- [x] 终端窗口可见（.command 前台运行）
- [x] 网页最后更新时间显示
- [x] 下载按钮跳转 GitHub Releases
- [x] 配置合并 Agent 端：`~/autorainbow_config.json` 含 `templates` 字段
- [x] 配置合并 JSX 端：dispatch 写入扁平路径 + 扫描 `_cache/`
- [x] 输出扁平化 + Base36 + _cache/ 写入
- [x] 前端模板配置编辑 UI
- [x] 清理缓存 API：`POST /api/cache/clear`

---

## 十三、注意事项

1. **Mixed Content**：Agent 同时提供静态文件服务，用户访问 `localhost:8800`，无跨域问题
2. **CORS**：所有 API 响应带 `Access-Control-Allow-Origin: *`
3. **服务退出**：`.command` 前台运行，终端窗口保持打开显示日志
4. **配置文件**：统一 `~/autorainbow_config.json`，Agent 和 JSX 都读这个路径
5. **打包**：PyInstaller 打包时包含 `pipeline/jsx/` 和 `pipeline/python/` 脚本
6. **Windows COM**：`execute_jsx` 用 `win32com.client.Dispatch("InDesign.Application")`，需要 `pywin32`
7. **浏览器文件路径**：浏览器沙箱拿不到真实路径，必须通过 Agent 弹系统对话框
8. **ExtendScript 隐藏目录**：`File()` 对 `.` 开头的目录 `exists` 可能返回 false，不要用隐藏目录存配置
9. **前端版本兼容**：Agent 只加不删 API，前端设 `MIN_AGENT_VERSION` 门槛，版本不匹配强制更新
10. **模板同步**：本地改过的模板不覆盖，标记为"本地修改"
