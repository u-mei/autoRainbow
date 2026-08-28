"""前端/JSX 静态结构回归测试。

防止两类已发生过的回归：

1. **app.js 未声明标识符引用**（2026-08-06 bug：删除旧版界面时删掉 startBtn 变量，
   startSelected 里残留 `if (startBtn)` 守卫，未声明标识符抛 ReferenceError，
   且错误在 async 函数 try 外被静默吞掉 → 点「开始处理」无反应）。
   本测试检查所有 `if (NAME)` / `NAME.disabled` 模式引用的标识符必须已声明。

2. **JSX 注入损坏**（2026-08-06 bug：向 core_runtime_params/watcher 注入
   parseES3Json 时把 safeParseJSON/parseJsonText 的函数主体吞掉，
   函数变成空壳返回 undefined → InDesign 排版报 TypeError）。
   本测试检查每个注入点：解析函数必须保留解析逻辑，parseES3Json 必须存在。
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

ROOT = Path(__file__).resolve().parent.parent.parent.parent
APP_JS = ROOT / "app" / "web" / "app.js"
JSX_DIR = ROOT / "pipeline" / "jsx"

# 浏览器/JS 内置对象与方法（出现在 if(NAME) / NAME.disabled 模式中时放行）
BUILTINS = {
    "window", "document", "fetch", "AbortSignal", "Array", "Number", "String",
    "Object", "JSON", "Math", "Date", "console", "navigator", "confirm",
    "setTimeout", "clearTimeout", "setInterval", "clearInterval",
    "requestAnimationFrame", "URLSearchParams", "MutationObserver",
    "encodeURIComponent", "decodeURIComponent", "FileReader", "FormData",
    "Promise", "Error", "performance", "location", "history", "localStorage",
    "sessionStorage", "Element", "Event", "navigator",
}

DECL_PATTERNS = [
    re.compile(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)"),
    re.compile(r"\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\("),
    re.compile(r"\bfor\s*\(\s*(?:const|let|var)?\s*([A-Za-z_$][\w$]*)"),
    re.compile(r"\bcatch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)"),
]

REF_PATTERNS = [
    re.compile(r"\bif\s*\(\s*([A-Za-z_$][\w$]*)\s*\)"),
    re.compile(r"\b([A-Za-z_$][\w$]*)\.disabled\b"),
    re.compile(r"\b([A-Za-z_$][\w$]*)\.addEventListener\b"),
]


def collect_function_params(text):
    """收集函数/箭头函数参数与 for-of 变量。"""
    params = set()
    # function name(a, b) / function (a, b)
    for m in re.finditer(r"\bfunction\s*(?:\w+\s*)?\(([^)]*)\)", text):
        for name in re.findall(r"[A-Za-z_$][\w$]*", m.group(1)):
            params.add(name)
    # 箭头函数 (a, b) => 与 a =>（排除对象字面量等误报场景，保守收集）
    for m in re.finditer(r"\(([^)]*)\)\s*=>", text):
        for name in re.findall(r"[A-Za-z_$][\w$]*", m.group(1)):
            params.add(name)
    for m in re.finditer(r"\bfor\s*\(\s*(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s+of\b", text):
        params.add(m.group(1))
    return params


class TestAppJsNoUndefinedIdentifier:
    def _analyze(self):
        text = APP_JS.read_text(encoding="utf-8")
        declared = set(BUILTINS)
        for pat in DECL_PATTERNS:
            declared.update(pat.findall(text))
        declared.update(collect_function_params(text))

        referenced = set()
        for pat in REF_PATTERNS:
            referenced.update(pat.findall(text))

        undefined = sorted(referenced - declared)
        return undefined

    def test_all_guarded_identifiers_are_declared(self):
        undefined = self._analyze()
        assert not undefined, (
            "app.js 中以下标识符被 `if (X)` / `X.disabled` / `X.addEventListener` 引用但未声明："
            f"{undefined}。\n"
            "未声明标识符会抛 ReferenceError（而不是 null 检查），若发生在 async 函数 try 外会被"
            "静默吞掉，导致点击按钮『无反应』。参考 2026-08-06 startBtn 事故。"
        )


JSX_PARSE_FILES = {
    "core_runtime_params.jsx": "api.parseJsonText = function (text) {",
    "create_layout_startup_watcher.jsx": "function safeParseJSON(text) {",
    "create_layout_dispatch.jsx": "function parseJsonText(text, sourceLabel) {",
    "create_layout_templateB.jsx": "function safeParseJSON(text) {",
    "create_layout_templateC.jsx": "function safeParseJSON(text) {",
    "create_layout_templateD.jsx": "function safeParseJSON(text) {",
    "export_page_snapshot.jsx": "function parseJsonText(text) {",
}


class TestJsxParserInjectionIntact:
    def test_parse_es3_json_present_in_all_injected_files(self):
        for filename in JSX_PARSE_FILES:
            text = (JSX_DIR / filename).read_text(encoding="utf-8")
            assert "function parseES3Json(text)" in text, (
                f"{filename} 缺少 parseES3Json（ES3 JSON 解析器注入缺失）"
            )

    def test_parse_es3_json_no_stray_closing_brace(self):
        """parseES3Json 函数收尾后不得有多余的 } / };（语法错误）。

        2026-08-06 事故：修复注入时残留了原 parseJsonText 的收尾 `};`，
        InDesign 报 SyntaxError: Expected: )。mutation 验证：追加多余
        收尾后本测试必须失败。
        """
        stray = re.compile(r"return result;\s*\n(\s*\}\s*\n)(\s*\}\s*;?\s*\n)")
        for filename in JSX_PARSE_FILES:
            text = (JSX_DIR / filename).read_text(encoding="utf-8")
            m = stray.search(text)
            assert m is None, (
                f"{filename} 的 parseES3Json 收尾后有多余的 {m.group(2).strip()}，"
                "会导致 InDesign 报 SyntaxError: Expected: )"
            )

    def test_parse_function_body_not_destroyed(self):
        """每个注入点：解析函数主体必须调用 parseES3Json（不得被注入吞成空壳）。

        2026-08-06 事故：注入脚本把 safeParseJSON/parseJsonText 主体替换为
        parseES3Json 声明，函数返回 undefined → InDesign 排版 TypeError。
        mutation 验证：删除 parseES3Json 调用后本测试必须失败。
        """
        for filename, marker in JSX_PARSE_FILES.items():
            text = (JSX_DIR / filename).read_text(encoding="utf-8")
            pos = text.index(marker)
            decl_pos = text.index("function parseES3Json(text)", pos)
            body = text[pos:decl_pos]  # 解析函数主体（到 parseES3Json 声明前）
            assert re.search(r"parseES3Json\s*\(", body), (
                f"{filename} 的解析函数主体未调用 parseES3Json，疑似注入把主体吞掉"
            )

    def test_es3_parser_has_no_eval(self):
        for filename in JSX_PARSE_FILES:
            text = (JSX_DIR / filename).read_text(encoding="utf-8")
            assert "eval(" not in text, f"{filename} 中残留 eval（安全约束）"


class TestJsxNoAutoPagination:
    """JSX 不再执行 soft/hard 自动分页（2026-08-06：分页点由前端按 style_profile 计算，
    保证编辑器显示与实际排版一致）。"""

    def test_layout_runner_has_no_soft_break(self):
        text = (JSX_DIR / "core_layout_runner.jsx").read_text(encoding="utf-8")
        assert "getEffectiveBottomSoft" not in text, (
            "core_layout_runner.jsx 不应再调用 getEffectiveBottomSoft（soft 自动分页已移除，"
            "分页点由前端计算，JSX 只尊重 page_break_before）"
        )

    def test_layout_runner_has_no_hard_break(self):
        text = (JSX_DIR / "core_layout_runner.jsx").read_text(encoding="utf-8")
        assert "getEffectiveBottomHard" not in text, (
            "core_layout_runner.jsx 不应再调用 getEffectiveBottomHard（2026-08-06 移除 hard 兜底："
            "分页计算器按图片收尾优先、溢出允许布局，hard 兜底会误触发导致实际分页与前端不一致）"
        )
        assert "recordAutoPageBreak" not in text, (
            "core_layout_runner.jsx 不应再记录自动分页（自动分页逻辑已全部移除，"
            "分页报告仅由旧流程残留）"
        )

    def test_templateB_logic_has_no_auto_pagination(self):
        text = (JSX_DIR / "core_templateB_logic.jsx").read_text(encoding="utf-8")
        for token in ("getEffectiveBottomSoft", "getEffectiveBottomHard", "recordAutoPageBreak"):
            assert token not in text, (
                f"core_templateB_logic.jsx 不应再调用 {token}（2026-08-06：templateB 分页逻辑迁移到前端"
                "page_break_calc.py，JSX 只尊重 page_break_before）"
            )


class TestJsxEs3Syntax:
    """JSX 必须保持 ES3 兼容：禁用 ES5+ 语法（箭头函数/let/const/模板字符串/Object.keys）。"""

    def test_es3_forbidden_syntax(self):
        forbidden = [
            (r"=>", "箭头函数"),
            (r"\blet\s", "let"),
            (r"\bconst\s", "const"),
            (r"`", "模板字符串"),
            (r"Object\.keys", "Object.keys（ES5）"),
        ]
        for filename in JSX_PARSE_FILES:
            text = (JSX_DIR / filename).read_text(encoding="utf-8")
            for pattern, label in forbidden:
                # 允许注释/字符串里的出现，只统计代码行（简单过滤：跳过 // 注释行）
                for lineno, line in enumerate(text.splitlines(), 1):
                    stripped = line.strip()
                    if stripped.startswith("//") or stripped.startswith("*"):
                        continue
                    if re.search(pattern, line):
                        raise AssertionError(
                            f"{filename}:{lineno} 使用了 ES3 不支持的语法「{label}」"
                        )
