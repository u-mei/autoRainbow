import os, sys, json, time
from pathlib import Path

# 2026-08-16 workspace 结构重构：目录全部配置化（相对 project_root）。
# 旧结构 A_templates/B_outputs/C_inputs 已废弃，一次迁移到位（见
# private/docs/Workspace结构重构设计方案.md）。
#
# 2026-08-18 配置结构重构（统一路径索引）：
# - 路径索引统一由 workspace/.runtime/paths.json 管理（唯一写死点 =
#   该文件相对 project_root 的固定位置，见 _RUNTIME_PATHS_REL）。
# - project_root 永不从 paths.json 读取：一律由脚本位置反推
#   （_infer_project_root）或 watcher 安装时注入；paths.json 中的
#   project_root 仅作记录/展示，每次启动自动校正。
# - 业务配置（templates/style_profile/chars_per_line 等）与路径分离，
#   存 workspace/.runtime/autorainbow_config.json。
# - 家目录旧配置（~/autorainbow_config.json、~/.autorainbow/config.json）
#   不再读取；首次运行自动迁移到项目内（_migrate_home_config）。

# 路径索引文件相对 project_root 的固定位置（全项目唯一写死点）
_RUNTIME_PATHS_REL = Path("workspace/.runtime/paths.json")

DEFAULT_DIR_CONFIG = {
    "workspace_dir": "workspace",                    # 工作区根
    "templates_dir": "workspace/templates",          # 原 A_templates
    "inputs_dir": "workspace/inputs",                # 原 C_inputs（含 _inbox 合并）
    "outputs_dir": "workspace/outputs",              # 原 B_outputs
    "work_dir": "workspace/outputs/work",            # 中间产物（caches/images/page-breaks/snapshots）
    "done_dir": "workspace/outputs/done",            # 成品 .indd 平铺
    "runtime_dir": "workspace/.runtime",             # 运行时状态
    "queue_dir": "workspace/.runtime/queue",         # 任务队列
    "logs_dir": "workspace/.runtime/logs",           # 日志
}

DEFAULT_CONFIG = {
    "project_root": "",
    "indesign_app_path": "",
    "polling_interval": 2000,
    "watcher_heartbeat_interval": 3,
    "watcher_alive_timeout": 10,
    "templates": {},
    **DEFAULT_DIR_CONFIG,
}

# paths.json 顶层键（路径相关，写入时与业务配置分离）
PATH_TOP_KEYS = {"project_root", "indesign_app_path"}


def _infer_project_root():
    """从脚本位置反推项目根（pipeline/python/agent/config.py → 上4级）。
    避免在默认配置中硬编码开发者机器路径。project_root 的唯一权威来源。"""
    candidate = Path(__file__).resolve().parents[3]
    if (candidate / "workspace").exists() and (candidate / "pipeline").exists():
        return str(candidate)
    return ""


def get_config_path():
    """业务配置文件位置（项目内 workspace/.runtime/autorainbow_config.json）。"""
    root = Path(_infer_project_root() or Path.home())
    return root / "workspace" / ".runtime" / "autorainbow_config.json"


def get_paths_path():
    """统一路径索引文件位置（相对 project_root 固定）。"""
    root = Path(_infer_project_root() or Path.home())
    return root / _RUNTIME_PATHS_REL


def read_paths():
    """读取统一路径索引。不存在或损坏时用默认相对布局，project_root 始终以反推为准。"""
    defaults = {
        "schema_version": 1,
        "project_root": _infer_project_root(),
        "indesign_app_path": "",
        "dirs": dict(DEFAULT_DIR_CONFIG),
    }
    p = get_paths_path()
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            merged_dirs = dict(defaults["dirs"])
            merged_dirs.update(data.get("dirs") or {})
            defaults = {
                "schema_version": data.get("schema_version", 1),
                "project_root": _infer_project_root() or data.get("project_root") or defaults["project_root"],
                "indesign_app_path": data.get("indesign_app_path") or defaults["indesign_app_path"],
                "dirs": merged_dirs,
            }
        except Exception:
            pass
    return defaults


def write_paths(paths=None):
    """写回统一路径索引。project_root 始终以反推为准再落盘。"""
    current = read_paths()
    if paths is not None:
        if isinstance(paths.get("dirs"), dict):
            current["dirs"].update(paths["dirs"])
        for k in PATH_TOP_KEYS:
            if k in paths:
                current[k] = paths[k]
    current["project_root"] = _infer_project_root() or current["project_root"]
    p = get_paths_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(current, f, indent=2, ensure_ascii=False)
    return current


def resolve_dir(paths, key, default):
    """把配置中的相对路径解析为绝对路径（相对 project_root）。"""
    dirs = paths.get("dirs", {}) if isinstance(paths, dict) else {}
    value = dirs.get(key)
    if value is None:
        value = paths.get(key) or default  # 兼容平铺结构
    p = Path(value)
    if p.is_absolute():
        return p
    return Path(paths.get("project_root") or "") / p


def _migrate_home_config():
    """首次迁移：家目录旧配置存在时，拆分写入 paths.json + 项目内业务配置。
    返回 True 表示执行了迁移（仅触发一次，随后旧配置不再被读取）。"""
    home_cfg = Path.home() / "autorainbow_config.json"
    if not home_cfg.exists():
        return False
    # 项目内配置已存在则跳过（新配置优先）
    if get_config_path().exists() or get_paths_path().exists():
        return False
    try:
        old = json.loads(home_cfg.read_text(encoding="utf-8"))
    except Exception:
        return False
    if not isinstance(old, dict):
        return False

    # 1) 写 paths.json（路径键）
    paths = {
        "schema_version": 1,
        "project_root": old.get("project_root") or _infer_project_root(),
        "indesign_app_path": old.get("indesign_app_path", ""),
        "dirs": {k: old[k] for k in DEFAULT_DIR_CONFIG if k in old},
    }
    write_paths(paths)

    # 2) 写业务配置（非路径键）
    business = {k: v for k, v in old.items()
                if k not in DEFAULT_DIR_CONFIG and k not in PATH_TOP_KEYS}
    business["_migrated_from_home"] = str(home_cfg)
    cfg_path = get_config_path()
    cfg_path.parent.mkdir(parents=True, exist_ok=True)
    with open(cfg_path, "w", encoding="utf-8") as f:
        json.dump(business, f, indent=2, ensure_ascii=False)
    return True


def _migrate_templates(cfg):
    """从 templates/{id}/config.json 读取板块配置，合并到 cfg['templates']"""
    project_root = Path(cfg.get("project_root", ""))
    templates_dir = resolve_dir(cfg, "templates_dir", "workspace/templates")
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
            cfg_path = get_config_path()
            cfg_path.parent.mkdir(parents=True, exist_ok=True)
            to_write = dict(cfg)
            to_write.pop("dirs", None)  # 路径索引不入业务配置文件
            with open(cfg_path, "w", encoding="utf-8") as f:
                json.dump(to_write, f, indent=2, ensure_ascii=False)
        except Exception:
            pass
    return cfg


def read_config():
    """读取合并配置：paths.json（路径索引）+ 项目内业务配置 + 模板合并。"""
    _migrate_home_config()
    paths = read_paths()
    cfg = DEFAULT_CONFIG.copy()

    # 路径键：从 paths.json 平铺（兼容旧访问方式 cfg["inputs_dir"] 等）
    cfg["project_root"] = paths["project_root"]
    cfg["indesign_app_path"] = paths["indesign_app_path"]
    for k, v in paths["dirs"].items():
        cfg[k] = v
    cfg["dirs"] = dict(paths["dirs"])

    # 业务键：从项目内业务配置
    cfg_path = get_config_path()
    if cfg_path.exists():
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                business = json.load(f)
            for k, v in business.items():
                if k not in DEFAULT_DIR_CONFIG and k != "project_root":
                    cfg[k] = v
        except Exception:
            pass

    if not cfg.get("project_root"):
        cfg["project_root"] = _infer_project_root()
    cfg = _migrate_templates(cfg)
    return cfg


def write_config(cfg):
    """拆分写回：路径键 → paths.json；业务键 → 项目内业务配置。"""
    path_updates = {}
    business_updates = {}
    for k, v in cfg.items():
        if k in PATH_TOP_KEYS:
            path_updates[k] = v
        elif k in DEFAULT_DIR_CONFIG:
            path_updates.setdefault("dirs", {})[k] = v
        elif k == "dirs" and isinstance(v, dict):
            for dk, dv in v.items():
                path_updates.setdefault("dirs", {})[dk] = dv
        else:
            business_updates[k] = v
    if path_updates:
        write_paths(path_updates)

    existing = read_config()
    existing.pop("dirs", None)  # 路径索引不入业务配置文件
    existing.update(business_updates)
    cfg_path = get_config_path()
    cfg_path.parent.mkdir(parents=True, exist_ok=True)
    with open(cfg_path, "w", encoding="utf-8") as f:
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