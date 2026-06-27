#targetengine "autoRainbowWatcherEngine"

(function () {
    if ($.global.__AUTO_RAINBOW_WATCHER_INSTALLED__) {
        return;
    }
    $.global.__AUTO_RAINBOW_WATCHER_INSTALLED__ = true;

    function safeParseJSON(text) {
        try {
            if (typeof JSON !== "undefined" && JSON.parse) {
                return JSON.parse(text);
            }
        } catch (e1) {}
        return eval("(" + text + ")");
    }

    var WATCHER_NAME = "AutoRainbowDispatchWatcher";

    function resolveProjectRoot() {
        var homeDir = Folder("~");
        var configPaths = [
            homeDir.fsName + "/autorainbow_config.json",
            homeDir.fsName + "/.autorainbow/config.json"
        ];
        for (var p = 0; p < configPaths.length; p++) {
            var configFile = File(configPaths[p]);
            if (configFile.exists) {
                try {
                    if (configFile.open("r")) {
                        configFile.encoding = "UTF-8";
                        var text = configFile.read();
                        configFile.close();
                        if (text.charCodeAt(0) === 0xFEFF) {
                            text = text.slice(1);
                        }
                        var cfg = safeParseJSON(text);
                        if (cfg && cfg.project_root) {
                            var root = Folder(cfg.project_root);
                            if (root.exists) {
                                return root;
                            }
                        }
                    }
                } catch (e) {
                }
            }
        }
        // 回退2：从 ~/autorainbow_project_root.txt 读取项目根（纯文本，非隐藏路径）
        try {
            var rootFile = File(homeDir.fsName + "/autorainbow_project_root.txt");
            if (rootFile.exists) {
                if (rootFile.open("r")) {
                    var rootText = rootFile.read();
                    rootFile.close();
                    rootText = rootText.replace(/\\n|\\r/g, "").trim();
                    if (rootText.length > 0) {
                        var root = Folder(rootText);
                        if (root.exists && Folder(root.fsName + "/workspace").exists) {
                            return root;
                        }
                    }
                }
            }
        } catch (e3) {
        }

        // 回退3：尝试从 watcher 脚本位置推算项目根目录
        try {
            var watcherFile = File($.fileName);
            var watcherDir = watcherFile.parent;
            if (watcherDir && watcherDir.parent) {
                var pipelineDir = watcherDir.parent;
                if (pipelineDir.parent) {
                    var projectRoot = pipelineDir.parent;
                    if (projectRoot.exists && Folder(projectRoot.fsName + "/workspace").exists) {
                        return projectRoot;
                    }
                }
            }
        } catch (e2) {
        }
        return null;
    }

    var PROJECT_ROOT = resolveProjectRoot();
    if (!PROJECT_ROOT) {
        alert("autoRainbow 监听器：未找到项目路径配置。\n请在 autoRainbow 应用的「监听器」页面设置项目根目录。");
        return;
    }

    $.global.__AUTO_RAINBOW_PROJECT_ROOT__ = PROJECT_ROOT.fsName;

    var SCRIPT_DIR = Folder(PROJECT_ROOT.fsName + "/pipeline/jsx");
    var DISPATCH_SCRIPT = File(SCRIPT_DIR.fsName + "/create_layout_dispatch.jsx");
    var WORKSPACE_ROOT = Folder(PROJECT_ROOT.fsName + "/workspace");
    var QUEUE_ROOT = Folder(WORKSPACE_ROOT.fsName + "/B_outputs/queue");
    var PENDING_DIR = Folder(QUEUE_ROOT.fsName + "/pending");
    var RUNNING_DIR = Folder(QUEUE_ROOT.fsName + "/running");
    var DONE_DIR = Folder(QUEUE_ROOT.fsName + "/done");
    var ERROR_DIR = Folder(QUEUE_ROOT.fsName + "/error");
    var LOG_FILE = File(WORKSPACE_ROOT.fsName + "/B_outputs/logs/watcher.log");
    var HEARTBEAT_FILE = File(QUEUE_ROOT.fsName + "/.watcher_heartbeat");
    var lastHeartbeatTime = 0;

    function nowText() {
        var d = new Date();
        var mm = ("0" + (d.getMonth() + 1)).slice(-2);
        var dd = ("0" + d.getDate()).slice(-2);
        var hh = ("0" + d.getHours()).slice(-2);
        var mi = ("0" + d.getMinutes()).slice(-2);
        var ss = ("0" + d.getSeconds()).slice(-2);
        return d.getFullYear() + "-" + mm + "-" + dd + " " + hh + ":" + mi + ":" + ss;
    }

    function ensureFolder(folderObj) {
        if (folderObj.exists) {
            return true;
        }
        if (folderObj.parent && !folderObj.parent.exists) {
            ensureFolder(folderObj.parent);
        }
        return folderObj.create();
    }

    function writeLog(msg) {
        ensureFolder(LOG_FILE.parent);
        if (!LOG_FILE.open("a")) {
            return;
        }
        // 使用 UTF-8 记录日志，便于排错
        LOG_FILE.encoding = "UTF-8";
        LOG_FILE.writeln("[" + nowText() + "] " + msg);
        LOG_FILE.close();
    }

    function writeHeartbeat() {
        var now = new Date().getTime();
        if (now - lastHeartbeatTime < 3000) {
            return;
        }
        lastHeartbeatTime = now;
        ensureFolder(HEARTBEAT_FILE.parent);
        if (!HEARTBEAT_FILE.open("w")) {
            return;
        }
        HEARTBEAT_FILE.encoding = "UTF-8";
        HEARTBEAT_FILE.writeln(String(now));
        HEARTBEAT_FILE.close();
    }

    function formatError(err) {
        if (!err) {
            return "unknown_error";
        }
        var parts = [];
        try {
            parts.push(String(err));
        } catch (e1) {
            parts.push("error_to_string_failed");
        }
        try {
            if (err.number !== undefined) {
                parts.push("number=" + err.number);
            }
        } catch (e2) {
        }
        try {
            if (err.fileName) {
                parts.push("file=" + err.fileName);
            }
        } catch (e3) {
        }
        try {
            if (err.line !== undefined) {
                parts.push("line=" + err.line);
            }
        } catch (e4) {
        }
        try {
            if (err.source) {
                var src = String(err.source);
                if (src.length > 120) {
                    src = src.slice(0, 120) + "...";
                }
                parts.push("source=" + src);
            }
        } catch (e5) {
        }
        return parts.join(" | ");
    }

    function moveFileTo(fileObj, targetFolder) {
        ensureFolder(targetFolder);
        var target = File(targetFolder.fsName + "/" + fileObj.name);
        if (target.exists) {
            var extPos = fileObj.name.lastIndexOf(".");
            var base = extPos > 0 ? fileObj.name.slice(0, extPos) : fileObj.name;
            var ext = extPos > 0 ? fileObj.name.slice(extPos) : "";
            target = File(targetFolder.fsName + "/" + base + "_" + (+new Date()) + ext);
        }
        if (!fileObj.rename(target.name)) {
            var copied = fileObj.copy(target.fsName);
            if (copied) {
                try {
                    fileObj.remove();
                } catch (e1) {
                }
            } else {
                throw new Error("任务文件移动失败: " + fileObj.fsName + " -> " + target.fsName);
            }
        }
        return File(target.fsName);
    }

    function pickOldestTask() {
        ensureFolder(PENDING_DIR);
        var files = PENDING_DIR.getFiles("*.json");
        if (!files || files.length === 0) {
            return null;
        }
        files.sort(function (a, b) {
            return a.modified.getTime() - b.modified.getTime();
        });
        return files[0];
    }

    function processOneTask() {
        if (!DISPATCH_SCRIPT.exists) {
            writeLog("未找到分发脚本: " + DISPATCH_SCRIPT.fsName);
            return;
        }

        var taskFile = pickOldestTask();
        if (!taskFile) {
            return;
        }

        var runningFile = moveFileTo(taskFile, RUNNING_DIR);
        writeLog("开始处理任务: " + runningFile.fsName);

        var progressFile = File(QUEUE_ROOT.fsName + "/progress.json");
        try { if (progressFile.exists) progressFile.remove(); } catch (eClean) {}

        $.global.__AUTO_RAINBOW_RUNNING_TASK_FILE__ = runningFile.fsName;
        try {
            $.evalFile(DISPATCH_SCRIPT);
            var doneFile = moveFileTo(runningFile, DONE_DIR);
            writeLog("任务完成: " + doneFile.fsName);
        } catch (err) {
            writeLog("任务失败: " + runningFile.fsName + " | " + formatError(err));
            try {
                moveFileTo(runningFile, ERROR_DIR);
            } catch (e2) {
                writeLog("任务转移到 error 失败: " + formatError(e2));
            }
        } finally {
            try { delete $.global.__AUTO_RAINBOW_RUNNING_TASK_FILE__; } catch (eClr) {}
            try { if (progressFile.exists) progressFile.remove(); } catch (eClean2) {}
        }
    }

    function clearOldWatcher() {
        var i;
        for (i = app.idleTasks.length - 1; i >= 0; i -= 1) {
            var t = app.idleTasks[i];
            if (t && t.name === WATCHER_NAME) {
                try {
                    t.removeEventListener(IdleEvent.ON_IDLE, $.global.__AUTO_RAINBOW_WATCHER_HANDLER__);
                } catch (e1) {
                }
                try {
                    t.remove();
                } catch (e2) {
                }
            }
        }
    }

    var isProcessing = false;
    var handler = function () {
        if (isProcessing) {
            return;
        }
        isProcessing = true;
        try {
            writeHeartbeat();
            processOneTask();
        } catch (err) {
            writeLog("Watcher 执行异常: " + formatError(err));
        } finally {
            isProcessing = false;
        }
    };

    $.global.__AUTO_RAINBOW_WATCHER_HANDLER__ = handler;

    clearOldWatcher();

    var idleTask = app.idleTasks.add({
        name: WATCHER_NAME,
        sleep: 1000
    });
    idleTask.addEventListener(IdleEvent.ON_IDLE, handler);

    ensureFolder(PENDING_DIR);
    ensureFolder(RUNNING_DIR);
    ensureFolder(DONE_DIR);
    ensureFolder(ERROR_DIR);

    writeHeartbeat();
    writeLog("Watcher 已启动");
}());
