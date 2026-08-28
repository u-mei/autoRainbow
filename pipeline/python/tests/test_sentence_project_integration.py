"""4_一句话 项目全链路 API 集成测试（JSON 层面，不做 InDesign 快照）。

覆盖用户关注的关键操作：添加图像、修改顺序、移除、分页、以及复合操作。
分两层：
- L2 合成数据（默认运行）：mock 解析脚本，验证路由层逻辑
- L3 真实资产（pytest -m real 或资产存在时）：真实解析脚本（纯 Python 子进程）
  跑真实图片（workspace/test_assets/images/，不进 git），验证真实文件名
  （Unicode/全角空格）下的配对、追加、去重、重建
"""

import io
import json
import os
import shutil
import sys
import unicodedata
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent import routes  # noqa: E402

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
ASSETS_DIR = _PROJECT_ROOT / "workspace/test_assets/images"

STYLE_PROFILE = {
    "layout_params": {
        "start_y": 267.4,
        "continue_start_y": 12.0,
        "gap_y": 48.0,
        "content_bottom_soft": 3000.0,
        "content_bottom_hard": 5000.0,
        "body_text_width": 936.0,
        "body_image_height": 517.68,
    },
    "objects": {
        "proto_card": [{"bounds": {"top": 917.68, "bottom": 1061.76}}],
        "proto_text": [{
            "text": {"point_size": 20, "leading": "AUTO", "inset_spacing": [0, 0, 0, 0],
                     "space_before": 0, "space_after": 0},
            "text_frame_prefs": {"minimum_height_for_auto_sizing": 0},
        }],
    },
}


def _cfg_for(tmp_path, home=None):
    ws = tmp_path / "workspace"
    for d in ("inputs", "outputs/work/caches", "outputs/work/images", "templates/4_一句话"):
        (ws / d).mkdir(parents=True, exist_ok=True)
    cfg = {
        "project_root": str(tmp_path),
        "templates_dir": "workspace/templates",
        "work_dir": "workspace/outputs/work",
        "inputs_dir": "workspace/inputs",
        "outputs_dir": "workspace/outputs",
        "done_dir": "workspace/outputs/done",
        "runtime_dir": "workspace/.runtime",
        "templates": {"4_一句话": {
            "layout_mode": "templateB",
            "style_profile": json.loads(json.dumps(STYLE_PROFILE)),
        }},
    }
    if home is not None:
        # 2026-08-18：配置已迁入项目内 workspace/.runtime/，home 不再承载配置。
        # 这里只确保 home 目录存在（供 HOME monkeypatch 隔离用户 site-packages）。
        home.mkdir(parents=True, exist_ok=True)
    return cfg


class FakeTrashAdapter:
    """模拟回收站：直接删除文件（断言"文件被移走"这一对调用方可见的结果）。"""

    def trash_file(self, path):
        Path(path).unlink()


@pytest.fixture
def iso_cfg(tmp_path, monkeypatch):
    """合成模式：mock 掉 routes.read_config，工作区隔离到 tmp。"""
    cfg = _cfg_for(tmp_path)
    monkeypatch.setattr(routes, "read_config", lambda: cfg)
    monkeypatch.setattr(routes, "adapter", FakeTrashAdapter())
    return cfg


@pytest.fixture
def iso_cfg_real(tmp_path, monkeypatch):
    """真实模式：工作区隔离到 tmp，解析子进程读项目内配置
    （workspace/.runtime/paths.json + autorainbow_config.json）。

    解析脚本子进程由 _run_docx_parse 按 cfg["project_root"] 定位，
    因此在 tmp 下软链真实脚本，使子进程能找到可执行文件且输出仍在 tmp 内。
    """
    home = tmp_path / "home"
    home.mkdir(exist_ok=True)
    pyp = tmp_path / "pipeline" / "python"
    pyp.mkdir(parents=True, exist_ok=True)
    real_script = _PROJECT_ROOT / "pipeline/python/docx_list_to_json.py"
    (pyp / "docx_list_to_json.py").symlink_to(real_script)
    cfg = _cfg_for(tmp_path, home=home)
    # 2026-08-18：配置迁入项目内。业务配置 + 统一路径索引都写到
    # tmp/workspace/.runtime/，解析子进程（docx_list_to_json.py）与
    # routes 都从项目内读取，不再依赖家目录配置。
    runtime_dir = tmp_path / "workspace" / ".runtime"
    runtime_dir.mkdir(parents=True, exist_ok=True)
    (runtime_dir / "autorainbow_config.json").write_text(
        json.dumps(cfg, ensure_ascii=False), encoding="utf-8"
    )
    dir_keys = {k: v for k, v in cfg.items() if k.endswith("_dir")}
    (runtime_dir / "paths.json").write_text(
        json.dumps({"schema_version": 1, "project_root": str(tmp_path),
                    "indesign_app_path": "", "dirs": dir_keys},
                   ensure_ascii=False), encoding="utf-8"
    )
    monkeypatch.setenv("HOME", str(home))
    # docx 装在用户 site（~/.local 或 ~/Library/...），HOME 被改后子进程找不到，
    # 把解析子进程所需的依赖目录显式注入 PYTHONPATH
    try:
        import docx  # noqa: F401
        deps = str(Path(docx.__file__).resolve().parent.parent)
        existing = os.environ.get("PYTHONPATH", "")
        monkeypatch.setenv("PYTHONPATH", deps + (os.pathsep + existing if existing else ""))
    except ImportError:
        pass
    monkeypatch.setattr(routes, "read_config", lambda: cfg)
    return cfg


class FakeWriter:
    def __init__(self):
        self.data = b""

    def write(self, data):
        self.data += data


class FakeHandler:
    """模拟 BaseHTTPRequestHandler：json_response/read_body 用到的最小接口。"""

    def __init__(self, body=None):
        self.status = 200
        self.headers = {"Content-Length": str(len(body or b""))}
        self.wfile = FakeWriter()
        self.rfile = io.BytesIO(body or b"")

    def send_response(self, status):
        self.status = status

    def send_header(self, *args):
        pass

    def end_headers(self):
        pass


def _call(handler_fn, body=None):
    h = FakeHandler(json.dumps(body or {}).encode("utf-8") if body is not None else b"{}")
    handler_fn(h)
    return json.loads(h.wfile.data.decode("utf-8")), h.status


def _load(cache_path):
    return json.loads(Path(cache_path).read_text(encoding="utf-8"))


def _nfc(s):
    return unicodedata.normalize("NFC", str(s or ""))


def _make_images(iso_cfg, names):
    inbox = Path(iso_cfg["project_root"]) / "workspace/inputs"
    paths = []
    for n in names:
        p = inbox / n
        p.write_bytes(b"\xff\xd8\xff\xe0fake")
        paths.append(str(p))
    return paths


def _fake_parse(monkeypatch):
    """mock 解析脚本：按 mapping 顺序生成 [image, text] 成对缓存（与真实产物同构）。"""

    def fake(cfg, mapping_items):
        import time as _time
        out_dir = Path(cfg["project_root"]) / "workspace/outputs/work/caches"
        out_dir.mkdir(parents=True, exist_ok=True)
        cache = out_dir / f"fake_parse_{_time.time_ns()}.json"
        els = []
        for i, m in enumerate(mapping_items):
            els.append({"index": i * 2 + 1, "type": "image", "src": m["path"], "source_path": m["path"]})
            els.append({"index": i * 2 + 2, "type": "text", "content": Path(m["path"]).stem})
        cache.write_text(json.dumps(els, ensure_ascii=False), encoding="utf-8")
        return str(cache), [m["path"] for m in mapping_items], ""

    monkeypatch.setattr(routes, "_run_docx_parse", fake)


# ---------------------------------------------------------------- L2 合成

class TestParseNewProject:
    def test_new_parse_pairs_and_source_paths(self, iso_cfg, monkeypatch):
        _fake_parse(monkeypatch)
        paths = _make_images(iso_cfg, ["a.png", "b.png", "c.png"])
        resp, status = _call(routes.handle_parse_images, {"paths": paths, "template_id": "4_一句话"})
        assert status == 200
        els = _load(resp["cache_path"])
        assert [e.get("type") for e in els] == ["image", "text", "image", "text", "image", "text"]
        imgs = [e for e in els if e.get("type") == "image"]
        assert [e["source_path"] for e in imgs] == paths
        assert [e.get("content") for e in els if e.get("type") == "text"] == ["a", "b", "c"]


class TestAppend:
    def test_append_adds_to_end_and_dedups(self, iso_cfg, monkeypatch):
        _fake_parse(monkeypatch)
        paths = _make_images(iso_cfg, ["a.png", "b.png", "c.png"])
        resp, _ = _call(routes.handle_parse_images, {"paths": paths, "template_id": "4_一句话"})
        cache = resp["cache_path"]

        # 追加 2 张新图 + 1 张重复
        d, e = _make_images(iso_cfg, ["d.png", "e.png"])
        dup = paths[0]
        resp2, status = _call(routes.handle_parse_images, {
            "paths": [d, dup, e], "template_id": "4_一句话", "append_to": cache,
        })
        assert status == 200
        assert resp2["added"] == 2
        els = _load(cache)
        assert [e.get("content") for e in els if e.get("type") == "text"] == ["a", "b", "c", "d", "e"]
        assert len([e for e in els if e.get("type") == "image"]) == 5

    def test_append_all_duplicates_returns_added_zero(self, iso_cfg, monkeypatch):
        _fake_parse(monkeypatch)
        paths = _make_images(iso_cfg, ["a.png", "b.png"])
        resp, _ = _call(routes.handle_parse_images, {"paths": paths, "template_id": "4_一句话"})
        resp2, _ = _call(routes.handle_parse_images, {
            "paths": paths, "template_id": "4_一句话", "append_to": resp["cache_path"],
        })
        assert resp2["added"] == 0


def _parsed_cache(iso_cfg, monkeypatch, names):
    _fake_parse(monkeypatch)
    paths = _make_images(iso_cfg, names)
    resp, _ = _call(routes.handle_parse_images, {"paths": paths, "template_id": "4_一句话"})
    return resp["cache_path"], paths


class TestReparse:
    def test_reparse_follows_index_order(self, iso_cfg, monkeypatch):
        cache, paths = _parsed_cache(iso_cfg, monkeypatch, ["a.png", "b.png", "c.png"])
        resp, status = _call(routes.handle_reparse, {
            "cache_path": cache, "template_id": "4_一句话", "images": [paths[1], paths[0]],
        })
        assert status == 200
        els = _load(cache)
        assert [e.get("content") for e in els if e.get("type") == "text"] == ["b", "a"]
        assert resp["removed"] == []

    def test_reparse_removes_fully_deleted_group(self, iso_cfg, monkeypatch):
        cache, paths = _parsed_cache(iso_cfg, monkeypatch, ["a.png", "b.png", "c.png"])
        # 删掉 b 整组（图+文）
        els = [e for e in _load(cache)
               if not (e.get("source_path") == paths[1] or e.get("content") == "b")]
        Path(cache).write_text(json.dumps(els, ensure_ascii=False), encoding="utf-8")
        resp, _ = _call(routes.handle_reparse, {
            "cache_path": cache, "template_id": "4_一句话", "images": paths,
        })
        assert resp["removed"] == [paths[1]]
        els = _load(cache)
        assert [e.get("content") for e in els if e.get("type") == "text"] == ["a", "c"]
        assert [e.get("index") for e in els] == [1, 2, 3, 4]
        # 整组删除 = 真正移除：源文件应已从输入目录移走
        assert not Path(paths[1]).exists(), "removed 的源文件应被真正移走"
        assert Path(paths[0]).exists() and Path(paths[2]).exists(), "未删除的文件应保留"

    def test_reparse_restores_deleted_image(self, iso_cfg, monkeypatch):
        cache, paths = _parsed_cache(iso_cfg, monkeypatch, ["a.png", "b.png"])
        # 删掉 a 的图元素（文本还在）
        els = [e for e in _load(cache) if e.get("source_path") != paths[0]]
        Path(cache).write_text(json.dumps(els, ensure_ascii=False), encoding="utf-8")
        resp, _ = _call(routes.handle_reparse, {
            "cache_path": cache, "template_id": "4_一句话", "images": paths,
        })
        assert resp["removed"] == []
        els = _load(cache)
        imgs = [e for e in els if e.get("type") == "image"]
        assert [e["source_path"] for e in imgs] == paths


class TestPageBreaks:
    def test_page_breaks_written_after_rebuild(self, iso_cfg, monkeypatch):
        _fake_parse(monkeypatch)
        paths = _make_images(iso_cfg, [f"img{i}.png" for i in range(9)])
        resp, _ = _call(routes.handle_parse_images, {"paths": paths, "template_id": "4_一句话"})
        els = _load(resp["cache_path"])
        break_idx = [e["index"] for e in els if e.get("page_break_before")]
        assert break_idx, "重建后应重算自动分页点"
        # 分页点应落在 unit 锚点（图 index 或其后文本 index 开头）
        assert all(int(i) % 2 == 1 for i in break_idx)

    def test_page_breaks_cleared_then_recomputed(self, iso_cfg, monkeypatch):
        cache, _ = _parsed_cache(iso_cfg, monkeypatch, ["a.png", "b.png"])
        els = _load(cache)
        els[2]["page_break_before"] = True  # 旧的手动分页
        Path(cache).write_text(json.dumps(els, ensure_ascii=False), encoding="utf-8")
        resp, _ = _call(routes.handle_reparse, {
            "cache_path": cache, "template_id": "4_一句话", "images": None,
        })
        assert resp["cache_path"]
        # 重建后旧手动分页点不应残留（分页由自动计算统一给出）
        els = _load(cache)
        breaks = [e["index"] for e in els if e.get("page_break_before")]
        assert breaks == [int(b) for b in resp.get("page_breaks") or []]


class TestCompoundFlow:
    def test_full_flow(self, iso_cfg, monkeypatch):
        _fake_parse(monkeypatch)
        # 1) 新建 3 图
        paths = _make_images(iso_cfg, ["a.png", "b.png", "c.png"])
        resp, _ = _call(routes.handle_parse_images, {"paths": paths, "template_id": "4_一句话"})
        cache = resp["cache_path"]
        # 2) 追加 2 图
        d, e = _make_images(iso_cfg, ["d.png", "e.png"])
        _call(routes.handle_parse_images, {"paths": [d, e], "template_id": "4_一句话", "append_to": cache})
        # 3) 删掉 b 整组
        els = [x for x in _load(cache) if not (x.get("source_path") == paths[1] or x.get("content") == "b")]
        Path(cache).write_text(json.dumps(els, ensure_ascii=False), encoding="utf-8")
        # 4) 重新解析（索引 5 张）
        resp, _ = _call(routes.handle_reparse, {
            "cache_path": cache, "template_id": "4_一句话", "images": paths + [d, e],
        })
        assert resp["removed"] == [paths[1]]
        els = _load(cache)
        assert [e.get("content") for e in els if e.get("type") == "text"] == ["a", "c", "d", "e"]
        # 5) 分页仍可计算
        breaks = [e["index"] for e in els if e.get("page_break_before")]
        assert breaks == [int(b) for b in resp.get("page_breaks") or []]


# ---------------------------------------------------------------- L3 真实资产

def _real_asset_paths(iso_cfg):
    if not ASSETS_DIR.is_dir():
        pytest.skip("缺少 workspace/test_assets/images（真实资产测试需用户提供）")
    imgs = sorted(ASSETS_DIR.glob("*.jpg")) + sorted(ASSETS_DIR.glob("*.png"))
    if not imgs:
        pytest.skip("workspace/test_assets/images 为空")
    inbox = Path(iso_cfg["project_root"]) / "workspace/inputs"
    copied = []
    for s in imgs:
        dst = inbox / s.name
        shutil.copy(s, dst)
        copied.append(str(dst))
    return copied


class TestRealAssets:
    def test_real_parse_pairs_source_paths_no_dups(self, iso_cfg_real):
        paths = _real_asset_paths(iso_cfg_real)
        resp, status = _call(routes.handle_parse_images, {"paths": paths, "template_id": "4_一句话"})
        assert status == 200
        els = _load(resp["cache_path"])
        imgs = [e for e in els if e.get("type") == "image"]
        txts = [e for e in els if e.get("type") == "text"]
        assert len(imgs) == len(paths), f"图片数应等于输入 {len(paths)}"
        assert len(txts) == len(paths), "文本数应等于图片数（严格成对）"
        stems = {_nfc(Path(p).stem) for p in paths}
        for img in imgs:
            assert _nfc(Path(img["source_path"]).stem) in stems, \
                f"source_path 配对失败: {img.get('source_path')}"
        contents = [_nfc(t["content"]) for t in txts]
        assert len(set(contents)) == len(contents), "文本不应重复（成对重建）"
        assert contents == [_nfc(Path(p).stem) for p in paths], "文本应为源文件名（顺序一致）"

    def test_real_append_then_reparse(self, iso_cfg_real):
        paths = _real_asset_paths(iso_cfg_real)
        resp, _ = _call(routes.handle_parse_images, {"paths": paths, "template_id": "4_一句话"})
        cache = resp["cache_path"]
        # 追加第一张（应为重复 → added 0）
        resp2, _ = _call(routes.handle_parse_images, {
            "paths": [paths[0]], "template_id": "4_一句话", "append_to": cache,
        })
        assert resp2["added"] == 0
        # 重新解析全量索引：内容不变、无重复
        resp3, _ = _call(routes.handle_reparse, {
            "cache_path": cache, "template_id": "4_一句话", "images": paths,
        })
        assert resp3["removed"] == []
        els = _load(cache)
        assert len([e for e in els if e.get("type") == "image"]) == len(paths)
        contents = [e["content"] for e in els if e.get("type") == "text"]
        assert len(set(_nfc(c) for c in contents)) == len(contents)
