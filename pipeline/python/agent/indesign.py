import os, sys, json
from pathlib import Path
from typing import Optional

from .config import read_config, auto_detect_indesign, resolve_dir
from .platform_adapter import create_adapter


adapter = create_adapter()


def try_open_indesign():
    cfg = read_config()
    app_path = cfg["indesign_app_path"]
    if not app_path:
        detected = auto_detect_indesign()
        app_path = (detected or {}).get("path") or ""
    if not app_path:
        return
    adapter.open_app(app_path)


def execute_jsx(script_path: str) -> str:
    cfg = read_config()
    app_path = cfg["indesign_app_path"]
    app_name = Path(app_path).stem if app_path else "Adobe InDesign 2026"
    return adapter.execute_jsx(script_path, app_name)


def _get_startup_dir() -> Optional[str]:
    return adapter.find_indesign_startup_dir()


def install_watcher() -> dict:
    cfg = read_config()
    startup_dir = _get_startup_dir()
    if not startup_dir:
        return {"success": False, "message": "未找到 InDesign Startup Scripts 目录，请先启动一次 InDesign"}

    watcher_src = Path(cfg["project_root"]) / "pipeline/jsx/create_layout_startup_watcher.jsx"
    if not watcher_src.exists():
        return {"success": False, "message": f"Watcher 源文件不存在: {watcher_src}"}

    target = Path(startup_dir) / "create_layout_startup_watcher.jsx"

    stale_scripts = [
        "create_layout_dispatch.jsx",
        "create_layout_templateA.jsx",
        "create_layout_templateB.jsx",
        "create_layout_templateC.jsx",
        "create_layout_templateD.jsx",
    ]
    disabled_count = 0
    for name in stale_scripts:
        p = Path(startup_dir) / name
        if p.exists():
            disabled = Path(startup_dir) / f"{name}.disabled"
            try:
                p.rename(disabled)
                disabled_count += 1
            except OSError:
                pass

    # 2026-08-18：watcher 副本安装时注入 project_root（不读家目录配置），
    # 使 Startup 副本自带项目根定位能力，迁移目录后重装一次即可。
    import shutil
    import json as _json
    source_text = watcher_src.read_text(encoding="utf-8")
    inject_line = (
        "// [autoInstall] project_root injected by install_watcher (2026-08-18)\n"
        "var __AUTO_INJECTED_PROJECT_ROOT__ = "
        + _json.dumps(cfg["project_root"]) + ";\n"
        "var __AUTO_INJECTED_PATHS_JSON__ = "
        + _json.dumps(str(Path(cfg["project_root"]) / "workspace/.runtime/paths.json")) + ";\n"
    )
    if "__AUTO_INJECTED_PROJECT_ROOT__" in source_text:
        # 残留旧注入（重复安装），先剥离旧注入行
        lines = []
        skip_next = False
        for line in source_text.split("\n"):
            if skip_next:
                skip_next = False
                continue
            if "var __AUTO_INJECTED_PROJECT_ROOT__" in line or "var __AUTO_INJECTED_PATHS_JSON__" in line:
                continue
            lines.append(line)
        source_text = "\n".join(lines)
    new_text = inject_line + source_text
    target.write_text(new_text, encoding="utf-8")

    msg = f"已安装到: {target}"
    if disabled_count > 0:
        msg += f"\n已禁用 {disabled_count} 个冲突脚本"
    msg += "\n请重启 InDesign 使 Startup Script 生效"

    return {"success": True, "message": msg}


def uninstall_watcher() -> dict:
    startup_dir = _get_startup_dir()
    if not startup_dir:
        return {"success": False, "message": "未找到 InDesign Startup Scripts 目录"}

    target = Path(startup_dir) / "create_layout_startup_watcher.jsx"
    if target.exists():
        target.unlink()
        return {"success": True, "message": f"已卸载: {target}"}
    return {"success": True, "message": "Watcher 未安装，无需卸载"}


def check_watcher_installed() -> dict:
    startup_dir = _get_startup_dir()
    if not startup_dir:
        return {"installed": False, "path": ""}

    candidate = Path(startup_dir) / "create_layout_startup_watcher.jsx"
    if candidate.exists():
        return {"installed": True, "path": str(candidate)}
    return {"installed": False, "path": ""}


def check_watcher_alive() -> dict:
    cfg = read_config()
    heartbeat = resolve_dir(cfg, "queue_dir", "workspace/.runtime/queue") / ".watcher_heartbeat"

    if not heartbeat.exists():
        return {"alive": False, "last_heartbeat": None}

    try:
        mtime = heartbeat.stat().st_mtime
        import time
        elapsed = time.time() - mtime
        timeout = cfg.get("watcher_alive_timeout", 10)
        alive = elapsed < timeout

        import datetime
        last_hb = datetime.datetime.fromtimestamp(mtime).isoformat()
        return {"alive": alive, "last_heartbeat": last_hb}
    except OSError:
        return {"alive": False, "last_heartbeat": None}
