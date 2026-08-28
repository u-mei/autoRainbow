"""回归测试：文件选择框弹出期间前端显示"无服务"。

Bug 背景（docs/fixes/添加文件时显示无服务.md）：
- handle_pick_files 同步调用 adapter.pick_files()（osascript 弹系统对话框），
  用户选文件期间请求一直占用 HTTP 线程
- 旧实现用单线程 HTTPServer，其他请求（前端 health 轮询）全部排队超时，
  界面显示"无服务"；选完文件后才恢复
- 修复：改用多线程 ThreadingHTTPServer（AgentServer），慢请求只占自己的线程

本测试在真实 HTTP 服务上验证：模拟 pick_files 阻塞 1.5 秒（等同弹窗期间），
期间 /api/health 必须快速响应。单线程实现下该测试必然失败。
"""

import json
import sys
import threading
import time
from http.client import HTTPConnection
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent import routes  # noqa: E402
from agent.server import AgentHandler, AgentServer  # noqa: E402


class FakeAdapter:
    """pick_files 模拟系统对话框：阻塞 1.5 秒后返回空选择（用户取消）。"""

    def __init__(self, block_seconds=1.5):
        self.block_seconds = block_seconds

    def pick_files(self, prompt, extensions):
        time.sleep(self.block_seconds)
        return []


@pytest.fixture
def running_server(monkeypatch):
    monkeypatch.setattr(routes, "adapter", FakeAdapter())
    server = AgentServer(("127.0.0.1", 0), AgentHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    yield port
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)


def _http_get(port, path, timeout):
    conn = HTTPConnection("127.0.0.1", port, timeout=timeout)
    try:
        conn.request("GET", path)
        resp = conn.getresponse()
        body = resp.read().decode("utf-8")
        return resp.status, body
    finally:
        conn.close()


class TestConcurrentServer:
    def test_health_responds_while_pick_files_blocking(self, running_server):
        port = running_server

        pick_done = threading.Event()

        def do_pick_files():
            try:
                _http_get(port, "/api/pick-files", timeout=10)
            finally:
                pick_done.set()

        t = threading.Thread(target=do_pick_files, daemon=True)
        t.start()
        time.sleep(0.3)  # 确保 pick-files 请求已进入服务并被阻塞

        start = time.time()
        status, body = _http_get(port, "/api/health", timeout=2)
        elapsed = time.time() - start

        assert status == 200, f"health 应正常响应，实际 {status}: {body[:200]}"
        assert elapsed < 1.0, (
            f"弹窗阻塞期间 health 响应耗时 {elapsed:.2f}s，超过 1s——"
            "服务仍是单线程，前端轮询会被文件选择框阻塞"
        )
        data = json.loads(body)
        assert data.get("online") is True

        assert pick_done.wait(timeout=10), "pick-files 请求应正常完成"

    def test_two_requests_run_in_parallel(self, running_server):
        port = running_server
        # 同时发起两个请求，多线程下二者都应快速完成
        results = []

        def worker():
            start = time.time()
            status, body = _http_get(port, "/api/health", timeout=5)
            results.append((status, time.time() - start, body))

        threads = [threading.Thread(target=worker) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=6)
        assert len(results) == 4
        for status, elapsed, body in results:
            assert status == 200
            assert elapsed < 3.0, f"并发请求耗时 {elapsed:.2f}s，疑似排队阻塞"
