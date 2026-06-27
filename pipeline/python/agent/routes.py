import os, sys, json, time, shutil, subprocess, re, threading
from pathlib import Path
from urllib.parse import urlparse, unquote_plus
from http.server import BaseHTTPRequestHandler

from .config import read_config, write_config, auto_detect_indesign, get_config_path, get_template_config, set_template_config, short_timestamp
from .indesign import (
    try_open_indesign, execute_jsx,
    install_watcher, uninstall_watcher,
    check_watcher_installed, check_watcher_alive
)
from .platform_adapter import create_adapter


adapter = create_adapter()
VERSION = "1.0.0"
ALLOWED_ORIGINS = {
    "http://127.0.0.1:8800",
    "http://localhost:8800",
}
_shutdown_callback = None


def set_shutdown_callback(callback):
    global _shutdown_callback
    _shutdown_callback = callback


def add_cors_headers(handler):
    origin = handler.headers.get("Origin", "")
    if origin in ALLOWED_ORIGINS:
        handler.send_header("Access-Control-Allow-Origin", origin)
        handler.send_header("Vary", "Origin")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")


def is_path_inside(path, root):
    try:
        resolved_path = Path(path).resolve()
        resolved_root = Path(root).resolve()
    except OSError:
        return False
    try:
        return resolved_path.is_relative_to(resolved_root)
    except AttributeError:
        return str(resolved_path).startswith(str(resolved_root) + os.sep) or resolved_path == resolved_root


def sanitize_upload_filename(filename):
    name = str(filename or "upload").replace("\\", "/").split("/")[-1].strip()
    name = name.replace("\x00", "")
    return name or "upload"


def resolve_unique_file_path(directory, filename):
    target_dir = Path(directory)
    safe_name = sanitize_upload_filename(filename)
    candidate = target_dir / safe_name
    if not candidate.exists():
        return candidate

    stem = Path(safe_name).stem or "upload"
    suffix = Path(safe_name).suffix
    for idx in range(1, 10000):
        candidate = target_dir / f"{stem}_{idx}{suffix}"
        if not candidate.exists():
            return candidate
    return target_dir / f"{stem}_{time.time_ns()}{suffix}"


def is_valid_template_dir_name(template_id):
    if not template_id:
        return True
    text = str(template_id)
    return (
        text not in {".", ".."}
        and "/" not in text
        and "\\" not in text
        and "\x00" not in text
    )


def resolve_workspace_file(cfg, path_text):
    p = Path(path_text).expanduser().resolve()
    workspace_root = get_workspace_root(cfg)
    if not is_path_inside(p, workspace_root):
        return None
    return p


def resolve_cache_file(cfg, path_text):
    p = Path(path_text).expanduser().resolve()
    cache_root = get_output_root(cfg) / "_cache"
    if p.suffix.lower() != ".json" or not is_path_inside(p, cache_root):
        return None
    return p


def find_replacement_cache_file(path):
    """Recover from stale cache ids by finding the latest same-prefix cache."""
    p = Path(path)
    if p.exists() or p.suffix.lower() != ".json":
        return p if p.exists() else None
    if "_" not in p.stem or not p.parent.exists():
        return None
    prefix = p.stem.rsplit("_", 1)[0] + "_"
    candidates = [
        item for item in p.parent.glob(prefix + "*.json")
        if item.is_file() and item.name != p.name
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: item.stat().st_mtime)


def collect_cache_image_refs(cfg):
    cache_root = get_output_root(cfg) / "_cache"
    shared_root = get_output_root(cfg) / "_shared_images"
    refs = set()
    if not cache_root.exists() or not shared_root.exists():
        return refs, 0
    cache_files = list(cache_root.glob("*.json"))
    if not cache_files:
        return refs, 0

    def collect_from_value(value):
        if isinstance(value, dict):
            for key, inner in value.items():
                if key in {"src", "image", "path"} and isinstance(inner, str):
                    p = Path(inner).expanduser()
                    try:
                        resolved = p.resolve()
                    except OSError:
                        continue
                    if is_path_inside(resolved, shared_root):
                        refs.add(str(resolved))
                else:
                    collect_from_value(inner)
        elif isinstance(value, list):
            for item in value:
                collect_from_value(item)

    unreadable = 0
    for cache_file in cache_files:
        try:
            data = json.loads(cache_file.read_text(encoding="utf-8"))
        except Exception:
            unreadable += 1
            continue
        collect_from_value(data)
    return refs, unreadable


def cleanup_unreferenced_shared_images(cfg):
    cache_root = get_output_root(cfg) / "_cache"
    shared_root = get_output_root(cfg) / "_shared_images"
    if not shared_root.exists():
        return {"cleared": 0, "removed_dirs": 0, "skipped": False}
    if not cache_root.exists() or not list(cache_root.glob("*.json")):
        return {"cleared": 0, "removed_dirs": 0, "skipped": True, "reason": "没有可用于校验引用的核心缓存 JSON"}
    refs, unreadable = collect_cache_image_refs(cfg)
    if unreadable > 0:
        return {"cleared": 0, "removed_dirs": 0, "skipped": True, "reason": f"{unreadable} 个核心缓存 JSON 读取失败"}
    cleared = 0
    removed_dirs = 0
    for f in shared_root.rglob("*"):
        if not f.is_file() or f.name.startswith("."):
            continue
        try:
            resolved = str(f.resolve())
        except OSError:
            continue
        if resolved in refs:
            continue
        try:
            f.unlink()
            cleared += 1
        except Exception:
            pass
    for d in sorted(shared_root.rglob("*"), key=lambda x: len(str(x)), reverse=True):
        if not d.is_dir():
            continue
        try:
            d.rmdir()
            removed_dirs += 1
        except Exception:
            pass
    return {"cleared": cleared, "removed_dirs": removed_dirs, "skipped": False}


def json_response(handler, data, status=200):
    body = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    add_cors_headers(handler)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_body(handler):
    length = int(handler.headers.get("Content-Length", 0))
    if length == 0:
        return {}
    raw = handler.rfile.read(length)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def parse_path(handler):
    parsed = urlparse(handler.path)
    return parsed.path.rstrip("/"), parsed.query


def get_cfg():
    cfg = read_config()
    return cfg


def get_workspace_root(cfg):
    return Path(cfg["project_root"]) / "workspace"


def get_output_root(cfg):
    return get_workspace_root(cfg) / "B_outputs"


def get_source_root(cfg):
    return get_output_root(cfg) / "_sources"


def get_input_root(cfg):
    return get_workspace_root(cfg) / "C_inputs"


def get_queue_root(cfg):
    return get_output_root(cfg) / "queue"


def get_page_breaks_root(cfg):
    return get_output_root(cfg) / "_page_breaks"


def get_page_breaks_file_for_cache(cfg, cache_path):
    return get_page_breaks_root(cfg) / f"{Path(cache_path).stem}.json"


def ensure_queue_dirs(queue_root):
    for name in ("pending", "running", "done", "error"):
        (queue_root / name).mkdir(parents=True, exist_ok=True)


def is_stale_queue_task(path, stale_seconds=600):
    try:
        return time.time() - path.stat().st_mtime > stale_seconds
    except Exception:
        return False


def count_files(dir_path):
    p = Path(dir_path)
    if not p.exists():
        return 0
    return len([f for f in p.iterdir() if f.suffix == ".json"])


def read_last_lines(path, max_lines=120):
    p = Path(path)
    if not p.exists():
        return ""
    text = p.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    if len(lines) > max_lines:
        lines = lines[-max_lines:]
    return "\n".join(lines)


def parse_dispatch_summary(text):
    ok = -1
    fail = -1
    for line in reversed(text.splitlines()):
        if "分发完成" in line:
            continue
        if "成功:" in line and "失败:" in line:
            m = re.search(r"成功:\s*(\d+)\s+失败:\s*(\d+)", line)
            if m:
                ok = int(m.group(1))
                fail = int(m.group(2))
                break
    return (max(ok, 0), max(fail, 0))


def parse_dispatch_file_results(text):
    lines = text.splitlines()
    start_idx = -1
    for i in range(len(lines) - 1, -1, -1):
        if "开始执行分发排版" in lines[i]:
            start_idx = i
            break
    if start_idx < 0:
        return []

    results = []
    current_cache = ""
    current_output = ""
    for line in lines[start_idx:]:
        if "开始处理:" in line:
            current_cache = line.split("开始处理:", 1)[1].strip()
            current_output = ""
            continue
        if "输出:" in line:
            current_output = line.split("输出:", 1)[1].strip()
            continue
        if "完成:" in line:
            output_path = line.split("完成:", 1)[1].strip()
            results.append({
                "status": "done",
                "cache_path": current_cache,
                "output_path": output_path or current_output,
            })
            current_cache = ""
            current_output = ""
            continue
        if "失败:" in line:
            if "成功:" in line:
                continue
            rest = line.split("失败:", 1)[1].strip()
            cache_path, _, error_text = rest.partition("，错误=")
            if not cache_path or (not error_text and not current_cache):
                continue
            results.append({
                "status": "fail",
                "cache_path": cache_path.strip() or current_cache,
                "output_path": current_output,
                "error": error_text.strip(),
            })
            current_cache = ""
            current_output = ""
    return [item for item in results if item.get("cache_path")]


def read_latest_task_report(queue_root):
    candidates = []
    for dirname in ("done", "error"):
        d = queue_root / dirname
        if not d.exists():
            continue
        candidates.extend([p for p in d.iterdir() if p.suffix == ".json"])
    if not candidates:
        return None
    latest = max(candidates, key=lambda p: p.stat().st_mtime)
    try:
        data = json.loads(latest.read_text(encoding="utf-8"))
    except Exception:
        return None
    results = data.get("results")
    if not isinstance(results, list):
        return None
    ok = int(data.get("ok") or len([x for x in results if x.get("status") == "done"]))
    fail = int(data.get("fail") or len([x for x in results if x.get("status") == "fail"]))
    task_id = str(data.get("task_id") or latest.stem)
    return {"ok": ok, "fail": fail, "results": results, "task_path": str(latest), "task_id": task_id}


def normalize_cache_elements_for_save(elements, existing_elements=None):
    if not isinstance(elements, list):
        return elements
    metadata_keys = ("doc_name", "section_name", "template_id", "doc_images_dir", "base36_id", "source_path")
    defaults = {}
    for source in (elements, existing_elements or []):
        if not isinstance(source, list):
            continue
        for item in source:
            if not isinstance(item, dict):
                continue
            for key in metadata_keys:
                if key not in defaults and item.get(key):
                    defaults[key] = item.get(key)

    normalized = []
    for idx, item in enumerate(elements, start=1):
        if not isinstance(item, dict):
            normalized.append(item)
            continue
        next_item = dict(item)
        next_item["index"] = idx
        if not next_item.get("type"):
            next_item["type"] = "image" if next_item.get("src") else "text"
        for key, value in defaults.items():
            if not next_item.get(key):
                next_item[key] = value
        normalized.append(next_item)
    return normalized


def archive_source_file_for_cache(cfg, src_path, cache_path):
    src = Path(src_path).resolve()
    if not src.exists() or not src.is_file():
        return ""
    source_root = get_source_root(cfg)
    source_root.mkdir(parents=True, exist_ok=True)
    if is_path_inside(src, source_root):
        return str(src)

    cache_stem = Path(cache_path).stem or src.stem
    target_name = sanitize_upload_filename(f"{cache_stem}{src.suffix.lower()}")
    target = resolve_unique_file_path(source_root, target_name).resolve()
    if not is_path_inside(target, source_root):
        return ""
    try:
        shutil.move(str(src), str(target))
    except Exception:
        shutil.copy2(str(src), str(target))
    return str(target)


def attach_source_path_to_cache(cache_path, source_path):
    if not source_path:
        return
    p = Path(cache_path)
    if not p.exists() or p.suffix.lower() != ".json":
        return
    try:
        elements = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return
    if not isinstance(elements, list):
        return
    changed = False
    for item in elements:
        if isinstance(item, dict) and item.get("source_path") != source_path:
            item["source_path"] = source_path
            changed = True
    if changed:
        p.write_text(json.dumps(elements, ensure_ascii=False, indent=2), encoding="utf-8")


def handle_health(handler):
    json_response(handler, {
        "online": True, "version": VERSION, "platform": sys.platform
    })


def handle_image(handler):
    from urllib.parse import urlparse, parse_qs
    params = parse_qs(urlparse(handler.path).query)
    img_path = (params.get("path") or [""])[0]
    if not img_path:
        json_response(handler, {"error": "缺少 path"}, 400)
        return
    cfg = get_cfg()
    p = resolve_workspace_file(cfg, img_path)
    if p is None:
        json_response(handler, {"error": "图片路径不在工作区内"}, 403)
        return
    if not p.exists() or not p.is_file():
        json_response(handler, {"error": "图片不存在"}, 404)
        return
    ext = p.suffix.lower()
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp"}
    ct = mime.get(ext.lstrip("."))
    if not ct:
        json_response(handler, {"error": "不支持的图片格式"}, 400)
        return
    try:
        data = p.read_bytes()
        handler.send_response(200)
        add_cors_headers(handler)
        handler.send_header("Content-Type", ct)
        handler.send_header("Content-Length", str(len(data)))
        handler.send_header("Cache-Control", "max-age=3600")
        handler.end_headers()
        handler.wfile.write(data)
    except Exception:
        json_response(handler, {"error": "读取图片失败"}, 500)


def handle_get_config(handler):
    cfg = get_cfg()
    config_path = get_config_path()
    json_response(handler, {
        "project_root": cfg["project_root"],
        "indesign_app_path": cfg["indesign_app_path"],
        "polling_interval": cfg["polling_interval"],
        "watcher_heartbeat_interval": cfg.get("watcher_heartbeat_interval", 3),
        "watcher_alive_timeout": cfg.get("watcher_alive_timeout", 10),
        "templates": cfg.get("templates", {}),
        "config_path": str(config_path),
        "config_exists": config_path.exists()
    })


def handle_post_config(handler):
    body = read_body(handler)
    allowed_keys = {"project_root", "indesign_app_path", "polling_interval",
                    "watcher_heartbeat_interval", "watcher_alive_timeout"}

    project_root = body.get("project_root")
    if project_root is not None:
        p = Path(project_root)
        if not p.exists() or not p.is_dir():
            json_response(handler, {"error": f"项目根目录不存在: {project_root}"}, 400)
            return
        if not (p / "workspace").exists():
            json_response(handler, {"error": f"目录结构不匹配，未找到 workspace 子目录: {project_root}"}, 400)
            return

    app_path = body.get("indesign_app_path")
    if app_path is not None:
        if not Path(app_path).exists():
            json_response(handler, {"error": f"InDesign 应用不存在: {app_path}"}, 400)
            return

    update = {k: v for k, v in body.items() if k in allowed_keys}
    if "templates" in body:
        update["templates"] = body["templates"]
    if update:
        write_config(update)
    json_response(handler, {"success": True, "config": get_cfg()})


def handle_auto_detect(handler):
    result = auto_detect_indesign()
    json_response(handler, result)


def handle_get_dashboard(handler):
    cfg = get_cfg()
    output_root = get_output_root(cfg)
    queue_root = get_queue_root(cfg)
    logs_root = output_root / "logs"

    pending = count_files(queue_root / "pending")
    running = count_files(queue_root / "running")
    done = count_files(queue_root / "done")
    error = count_files(queue_root / "error")

    dispatch_log = read_last_lines(logs_root / "dispatch.log")
    watcher_log = read_last_lines(logs_root / "watcher.log")
    pipeline_log = read_last_lines(logs_root / "pipeline.log")

    task_report = read_latest_task_report(queue_root)
    log_file_results = parse_dispatch_file_results(dispatch_log)
    if task_report:
        last_success = task_report["ok"]
        last_fail = task_report["fail"]
        file_results = task_report["results"]
        last_task_path = task_report["task_path"]
        last_task_id = task_report["task_id"]
    else:
        last_success, last_fail = parse_dispatch_summary(dispatch_log)
        file_results = log_file_results
        last_task_path = ""
        last_task_id = ""

    watcher_status = check_watcher_alive()

    progress = None
    progress_file = queue_root / "progress.json"
    if progress_file.exists():
        try:
            progress = json.loads(progress_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    json_response(handler, {
        "running": running > 0,
        "pending_count": pending,
        "running_count": running,
        "done_count": done,
        "error_count": error,
        "last_success": last_success,
        "last_fail": last_fail,
        "last_file_results": file_results,
        "last_task_path": last_task_path,
        "last_task_id": last_task_id,
        "dispatch_log": dispatch_log,
        "watcher_log": watcher_log,
        "pipeline_log": pipeline_log,
        "watcher_alive": watcher_status["alive"],
        "progress": progress
    })


def handle_queue_stats(handler):
    cfg = get_cfg()
    queue_root = get_queue_root(cfg)
    json_response(handler, {
        "pending": count_files(queue_root / "pending"),
        "running": count_files(queue_root / "running"),
        "done": count_files(queue_root / "done"),
        "error": count_files(queue_root / "error")
    })


def handle_get_state(handler):
    cfg = get_cfg()
    state_file = get_workspace_root(cfg) / ".ui_state.json"
    if state_file.exists():
        data = state_file.read_text(encoding="utf-8")
        try:
            json_response(handler, json.loads(data))
        except Exception:
            json_response(handler, {"files": [], "active_tab": "config"})
    else:
        json_response(handler, {"files": [], "active_tab": "config"})


def handle_post_state(handler):
    body = read_body(handler)
    content = body.get("content", "")
    if isinstance(content, str):
        try:
            data = json.loads(content)
        except Exception:
            data = content
    else:
        data = content

    cfg = get_cfg()
    state_file = get_workspace_root(cfg) / ".ui_state.json"
    state_file.parent.mkdir(parents=True, exist_ok=True)

    if isinstance(data, str):
        state_file.write_text(data, encoding="utf-8")
    else:
        state_file.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
    json_response(handler, {"success": True})


def handle_pick_files(handler):
    try:
        raw_paths = adapter.pick_files("请选择要导入的文件", ["docx", "png", "jpg", "jpeg"])
        # 复制到 _inbox/ 返回 server 路径
        cfg = get_cfg()
        inbox = get_input_root(cfg) / "_inbox"
        inbox.mkdir(parents=True, exist_ok=True)
        server_paths = []
        for p in raw_paths:
            src = Path(p)
            if not src.exists():
                continue
            target = resolve_unique_file_path(inbox, src.name)
            shutil.copy2(str(src), str(target))
            server_paths.append(str(target))
        json_response(handler, server_paths)
    except Exception as e:
        json_response(handler, {"error": str(e)}, 500)


def handle_upload(handler):
    length = int(handler.headers.get("Content-Length", 0))
    file_data = handler.rfile.read(length)
    from urllib.parse import urlparse, parse_qs
    params = parse_qs(urlparse(handler.path).query)
    filename = sanitize_upload_filename((params.get("filename") or ["upload"])[0])
    template_id = (params.get("template_id") or [""])[0]
    if not is_valid_template_dir_name(template_id):
        json_response(handler, {"error": "非法模板目录名"}, 400)
        return

    cfg = get_cfg()
    input_root = get_input_root(cfg)
    if template_id:
        target_dir = input_root / template_id
    else:
        target_dir = input_root / "_inbox"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = resolve_unique_file_path(target_dir, filename).resolve()
    if not is_path_inside(target, input_root):
        json_response(handler, {"error": "上传目标路径越界"}, 400)
        return
    with open(target, "wb") as f:
        f.write(file_data)
    json_response(handler, {"path": str(target), "name": filename})


def handle_input_clear(handler):
    cfg = get_cfg()
    input_root = get_input_root(cfg)
    cleared = 0
    if input_root.exists():
        for entry in input_root.iterdir():
            if entry.name.startswith("."):
                continue
            if entry.is_dir():
                for f in entry.iterdir():
                    if f.is_file() and not f.name.startswith("."):
                        try:
                            f.unlink()
                            cleared += 1
                        except Exception:
                            pass
            elif entry.is_file():
                try:
                    entry.unlink()
                    cleared += 1
                except Exception:
                    pass
    json_response(handler, {"success": True, "cleared": cleared})


def handle_open_path(handler):
    body = read_body(handler)
    path = body.get("path", "")
    if not path:
        json_response(handler, {"error": "路径不能为空"}, 400)
        return
    try:
        cfg = get_cfg()
        requested = Path(path).expanduser().resolve()
        inbox = (get_input_root(cfg) / "_inbox").resolve()
        if requested == inbox:
            inbox.mkdir(parents=True, exist_ok=True)
        adapter.open_folder(path)
        json_response(handler, {"success": True})
    except Exception as e:
        json_response(handler, {"error": str(e)}, 500)


def handle_open_output_folder(handler):
    cfg = get_cfg()
    path = str(get_output_root(cfg))
    try:
        adapter.open_folder(path)
        json_response(handler, {"success": True})
    except Exception as e:
        json_response(handler, {"error": str(e)}, 500)


def handle_delete_output_file(handler):
    body = read_body(handler)
    path_text = body.get("path", "")
    if not path_text:
        json_response(handler, {"error": "缺少输出文件路径"}, 400)
        return

    cfg = get_cfg()
    output_root = get_output_root(cfg)
    try:
        target = Path(path_text).expanduser().resolve()
        output_root_resolved = output_root.resolve()
    except OSError as e:
        json_response(handler, {"error": f"输出文件路径无效: {e}"}, 400)
        return

    if not is_path_inside(target, output_root_resolved):
        json_response(handler, {"error": "输出文件路径不在 B_outputs 内"}, 403)
        return
    if target.suffix.lower() != ".indd":
        json_response(handler, {"error": "只允许删除 .indd 导出文件"}, 400)
        return

    try:
        rel_parts = target.relative_to(output_root_resolved).parts
    except ValueError:
        json_response(handler, {"error": "输出文件路径不在 B_outputs 内"}, 403)
        return
    if rel_parts and (rel_parts[0].startswith("_") or rel_parts[0] in {"logs", "queue"}):
        json_response(handler, {"error": "不允许删除系统输出目录内的文件"}, 403)
        return

    if not target.exists():
        json_response(handler, {
            "success": True,
            "deleted": False,
            "path": str(target),
            "message": "导出文件已不存在"
        })
        return
    if not target.is_file():
        json_response(handler, {"error": "目标不是文件"}, 400)
        return

    try:
        target.unlink()
    except Exception as e:
        json_response(handler, {"error": f"删除导出文件失败: {e}"}, 500)
        return

    json_response(handler, {
        "success": True,
        "deleted": True,
        "path": str(target),
        "message": "已删除导出文件"
    })


def handle_pipeline_start(handler):
    body = read_body(handler)
    rows = body.get("rows", [])
    if not rows:
        json_response(handler, {"error": "没有可处理文件"}, 400)
        return

    cfg = get_cfg()
    project_root = Path(cfg["project_root"])
    script_dir = project_root / "pipeline/python"

    ws_root = get_workspace_root(cfg)
    input_root = get_input_root(cfg)
    output_root = get_output_root(cfg)
    queue_root = get_queue_root(cfg)

    ensure_queue_dirs(queue_root)
    (output_root / "logs").mkdir(parents=True, exist_ok=True)
    (output_root / "_cache").mkdir(parents=True, exist_ok=True)
    (output_root / "_shared_images").mkdir(parents=True, exist_ok=True)

    active_count = count_files(queue_root / "pending") + count_files(queue_root / "running")
    if active_count > 0:
        json_response(handler, {"error": "当前有任务等待或执行中，请稍后再试"}, 400)
        return

    accepted = 0
    skipped = 0
    skipped_files = []
    generated_files = []
    accepted_files = []

    for row in rows:
        cache_path = row.get("cache_path", "")
        template_id = row.get("template_id", "")

        if not cache_path or not template_id:
            skipped += 1
            skipped_files.append(f"缺少 cache_path 或 template_id")
            continue

        cp = resolve_cache_file(cfg, cache_path)
        if cp is None:
            skipped += 1
            skipped_files.append(f"缓存路径不在允许目录内: {cache_path}")
            continue
        if not cp.exists():
            replacement = find_replacement_cache_file(cp)
            if replacement is None:
                skipped += 1
                skipped_files.append(f"缓存文件不存在: {cache_path}")
                continue
            cp = replacement

        resolved_cache_path = str(cp.resolve())
        generated_files.append(resolved_cache_path)
        accepted_files.append({
            "requested_cache_path": cache_path,
            "cache_path": resolved_cache_path,
            "template_id": template_id,
        })
        accepted += 1

    if accepted == 0:
        json_response(handler, {
            "accepted": 0, "skipped": skipped,
            "message": "没有可处理的缓存文件",
            "skipped_files": skipped_files
        })
        return

    ts = int(time.time())
    task_id = time.time_ns()
    try_open_indesign()

    task_id_text = f"dispatch_{task_id}"
    task_file = queue_root / "running" / f"{task_id_text}.json"
    task_file.write_text(
        json.dumps({
            "task_type": "dispatch_all",
            "task_id": task_id_text,
            "created_at": ts,
            "source": "agent-direct",
            "files": generated_files
        }, indent=2),
        encoding="utf-8"
    )

    # 直接触发 dispatch（非阻塞，兼容 watcher 未运行的情况）
    trigger_error = ""
    try:
        params_file = project_root / "pipeline" / "jsx" / "_pipeline_params.json"
        params_file.write_text(
            json.dumps({
                "pipeline_batch_mode": "1",
                "pipeline_task_file": str(task_file),
                "pipeline_direct_task": "1",
                "pipeline_task_id": task_id_text
            }, indent=2),
            encoding="utf-8"
        )
        dispatch_jsx = project_root / "pipeline" / "jsx" / "create_layout_dispatch.jsx"
        if not dispatch_jsx.exists():
            trigger_error = f"分发脚本不存在: {dispatch_jsx}"
        else:
            app_name = Path(cfg["indesign_app_path"]).stem if cfg.get("indesign_app_path") else "Adobe InDesign 2026"
            subprocess.Popen(
                ["osascript", "-e", f'set f to POSIX file "{dispatch_jsx}"',
                 "-e", f'tell application "{app_name}"',
                 "-e", "do script f language javascript",
                 "-e", "end tell"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
    except Exception as exc:
        trigger_error = str(exc)

    if trigger_error:
        try:
            task_data = json.loads(task_file.read_text(encoding="utf-8"))
        except Exception:
            task_data = {}
        task_data.update({
            "status": "error",
            "completed_at": int(time.time()),
            "ok": 0,
            "fail": len(generated_files),
            "results": [
                {"status": "fail", "cache_path": cache_path, "error": trigger_error[:200]}
                for cache_path in generated_files
            ],
        })
        task_file.write_text(json.dumps(task_data, ensure_ascii=False, indent=2), encoding="utf-8")
        error_file = queue_root / "error" / task_file.name
        if error_file.exists():
            error_file.unlink()
        shutil.move(str(task_file), str(error_file))
        json_response(handler, {"error": f"启动分发失败: {trigger_error}", "task_id": task_id_text, "task_path": str(error_file)}, 500)
        return

    json_response(handler, {
        "accepted": accepted, "skipped": skipped,
        "message": f"已投递任务: {task_file}",
        "task_id": task_id_text,
        "task_path": str(task_file),
        "accepted_files": accepted_files,
        "skipped_files": skipped_files
    })


def handle_pipeline_full(handler):
    cfg = get_cfg()
    project_root = Path(cfg["project_root"])

    queue_root = get_queue_root(cfg)
    ensure_queue_dirs(queue_root)
    (get_output_root(cfg) / "logs").mkdir(parents=True, exist_ok=True)
    (get_output_root(cfg) / "_cache").mkdir(parents=True, exist_ok=True)
    (get_output_root(cfg) / "_shared_images").mkdir(parents=True, exist_ok=True)
    active_count = count_files(queue_root / "pending") + count_files(queue_root / "running")
    if active_count > 0:
        json_response(handler, {"error": "当前有任务等待或执行中，请稍后再试"}, 400)
        return

    try_open_indesign()

    py_script = project_root / "pipeline/python/docx_list_to_json.py"
    if py_script.exists():
        result = subprocess.run(
            [sys.executable, str(py_script)],
            cwd=str(project_root),
            capture_output=True, text=True
        )
        if result.returncode != 0:
            parser_error = (result.stderr or result.stdout or "").strip()[:500]
            json_response(handler, {
                "success": False,
                "message": "文档解析失败，任务未入队",
                "parser_error": parser_error
            }, 500)
            return

    cache_files = sorted(str(p.resolve()) for p in (get_output_root(cfg) / "_cache").glob("*.json"))
    if not cache_files:
        json_response(handler, {"success": False, "message": "没有可处理的核心缓存文件"}, 400)
        return

    ts = int(time.time())
    task_id = time.time_ns()
    task_id_text = f"dispatch_{task_id}"
    task_file = queue_root / "pending" / f"{task_id_text}.json"
    task_file.write_text(
        json.dumps({
            "task_type": "dispatch_all",
            "task_id": task_id_text,
            "created_at": ts,
            "source": "agent-full",
            "files": cache_files
        }, indent=2),
        encoding="utf-8"
    )

    json_response(handler, {
        "success": True,
        "message": f"已启动完整流水线: {task_file}",
        "task_id": task_id_text,
        "task_path": str(task_file),
        "accepted": len(cache_files),
    })


def handle_parse_file(handler):
    body = read_body(handler)
    src_path = body.get("path", "")
    template_id = body.get("template_id", "")

    if not src_path or not template_id:
        json_response(handler, {"error": "缺少 path 或 template_id"}, 400)
        return

    cfg = get_cfg()
    src = resolve_workspace_file(cfg, src_path)
    if src is None:
        json_response(handler, {"error": "文件路径不在工作区内"}, 403)
        return
    if not src.exists():
        json_response(handler, {"error": f"文件不存在: {src_path}"}, 400)
        return
    project_root = Path(cfg["project_root"])
    output_root = get_output_root(cfg)
    (output_root / "_cache").mkdir(parents=True, exist_ok=True)
    (output_root / "_shared_images").mkdir(parents=True, exist_ok=True)
    get_source_root(cfg).mkdir(parents=True, exist_ok=True)

    ts = time.time_ns()
    mapping = [{"path": str(src.resolve()), "template_id": template_id}]
    mapping_file = output_root / "_cache" / f"parse_{ts}.json"
    mapping_file.write_text(json.dumps(mapping), encoding="utf-8")

    py_script = project_root / "pipeline/python/docx_list_to_json.py"
    result = subprocess.run(
        [sys.executable, str(py_script), str(mapping_file)],
        cwd=str(project_root), capture_output=True, text=True
    )

    try:
        mapping_file.unlink()
    except Exception:
        pass

    if result.returncode != 0:
        err = (result.stderr or result.stdout or "").strip()[:500]
        json_response(handler, {"error": f"解析失败: {err}"}, 500)
        return

    cache_path = None
    for line in result.stdout.strip().split("\n"):
        line = line.strip()
        if line.endswith(".json"):
            cache_path = line
            break

    if not cache_path:
        json_response(handler, {"error": "解析未生成缓存文件"}, 500)
        return

    source_path = archive_source_file_for_cache(cfg, src, cache_path)
    attach_source_path_to_cache(cache_path, source_path)

    json_response(handler, {"cache_path": cache_path, "source_path": source_path})


def handle_get_cache(handler):
    from urllib.parse import urlparse, parse_qs
    params = parse_qs(urlparse(handler.path).query)
    cache_path = (params.get("path") or [""])[0]
    if not cache_path:
        json_response(handler, {"error": "缺少 path"}, 400)
        return
    cfg = get_cfg()
    p = resolve_cache_file(cfg, cache_path)
    if p is None:
        json_response(handler, {"error": "缓存路径不在允许目录内"}, 403)
        return
    if not p.exists():
        replacement = find_replacement_cache_file(p)
        if replacement is None:
            json_response(handler, {"error": f"缓存文件不存在: {cache_path}"}, 404)
            return
        p = replacement
    try:
        elements = json.loads(p.read_text(encoding="utf-8"))
        source_path = ""
        if isinstance(elements, list):
            for item in elements:
                if isinstance(item, dict) and item.get("source_path"):
                    source_path = item.get("source_path")
                    break
        json_response(handler, {"elements": elements, "cache_path": str(p), "source_path": source_path})
    except Exception as e:
        json_response(handler, {"error": f"读取失败: {e}"}, 500)


def handle_get_page_breaks(handler):
    from urllib.parse import urlparse, parse_qs
    params = parse_qs(urlparse(handler.path).query)
    cache_path = (params.get("path") or [""])[0]
    if not cache_path:
        json_response(handler, {"error": "缺少 path"}, 400)
        return
    cfg = get_cfg()
    p = resolve_cache_file(cfg, cache_path)
    if p is None:
        json_response(handler, {"error": "缓存路径不在允许目录内"}, 403)
        return
    if not p.exists():
        replacement = find_replacement_cache_file(p)
        if replacement is None:
            json_response(handler, {"error": f"缓存文件不存在: {cache_path}"}, 404)
            return
        p = replacement
    breaks_file = get_page_breaks_file_for_cache(cfg, p)
    if not breaks_file.exists():
        json_response(handler, {
            "cache_path": str(p),
            "exists": False,
            "auto_break_indices": [],
            "message": "尚未记录自动分页，请先生成一次"
        })
        return
    try:
        data = json.loads(breaks_file.read_text(encoding="utf-8"))
        indexes = data.get("auto_break_indices", [])
        if not isinstance(indexes, list):
            indexes = []
        json_response(handler, {
            "cache_path": str(p),
            "exists": True,
            "page_breaks_path": str(breaks_file),
            "auto_break_indices": indexes,
            "records": data.get("records", []),
            "updated_at": data.get("updated_at", "")
        })
    except Exception as e:
        json_response(handler, {"error": f"读取自动分页失败: {e}"}, 500)


def handle_resolve_caches(handler):
    body = read_body(handler)
    paths = body.get("paths", [])
    if not isinstance(paths, list):
        json_response(handler, {"error": "paths 必须是数组"}, 400)
        return
    cfg = get_cfg()
    results = []
    for path_text in paths:
        cache_path = str(path_text or "")
        item = {"path": cache_path, "exists": False, "cache_path": ""}
        if not cache_path:
            item["error"] = "缺少 path"
            results.append(item)
            continue
        p = resolve_cache_file(cfg, cache_path)
        if p is None:
            item["error"] = "缓存路径不在允许目录内"
            results.append(item)
            continue
        if p.exists():
            item["exists"] = True
            item["cache_path"] = str(p)
            results.append(item)
            continue
        replacement = find_replacement_cache_file(p)
        if replacement is not None:
            item["exists"] = True
            item["cache_path"] = str(replacement)
        else:
            item["error"] = "缓存文件不存在"
        results.append(item)
    json_response(handler, {"items": results})


def handle_put_cache(handler):
    body = read_body(handler)
    cache_path = body.get("path", "")
    elements = body.get("elements")
    if not cache_path or elements is None:
        json_response(handler, {"error": "缺少 path 或 elements"}, 400)
        return
    cfg = get_cfg()
    p = resolve_cache_file(cfg, cache_path)
    if p is None:
        json_response(handler, {"error": "缓存路径不在允许目录内"}, 403)
        return
    if not p.exists():
        replacement = find_replacement_cache_file(p)
        if replacement is not None:
            p = replacement
    try:
        existing_elements = None
        if p.exists():
            try:
                existing_elements = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                existing_elements = None
        elements = normalize_cache_elements_for_save(elements, existing_elements)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(elements, ensure_ascii=False, indent=2), encoding="utf-8")
        json_response(handler, {"success": True, "cache_path": str(p)})
    except Exception as e:
        json_response(handler, {"error": f"保存失败: {e}"}, 500)


def handle_pipeline_recover(handler):
    cfg = get_cfg()
    queue_root = get_queue_root(cfg)
    running_dir = queue_root / "running"
    pending_dir = queue_root / "pending"

    running_dir.mkdir(parents=True, exist_ok=True)
    pending_dir.mkdir(parents=True, exist_ok=True)

    moved = 0
    skipped_active = 0
    for entry in running_dir.iterdir():
        if not entry.is_file() or entry.suffix != ".json":
            continue
        if not is_stale_queue_task(entry):
            skipped_active += 1
            continue
        target = pending_dir / entry.name
        if target.exists():
            stem = entry.stem
            target = pending_dir / f"{stem}_{int(time.time())}.json"
        try:
            entry.rename(target)
            moved += 1
        except OSError:
            shutil.copy2(str(entry), str(target))
            entry.unlink()
            moved += 1

    json_response(handler, {
        "success": True,
        "message": f"已恢复 {moved} 个卡住任务到 pending",
        "recovered": moved,
        "skipped_active": skipped_active,
    })


def handle_watcher_status(handler):
    installed = check_watcher_installed()
    alive = check_watcher_alive()
    json_response(handler, {
        "installed": installed["installed"],
        "path": installed["path"],
        "alive": alive["alive"],
        "last_heartbeat": alive["last_heartbeat"]
    })


def handle_watcher_install(handler):
    result = install_watcher()
    json_response(handler, result)


def handle_watcher_uninstall(handler):
    result = uninstall_watcher()
    json_response(handler, result)


def handle_watcher_open_folder(handler):
    from .indesign import _get_startup_dir as get_startup
    startup_dir = get_startup()
    if not startup_dir:
        json_response(handler, {"error": "未找到 Startup Scripts 目录"}, 400)
        return
    try:
        adapter.open_folder(startup_dir)
        json_response(handler, {"success": True, "path": startup_dir})
    except Exception as e:
        json_response(handler, {"error": str(e)}, 500)


def handle_log_clear(handler):
    body = read_body(handler)
    kind = body.get("kind", "")
    valid = {"dispatch", "watcher", "pipeline", "dispatch_debug"}
    if kind not in valid:
        json_response(handler, {"error": f"不支持的日志类型: {kind}"}, 400)
        return

    cfg = get_cfg()
    log_file = get_output_root(cfg) / "logs" / f"{kind}.log"
    log_file.parent.mkdir(parents=True, exist_ok=True)
    try:
        if log_file.exists():
            log_file.unlink()
        log_file.touch()
    except Exception as e:
        json_response(handler, {"error": f"删除日志文件失败: {e}"}, 500)
        return
    json_response(handler, {"success": True, "message": f"已清空 {kind}.log"})


def handle_disk_space(handler):
    cfg = get_cfg()
    try:
        available = adapter.get_disk_space(cfg["project_root"])
        available_mb = available // (1024 * 1024)
        warning = available < 500 * 1024 * 1024
        json_response(handler, {
            "available_mb": available_mb,
            "warning": warning
        })
    except Exception as e:
        json_response(handler, {"error": str(e), "available_mb": 0, "warning": True})


def handle_cleanup(handler):
    cfg = get_cfg()
    output_root = get_output_root(cfg)
    queue_root = get_queue_root(cfg)
    issues = []

    # recover stuck tasks
    recovered = 0
    running_dir = queue_root / "running"
    pending_dir = queue_root / "pending"
    if running_dir.exists():
        for entry in running_dir.iterdir():
            if entry.suffix == ".json":
                if not is_stale_queue_task(entry):
                    continue
                target = pending_dir / entry.name
                if target.exists():
                    target = pending_dir / f"{entry.stem}_{int(time.time())}.json"
                try:
                    entry.rename(target)
                    recovered += 1
                except OSError:
                    shutil.copy2(str(entry), str(target))
                    entry.unlink()
                    recovered += 1
    if recovered > 0:
        issues.append(f"已恢复 {recovered} 个卡住任务")

    # clean stale errors (>24h)
    stale_errors_cleaned = 0
    error_dir = queue_root / "error"
    if error_dir.exists():
        now = time.time()
        for entry in error_dir.iterdir():
            if entry.suffix == ".json":
                mtime = entry.stat().st_mtime
                if now - mtime > 86400:
                    entry.unlink()
                    stale_errors_cleaned += 1
    if stale_errors_cleaned > 0:
        issues.append(f"已清理 {stale_errors_cleaned} 个超过24小时的错误任务")

    # clean stale progress
    progress_cleaned = False
    progress_file = queue_root / "progress.json"
    if progress_file.exists():
        running = count_files(running_dir) if running_dir.exists() else 0
        if running == 0:
            progress_file.unlink()
            progress_cleaned = True
            issues.append("已清理残留进度文件")

    watcher_installed_info = check_watcher_installed()
    watcher_alive_info = check_watcher_alive()
    watcher_installed = watcher_installed_info["installed"]
    watcher_alive = watcher_alive_info["alive"]

    if not watcher_installed:
        issues.append("Watcher 未安装")
    elif not watcher_alive:
        issues.append("Watcher 未响应（心跳超时）")

    json_response(handler, {
        "recovered": recovered,
        "stale_errors_cleaned": stale_errors_cleaned,
        "progress_cleaned": progress_cleaned,
        "watcher_installed": watcher_installed,
        "watcher_alive": watcher_alive,
        "issues": issues
    })


def handle_clear_cache(handler):
    """清理非核心缓存；保留编辑核心 _cache JSON 和 _shared_images 图片资源。"""
    cfg = get_cfg()
    output_root = get_output_root(cfg)
    queue_root = get_queue_root(cfg)
    if count_files(queue_root / "pending") + count_files(queue_root / "running") > 0:
        json_response(handler, {"error": "当前有任务等待或执行中，请稍后再清理"}, 400)
        return
    cleared = 0
    cleared_dirs = []
    preserved_dirs = []

    if not output_root.exists():
        json_response(handler, {
            "success": True,
            "cleared": 0,
            "cleared_dirs": [],
            "message": "输出目录不存在，无需清理"
        })
        return

    for entry in output_root.iterdir():
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        if entry.name in ("_cache", "_shared_images", "_sources", "_page_breaks"):
            preserved_dirs.append(entry.name)
            continue
        if entry.name == "logs":
            cleared_dirs.append(entry.name)
            for f in entry.iterdir():
                if f.is_file() and f.name.endswith(".log"):
                    try:
                        f.unlink()
                        cleared += 1
                    except Exception:
                        pass
            continue
        if entry.name == "queue":
            for sub in entry.iterdir():
                if sub.is_dir() and sub.name in ("done", "error"):
                    cleared_dirs.append(f"queue/{sub.name}")
                    for f in sub.rglob("*"):
                        if f.is_file():
                            try:
                                f.unlink()
                                cleared += 1
                            except Exception:
                                pass
            progress_file = entry / "progress.json"
            if progress_file.exists():
                try:
                    progress_file.unlink()
                    cleared += 1
                except Exception:
                    pass
            continue
        cleared_dirs.append(entry.name)
        for f in entry.rglob("*"):
            if any(part in ("_golden", "_snapshots") for part in f.parts):
                continue
            if f.is_file():
                try:
                    f.unlink()
                    cleared += 1
                except Exception:
                    pass
        for d in sorted(entry.rglob("*"), key=lambda x: len(str(x)), reverse=True):
            if any(part in ("_golden", "_snapshots") for part in d.parts):
                preserved_dirs.append(str(d.relative_to(output_root)))
                continue
            if d.is_dir() and d.name != entry.name:
                try:
                    d.rmdir()
                except Exception:
                    pass

    shared_gc = cleanup_unreferenced_shared_images(cfg)
    if shared_gc["cleared"] > 0:
        cleared += shared_gc["cleared"]
        cleared_dirs.append("_shared_images/未引用图片")

    json_response(handler, {
        "success": True,
        "cleared": cleared,
        "cleared_dirs": cleared_dirs,
        "preserved_dirs": sorted(set(preserved_dirs)),
        "shared_images_gc": shared_gc,
        "message": f"已清理 {cleared} 个非核心/未引用文件；已保留 _cache、_sources、_page_breaks、被引用图片资源和快照/金标目录"
    })


def handle_stop(handler):
    json_response(handler, {"success": True, "message": "服务即将关闭"})
    if _shutdown_callback:
        threading.Thread(target=_shutdown_callback, daemon=True).start()


def handle_get_templates(handler):
    cfg = get_cfg()
    templates = cfg.get("templates", {})
    templates_dir = get_workspace_root(cfg) / "A_templates"
    
    result = []
    if templates:
        for template_id, template_cfg in templates.items():
            template_dir = templates_dir / template_id
            has_indd = bool(template_dir.exists() and any(template_dir.glob("*.indd")))
            result.append({
                "id": template_id,
                "label": template_cfg.get("label", template_id),
                "config": template_cfg,
                "has_indd": has_indd
            })
    elif templates_dir.exists():
        for entry in sorted(templates_dir.iterdir()):
            if not entry.is_dir() or entry.name.startswith("."):
                continue
            config_file = entry / "config.json"
            config_data = {}
            if config_file.exists():
                try:
                    config_data = json.loads(config_file.read_text(encoding="utf-8"))
                except Exception:
                    pass
            has_indd = any(entry.glob("*.indd"))
            result.append({
                "id": entry.name,
                "label": config_data.get("label", entry.name),
                "config": config_data,
                "has_indd": has_indd
            })
    json_response(handler, result)


def handle_get_template_config(handler, template_id):
    cfg = get_cfg()
    templates = cfg.get("templates", {})
    template_cfg = templates.get(template_id)
    if template_cfg is None:
        config_file = get_workspace_root(cfg) / "A_templates" / template_id / "config.json"
        if config_file.exists():
            try:
                template_cfg = json.loads(config_file.read_text(encoding="utf-8"))
            except Exception:
                pass
    if template_cfg is None:
        json_response(handler, {"error": "模板配置不存在"}, 404)
        return
    json_response(handler, template_cfg)


def handle_put_template_config(handler, template_id):
    body = read_body(handler)
    cfg = get_cfg()
    if "templates" not in cfg:
        cfg["templates"] = {}
    cfg["templates"][template_id] = body
    write_config(cfg)
    config_file = get_workspace_root(cfg) / "A_templates" / template_id / "config.json"
    if config_file.exists():
        try:
            config_file.write_text(json.dumps(body, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception:
            pass
    json_response(handler, {"success": True})


def handle_open_template_folder(handler, template_id):
    cfg = get_cfg()
    folder = get_workspace_root(cfg) / "A_templates" / template_id
    if not folder.exists():
        json_response(handler, {"error": "模板目录不存在"}, 404)
        return
    try:
        adapter.open_folder(str(folder))
        json_response(handler, {"success": True})
    except Exception as e:
        json_response(handler, {"error": str(e)}, 500)


def handle_snapshot_export(handler):
    cfg = get_cfg()
    project_root = Path(cfg["project_root"])
    script = project_root / "pipeline/jsx/export_page_snapshot.jsx"
    if not script.exists():
        json_response(handler, {"success": False, "message": "快照脚本不存在", "details": ""}, 400)
        return

    # write params
    params = {"pipeline_snapshot_indd": "", "pipeline_project_root": cfg["project_root"]}
    params_file = project_root / "pipeline/jsx/_pipeline_params.json"
    params_file.write_text(json.dumps(params, indent=2), encoding="utf-8")

    try:
        result = execute_jsx(str(script))
        json_response(handler, {"success": True, "message": "快照导出完成", "details": result})
    except Exception as e:
        json_response(handler, {"success": False, "message": "快照导出失败", "details": str(e)}, 500)
    finally:
        if params_file.exists():
            params_file.unlink()


def handle_snapshot_compare(handler):
    cfg = get_cfg()
    project_root = Path(cfg["project_root"])
    script = project_root / "pipeline/python/compare_snapshot.py"
    output_root = get_output_root(cfg)

    if not script.exists():
        json_response(handler, {"success": False, "message": "对比脚本不存在", "details": ""}, 400)
        return

    try:
        result = subprocess.run(
            [sys.executable, str(script), "--workspace", str(output_root),
             "--golden-root", str(output_root), "--tolerance", "0.01", "--threshold", "10"],
            capture_output=True, text=True, cwd=str(project_root)
        )
        details = (result.stdout.strip() or result.stderr.strip())
        success = result.returncode == 0
        json_response(handler, {
            "success": success,
            "message": "对比通过" if success else "存在差异",
            "details": details
        })
    except Exception as e:
        json_response(handler, {"success": False, "message": "对比失败", "details": str(e)}, 500)


def handle_snapshot_promote(handler):
    cfg = get_cfg()
    project_root = Path(cfg["project_root"])
    script = project_root / "pipeline/python/compare_snapshot.py"
    output_root = get_output_root(cfg)

    if not script.exists():
        json_response(handler, {"success": False, "message": "对比脚本不存在", "details": ""}, 400)
        return

    try:
        result = subprocess.run(
            [sys.executable, str(script), "--promote", "--workspace", str(output_root)],
            capture_output=True, text=True, cwd=str(project_root)
        )
        details = (result.stdout.strip() or result.stderr.strip())
        success = result.returncode == 0
        json_response(handler, {
            "success": success,
            "message": "金标已更新" if success else "金标更新失败",
            "details": details
        })
    except Exception as e:
        json_response(handler, {"success": False, "message": "金标更新失败", "details": str(e)}, 500)


def handle_snapshot_dirs(handler):
    cfg = get_cfg()
    output_root = get_output_root(cfg)
    if not output_root.exists():
        json_response(handler, [])
        return

    dirs = []
    for section in output_root.iterdir():
        if not section.is_dir() or section.name in ("logs", "queue"):
            continue
        for doc in section.iterdir():
            if not doc.is_dir():
                continue
            golden = doc / "_golden"
            snap = doc / "_snapshots"
            has_golden = golden.exists()
            has_snap = snap.exists()
            if has_golden or has_snap:
                status = ""
                if has_golden and has_snap:
                    status = "✓ 金标 / 快照"
                elif has_golden:
                    status = "✓ 金标"
                elif has_snap:
                    status = "快照"
                dirs.append(f"{section.name}/{doc.name}  [{status}]")
    json_response(handler, dirs)


def handle_validate_files(handler):
    body = read_body(handler)
    paths = body.get("paths", [])
    result = []
    for p in paths:
        path = Path(p)
        result.append({
            "path": p,
            "exists": path.exists() and path.is_file()
        })
    json_response(handler, result)


def handle_get_inputs(handler):
    cfg = get_cfg()
    input_root = get_input_root(cfg)
    files = []
    inbox = input_root / "_inbox"
    if inbox.exists():
        for f in sorted(inbox.iterdir()):
            if f.is_file() and not f.name.startswith("."):
                ext = f.suffix.lower().lstrip(".")
                if ext in ("docx", "png", "jpg", "jpeg"):
                    files.append({
                        "path": str(f.resolve()),
                        "name": f.name,
                        "template_id": "_inbox",
                        "ext": ext
                    })
    json_response(handler, files)


def handle_cache_stats(handler):
    cfg = get_cfg()
    output_root = get_output_root(cfg)
    stats = []
    total_size = 0

    if not output_root.exists():
        json_response(handler, {"dirs": [], "total_size_bytes": 0})
        return

    def is_valid_file(f):
        return f.is_file() and f.name != ".DS_Store" and f.name != ".watcher_heartbeat"

    def collect_preserved(dir_path):
        preserved = []
        for f in sorted(dir_path.rglob("*")):
            if is_valid_file(f):
                preserved.append(str(f.relative_to(dir_path)))
        return preserved

    for entry in sorted(output_root.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        file_count = 0
        dir_size = 0
        preserved = []
        for f in entry.rglob("*"):
            if is_valid_file(f):
                file_count += 1
                dir_size += f.stat().st_size

        if entry.name == "logs":
            preserved = collect_preserved(entry)
        elif entry.name == "queue":
            preserved = collect_preserved(entry)
            preserved = [p for p in preserved
                         if not p.startswith("done/") and not p.startswith("error/")
                         and p != ".watcher_heartbeat"]

        if file_count > 0 or entry.name in ("_cache", "_shared_images", "_page_breaks"):
            stats.append({
                "name": entry.name,
                "files": file_count,
                "size_bytes": dir_size,
                "preserved": preserved
            })
            total_size += dir_size

    json_response(handler, {"dirs": stats, "total_size_bytes": total_size})


ROUTES = {
    "GET:/api/health": handle_health,
    "GET:/api/config": handle_get_config,
    "POST:/api/config": handle_post_config,
    "POST:/api/config/auto-detect": handle_auto_detect,
    "GET:/api/dashboard": handle_get_dashboard,
    "GET:/api/queue/stats": handle_queue_stats,
    "GET:/api/state": handle_get_state,
    "POST:/api/state": handle_post_state,
    "GET:/api/pick-files": handle_pick_files,
    "POST:/api/upload": handle_upload,
    "POST:/api/input/clear": handle_input_clear,
    "POST:/api/open-path": handle_open_path,
    "POST:/api/open-output-folder": handle_open_output_folder,
    "POST:/api/output/delete": handle_delete_output_file,
    "POST:/api/parse": handle_parse_file,
    "GET:/api/image": handle_image,
    "GET:/api/cache": handle_get_cache,
    "GET:/api/page-breaks": handle_get_page_breaks,
    "POST:/api/cache/resolve": handle_resolve_caches,
    "PUT:/api/cache": handle_put_cache,
    "POST:/api/pipeline/start": handle_pipeline_start,
    "POST:/api/pipeline/full": handle_pipeline_full,
    "POST:/api/pipeline/recover": handle_pipeline_recover,
    "GET:/api/watcher/status": handle_watcher_status,
    "POST:/api/watcher/install": handle_watcher_install,
    "POST:/api/watcher/uninstall": handle_watcher_uninstall,
    "POST:/api/watcher/open-folder": handle_watcher_open_folder,
    "POST:/api/log/clear": handle_log_clear,
    "GET:/api/disk-space": handle_disk_space,
    "POST:/api/cleanup": handle_cleanup,
    "POST:/api/cache/clear": handle_clear_cache,
    "POST:/api/stop": handle_stop,
    "GET:/api/cache-stats": handle_cache_stats,
    "POST:/api/validate-files": handle_validate_files,
    "GET:/api/inputs": handle_get_inputs,
    "GET:/api/templates": handle_get_templates,
    "POST:/api/snapshot/export": handle_snapshot_export,
    "POST:/api/snapshot/compare": handle_snapshot_compare,
    "POST:/api/snapshot/promote": handle_snapshot_promote,
    "GET:/api/snapshot/dirs": handle_snapshot_dirs,
}


def dispatch(handler):
    path, query = parse_path(handler)
    method = handler.command

    # template-specific routes
    if method == "GET" and path.startswith("/api/templates/") and path.endswith("/config"):
        parts = path.split("/")
        if len(parts) == 5:
            handle_get_template_config(handler, unquote_plus(parts[3]))
            return True
    elif method == "PUT" and path.startswith("/api/templates/") and path.endswith("/config"):
        parts = path.split("/")
        if len(parts) == 5:
            handle_put_template_config(handler, unquote_plus(parts[3]))
            return True
    elif method == "POST" and path.startswith("/api/templates/") and path.endswith("/open-folder"):
        parts = path.split("/")
        if len(parts) == 5:
            handle_open_template_folder(handler, unquote_plus(parts[3]))
            return True

    key = f"{method}:{path}"
    handler_func = ROUTES.get(key)
    if handler_func:
        handler_func(handler)
        return True
    return False
