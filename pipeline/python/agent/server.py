#!/usr/bin/env python3
"""
AutoRainbow Agent - HTTP 服务入口
监听 localhost:8800，提供 REST API + 静态文件服务。
"""

import os, sys, json, threading, time, mimetypes
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

_script_dir = Path(__file__).parent
_package_dir = _script_dir.parent
if str(_package_dir) not in sys.path:
    sys.path.insert(0, str(_package_dir))

from agent.routes import dispatch, json_response, add_cors_headers, set_shutdown_callback, start_queue_recovery_worker

# 2026-08-18：启动时校正统一路径索引——project_root 以脚本位置反推为准，
# 目录迁移后首次启动即把 paths.json 落盘为新项目根（不依赖旧值）。
try:
    from agent import config as _cfg_mod
    _cfg_mod.write_paths()
except Exception:
    pass

_proj_root = _script_dir.parent.parent.parent
_static_dir = _proj_root / "app" / "web"


class AgentHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        sys.stderr.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {self.command} {self.path} -> {format % args}\n")

    def handle(self):
        try:
            super().handle()
        except BrokenPipeError:
            pass
        except ConnectionResetError:
            pass

    def do_OPTIONS(self):
        self.send_response(204)
        add_cors_headers(self)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/"):
            self._route()
        else:
            self._serve_static()

    def do_HEAD(self):
        if self.path.startswith("/api/health"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", "0")
            add_cors_headers(self)
            self.end_headers()
        elif self.path.startswith("/api/"):
            json_response(self, {"error": "Not Found", "path": self.path}, 404)
        else:
            self._serve_static(send_body=False)

    def do_POST(self):
        self._route()

    def do_PUT(self):
        self._route()

    def do_DELETE(self):
        self._route()

    def _route(self):
        start = time.time()
        try:
            if not dispatch(self):
                json_response(self, {"error": "Not Found", "path": self.path}, 404)
        finally:
            sys.stderr.write(f"[{time.strftime('%H:%M:%S')}] {self.command} {self.path} 完成耗时 {time.time() - start:.2f}s\n")

    def _serve_static(self, send_body=True):
        path = urlparse(self.path).path.lstrip("/")
        if not path:
            path = "index.html"
        file_path = _static_dir / path
        resolved = file_path.resolve()
        static_root = _static_dir.resolve()
        try:
            inside_static = resolved.is_relative_to(static_root)
        except AttributeError:
            inside_static = str(resolved).startswith(str(static_root) + os.sep) or resolved == static_root
        if not inside_static:
            self.send_error(403)
            return
        if not resolved.exists() or not resolved.is_file():
            self.send_error(404)
            return
        content_type, _ = mimetypes.guess_type(str(resolved))
        if content_type is None:
            content_type = "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(resolved.stat().st_size))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if send_body:
            with open(resolved, "rb") as f:
                self.wfile.write(f.read())


_server_instance = None


class AgentServer(ThreadingHTTPServer):
    """多线程 HTTP 服务器：慢请求（文件选择框、大文件、子进程调用）
    只占用自己的线程，不阻塞前端轮询/健康检查。"""
    daemon_threads = True
    block_on_close = False


def serve_forever(host="127.0.0.1", port=8800):
    global _server_instance
    _server_instance = AgentServer((host, port), AgentHandler)
    set_shutdown_callback(_server_instance.shutdown)
    # 后台线程：定时扫描并自动恢复卡死的 running 任务
    try:
        start_queue_recovery_worker()
    except Exception:
        pass
    print(f"[autoRainbow Agent] 服务启动: http://{host}:{port}", flush=True)
    try:
        _server_instance.serve_forever()
    except KeyboardInterrupt:
        print("\n[autoRainbow Agent] 服务关闭", flush=True)
        _server_instance.server_close()


if __name__ == "__main__":
    serve_forever()
