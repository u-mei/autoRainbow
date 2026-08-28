import os, sys, json, time, shutil, subprocess, re, threading, unicodedata
from pathlib import Path
from urllib.parse import urlparse, unquote_plus
from http.server import BaseHTTPRequestHandler

from .config import read_config, write_config, auto_detect_indesign, get_config_path, get_paths_path, get_template_config, set_template_config, short_timestamp, resolve_dir
from .indesign import (
    try_open_indesign, execute_jsx,
    install_watcher, uninstall_watcher,
    check_watcher_installed, check_watcher_alive,
    _get_startup_dir
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


def is_trusted_request(handler):
    """CSRF 防护：校验 Origin/Referer。浏览器跨站请求必带其中之一，
    非白名单来源直接拒绝；无来源头的本地工具调用（curl、本机脚本）放行。"""
    origin = handler.headers.get("Origin", "")
    referer = handler.headers.get("Referer", "")
    if origin:
        return origin in ALLOWED_ORIGINS
    if referer:
        ref_origin = urlparse(referer).scheme + "://" + (urlparse(referer).netloc or "")
        return ref_origin in ALLOWED_ORIGINS
    return True


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
    cache_root = get_caches_root(cfg)
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
    cache_root = get_caches_root(cfg)
    shared_root = get_images_root(cfg)
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
    cache_root = get_caches_root(cfg)
    shared_root = get_images_root(cfg)
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


MAX_BODY_BYTES = 200 * 1024 * 1024


def read_body(handler):
    length = int(handler.headers.get("Content-Length", 0))
    if length == 0:
        return {}
    if length > MAX_BODY_BYTES:
        raise ValueError(f"请求体过大，超过 {MAX_BODY_BYTES} 字节限制")
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
    return resolve_dir(cfg, "workspace_dir", "workspace")


def get_output_root(cfg):
    return resolve_dir(cfg, "outputs_dir", "workspace/outputs")


def get_work_root(cfg):
    return resolve_dir(cfg, "work_dir", "workspace/outputs/work")


def get_done_root(cfg):
    return resolve_dir(cfg, "done_dir", "workspace/outputs/done")


def get_templates_root(cfg):
    return resolve_dir(cfg, "templates_dir", "workspace/templates")


def get_runtime_root(cfg):
    return resolve_dir(cfg, "runtime_dir", "workspace/.runtime")


def get_logs_root(cfg):
    return resolve_dir(cfg, "logs_dir", "workspace/.runtime/logs")


def get_caches_root(cfg):
    return get_work_root(cfg) / "caches"


def get_images_root(cfg):
    return get_work_root(cfg) / "images"


def get_snapshots_root(cfg):
    return get_work_root(cfg) / "snapshots"


def get_input_root(cfg):
    return resolve_dir(cfg, "inputs_dir", "workspace/inputs")


def get_queue_root(cfg):
    return resolve_dir(cfg, "queue_dir", "workspace/.runtime/queue")


def get_page_breaks_root(cfg):
    return get_work_root(cfg) / "page-breaks"


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
    """记录源文件路径，不移动/不拷贝（2026-08-07 回归用户确认：解析只记录路径）。

    源文件保留在原位置（inputs/ 等），缓存元素通过 src/source_path 引用。
    """
    src = Path(src_path).resolve()
    if not src.exists() or not src.is_file():
        return ""
    return str(src)


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


def handle_image_check(handler):
    """GET /api/image/check?path=... 严格校验图片文件是否完整可解码。

    浏览器对截断 JPEG 有容错（能显示部分），但 InDesign place() 会报
    "Unable to read JPEG"。此端点用 PIL 严格模式（LOAD_TRUNCATED_IMAGES=False）
    完整解码验证，损坏/截断图片返回 valid=false，编辑器据此提醒用户。

    注意：不要使用 "error" 字段名——前端 fetchJsonChecked 会把任何带
    "error" 字段的 200 响应当失败抛异常，导致检测结果被吞。损坏信息放
    "detail" 字段。

    返回: {"valid": bool, "detail": str, "path": str}
    """
    from urllib.parse import urlparse, parse_qs
    params = parse_qs(urlparse(handler.path).query)
    path = (params.get("path") or [""])[0]
    if not path:
        json_response(handler, {"error": "缺少 path"}, 400)
        return
    cfg = get_cfg()
    p = resolve_workspace_file(cfg, path)
    if p is None:
        json_response(handler, {"valid": False, "detail": "路径不在工作区内", "path": path})
        return
    if not p.exists() or not p.is_file():
        json_response(handler, {"valid": False, "detail": "文件不存在", "path": path})
        return
    ext = p.suffix.lower().lstrip(".")
    if ext not in ("jpg", "jpeg", "png"):
        json_response(handler, {"valid": False, "detail": "仅支持图片文件", "path": path})
        return
    try:
        from PIL import Image, ImageFile
        ImageFile.LOAD_TRUNCATED_IMAGES = False  # 严格模式：截断图必须报错
        with Image.open(str(p)) as img:
            img.load()  # 完整解码验证
        # 修复后自动解除该图的事件（换图/修复后重新 check 通过 → 事件置已处理）
        resolve_events_for_file(cfg, path=str(p.resolve()))
        json_response(handler, {"valid": True, "detail": "", "path": path})
    except Exception as exc:
        msg = str(exc) or exc.__class__.__name__
        add_event(cfg, "broken_image", "error", detail=msg, file=p.name,
                  path=str(p.resolve()), cache_path="")
        json_response(handler, {"valid": False, "detail": msg, "path": path})


DEFAULT_CHARS_PER_LINE = {"1": 26, "2": 13, "3": 8}


def _find_text_point_size(obj):
    """在 style_profile 对象里找正文文本框的字号（point_size）。

    优先取 proto_text / body_text 对应的槽；找不到再递归第一个
    text_frame（避免先取到大标题 60pt 导致兜底字数偏小）。
    """
    if isinstance(obj, list):
        for value in obj:
            pt = _find_text_point_size(value)
            if pt:
                return pt
        return 0.0
    if not isinstance(obj, dict):
        return 0.0
    for key in ("proto_text", "body_text"):
        if key in obj:
            pt = _find_text_point_size(obj[key])
            if pt:
                return pt
    if obj.get("kind") == "text_frame":
        text = obj.get("text") or {}
        try:
            return float(text.get("point_size") or 0)
        except (TypeError, ValueError):
            return 0.0
    for value in obj.values():
        pt = _find_text_point_size(value)
        if pt:
            return pt
    return 0.0


def resolve_chars_per_line(cfg, template_id):
    """2026-08-16：模板级"每行字数"配置（前端显示用，非 InDesign 排版配置）。

    设计文档：private/docs/features/一行多文本块设计方案.md §4.1。
    兜底链：模板配置 chars_per_line → style_profile 宽度模型推导
    （floor(框宽/字号)，如 7_周边 936/36=26）→ 全局默认 26/13/8。
    """
    templates = cfg.get("templates") or {}
    tcfg = templates.get(template_id)
    if isinstance(tcfg, dict):
        cpl = tcfg.get("chars_per_line")
        if isinstance(cpl, dict) and any(cpl.get(str(k)) for k in (1, 2, 3)):
            return {
                "1": max(int(cpl.get("1") or 0) or 26, 1),
                "2": max(int(cpl.get("2") or 0) or 13, 1),
                "3": max(int(cpl.get("3") or 0) or 8, 1),
            }
        profile = tcfg.get("style_profile")
        if isinstance(profile, dict):
            lp = profile.get("layout_params") or {}
            width = lp.get("body_text_width")
            try:
                width_f = float(width)
                pt = _find_text_point_size(profile.get("objects"))
                if width_f > 0 and pt > 0:
                    z1 = max(int(width_f / pt), 1)
                    return {
                        "1": z1,
                        "2": max(int(z1 / 2), 1),
                        "3": max(int(z1 / 3), 1),
                    }
            except (TypeError, ValueError):
                pass
    return dict(DEFAULT_CHARS_PER_LINE)


def _templates_with_chars_per_line(cfg):
    templates = cfg.get("templates") or {}
    out = {}
    for tid, tcfg in templates.items():
        merged = dict(tcfg) if isinstance(tcfg, dict) else {"layout_mode": ""}
        merged["chars_per_line"] = resolve_chars_per_line(cfg, tid)
        out[tid] = merged
    return out


def handle_get_config(handler):
    cfg = get_cfg()
    config_path = get_config_path()
    json_response(handler, {
        "project_root": cfg["project_root"],
        "indesign_app_path": cfg["indesign_app_path"],
        "polling_interval": cfg["polling_interval"],
        "watcher_heartbeat_interval": cfg.get("watcher_heartbeat_interval", 3),
        "watcher_alive_timeout": cfg.get("watcher_alive_timeout", 10),
        "page_bottom_trim_px": cfg.get("page_bottom_trim_px", 60),
        "templates": _templates_with_chars_per_line(cfg),
        "config_path": str(config_path),
        "config_exists": config_path.exists(),
        "paths_path": str(get_paths_path()),
        "paths_exists": get_paths_path().exists(),
        "dirs": cfg.get("dirs", {}),
    })


def handle_post_config(handler):
    body = read_body(handler)
    allowed_keys = {"project_root", "indesign_app_path", "polling_interval",
                    "watcher_heartbeat_interval", "watcher_alive_timeout",
                    "page_bottom_trim_px"}

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

    # 事件队列：新任务的失败结果 → 排版失败事件（add_event 按 task_id + 文件去重，
    # dashboard 轮询重复读取不会重复入队）
    if last_fail > 0 and file_results:
        for item in file_results:
            if item.get("status") in ("fail", "failed", "error"):
                try:
                    cp = item.get("cache_path", "")
                    add_event(cfg, "layout_fail", "error",
                              detail=str(item.get("error", "排版失败")),
                              file=Path(cp).name if cp else "",
                              path=cp, cache_path=cp, task_id=last_task_id)
                except Exception:
                    pass

    watcher_status = check_watcher_alive()

    # 最近自动恢复的卡死任务（近 5 分钟的事件，前端据此提示）
    recovered_recent = None
    rr_file = queue_root / "recovered_recent.json"
    if rr_file.exists():
        try:
            ev = json.loads(rr_file.read_text(encoding="utf-8"))
            if int(time.time()) - int(ev.get("at", 0)) < 300:
                recovered_recent = ev
        except Exception:
            pass

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
        "recovered_recent": recovered_recent,
        "progress": progress
    })


# ========== 待处理事件队列（待办 1b，2026-08-22 实施） ==========
# 统一事件队列：解析失败 / 排版失败 / 坏图 / 卡死恢复 / 缺字（预留）。
# 存储：queue/events.json。事件可按文件定位（cachePath/path），前端点击跳转。
EVENT_SEVERITY = {"error", "warning", "info"}


def _events_file(cfg):
    return get_queue_root(cfg) / "events.json"


def _load_events(cfg):
    """返回 (events, meta)。events 按 updatedAt 倒序。"""
    f = _events_file(cfg)
    if f.exists():
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            events = data.get("events", [])
            events.sort(key=lambda e: e.get("updatedAt", 0), reverse=True)
            return events, data.get("meta", {})
        except Exception:
            pass
    return [], {}


def _save_events(cfg, events, meta):
    f = _events_file(cfg)
    f.write_text(json.dumps({"meta": meta, "events": events}, ensure_ascii=False, indent=2), encoding="utf-8")


def add_event(cfg, etype, severity, detail="", file="", path="", cache_path="", task_id=None, max_events=200):
    """写入/合并事件。

    去重键 = type + (cache_path or path)：同文件同类型再次发生 → 合并（count+1、
    updatedAt/detail 更新、status 回到 pending）。带 task_id 时，同一文件同一任务
    只入队一次（防 dashboard 轮询重复写）。"""
    if etype not in ("parse_fail", "layout_fail", "broken_image", "stuck_recovery", "missing_glyph"):
        return
    events, meta = _load_events(cfg)
    key = cache_path or path
    now = int(time.time())
    for e in events:
        same_file = (e.get("cachePath") or e.get("path")) == key
        if e.get("type") == etype and same_file:
            if task_id and e.get("taskId") == task_id:
                return  # 同一任务同一文件已入队（轮询重复调用跳过）
            e["count"] = e.get("count", 1) + 1
            e["updatedAt"] = now
            e["detail"] = detail
            e["status"] = "pending"
            if task_id:
                e["taskId"] = task_id
            _save_events(cfg, events, meta)
            return
    events.append({
        "id": f"evt_{now}_{len(events)}",
        "type": etype,
        "severity": severity if severity in EVENT_SEVERITY else "error",
        "file": file,
        "path": path,
        "cachePath": cache_path,
        "detail": detail,
        "createdAt": now,
        "updatedAt": now,
        "count": 1,
        "status": "pending",
    })
    if task_id:
        events[-1]["taskId"] = task_id
    events.sort(key=lambda e: e.get("updatedAt", 0), reverse=True)
    if len(events) > max_events:
        events = events[:max_events]
    _save_events(cfg, events, meta)


def resolve_event(cfg, event_id, status):
    """更新事件状态（pending/resolved/ignored）。返回是否变更。"""
    if status not in ("pending", "resolved", "ignored"):
        return False
    events, meta = _load_events(cfg)
    changed = False
    for e in events:
        if e.get("id") == event_id and e.get("status") != status:
            e["status"] = status
            changed = True
    if changed:
        _save_events(cfg, events, meta)
    return changed


def resolve_events_for_file(cfg, cache_path="", path=""):
    """按文件解除全部事件（如坏图修复后）。"""
    key = cache_path or path
    if not key:
        return
    events, meta = _load_events(cfg)
    changed = False
    for e in events:
        if (e.get("cachePath") or e.get("path")) == key and e.get("status") != "resolved":
            e["status"] = "resolved"
            changed = True
    if changed:
        _save_events(cfg, events, meta)


def handle_get_events(handler):
    """GET /api/events → {"events": [...]}（updatedAt 倒序）"""
    cfg = get_cfg()
    events, _ = _load_events(cfg)
    json_response(handler, {"events": events})


def handle_update_event(handler):
    """POST /api/events/update body {id, status} → 更新事件状态"""
    body = read_body(handler)
    event_id = body.get("id", "")
    status = body.get("status", "")
    if not event_id or status not in ("pending", "resolved", "ignored"):
        json_response(handler, {"error": "参数无效"}, 400)
        return
    cfg = get_cfg()
    resolve_event(cfg, event_id, status)
    json_response(handler, {"success": True})


def handle_remove_event(handler):
    """POST /api/events/remove body {id} → 删除单条事件（问题场景已过时/断开时彻底移除）"""
    body = read_body(handler)
    event_id = body.get("id", "")
    if not event_id:
        json_response(handler, {"error": "参数无效"}, 400)
        return
    cfg = get_cfg()
    events, meta = _load_events(cfg)
    before = len(events)
    events = [e for e in events if e.get("id") != event_id]
    if len(events) != before:
        _save_events(cfg, events, meta)
    json_response(handler, {"success": True})


def handle_remove_events_by_file(handler):
    """POST /api/events/remove-by-file body {paths: [...]} → 删除所有关联这些路径的事件
    （文件从队列/磁盘移除时联动清理，避免过期事件残留）。path/cachePath 精确匹配。"""
    body = read_body(handler)
    paths = body.get("paths") or []
    if not isinstance(paths, list) or not paths:
        json_response(handler, {"error": "参数无效"}, 400)
        return
    path_set = {str(p) for p in paths if p}
    cfg = get_cfg()
    events, meta = _load_events(cfg)
    before = len(events)
    events = [e for e in events if (e.get("cachePath") or "") not in path_set and (e.get("path") or "") not in path_set]
    removed = before - len(events)
    if removed > 0:
        _save_events(cfg, events, meta)
    json_response(handler, {"success": True, "removed": removed})


def recover_stale_running_tasks(cfg, stale_seconds=120):
    """把长时间无动静（卡死）的 running 任务移回 pending，供 watcher 处理。

    卡死来源：agent-direct 触发后 dispatch 未真正执行（InDesign 闪退/模态挂起）、
    dispatch 中途崩溃等。dispatch 执行时会持续写进度更新任务 mtime，
    因此 mtime 静止超过 stale_seconds 即可判定卡死。
    恢复后写入 recovered_recent.json，前端据此提示。"""
    queue_root = get_queue_root(cfg)
    running_dir = queue_root / "running"
    if not running_dir.exists():
        return 0
    recovered = 0
    moved = []
    for entry in running_dir.iterdir():
        if entry.is_file() and entry.suffix == ".json" and is_stale_queue_task(entry, stale_seconds=stale_seconds):
            try:
                entry.rename(queue_root / "pending" / entry.name)
                recovered += 1
                moved.append(entry.name)
            except OSError:
                pass
    if recovered > 0:
        try:
            event = {"at": int(time.time()), "count": recovered, "tasks": moved}
            (queue_root / "recovered_recent.json").write_text(
                json.dumps(event, ensure_ascii=False), encoding="utf-8")
        except Exception:
            pass
        try:
            add_event(cfg, "stuck_recovery", "warning",
                      detail=f"自动恢复 {recovered} 个卡死任务（已移至待处理队列）",
                      file="", path="", cache_path="")
        except Exception:
            pass
    return recovered


def start_queue_recovery_worker():
    """后台守护线程：每 30 秒扫描 running，自动恢复卡死任务并提示前端。"""

    def _loop():
        while True:
            try:
                cfg = get_cfg()
                recover_stale_running_tasks(cfg)
            except Exception:
                pass
            time.sleep(30)

    threading.Thread(target=_loop, daemon=True).start()


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
        # 复制到 inputs/ 返回 server 路径
        cfg = get_cfg()
        inbox = get_input_root(cfg)
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
    input_root.mkdir(parents=True, exist_ok=True)
    target = resolve_unique_file_path(input_root, filename).resolve()
    if not is_path_inside(target, input_root):
        json_response(handler, {"error": "上传目标路径越界"}, 400)
        return
    with open(target, "wb") as f:
        f.write(file_data)
    json_response(handler, {"path": str(target), "name": filename})


def remove_input_file(cfg, path_text):
    """移除 inputs/ 内的输入文件：优先移到系统回收站，回收站不可用时直接删除。
    返回 (status_code, payload)。"""
    if not path_text:
        return 400, {"error": "缺少路径"}
    input_root = get_input_root(cfg).resolve()
    try:
        target = Path(path_text).expanduser().resolve()
    except OSError as e:
        return 400, {"error": f"路径无效: {e}"}
    if not is_path_inside(target, input_root):
        return 403, {"error": "路径不在输入目录内"}
    if not target.exists():
        return 200, {"success": True, "trashed": False, "path": str(target), "message": "文件已不存在"}
    if not target.is_file():
        return 400, {"error": "目标不是文件"}
    try:
        adapter.trash_file(str(target))
        return 200, {"success": True, "trashed": True, "path": str(target), "message": "已移到回收站"}
    except Exception:
        try:
            target.unlink()
            return 200, {"success": True, "trashed": False, "path": str(target), "message": "回收站不可用，已直接删除"}
        except Exception as e:
            return 500, {"error": f"删除失败: {e}"}


def handle_input_remove(handler):
    body = read_body(handler)
    status, payload = remove_input_file(get_cfg(), body.get("path", ""))
    json_response(handler, payload, status)


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
        inbox = (get_input_root(cfg)).resolve()
        workspace_root = get_workspace_root(cfg).resolve()
        if is_path_inside(requested, workspace_root):
            if requested == inbox:
                inbox.mkdir(parents=True, exist_ok=True)
            adapter.open_folder(path)
            json_response(handler, {"success": True})
            return
        startup_dir = _get_startup_dir()
        if startup_dir and requested == Path(startup_dir).resolve():
            adapter.open_folder(path)
            json_response(handler, {"success": True})
            return
        json_response(handler, {"error": "路径不在允许打开范围内"}, 403)
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
        json_response(handler, {"error": "输出文件路径不在 outputs 内"}, 403)
        return
    if target.suffix.lower() != ".indd":
        json_response(handler, {"error": "只允许删除 .indd 导出文件"}, 400)
        return

    try:
        rel_parts = target.relative_to(output_root_resolved).parts
    except ValueError:
        json_response(handler, {"error": "输出文件路径不在 outputs 内"}, 403)
        return
    if rel_parts and rel_parts[0] != "done":
        json_response(handler, {"error": "只允许删除 done/ 下的导出文件"}, 403)
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
    confirm_overwrite = bool(body.get("confirm_overwrite"))
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
    get_logs_root(cfg).mkdir(parents=True, exist_ok=True)
    get_caches_root(cfg).mkdir(parents=True, exist_ok=True)
    get_images_root(cfg).mkdir(parents=True, exist_ok=True)
    get_done_root(cfg).mkdir(parents=True, exist_ok=True)

    # 自动恢复卡死的 running 任务（agent-direct 触发后 dispatch 未真正执行会残留，
    # 例如 InDesign 闪退/模态挂起）：120 秒无动静视为卡死，移回 pending 交给 watcher，
    # 否则 active_count 永远 > 0，后续"开始处理"全部被拒（400）。
    recover_stale_running_tasks(cfg)

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

    # 2026-08-16：done 重名冲突预检——输出文件名 = {板块}_{名}.indd（与 dispatch 一致）。
    # 未确认覆写时先返回冲突列表，由前端弹窗让用户决定；确认后带 confirm_overwrite 重发。
    done_root = get_done_root(cfg)
    conflicts = []
    if not confirm_overwrite:
        for cp in generated_files:
            out_name = _output_indd_name_for_cache(cp)
            if not out_name:
                continue
            existing = done_root / out_name
            if existing.exists():
                conflicts.append({
                    "cache_path": cp,
                    "output_name": out_name,
                    "output_path": str(existing)
                })
    if conflicts:
        json_response(handler, {
            "accepted": accepted, "skipped": skipped,
            "conflict": True,
            "message": f"存在 {len(conflicts)} 个同名输出文件，需要确认是否覆写",
            "conflicts": conflicts,
            "accepted_files": accepted_files
        })
        return

    ts = int(time.time())
    task_id = time.time_ns()
    try_open_indesign()

    task_id_text = f"dispatch_{task_id}"
    # 2026-08-25：优先走 watcher——任务写 pending（watcher 定时器兜底拾取），
    # osascript 触发只做加速（direct_trigger 标记：watcher 20s 内跳过，避免重复排版）。
    # osascript 权限丢失/InDesign 忙时任务留在 pending，由 watcher 兜底执行，不再卡死。
    task_file = queue_root / "pending" / f"{task_id_text}.json"
    task_file.write_text(
        json.dumps({
            "task_type": "dispatch_all",
            "task_id": task_id_text,
            "created_at": ts,
            "source": "agent-direct",
            "direct_trigger": True,
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
            if not re.match(r"^[\w\u4e00-\u9fff .()\-']+$", app_name):
                raise ValueError(f"非法的 InDesign 应用名: {app_name}")
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
    (get_logs_root(cfg)).mkdir(parents=True, exist_ok=True)
    (get_caches_root(cfg)).mkdir(parents=True, exist_ok=True)
    (get_images_root(cfg)).mkdir(parents=True, exist_ok=True)
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

    cache_files = sorted(str(p.resolve()) for p in (get_caches_root(cfg)).glob("*.json"))
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


def recalculate_page_breaks_for_cache(cfg, cache_path, template_id):
    """按模板 style_profile 重新计算缓存的分页点并写回缓存文件。

    返回 {"breaks": [...], "note": ""}。无 style_profile 时跳过计算。"""
    from page_break_calc import calculate_page_breaks, apply_page_breaks_to_elements
    result = {"breaks": [], "note": ""}
    p = Path(cache_path).resolve()
    if p.suffix.lower() != ".json" or not p.exists():
        return result
    try:
        elements = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return result
    if not isinstance(elements, list):
        return result

    template_cfg = (read_config().get("templates") or {}).get(template_id) or {}
    style_profile = template_cfg.get("style_profile")
    if not isinstance(style_profile, dict) or not style_profile.get("layout_params"):
        result["note"] = "模板尚未提取样式记录（style_profile），暂不计算分页"
        return result

    layout_mode = str(template_cfg.get("layout_mode") or "templateA")
    # 重置语义：先清掉缓存中的旧分页点（含上次自动分页），再按当前样式重新计算
    cleared = False
    for el in elements:
        if isinstance(el, dict) and "page_break_before" in el:
            del el["page_break_before"]
            cleared = True
    if cleared:
        try:
            p.write_text(json.dumps(elements, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as exc:
            result["note"] = f"分页清理失败: {exc}"
            return result
    try:
        # 2026-08-16：多格行按模板级每行字数 Z(N) 估高
        chars_per_line = resolve_chars_per_line(read_config(), template_id)
        breaks = calculate_page_breaks(elements, style_profile, layout_mode, chars_per_line)
    except Exception as exc:
        result["note"] = f"分页计算失败: {exc}"
        return result

    changed = apply_page_breaks_to_elements(elements, breaks)
    if changed:
        try:
            p.write_text(json.dumps(elements, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as exc:
            result["note"] = f"分页写入失败: {exc}"
            return result
    result["breaks"] = [int(b) for b in breaks]
    return result


def handle_reparse(handler):
    """重新解析项目（4_一句话）：按项目图片索引列表重建 [图+文] 对，文本=图片文件名。

    2026-08-07 用户确认模型：
    - 顺序 = 项目 images 索引顺序（重置后失去拖拽调整信息，可接受）
    - 文本 = 图片文件名（手动编辑过的文本会被覆盖，可接受）
    - 编辑器里删除的图/文会恢复：缓存中图元素或文件名文本任一存在即重建整组
    - 图元素和文件名文本都被删除 → 视为整组删除，从索引移除（返回 removed，前端同步索引）
    - 源文件缺失时保留原配对文本（避免退化为副本编号）
    传入 images 时走索引重建；不传时保留旧的按缓存列表重建逻辑（兼容其他调用）。"""
    body = read_body(handler)
    cache_path = body.get("cache_path", "")
    template_id = body.get("template_id", "")
    images = body.get("images")

    if not cache_path or not template_id:
        json_response(handler, {"error": "缺少 cache_path 或 template_id"}, 400)
        return

    cfg = get_cfg()
    target = resolve_cache_file(cfg, cache_path)
    if target is None:
        json_response(handler, {"error": "缓存路径无效"}, 400)
        return
    try:
        elements = json.loads(target.read_text(encoding="utf-8"))
        if not isinstance(elements, list):
            raise ValueError("缓存结构异常")
    except Exception as exc:
        json_response(handler, {"error": f"读取缓存失败: {exc}"}, 500)
        return

    if images is not None:
        if not isinstance(images, list):
            json_response(handler, {"error": "images 参数格式错误"}, 400)
            return
        rebuilt, removed = _rebuild_from_index(elements, images)
        # 整组删除 = 真正移除：把源文件从输入目录移走（回收站优先，兜底删除）。
        # 2026-08-16 起不再扫描 inputs 自动入队；此处仍移除源文件以保持磁盘干净。
        for p in removed:
            try:
                remove_input_file(cfg, p)
            except Exception:
                pass
    else:
        rebuilt = _rebuild_from_cache(elements)
        removed = []

    # 重新解析 = 全新重建：清掉全部旧分页点（含手动/自动），
    # 由前端加载时重新计算自动分页（getPageBreaks）
    for el in rebuilt:
        if isinstance(el, dict) and "page_break_before" in el:
            del el["page_break_before"]

    try:
        target.write_text(json.dumps(rebuilt, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as exc:
        add_event(cfg, "parse_fail", "error", detail=f"写入缓存失败: {exc}",
                  file=target.name, path=str(target), cache_path=str(target))
        json_response(handler, {"error": f"写入缓存失败: {exc}"}, 500)
        return

    recalc_result = recalculate_page_breaks_for_cache(cfg, str(target), template_id)

    json_response(handler, {
        "cache_path": str(target),
        "element_count": len(rebuilt),
        "removed": removed,
        "image_paths": [e.get("source_path") or "" for e in rebuilt if isinstance(e, dict) and e.get("type") == "image"],
        "page_breaks": recalc_result["breaks"],
        "page_breaks_note": recalc_result["note"]
    })


def _rebuild_from_index(elements, images):
    """按项目图片索引重建（4_一句话）。返回 (rebuilt, removed)。

    空索引（旧数据行无 images 字段）：从缓存现有 image 元素的 source_path 兜底，
    避免空索引把整个缓存清空。"""
    if not images:
        images = [
            e.get("source_path") or e.get("src")
            for e in elements or []
            if isinstance(e, dict) and e.get("type") == "image"
        ]
        images = [p for p in images if p]
    img_by_src = {}
    text_by_stem = {}
    for e in elements or []:
        if not isinstance(e, dict):
            continue
        if e.get("type") == "image" and e.get("source_path"):
            img_by_src.setdefault(_norm_filename(e["source_path"]), e)
        elif e.get("type") == "text":
            c = _norm_filename(e.get("content") or "")
            if c:
                text_by_stem.setdefault(c, e)
    rebuilt = []
    removed = []
    idx = 1
    for p in images:
        stem = _norm_filename(Path(p).stem)
        img_elem = img_by_src.get(_norm_filename(p))
        text_elem = text_by_stem.get(stem)
        if img_elem is None and text_elem is None:
            # 图元素和文件名文本都被删除：整组删除，从索引移除
            removed.append(p)
            continue
        if img_elem is not None:
            new_img = dict(img_elem)
        else:
            new_img = {"index": 0, "type": "image", "src": p, "source_path": p}
        new_img["index"] = idx
        idx += 1
        rebuilt.append(new_img)
        src_path = (new_img.get("source_path") or "").strip()
        if src_path and os.path.exists(src_path):
            content = Path(src_path).stem
        elif text_elem is not None:
            content = text_elem.get("content") or ""
        else:
            content = ""
        if text_elem is not None:
            new_txt = dict(text_elem)
        else:
            new_txt = {k: v for k, v in new_img.items() if k not in ("index", "type", "src", "source_path")}
        new_txt["index"] = idx
        new_txt["type"] = "text"
        new_txt["content"] = content
        idx += 1
        rebuilt.append(new_txt)
    return rebuilt, removed


def _rebuild_from_cache(elements):
    """旧逻辑：按缓存列表遍历重建（无 images 索引时的兼容路径）。

    遍历 image 元素重建配对文本（文本=源文件名 stem，源缺失时保留原文本），
    独立文本元素保留。"""
    rebuilt = []
    idx = 1
    i = 0
    n = len(elements)
    while i < n:
        e = elements[i]
        if not isinstance(e, dict):
            i += 1
            continue
        if e.get("type") == "image":
            src_path = e.get("source_path") or ""
            fallback = ""
            if i + 1 < n and isinstance(elements[i + 1], dict) and elements[i + 1].get("type") == "text":
                fallback = elements[i + 1].get("content") or ""
            if src_path and os.path.exists(src_path):
                stem = Path(src_path).stem
            else:
                stem = fallback
            new_img = dict(e)
            new_img["index"] = idx
            rebuilt.append(new_img)
            idx += 1
            new_txt = {k: v for k, v in e.items() if k not in ("index", "type", "src", "source_path")}
            new_txt["index"] = idx
            new_txt["type"] = "text"
            new_txt["content"] = stem
            rebuilt.append(new_txt)
            idx += 1
            if i + 1 < n and isinstance(elements[i + 1], dict) and elements[i + 1].get("type") == "text":
                i += 2
            else:
                i += 1
        elif e.get("type") == "text":
            new_txt = dict(e)
            new_txt["index"] = idx
            rebuilt.append(new_txt)
            idx += 1
            i += 1
        else:
            i += 1
    return rebuilt


def handle_recalculate_page_breaks(handler):
    body = read_body(handler)
    cache_path = body.get("path", "")
    template_id = body.get("template_id", "")
    if not cache_path or not template_id:
        json_response(handler, {"error": "缺少 path 或 template_id"}, 400)
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
    result = recalculate_page_breaks_for_cache(cfg, str(p), template_id)
    json_response(handler, {
        "success": True,
        "cache_path": str(p),
        "page_breaks": result["breaks"],
        "note": result["note"]
    })


def _run_docx_parse(cfg, mapping_items):
    """执行解析脚本，返回 (cache_path, source_paths, error)。"""
    project_root = Path(cfg["project_root"])
    output_root = get_output_root(cfg)
    get_caches_root(cfg).mkdir(parents=True, exist_ok=True)
    get_images_root(cfg).mkdir(parents=True, exist_ok=True)

    ts = time.time_ns()
    mapping_file = get_caches_root(cfg) / f"parse_{ts}.json"
    mapping_file.write_text(json.dumps(mapping_items), encoding="utf-8")

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
        return None, [], f"解析失败: {err}"

    cache_path = None
    for line in result.stdout.strip().split("\n"):
        line = line.strip()
        if line.endswith(".json"):
            cache_path = line
            break
    if not cache_path:
        return None, [], "解析未生成缓存文件"
    return cache_path, [item["path"] for item in mapping_items], ""


def _norm_filename(text):
    """Unicode 规范化（NFC），避免 macOS NFD 文件名与脚本输出差异导致配对/去重失败。"""
    return unicodedata.normalize("NFC", str(text or ""))


def _output_indd_name_for_cache(cache_path):
    """按缓存元数据计算输出文件名 {板块}_{名}.indd（与 dispatch buildOutputInddPath 一致）。

    缓存 JSON 首个元素的 section_name=板块、doc_name=原文档名（去扩展名）。
    读不到时退回解析文件名（{板块}_{名}_{id}.json → {板块}_{名}.indd）。
    """
    try:
        with open(cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list) and data and isinstance(data[0], dict):
            section = str(data[0].get("section_name") or "")
            doc_name = str(data[0].get("doc_name") or "")
            if section and doc_name:
                import re as _re
                stem = Path(doc_name).stem
                stem = _re.sub(r'[/\\:*?"<>|]', "_", stem).strip()
                section = _re.sub(r'[/\\:*?"<>|]', "_", section).strip()
                if section and stem:
                    return f"{section}_{stem}.indd"
    except Exception:
        pass
    try:
        stem = Path(cache_path).stem  # {板块}_{名}_{id}
        parts = stem.split("_")
        if len(parts) >= 3:
            return "_".join(parts[:-1]) + ".indd"  # 去掉末尾 id
        return stem + ".indd"
    except Exception:
        return None


def _attach_source_paths(cache_path, mapping_items):
    """按文件名（stem）配对给缓存 image 元素附加 source_path。

    解析脚本的输出顺序可能与 mapping 顺序不同（脚本内部排序），
    按顺序配对会错位（2026-08-07 发现：首尾组 source_path 配错）。
    改为用 image 元素【后面紧跟】的 text 内容（=原文件名 stem）匹配
    mapping 路径（元素顺序为 image → text 成对）。"""
    try:
        new_cache = Path(cache_path)
        new_els = json.loads(new_cache.read_text(encoding="utf-8"))
        by_stem = {}
        for m in mapping_items:
            by_stem.setdefault(_norm_filename(Path(m["path"]).stem), m["path"])
        n = len(new_els)
        for i, e in enumerate(new_els):
            if not isinstance(e, dict) or e.get("type") != "image":
                continue
            j = i + 1
            while j < n and (not isinstance(new_els[j], dict) or new_els[j].get("type") != "text"):
                j += 1
            if j < n:
                content = new_els[j].get("content") or ""
                e["source_path"] = by_stem.get(_norm_filename(content), e.get("source_path") or "")
        new_cache.write_text(json.dumps(new_els, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


def _existing_image_stems(elements):
    """现有缓存中 image 元素的规范化文件名 stem 集合（去重/过滤用）。"""
    stems = set()
    for e in elements or []:
        if isinstance(e, dict) and e.get("type") == "image" and e.get("source_path"):
            stems.add(_norm_filename(Path(e["source_path"]).stem))
    return stems


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
    if not src.exists() or not src.is_file():
        json_response(handler, {"error": f"文件不存在: {src_path}"}, 400)
        return

    cache_path, source_paths, err = _run_docx_parse(cfg, [{"path": str(src.resolve()), "template_id": template_id}])
    if err:
        add_event(cfg, "parse_fail", "error", detail=str(err), file=src.name,
                  path=str(src.resolve()), cache_path="")
        json_response(handler, {"error": err}, 500)
        return

    source_path = archive_source_file_for_cache(cfg, src, cache_path)
    attach_source_path_to_cache(cache_path, source_path)

    # 解析完成后按模板样式记录计算自动分页点，写入缓存（替代 JSX 排版时计算）
    recalc_result = recalculate_page_breaks_for_cache(cfg, cache_path, template_id)

    json_response(handler, {
        "cache_path": cache_path,
        "source_path": source_paths[0] if source_paths else src_path,
        "page_breaks": recalc_result["breaks"],
        "page_breaks_note": recalc_result["note"]
    })


def handle_parse_images(handler):
    """多张图片解析。无 append_to：新建缓存（图片组=一个文档）；
    有 append_to：追加到现有项目缓存末尾（4_一句话 持续项目模型，2026-08-07 用户确认）。"""
    body = read_body(handler)
    paths = body.get("paths") or []
    template_id = body.get("template_id", "")
    append_to = body.get("append_to") or ""

    if not isinstance(paths, list) or not paths:
        json_response(handler, {"error": "缺少图片路径列表"}, 400)
        return
    if not template_id:
        json_response(handler, {"error": "缺少 template_id"}, 400)
        return

    cfg = get_cfg()
    image_exts = ("png", "jpg", "jpeg")
    mapping_items = []
    for p in paths:
        src = resolve_workspace_file(cfg, p)
        if src is None:
            json_response(handler, {"error": f"文件路径不在工作区内: {p}"}, 403)
            return
        if not src.exists() or not src.is_file():
            json_response(handler, {"error": f"文件不存在: {p}"}, 400)
            return
        ext = src.suffix.lower().lstrip(".")
        if ext not in image_exts:
            json_response(handler, {"error": f"仅支持图片文件: {p}"}, 400)
            return
        mapping_items.append({"path": str(src.resolve()), "template_id": template_id})

    if append_to:
        # 追加场景：按规范化文件名 stem 过滤已存在的图，避免重复解析
        target = resolve_cache_file(cfg, append_to)
        if target is None:
            json_response(handler, {"error": "追加目标缓存路径无效"}, 400)
            return
        try:
            existing_els = json.loads(target.read_text(encoding="utf-8"))
            existing_stems = _existing_image_stems(existing_els)
        except Exception:
            existing_stems = set()
        fresh = [m for m in mapping_items if _norm_filename(Path(m["path"]).stem) not in existing_stems]
        if not fresh:
            # 全部重复：仅重算分页并返回现有缓存
            recalc_result = recalculate_page_breaks_for_cache(cfg, str(target), template_id)
            json_response(handler, {
                "cache_path": str(target),
                "source_path": mapping_items[0]["path"],
                "added": 0,
                "page_breaks": recalc_result["breaks"],
                "page_breaks_note": recalc_result["note"]
            })
            return
        mapping_items = fresh

    cache_path, _, err = _run_docx_parse(cfg, mapping_items)
    if err:
        json_response(handler, {"error": err}, 500)
        return

    # 新缓存 image 元素附加原始路径（按文件名配对，reparse 用其重建文本）
    _attach_source_paths(cache_path, mapping_items)

    if append_to:
        target = resolve_cache_file(cfg, append_to)
        if target is None:
            json_response(handler, {"error": "追加目标缓存路径无效"}, 400)
            return
        try:
            existing = json.loads(target.read_text(encoding="utf-8"))
            new_els = json.loads(Path(cache_path).read_text(encoding="utf-8"))
            if not isinstance(existing, list) or not isinstance(new_els, list):
                raise ValueError("缓存结构异常")
        except Exception as exc:
            json_response(handler, {"error": f"追加失败: {exc}"}, 500)
            return
        # 过滤新缓存中已存在的图组（按规范化文件名 stem 去重）
        existing_stems = _existing_image_stems(existing)
        filtered_new = []
        skip = False
        for e in new_els:
            if not isinstance(e, dict):
                continue
            if e.get("type") == "image":
                skip = _norm_filename(Path(e.get("source_path") or "").stem) in existing_stems
                if not skip:
                    filtered_new.append(e)
            elif not skip:
                filtered_new.append(e)
        new_els = filtered_new
        next_index = max([int(e.get("index") or 0) for e in existing] or [0]) + 1
        for e in new_els:
            e["index"] = next_index
            next_index += 1
        merged = existing + new_els
        try:
            target.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as exc:
            json_response(handler, {"error": f"追加写入失败: {exc}"}, 500)
            return
        try:
            Path(cache_path).unlink()
        except Exception:
            pass
        cache_path = str(target)

    # 多图模式：源文件留在原位置（记录路径，不归档移动）

    recalc_result = recalculate_page_breaks_for_cache(cfg, cache_path, template_id)

    json_response(handler, {
        "cache_path": cache_path,
        "source_path": mapping_items[0]["path"],
        "added": len(mapping_items),
        "page_breaks": recalc_result["breaks"],
        "page_breaks_note": recalc_result["note"]
    })


def handle_thumbnail(handler):
    """GET /api/thumbnail?path=... 返回工作区内图片二进制。

    http 页面不能直接加载 file:// 图片（浏览器跨协议限制），
    缩略图/预览统一走本端点（2026-08-07）。"""
    from urllib.parse import urlparse, parse_qs
    params = parse_qs(urlparse(handler.path).query)
    path = (params.get("path") or [""])[0]
    if not path:
        json_response(handler, {"error": "缺少 path"}, 400)
        return
    cfg = get_cfg()
    p = resolve_workspace_file(cfg, path)
    if p is None:
        json_response(handler, {"error": "路径不在工作区内"}, 403)
        return
    if not p.exists() or not p.is_file():
        json_response(handler, {"error": "文件不存在"}, 404)
        return
    ext = p.suffix.lower().lstrip(".")
    if ext not in ("jpg", "jpeg", "png"):
        json_response(handler, {"error": "仅支持图片文件"}, 400)
        return
    try:
        data = p.read_bytes()
    except Exception as exc:
        json_response(handler, {"error": f"读取失败: {exc}"}, 500)
        return
    ctype = "image/png" if ext == "png" else "image/jpeg"
    handler.send_response(200)
    handler.send_header("Content-Type", ctype)
    handler.send_header("Content-Length", str(len(data)))
    add_cors_headers(handler)
    handler.send_header("Cache-Control", "no-cache")
    handler.end_headers()
    handler.wfile.write(data)


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
    log_file = get_logs_root(cfg) / f"{kind}.log"
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
    """清理非核心缓存；保留编辑核心 work/ 下 caches/images 等。"""
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
        if entry.name in ("work", "done"):
            # 中间产物 work/（caches/images/page-breaks/snapshots）与成品 done/ 都是编辑核心，保留
            preserved_dirs.append(entry.name)
            continue
        if entry.name in ("queue", "logs"):
            cleared_dirs.append(entry.name)
            for f in entry.rglob("*"):
                if f.is_file() and f.suffix == ".log":
                    try:
                        f.unlink()
                        cleared += 1
                    except Exception:
                        pass
            continue
        cleared_dirs.append(entry.name)
        for f in entry.rglob("*"):
            if f.is_file():
                try:
                    f.unlink()
                    cleared += 1
                except Exception:
                    pass
        for d in sorted(entry.rglob("*"), key=lambda x: len(str(x)), reverse=True):
            if d.is_dir() and d.name != entry.name:
                try:
                    d.rmdir()
                except Exception:
                    pass

    shared_gc = cleanup_unreferenced_shared_images(cfg)
    if shared_gc["cleared"] > 0:
        cleared += shared_gc["cleared"]
        cleared_dirs.append("images/未引用图片")

    json_response(handler, {
        "success": True,
        "cleared": cleared,
        "cleared_dirs": cleared_dirs,
        "preserved_dirs": sorted(set(preserved_dirs)),
        "shared_images_gc": shared_gc,
        "message": f"已清理 {cleared} 个非核心/未引用文件；已保留 work/（caches/images/page-breaks/snapshots）与 done/ 及被引用图片资源"
    })


def handle_stop(handler):
    json_response(handler, {"success": True, "message": "服务即将关闭"})
    if _shutdown_callback:
        threading.Thread(target=_shutdown_callback, daemon=True).start()


def handle_get_templates(handler):
    cfg = get_cfg()
    templates = cfg.get("templates", {})
    templates_dir = get_templates_root(cfg)
    
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
        config_file = get_templates_root(cfg) / template_id / "config.json"
        if config_file.exists():
            try:
                template_cfg = json.loads(config_file.read_text(encoding="utf-8"))
            except Exception:
                pass
    if template_cfg is None:
        json_response(handler, {"error": "模板配置不存在"}, 404)
        return
    merged = dict(template_cfg)
    merged["chars_per_line"] = resolve_chars_per_line(cfg, template_id)
    json_response(handler, merged)


def handle_put_template_config(handler, template_id):
    body = read_body(handler)
    cfg = get_cfg()
    if "templates" not in cfg:
        cfg["templates"] = {}
    cfg["templates"][template_id] = body
    write_config(cfg)
    config_file = get_templates_root(cfg) / template_id / "config.json"
    if config_file.exists():
        try:
            config_file.write_text(json.dumps(body, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception:
            pass
    json_response(handler, {"success": True})


def handle_open_template_folder(handler, template_id):
    cfg = get_cfg()
    folder = get_templates_root(cfg) / template_id
    if not folder.exists():
        json_response(handler, {"error": "模板目录不存在"}, 404)
        return
    try:
        adapter.open_folder(str(folder))
        json_response(handler, {"success": True})
    except Exception as e:
        json_response(handler, {"error": str(e)}, 500)


def handle_extract_template_style(handler, template_id):
    cfg = get_cfg()
    project_root = Path(cfg["project_root"])
    script = project_root / "pipeline/jsx/extract_template_style_profile.jsx"
    template_folder = get_templates_root(cfg) / template_id
    if not template_folder.exists():
        json_response(handler, {"success": False, "message": f"模板目录不存在: {template_id}"}, 404)
        return
    if not script.exists():
        json_response(handler, {"success": False, "message": "样式提取脚本不存在", "details": ""}, 400)
        return

    params = {"pipeline_extract_template_id": template_id}
    params_file = project_root / "pipeline/jsx/_pipeline_params.json"
    params_file.write_text(json.dumps(params, indent=2), encoding="utf-8")
    try:
        result = execute_jsx(str(script))
        profile_path = template_folder / "style_profile.json"
        exists = profile_path.exists()
        if exists:
            try:
                profile = json.loads(profile_path.read_text(encoding="utf-8"))
                object_count = len(profile.get("objects", {}))
                unlabeled = profile.get("_unlabeled_count", 0)
                start_y = profile.get("layout_params", {}).get("start_y")
            except Exception:
                profile = None
                object_count = 0
                unlabeled = 0
                start_y = None
            if profile:
                try:
                    merged = read_config()
                    if "templates" not in merged:
                        merged["templates"] = {}
                    merged["templates"].setdefault(template_id, {})["style_profile"] = profile
                    write_config(merged)
                except Exception:
                    pass
            json_response(handler, {
                "success": True,
                "message": "样式提取完成",
                "details": result,
                "profile_path": str(profile_path),
                "object_count": object_count,
                "unlabeled_count": unlabeled,
                "start_y": start_y
            })
        else:
            json_response(handler, {"success": False, "message": "样式提取未生成 style_profile.json", "details": result}, 500)
    except Exception as e:
        json_response(handler, {"success": False, "message": "样式提取失败", "details": str(e)}, 500)
    finally:
        if params_file.exists():
            try:
                params_file.unlink()
            except Exception:
                pass


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
    snapshots_root = get_snapshots_root(cfg)

    if not script.exists():
        json_response(handler, {"success": False, "message": "对比脚本不存在", "details": ""}, 400)
        return

    try:
        result = subprocess.run(
            [sys.executable, str(script), "--workspace", str(snapshots_root),
             "--golden-root", str(snapshots_root), "--tolerance", "0.01", "--threshold", "10"],
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
    snapshots_root = get_snapshots_root(cfg)

    if not script.exists():
        json_response(handler, {"success": False, "message": "对比脚本不存在", "details": ""}, 400)
        return

    try:
        result = subprocess.run(
            [sys.executable, str(script), "--promote", "--workspace", str(snapshots_root)],
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
    snapshots_root = get_snapshots_root(cfg)
    if not snapshots_root.exists():
        json_response(handler, [])
        return

    dirs = []
    for doc in sorted(snapshots_root.iterdir()):
        if not doc.is_dir() or doc.name.startswith("."):
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
            dirs.append(f"{doc.name}  [{status}]")
    json_response(handler, dirs)


def handle_validate_files(handler):
    body = read_body(handler)
    paths = body.get("paths", [])
    cfg = get_cfg()
    workspace_root = get_workspace_root(cfg).resolve()
    result = []
    for p in paths:
        try:
            path = Path(p).expanduser().resolve()
        except OSError:
            result.append({"path": p, "exists": False})
            continue
        result.append({
            "path": p,
            "exists": is_path_inside(path, workspace_root) and path.exists() and path.is_file()
        })
    json_response(handler, result)


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

    # outputs/ 下只有 work/ 与 done/（新结构）；queue/logs 已移入 .runtime/
    for entry in sorted(output_root.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        file_count = 0
        dir_size = 0
        for f in entry.rglob("*"):
            if is_valid_file(f):
                file_count += 1
                dir_size += f.stat().st_size

        if file_count > 0 or entry.name in ("work", "done"):
            stats.append({
                "name": entry.name,
                "files": file_count,
                "size_bytes": dir_size,
                "preserved": []
            })
            total_size += dir_size

    json_response(handler, {"dirs": stats, "total_size_bytes": total_size})


ROUTES = {
    "GET:/api/health": handle_health,
    "GET:/api/config": handle_get_config,
    "POST:/api/config": handle_post_config,
    "POST:/api/config/auto-detect": handle_auto_detect,
    "GET:/api/dashboard": handle_get_dashboard,
    "GET:/api/events": handle_get_events,
    "POST:/api/events/update": handle_update_event,
    "POST:/api/events/remove": handle_remove_event,
    "POST:/api/events/remove-by-file": handle_remove_events_by_file,
    "GET:/api/queue/stats": handle_queue_stats,
    "GET:/api/state": handle_get_state,
    "POST:/api/state": handle_post_state,
    "GET:/api/pick-files": handle_pick_files,
    "POST:/api/upload": handle_upload,
    "POST:/api/input/clear": handle_input_clear,
    "POST:/api/input/remove": handle_input_remove,
    "POST:/api/open-path": handle_open_path,
    "POST:/api/open-output-folder": handle_open_output_folder,
    "POST:/api/output/delete": handle_delete_output_file,
    "POST:/api/parse": handle_parse_file,
    "POST:/api/parse-images": handle_parse_images,
    "POST:/api/reparse": handle_reparse,
    "GET:/api/image": handle_image,
    "GET:/api/image/check": handle_image_check,
    "GET:/api/cache": handle_get_cache,
    "GET:/api/thumbnail": handle_thumbnail,
    "GET:/api/page-breaks": handle_get_page_breaks,
    "POST:/api/page-breaks/recalculate": handle_recalculate_page_breaks,
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
    "GET:/api/templates": handle_get_templates,
    "POST:/api/snapshot/export": handle_snapshot_export,
    "POST:/api/snapshot/compare": handle_snapshot_compare,
    "POST:/api/snapshot/promote": handle_snapshot_promote,
    "GET:/api/snapshot/dirs": handle_snapshot_dirs,
}


def dispatch(handler):
    path, query = parse_path(handler)
    method = handler.command

    if not is_trusted_request(handler):
        json_response(handler, {"error": "请求来源不受信任"}, 403)
        return True

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
    elif method == "POST" and path.startswith("/api/templates/") and path.endswith("/extract-style"):
        parts = path.split("/")
        if len(parts) == 5:
            handle_extract_template_style(handler, unquote_plus(parts[3]))
            return True

    key = f"{method}:{path}"
    handler_func = ROUTES.get(key)
    if handler_func:
        try:
            handler_func(handler)
        except ValueError as e:
            json_response(handler, {"error": str(e)}, 400)
        return True
    return False
