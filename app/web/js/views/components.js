// 组件展示面板（"组件" tab，UI 样式 showcase）
// 依赖：无（纯静态 HTML 字符串）。被 main.js(app.js) 引用。

export function renderComponents() {
  const el = document.getElementById("componentsShowcase");
  if (!el) return;
  el.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <h3>许可证标记</h3>
      <p style="color:var(--muted);margin:0">
        UI 样式参考
        <a href="https://github.com/guokaigdg/animal-island-ui.git" target="_blank" rel="noreferrer">Animal Island UI</a>
        ，上游许可证为 Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)。
      </p>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>组件样式展示</h3>
      <p style="color:var(--muted);margin:0">覆盖所有页面的 UI 元素及对应样式</p>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>按钮 Buttons</h3>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <button>默认</button>
        <button class="primary">主要</button>
        <button class="ghost">幽灵</button>
        <button disabled>禁用</button>
        <button class="primary" disabled>禁用主要</button>
        <button class="small">小按钮</button>
        <button class="primary small">小主要</button>
        <button class="primary" style="height:48px;border-radius:24px;font-size:16px">开始处理</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>卡片 Card</h3>
      <div style="display:flex;flex-wrap:wrap;gap:12px">
        <div class="card" style="margin:0;flex:1;min-width:200px">
          <strong>默认卡片</strong>
          <p style="margin:6px 0 0;color:var(--muted);font-size:13px">圆角 20px · 点阵背景 · 柔和阴影</p>
        </div>
        <div class="log-card" style="margin:0;flex:1;min-width:200px">
          <h3>日志卡片</h3>
          <p style="margin:6px 0 0;color:var(--muted);font-size:13px">日志页专用卡片样式</p>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>输入框 Input</h3>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <input type="text" placeholder="请输入内容" value="示例文字" />
        <input type="text" placeholder="占位符样式" />
        <input type="text" placeholder="禁用状态" disabled />
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>下拉菜单 Select</h3>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <div class="template-dropdown" style="position:relative">
          <button class="tpl-trigger">本周头条</button>
          <div class="tpl-menu" style="display:flex;position:static;box-shadow:none;border:none;background:transparent;padding:4px 0;flex-direction:row;gap:4px;flex-wrap:wrap">
            <button class="tpl-option"><span class="dot" style="background:#3f8efc"></span><span>本周头条</span></button>
            <button class="tpl-option"><span class="dot" style="background:#00a870"></span><span>直播精选</span></button>
            <button class="tpl-option"><span class="dot" style="background:#ff9f1c"></span><span>彩虹综艺</span></button>
            <button class="tpl-option"><span class="dot" style="background:#9b5de5"></span><span>一句话</span></button>
            <button class="tpl-option"><span class="dot" style="background:#e05a5a"></span><span>音乐专题</span></button>
            <button class="tpl-option"><span class="dot" style="background:#2a9d8f"></span><span>新衣披露</span></button>
            <button class="tpl-option"><span class="dot" style="background:#6c757d"></span><span>周边</span></button>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>状态指示 Status Dot</h3>
      <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center">
        <span><span class="dot good"></span> 成功</span>
        <span><span class="dot bad"></span> 失败</span>
        <span><span class="dot warn"></span> 警告</span>
        <span><span class="dot unassigned"></span> 未选择</span>
        <span><span class="dot idle"></span> 空闲</span>
        <span><span class="dot env"></span> 环境</span>
        <span><span class="dot done"></span> 完成</span>
        <span><span class="dot" style="background:#3f8efc"></span> 自定义</span>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>状态徽章 Status Badge</h3>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center">
        <span class="status-badge"><span class="dot good"></span> 运行中 <span class="status-badge-time">刚刚</span></span>
        <span class="status-badge"><span class="dot bad"></span> 已断开 <span class="status-badge-time">5分钟前</span></span>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>文件表格 File Table</h3>
      <div class="table-wrap" style="margin-top:0">
        <div class="files-list">
          <div class="files-head">
            <div class="col-handle"></div>
            <div class="col-name">文件名</div>
            <div class="col-template">使用模板</div>
            <div class="col-status">生成情况</div>
            <div class="col-action">操作</div>
          </div>
          <div class="files-body">
            <div class="file-row">
              <div class="file-col col-handle"><button class="drag-handle-btn">☰</button></div>
              <div class="file-col col-name"><span class="file-name-text">示例文档.docx</span></div>
              <div class="file-col col-template">
                <span class="dot" style="background:#3f8efc"></span>
                <span style="font-size:13px">本周头条</span>
              </div>
              <div class="file-col col-status status-ok">已完成</div>
              <div class="file-col col-action"><button class="remove-row-btn ghost">✕</button></div>
            </div>
            <div class="file-row">
              <div class="file-col col-handle"><button class="drag-handle-btn">☰</button></div>
              <div class="file-col col-name"><span class="file-name-text">图片素材.png</span></div>
              <div class="file-col col-template">
                <span class="dot" style="background:#9b5de5"></span>
                <span style="font-size:13px">一句话</span>
              </div>
              <div class="file-col col-status status-warn">处理中</div>
              <div class="file-col col-action"><button class="remove-row-btn ghost">✕</button></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>拖放区域 Drop Zone</h3>
      <div class="drop-zone" style="max-width:500px">
        <div class="drop-title">拖拽文件到此处</div>
        <div class="drop-sub" style="color:var(--muted)">支持：docx / png / jpg / jpeg</div>
        <div class="drop-actions"><button>手动选择文件</button></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>工作流磁贴 Workflow Tile</h3>
      <div class="workflow-overview" style="max-width:700px">
        <div class="workflow-tile">
          <span class="workflow-label">监听器</span>
          <strong class="workflow-good">运行中</strong>
          <span>-</span>
        </div>
        <div class="workflow-tile">
          <span class="workflow-label">队列</span>
          <strong>空闲</strong>
          <span>等待任务</span>
        </div>
        <div class="workflow-tile">
          <span class="workflow-label">本次结果</span>
          <strong>3 / 1</strong>
          <span>成功 / 失败</span>
        </div>
        <button class="workflow-tile workflow-action" type="button">
          <span class="workflow-label">输出</span>
          <strong>查看生成目录</strong>
          <span>打开 outputs</span>
        </button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>监听器状态 Watcher Status</h3>
      <div class="watcher-status-grid" style="max-width:500px">
        <div class="status-item">
          <span class="status-label">运行状态</span>
          <span class="status-value"><span class="dot good"></span> 运行中</span>
        </div>
        <div class="status-item">
          <span class="status-label">心跳</span>
          <span class="status-value mono">3s 前</span>
        </div>
        <div class="status-item">
          <span class="status-label">项目路径</span>
          <span class="status-value mono" style="font-size:12px">/Users/.../autoRainbow</span>
        </div>
        <div class="status-item">
          <span class="status-label">InDesign</span>
          <span class="status-value">2025</span>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>结果网格 Result Grid</h3>
      <div class="result-grid" style="max-width:500px">
        <div class="card" style="margin:0;text-align:center"><strong>3</strong><br><span class="status-label">成功</span></div>
        <div class="card" style="margin:0;text-align:center"><strong>1</strong><br><span class="status-label">失败</span></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>工具栏 Tool Row</h3>
      <div class="tool-row">
        <button>按钮一</button>
        <button class="primary">按钮二</button>
        <button class="ghost">按钮三</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>导航标签 Tab</h3>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="tab-btn active">配置</button>
        <button class="tab-btn">结果</button>
        <button class="tab-btn">日志</button>
        <button class="tab-btn">组件</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>排版 Typography</h3>
      <h3 style="margin:0 0 8px">h3 标题 · 794f27 粗体</h3>
      <p style="font-weight:700;margin:0 0 4px;color:var(--animal-text-color)">正文加粗 — 794f27</p>
      <p style="margin:0 0 4px;color:var(--muted)">次要文字 — 9f927d</p>
      <p style="margin:0 0 4px;font-size:12px;color:var(--animal-text-color-disabled)">禁用文字 — c4b89e</p>
      <span class="status-label">状态标签 status-label</span>
      <div style="margin-top:6px"><code class="mono">等宽字体 mono — SF Mono / Fira Code</code></div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>帮助文本 Watcher Help</h3>
      <div class="watcher-help-text" style="max-width:500px">
        <p>监听器是 InDesign 后台脚本，负责轮询队列并自动排版。</p>
        <ul><li>确保 InDesign 已安装</li><li>点击"安装监听器"</li></ul>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>预格式文本 Pre / Mono</h3>
      <pre style="max-height:120px;margin:0;font-size:12px">{
  "status": "ok",
  "timestamp": 1719360000,
  "message": "示例日志输出"
}</pre>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>快照测试结果 Snapshot</h3>
      <div class="snap-result" style="max-height:150px">
        <div class="pass">✓ page-001.png 通过</div>
        <div class="pass">✓ page-002.png 通过</div>
        <div class="fail">✗ page-003.png 差异: 2.3%</div>
        <div class="summary">总计: 2 通过, 1 失败</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3>提示 Toast</h3>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div class="format-toast" style="position:static;opacity:1;transform:none;margin:0">操作成功</div>
        <div class="format-toast" style="position:static;opacity:1;transform:none;margin:0;background:var(--bad)">操作失败</div>
      </div>
    </div>

    <div class="card">
      <h3>空状态 Empty</h3>
      <div class="empty-files" style="position:static;border:none;box-shadow:none">
        <strong>暂无待处理文件</strong>
        <span>选择 docx 或图片后，会在这里配置模板和查看生成状态</span>
      </div>
    </div>
  `;
}