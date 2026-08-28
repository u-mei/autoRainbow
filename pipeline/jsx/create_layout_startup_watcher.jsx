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
        try {
            return parseES3Json(text);
        } catch (e2) {
            return null;
        }
    }

    function parseES3Json(text) {
        if (typeof JSON !== "undefined" && JSON.parse) {
            return JSON.parse(text);
        }
        var src = String(text || "");
        if (src.charCodeAt(0) === 0xFEFF) {
            src = src.slice(1);
        }
        var pos = 0;
        function skipWs() {
            while (pos < src.length) {
                var c = src.charAt(pos);
                if (c === " " || c === "\t" || c === "\r" || c === "\n") {
                    pos += 1;
                } else {
                    break;
                }
            }
        }
        function fail(msg) {
            throw new Error("JSON 解析失败: " + msg + " (位置 " + pos + ")");
        }
        function parseString() {
            if (src.charAt(pos) !== "\"") {
                fail("期望字符串");
            }
            pos += 1;
            var out = "";
            while (pos < src.length) {
                var ch = src.charAt(pos);
                if (ch === "\"") {
                    pos += 1;
                    return out;
                }
                if (ch === "\\") {
                    pos += 1;
                    var esc = src.charAt(pos);
                    if (esc === "u") {
                        var hex = src.substr(pos + 1, 4);
                        out += String.fromCharCode(parseInt(hex, 16));
                        pos += 5;
                    } else if (esc === "n") {
                        out += "\n";
                        pos += 1;
                    } else if (esc === "t") {
                        out += "\t";
                        pos += 1;
                    } else if (esc === "r") {
                        out += "\r";
                        pos += 1;
                    } else if (esc === "b") {
                        out += "\b";
                        pos += 1;
                    } else if (esc === "f") {
                        out += "\f";
                        pos += 1;
                    } else if (esc === "/") {
                        out += "/";
                        pos += 1;
                    } else if (esc === "\\") {
                        out += "\\";
                        pos += 1;
                    } else if (esc === "\"") {
                        out += "\"";
                        pos += 1;
                    } else {
                        fail("未知转义 \\" + esc);
                    }
                } else {
                    out += ch;
                    pos += 1;
                }
            }
            fail("字符串未闭合");
        }
        function parseNumber() {
            var start = pos;
            if (src.charAt(pos) === "-") {
                pos += 1;
            }
            while (pos < src.length && "0123456789.eE+-".indexOf(src.charAt(pos)) >= 0) {
                pos += 1;
            }
            var numText = src.substring(start, pos);
            var num = Number(numText);
            if (isNaN(num)) {
                fail("非法数字: " + numText);
            }
            return num;
        }
        function parseLiteral(word, value) {
            if (src.substr(pos, word.length) !== word) {
                fail("非法字面量: " + word);
            }
            pos += word.length;
            return value;
        }
        function parseArray() {
            pos += 1;
            var arr = [];
            skipWs();
            if (src.charAt(pos) === "]") {
                pos += 1;
                return arr;
            }
            for (;;) {
                arr.push(parseValue());
                skipWs();
                var c = src.charAt(pos);
                if (c === ",") {
                    pos += 1;
                    continue;
                }
                if (c === "]") {
                    pos += 1;
                    return arr;
                }
                fail("数组期望 , 或 ]");
            }
        }
        function parseObject() {
            pos += 1;
            var obj = {};
            skipWs();
            if (src.charAt(pos) === "}") {
                pos += 1;
                return obj;
            }
            for (;;) {
                skipWs();
                if (src.charAt(pos) !== "\"") {
                    fail("对象键必须是字符串");
                }
                var key = parseString();
                skipWs();
                if (src.charAt(pos) !== ":") {
                    fail("对象期望 :");
                }
                pos += 1;
                obj[key] = parseValue();
                skipWs();
                var c = src.charAt(pos);
                if (c === ",") {
                    pos += 1;
                    continue;
                }
                if (c === "}") {
                    pos += 1;
                    return obj;
                }
                fail("对象期望 , 或 }");
            }
        }
        function parseValue() {
            skipWs();
            var c = src.charAt(pos);
            if (c === "{") {
                return parseObject();
            }
            if (c === "[") {
                return parseArray();
            }
            if (c === "\"") {
                return parseString();
            }
            if (c === "t") {
                return parseLiteral("true", true);
            }
            if (c === "f") {
                return parseLiteral("false", false);
            }
            if (c === "n") {
                return parseLiteral("null", null);
            }
            if (c === "-" || (c >= "0" && c <= "9")) {
                return parseNumber();
            }
            fail("非法值: " + c);
        }
        var result = parseValue();
        skipWs();
        if (pos < src.length) {
            fail("尾部多余内容");
        }
        return result;
    }


    var WATCHER_NAME = "AutoRainbowDispatchWatcher";

    function resolveProjectRoot() {
        // 2026-08-18：不再读家目录配置（~/autorainbow_config.json 等）。
        // 优先使用安装时注入的项目根（install_watcher 写入副本的常量）；
        // 源码直接运行（未安装）时回退到脚本位置反推。
        // 1) 安装注入的项目根
        if (typeof __AUTO_INJECTED_PROJECT_ROOT__ === "string" && __AUTO_INJECTED_PROJECT_ROOT__) {
            var injRoot = Folder(__AUTO_INJECTED_PROJECT_ROOT__);
            if (injRoot.exists && Folder(injRoot.fsName + "/workspace").exists) {
                return injRoot;
            }
        }
        // 2) 尝试从 watcher 脚本位置推算项目根目录（源码运行场景：
        //    pipeline/jsx/create_layout_startup_watcher.jsx → 上溯3级）
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
    var QUEUE_ROOT = Folder(WORKSPACE_ROOT.fsName + "/.runtime/queue");
    var PENDING_DIR = Folder(QUEUE_ROOT.fsName + "/pending");
    var RUNNING_DIR = Folder(QUEUE_ROOT.fsName + "/running");
    var DONE_DIR = Folder(QUEUE_ROOT.fsName + "/done");
    var ERROR_DIR = Folder(QUEUE_ROOT.fsName + "/error");
    var LOG_FILE = File(WORKSPACE_ROOT.fsName + "/.runtime/logs/watcher.log");
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
        // 2026-08-25：投递先写 pending + osascript 加速触发（direct_trigger 标记）。
        // 创建 20s 内跳过 direct_trigger 任务（等 osascript 处理，避免重复排版）；
        // osascript 失败/排队超时后由 watcher 兜底拾取。
        var nowMs = (new Date()).getTime();
        var candidates = [];
        for (var fi = 0; fi < files.length; fi += 1) {
            var f = files[fi];
            var skip = false;
            if (f.modified && (nowMs - f.modified.getTime()) < 20000) {
                try {
                    f.open("r");
                    f.encoding = "UTF-8";
                    var taskText = f.read();
                    f.close();
                    var taskData = safeParseJSON(taskText);
                    if (taskData && taskData.direct_trigger) {
                        skip = true;
                    }
                } catch (eParse) {
                    try { f.close(); } catch (eClose) {}
                }
            }
            if (!skip) {
                candidates.push(f);
            }
        }
        candidates.sort(function (a, b) {
            return a.modified.getTime() - b.modified.getTime();
        });
        return candidates.length > 0 ? candidates[0] : null;
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

    // 2026-08-25：idleTasks 的 ON_IDLE 在 InDesign 忙/后台时触发极慢（实测 ~28s 一次），
    // 加 3s 定时器兜底，保证心跳与任务处理不依赖空闲。
    // $.setInterval 实测不可用，依次尝试 app.setInterval / app.setTimeout 递归（ScriptUI 定时器）。
    var timerOk = false;
    try {
        if (typeof app.setInterval === "function") {
            app.setInterval(handler, 3000);
            timerOk = true;
        }
    } catch (eTimer) {
        writeLog("app.setInterval 不可用: " + formatError(eTimer));
    }
    if (!timerOk) {
        try {
            (function scheduleTimer() {
                app.setTimeout(function () {
                    try { handler(); } catch (eTimer2) { writeLog("定时器兜底异常: " + formatError(eTimer2)); }
                    scheduleTimer();
                }, 3000);
            })();
            timerOk = true;
        } catch (eTimer3) {
            writeLog("定时器兜底不可用，仅 idleTasks: " + formatError(eTimer3));
        }
    }

    ensureFolder(PENDING_DIR);
    ensureFolder(RUNNING_DIR);
    ensureFolder(DONE_DIR);
    ensureFolder(ERROR_DIR);

    writeHeartbeat();
    writeLog("Watcher 已启动");
}());
