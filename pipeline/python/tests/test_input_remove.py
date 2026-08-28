"""回归测试：remove_input_file 的校验、回收站调用与 fallback。

背景（docs/fixes/待处理队列移除失效.md）：
- 前端"移除"(✕)只从 state.files 数组移除，磁盘上的源文件仍在
- 修复：新增 POST /api/input/remove，优先把文件移到系统回收站（不可用时直接删除）
- 2026-08-16 起不再扫描 inputs 自动入队（仅主动导入），
  本测试聚焦 remove_input_file 自身的校验与回收站/删除 fallback 行为
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent import routes  # noqa: E402


class FakeWriter:
    def __init__(self):
        self.data = b""

    def write(self, data):
        self.data += data


class FakeHandler:
    """模拟 BaseHTTPRequestHandler 中 json_response 用到的最小接口。"""

    def __init__(self):
        self.status = 200
        self.headers = {}
        self.wfile = FakeWriter()

    def send_response(self, status):
        self.status = status

    def send_header(self, *args):
        pass

    def end_headers(self):
        pass


class FakeAdapter:
    """模拟 platform adapter 的回收站能力。

    真实回收站行为（osascript Finder / PowerShell）不应在单元测试中执行：
    CI 无 GUI，且无法断言文件"进了回收站"。这里用"unlink 文件"模拟
    "文件被移走"这一对调用方可见的结果。
    """

    def __init__(self, raise_on_trash=False):
        self.calls = []
        self.raise_on_trash = raise_on_trash

    def trash_file(self, path):
        self.calls.append(path)
        if self.raise_on_trash:
            raise RuntimeError("trash unavailable")
        Path(path).unlink()


@pytest.fixture
def workspace_cfg(tmp_path):
    inputs = tmp_path / "workspace" / "inputs"
    inputs.mkdir(parents=True)
    return {"project_root": str(tmp_path)}


@pytest.fixture
def fake_adapter(monkeypatch):
    adapter = FakeAdapter()
    monkeypatch.setattr(routes, "adapter", adapter)
    return adapter


class TestRemoveValidation:
    def test_missing_path_returns_400(self, workspace_cfg):
        status, payload = routes.remove_input_file(workspace_cfg, "")
        assert status == 400
        assert "path" in payload["error"] or "路径" in payload["error"]

    def test_rejects_path_outside_input_root(self, workspace_cfg, fake_adapter, tmp_path):
        outside = tmp_path / "outside.txt"
        outside.write_text("x")
        status, payload = routes.remove_input_file(workspace_cfg, str(outside))
        assert status == 403
        assert outside.exists(), "越界路径不应被删除"
        assert fake_adapter.calls == [], "越界路径不应触发回收站调用"

    def test_rejects_directory(self, workspace_cfg, fake_adapter):
        status, payload = routes.remove_input_file(workspace_cfg, str(workspace_cfg["project_root"]) + "/workspace/inputs")
        assert status == 400
        assert fake_adapter.calls == []

    def test_missing_file_is_idempotent_ok(self, workspace_cfg, fake_adapter):
        missing = str(Path(workspace_cfg["project_root"]) / "workspace" / "inputs" / "gone.docx")
        status, payload = routes.remove_input_file(workspace_cfg, missing)
        assert status == 200
        assert payload["success"] is True
        assert payload["trashed"] is False


class TestRemoveToTrash:
    def test_moves_file_to_trash(self, workspace_cfg, fake_adapter):
        target = Path(workspace_cfg["project_root"]) / "workspace" / "inputs" / "demo.docx"
        target.write_text("demo")
        status, payload = routes.remove_input_file(workspace_cfg, str(target))
        assert status == 200
        assert payload["success"] is True
        assert payload["trashed"] is True
        assert fake_adapter.calls == [str(target.resolve())], "应调用回收站 API"
        assert not target.exists(), "文件应已从磁盘移走"

    def test_falls_back_to_direct_unlink_when_trash_unavailable(
        self, workspace_cfg, monkeypatch
    ):
        adapter = FakeAdapter(raise_on_trash=True)
        monkeypatch.setattr(routes, "adapter", adapter)
        target = Path(workspace_cfg["project_root"]) / "workspace" / "inputs" / "demo2.docx"
        target.write_text("demo")
        status, payload = routes.remove_input_file(workspace_cfg, str(target))
        assert status == 200
        assert payload["success"] is True
        assert payload["trashed"] is False
        assert not target.exists(), "回收站不可用时应直接删除"

    def test_returns_500_when_both_trash_and_unlink_fail(self, workspace_cfg, monkeypatch):
        adapter = FakeAdapter(raise_on_trash=True)
        monkeypatch.setattr(routes, "adapter", adapter)

        def fail_unlink(self):
            raise PermissionError("cannot unlink")

        monkeypatch.setattr(Path, "unlink", fail_unlink)
        target = Path(workspace_cfg["project_root"]) / "workspace" / "inputs" / "demo3.docx"
        target.write_text("demo")
        status, payload = routes.remove_input_file(workspace_cfg, str(target))
        assert status == 500
        assert target.exists(), "删除失败时文件应保留"
