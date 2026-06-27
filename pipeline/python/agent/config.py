import os, sys, json, time
from pathlib import Path
DEFAULT_CONFIG = {
    "project_root": "/Users/mei/AiWorks/autoRainbow",
    "indesign_app_path": "/Applications/Adobe InDesign 2026/Adobe InDesign 2026.app",
    "polling_interval": 2000,
    "watcher_heartbeat_interval": 3,
    "watcher_alive_timeout": 10,
    "templates": {}
}


def get_config_path():
    return Path.home() / "autorainbow_config.json"


def _migrate_templates(cfg):
    """从 A_templates/{id}/config.json 读取板块配置，合并到 cfg['templates']"""
    project_root = Path(cfg.get("project_root", ""))
    templates_dir = project_root / "workspace" / "A_templates"
    if not templates_dir.exists():
        return cfg
    existing_templates = set(cfg.get("templates", {}).keys())
    modified = False
    for entry in sorted(templates_dir.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        if entry.name in existing_templates:
            continue
        config_file = entry / "config.json"
        if config_file.exists():
            try:
                data = json.loads(config_file.read_text(encoding="utf-8"))
                if "templates" not in cfg:
                    cfg["templates"] = {}
                cfg["templates"][entry.name] = data
                modified = True
            except Exception:
                pass
    if modified:
        try:
            path = get_config_path()
            with open(path, "w", encoding="utf-8") as f:
                json.dump(cfg, f, indent=2, ensure_ascii=False)
        except Exception:
            pass
    return cfg


def read_config():
    path = get_config_path()
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            merged = DEFAULT_CONFIG.copy()
            merged.update(cfg)
            merged = _migrate_templates(merged)
            return merged
        except Exception:
            pass
    return DEFAULT_CONFIG.copy()
def write_config(cfg):
    path = get_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = read_config()
    existing.update(cfg)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(existing, f, indent=2, ensure_ascii=False)
    return existing

def get_template_config(template_id):
    cfg = read_config()
    templates = cfg.get("templates", {})
    return templates.get(template_id)

def set_template_config(template_id, template_cfg):
    cfg = read_config()
    if "templates" not in cfg:
        cfg["templates"] = {}
    cfg["templates"][template_id] = template_cfg
    write_config(cfg)
    return cfg

def short_timestamp():
    """Unix 分钟数转 Base36，约 5 位字符，用于文件命名"""
    minutes = int(time.time() // 60)
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    result = ""
    while minutes:
        result = chars[minutes % 36] + result
        minutes //= 36
    return result or "0"

def auto_detect_indesign():
    config = read_config()
    if sys.platform == "darwin":
        import glob as gl
        matches = gl.glob("/Applications/Adobe InDesign*/Adobe InDesign*.app")
        if matches:
            matches.sort(reverse=True)
            config["indesign_app_path"] = matches[0]
            write_config(config)
            return {"detected": True, "path": matches[0]}
    elif sys.platform == "win32":
        import glob as gl
        matches = gl.glob("C:\\Program Files\\Adobe\\Adobe InDesign*\\InDesign.exe")
        if matches:
            matches.sort(reverse=True)
            config["indesign_app_path"] = matches[0]
            write_config(config)
            return {"detected": True, "path": matches[0]}
    return {"detected": False, "path": None}
