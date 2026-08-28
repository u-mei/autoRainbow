(function () {
    function parseJsonText(text, sourceLabel) {
        var raw = String(text || "");
        if (raw.charCodeAt(0) === 0xFEFF) {
            raw = raw.slice(1);
        }

        try {
            if (typeof JSON !== "undefined" && JSON.parse) {
                return JSON.parse(raw);
            }
        } catch (e1) {
        }
        try {
            return parseES3Json(raw);
        } catch (e2) {
            var preview = raw.slice(0, 180).replace(/\r/g, "\\r").replace(/\n/g, "\\n");
            throw new Error("JSON解析失败: " + sourceLabel + "；错误=" + e2 + "；片段=" + preview);
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

    function stringifyJsonText(obj, pretty) {
        try {
            if (typeof JSON !== "undefined" && JSON.stringify) {
                return pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
            }
        } catch (e) {}

        function quoteString(value) {
            return '"' + String(value)
                .replace(/\\/g, "\\\\")
                .replace(/"/g, '\\"')
                .replace(/\r/g, "\\r")
                .replace(/\n/g, "\\n")
                .replace(/\t/g, "\\t") + '"';
        }

        function encode(value, level) {
            var i, k, keys, parts, indent, childIndent;
            if (value === null || value === undefined) {
                return "null";
            }
            if (typeof value === "string") {
                return quoteString(value);
            }
            if (typeof value === "number" || typeof value === "boolean") {
                return String(value);
            }
            if (value instanceof Array) {
                parts = [];
                for (i = 0; i < value.length; i += 1) {
                    parts.push(encode(value[i], level + 1));
                }
                if (!pretty) {
                    return "[" + parts.join(",") + "]";
                }
                indent = new Array(level + 1).join("  ");
                childIndent = new Array(level + 2).join("  ");
                return parts.length ? "[\n" + childIndent + parts.join(",\n" + childIndent) + "\n" + indent + "]" : "[]";
            }
            if (typeof value === "object") {
                parts = [];
                keys = [];
                for (k in value) {
                    if (value.hasOwnProperty(k)) {
                        keys.push(k);
                    }
                }
                for (i = 0; i < keys.length; i += 1) {
                    k = keys[i];
                    parts.push(quoteString(k) + (pretty ? ": " : ":") + encode(value[k], level + 1));
                }
                if (!pretty) {
                    return "{" + parts.join(",") + "}";
                }
                indent = new Array(level + 1).join("  ");
                childIndent = new Array(level + 2).join("  ");
                return parts.length ? "{\n" + childIndent + parts.join(",\n" + childIndent) + "\n" + indent + "}" : "{}";
            }
            return quoteString(String(value));
        }

        return encode(obj, 0);
    }

    function resolveFile(baseFolder, pathText) {
        if (!pathText) {
            throw new Error("路径不能为空");
        }
        if (pathText.indexOf("/") === 0) {
            return File(pathText);
        }
        if (pathText.length > 2 && pathText.charAt(1) === ":" && (pathText.charAt(2) === "\\" || pathText.charAt(2) === "/")) {
            return File(pathText);
        }
        return File(baseFolder.fsName + "/" + pathText);
    }

    function readJsonFile(fileObj) {
        if (!fileObj.exists) {
            throw new Error("文件不存在: " + fileObj.fsName);
        }

        if (!fileObj.open("r")) {
            throw new Error("文件打开失败: " + fileObj.fsName);
        }

        fileObj.encoding = "UTF-8";
        var content = fileObj.read();
        fileObj.close();
        return parseJsonText(content, fileObj.fsName);
    }

    function ensureFolderExists(folderObj) {
        if (!folderObj || folderObj.exists) {
            return true;
        }

        if (folderObj.parent && !folderObj.parent.exists) {
            if (!ensureFolderExists(folderObj.parent)) {
                return false;
            }
        }

        return folderObj.create();
    }

    function writeTextFile(fileObj, textValue) {
        if (!ensureFolderExists(fileObj.parent)) {
            return;
        }

        if (!fileObj.open("w")) {
            return;
        }

        fileObj.encoding = "UTF-8";
        fileObj.write(textValue);
        fileObj.close();
    }

    function nowText() {
        var d = new Date();
        var mm = ("0" + (d.getMonth() + 1)).slice(-2);
        var dd = ("0" + d.getDate()).slice(-2);
        var hh = ("0" + d.getHours()).slice(-2);
        var mi = ("0" + d.getMinutes()).slice(-2);
        var ss = ("0" + d.getSeconds()).slice(-2);
        return d.getFullYear() + "-" + mm + "-" + dd + " " + hh + ":" + mi + ":" + ss;
    }

    function pushLog(logs, msg) {
        logs.push("[" + nowText() + "] " + msg);
    }

    function sanitizeFileNamePart(nameText) {
        var text = String(nameText || "");
        var invalidChars = ["\\", "/", ":", "*", "?", "\"", "<", ">", "|"];
        var i;
        for (i = 0; i < invalidChars.length; i += 1) {
            var ch = invalidChars[i];
            while (text.indexOf(ch) >= 0) {
                text = text.split(ch).join("_");
            }
        }

        // 手工 trim，避免正则在老版本 ExtendScript 上的兼容问题
        while (text.length > 0 && (text.charAt(0) === " " || text.charAt(0) === "\t" || text.charAt(0) === "\r" || text.charAt(0) === "\n")) {
            text = text.substring(1);
        }
        while (text.length > 0 && (text.charAt(text.length - 1) === " " || text.charAt(text.length - 1) === "\t" || text.charAt(text.length - 1) === "\r" || text.charAt(text.length - 1) === "\n")) {
            text = text.substring(0, text.length - 1);
        }

        if (!text) {
            text = "unnamed";
        }
        return text;
    }

    function timestampText() {
        var d = new Date();
        var mm = ("0" + (d.getMonth() + 1)).slice(-2);
        var dd = ("0" + d.getDate()).slice(-2);
        var hh = ("0" + d.getHours()).slice(-2);
        var mi = ("0" + d.getMinutes()).slice(-2);
        var ss = ("0" + d.getSeconds()).slice(-2);
        return d.getFullYear() + mm + dd + "_" + hh + mi + ss;
    }

    function normalizeLayoutMode(modeText) {
        var raw = String(modeText || "");
        var key = raw.toLowerCase();
        key = key.replace(/^\s+|\s+$/g, "");

        if (!key || key === "templatea" || key === "legacy" || key === "default" || key === "old_rule") {
            return "templateA";
        }
        if (key === "a" || key === "templateb") {
            return "templateB";
        }
        if (key === "b" || key === "templatec") {
            return "templateC";
        }
        if (key === "c" || key === "templated") {
            return "templateD";
        }

        return String(modeText);
    }

    function defaultScriptByMode(layoutMode) {
        if (layoutMode === "templateA") {
            return "create_layout_templateA.jsx";
        }
        if (layoutMode === "templateB") {
            return "create_layout_templateB.jsx";
        }
        if (layoutMode === "templateC") {
            return "create_layout_templateC.jsx";
        }
        if (layoutMode === "templateD") {
            return "create_layout_templateD.jsx";
        }
        return "create_layout_templateA.jsx";
    }

    function collectWorkspaceOutputJsonFiles(folderObj, list) {
        var entries = folderObj.getFiles();
        var i;

        for (i = 0; i < entries.length; i += 1) {
            var entry = entries[i];
            if (entry instanceof Folder) {
                if (entry.name && entry.name.indexOf("_legacy_") === 0) {
                    continue;
                }
                collectWorkspaceOutputJsonFiles(entry, list);
            } else if (entry instanceof File) {
                if (String(entry.name).toLowerCase() === "output.json") {
                    list.push(entry);
                }
            }
        }
    }

    function collectCacheJsonFiles(cacheFolder, list) {
        var entries = cacheFolder.getFiles("*.json");
        var i;
        for (i = 0; i < entries.length; i += 1) {
            if (entries[i] instanceof File) {
                list.push(entries[i]);
            }
        }
    }

    function resolveDispatchProjectRoot() {
        // 2026-08-18：不再读家目录配置。优先级：
        // 1) watcher 设置的全局常量（副本自带项目根，见 install_watcher 注入）
        // 2) 安装注入常量（直接复制副本运行时）
        // 3) 脚本位置反推：pipeline/jsx/create_layout_dispatch.jsx → 上溯3级
        if (typeof $.global.__AUTO_RAINBOW_PROJECT_ROOT__ === "string" && $.global.__AUTO_RAINBOW_PROJECT_ROOT__) {
            var gRoot = Folder($.global.__AUTO_RAINBOW_PROJECT_ROOT__);
            if (gRoot.exists && Folder(gRoot.fsName + "/workspace").exists) {
                return gRoot.fsName;
            }
        }
        if (typeof __AUTO_INJECTED_PROJECT_ROOT__ === "string" && __AUTO_INJECTED_PROJECT_ROOT__) {
            var iRoot = Folder(__AUTO_INJECTED_PROJECT_ROOT__);
            if (iRoot.exists && Folder(iRoot.fsName + "/workspace").exists) {
                return iRoot.fsName;
            }
        }
        try {
            var scriptFile = File($.fileName);
            var scriptDir = scriptFile.parent;         // pipeline/jsx
            if (scriptDir && scriptDir.parent && scriptDir.parent.parent) {
                var projectRootDir = scriptDir.parent.parent;  // 项目根
                if (projectRootDir.exists && Folder(projectRootDir.fsName + "/workspace").exists) {
                    return projectRootDir.fsName;
                }
            }
        } catch (e) {
        }
        return "";
    }

    function collectConfigCandidates(baseFolder, activeDoc) {
        var candidates = [];
        var seen = {};
        var roots = [];
        var i;

        // 最高优先级：统一路径索引 + 项目内业务配置
        // （不再读家目录 ~/autorainbow_config.json / ~/.autorainbow/config.json）
        var projectRoot = resolveDispatchProjectRoot();
        if (projectRoot) {
            var cfgPaths = [
                projectRoot + "/workspace/.runtime/autorainbow_config.json",
                projectRoot + "/workspace/templates/config.json"
            ];
            for (var k = 0; k < cfgPaths.length; k += 1) {
                if (!seen[cfgPaths[k]]) {
                    seen[cfgPaths[k]] = true;
                    candidates.push(File(cfgPaths[k]));
                }
            }
        }

        roots.push(baseFolder);

        if (activeDoc && activeDoc.saved && activeDoc.fullName && activeDoc.fullName.parent) {
            roots.push(activeDoc.fullName.parent);
        }

        for (i = 0; i < roots.length; i += 1) {
            var root = roots[i];
            var current = root;
            var guard = 0;
            while (current && guard < 10) {
                var paths = [
                    current.fsName + "/workspace/templates/config.json",
                    current.fsName + "/workspace/config.json",
                    current.fsName + "/D/templates/config.json",
                    current.fsName + "/D/config.json",
                    current.fsName + "/templates/config.json",
                    current.fsName + "/config.json"
                ];
                var j;
                for (j = 0; j < paths.length; j += 1) {
                    if (!seen[paths[j]]) {
                        seen[paths[j]] = true;
                        candidates.push(File(paths[j]));
                    }
                }
                if (!current.parent || current.parent.fsName === current.fsName) {
                    break;
                }
                current = current.parent;
                guard += 1;
            }
        }

        return candidates;
    }

    function getConfigFile(baseFolder, activeDoc) {
        var candidates = collectConfigCandidates(baseFolder, activeDoc);
        var i;

        for (i = 0; i < candidates.length; i += 1) {
            if (candidates[i].exists) {
                return candidates[i];
            }
        }

        var tried = [];
        for (i = 0; i < candidates.length; i += 1) {
            tried.push(candidates[i].fsName);
        }
        throw new Error("未找到配置文件，已尝试: " + tried.join(", "));
    }

    function getProjectRootFromConfig(configFile) {
        var parentFolder = configFile.parent;
        if (parentFolder && parentFolder.name === "templates") {
            return parentFolder.parent;
        }
        return parentFolder;
    }

    function resolveTemplateScriptFile(layoutScriptText, projectRoot, scriptFolder) {
        var candidates = [];

        if (layoutScriptText) {
            if (layoutScriptText.indexOf("/") === 0 || (layoutScriptText.length > 2 && layoutScriptText.charAt(1) === ":")) {
                candidates.push(File(layoutScriptText));
            }
            candidates.push(File(projectRoot.fsName + "/" + layoutScriptText));
            if (projectRoot.parent) {
                candidates.push(File(projectRoot.parent.fsName + "/" + layoutScriptText));
            }
            candidates.push(File(scriptFolder.fsName + "/" + layoutScriptText));
        }

        var i;
        for (i = 0; i < candidates.length; i += 1) {
            if (candidates[i] && candidates[i].exists) {
                return candidates[i];
            }
        }

        throw new Error("未找到模板脚本: " + layoutScriptText);
    }

    function findTemplateInddFile(templateFolder) {
        var entries = templateFolder.getFiles("*.indd");
        if (!entries || entries.length === 0) {
            throw new Error("模板目录未找到 .indd 文件: " + templateFolder.fsName);
        }
        if (entries.length > 1) {
            throw new Error("模板目录存在多个 .indd，期望唯一: " + templateFolder.fsName);
        }
        return entries[0];
    }

    function buildOutputInddPath(outputJsonFile, records) {
        var docName = null;
        var sectionName = null;

        if (records && records.length > 0) {
            docName = String(records[0].doc_name || "");
            sectionName = String(records[0].section_name || "");
        }

        if (!docName) {
            docName = outputJsonFile.parent.name;
        }

        var baseName = sanitizeFileNamePart(docName.replace(/\.[^.]+$/, ""));
        var sectionPart = sanitizeFileNamePart(sectionName || "output");

        // 2026-08-16 新结构：成品平铺到 outputs/done/{板块}_{名}.indd（无板块层级、无时间戳）
        var doneRoot = null;
        if ($.global.__AUTO_RAINBOW_PROJECT_ROOT__) {
            doneRoot = Folder($.global.__AUTO_RAINBOW_PROJECT_ROOT__ + "/workspace/outputs/done");
        }
        if (!doneRoot || !doneRoot.exists) {
            doneRoot = Folder(outputJsonFile.fsName.split("/work/caches/")[0] + "/outputs/done");
        }
        if (!doneRoot.exists) { doneRoot.create(); }

        var outputFile = File(doneRoot.fsName + "/" + sectionPart + "_" + baseName + ".indd");
        return outputFile;
    }

    function removeExistingOutputIndd(outputFile) {
        if (!outputFile || !outputFile.exists) {
            return false;
        }
        if (!outputFile.remove()) {
            throw new Error("无法删除旧导出文件，请确认文件未在 InDesign 或 Finder 中打开: " + outputFile.fsName);
        }
        return true;
    }

    function clearPipelineArgs() {
        // 删除参数文件
        try {
            var paramsFile = getPipelineParamsFile();
            if (paramsFile.exists) {
                paramsFile.remove();
            }
        } catch (e1) {
        }
    }

    function getPipelineParamsFile() {
        // 参数文件放在 JSX 脚本同目录
        var scriptFile = File($.fileName);
        var scriptFolder = scriptFile.parent;
        return File(scriptFolder.fsName + "/_pipeline_params.json");
    }

    function writePipelineParams(params) {
        var paramsFile = getPipelineParamsFile();
        if (!paramsFile.open("w")) {
            throw new Error("无法创建参数文件: " + paramsFile.fsName);
        }
        paramsFile.encoding = "UTF-8";
        paramsFile.write(stringifyJsonText(params, true));
        paramsFile.close();
    }

    function getActiveDocumentSafe() {
        try {
            if (app.documents && app.documents.length > 0) {
                try {
                    return app.activeDocument;
                } catch (e1) {
                    return app.documents[0];
                }
            }
        } catch (e2) {
        }
        return null;
    }

    function createProgressUi(totalCount) {
        var ui = {
            win: null,
            statusText: null,
            countText: null,
            bar: null,
            total: Math.max(0, Number(totalCount) || 0)
        };

        try {
            var win = new Window("palette", "自动排版进度");
            win.orientation = "column";
            win.alignChildren = ["fill", "top"];
            win.spacing = 8;
            win.margins = 12;

            var title = win.add("statictext", undefined, "准备开始...");
            title.characters = 48;
            ui.statusText = title;

            var count = win.add("statictext", undefined, "0 / " + ui.total);
            ui.countText = count;

            var bar = win.add("progressbar", undefined, 0, Math.max(1, ui.total));
            bar.preferredSize.width = 420;
            bar.value = 0;
            ui.bar = bar;

            win.show();
            ui.win = win;
        } catch (e1) {
        }

        return ui;
    }

    function updateProgressUi(ui, doneCount, statusText) {
        if (!ui) {
            return;
        }
        var done = Math.max(0, Number(doneCount) || 0);
        var total = Math.max(0, Number(ui.total) || 0);

        try {
            if (ui.countText) {
                ui.countText.text = done + " / " + total;
            }
            if (ui.statusText && statusText !== undefined) {
                ui.statusText.text = String(statusText);
            }
            if (ui.bar) {
                ui.bar.maxvalue = Math.max(1, total);
                ui.bar.value = Math.min(done, Math.max(1, total));
            }
            if (ui.win) {
                ui.win.update();
            }
        } catch (e1) {
        }
    }

    function closeProgressUi(ui) {
        try {
            if (ui && ui.win) {
                ui.win.close();
            }
        } catch (e1) {
        }
    }

    function runWithBatchInteractionPolicy(runFn) {
        var hasOldLevel = false;
        var oldLevel = null;
        var hasOldCheckLinksAtOpen = false;
        var oldCheckLinksAtOpen = null;

        try {
            if (app.scriptPreferences && app.scriptPreferences.userInteractionLevel !== undefined) {
                oldLevel = app.scriptPreferences.userInteractionLevel;
                hasOldLevel = true;
                app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;
            }
        } catch (e1) {
        }

        try {
            if (app.linkingPreferences && app.linkingPreferences.checkLinksAtOpen !== undefined) {
                oldCheckLinksAtOpen = app.linkingPreferences.checkLinksAtOpen;
                hasOldCheckLinksAtOpen = true;
                app.linkingPreferences.checkLinksAtOpen = false;
            }
        } catch (e2) {
        }

        try {
            return runFn();
        } finally {
            try {
                if (hasOldCheckLinksAtOpen) {
                    app.linkingPreferences.checkLinksAtOpen = oldCheckLinksAtOpen;
                }
            } catch (e3) {
            }
            try {
                if (hasOldLevel) {
                    app.scriptPreferences.userInteractionLevel = oldLevel;
                }
            } catch (e4) {
            }
        }
    }

    function isNormalLinkStatus(linkObj) {
        try {
            if (linkObj.status === LinkStatus.NORMAL) {
                return true;
            }
        } catch (e1) {
        }
        return false;
    }

    function updateOutdatedLinksQuietly(docObj, logs, labelText) {
        if (!docObj || !docObj.isValid || !docObj.links) {
            return;
        }

        var total = 0;
        var updated = 0;
        var skippedNormal = 0;
        var failed = 0;

        var i;
        for (i = 0; i < docObj.links.length; i += 1) {
            var oneLink = docObj.links[i];
            if (!oneLink || !oneLink.isValid) {
                continue;
            }
            total += 1;

            if (isNormalLinkStatus(oneLink)) {
                skippedNormal += 1;
                continue;
            }

            try {
                oneLink.update();
                updated += 1;
            } catch (e1) {
                failed += 1;
                try {
                    pushLog(logs, "链接更新失败: file=" + (oneLink.filePath || oneLink.name || "?") + " 错误=" + e1);
                } catch (eLog) {
                }
            }
        }

        pushLog(
            logs,
            "链接自动更新(" + labelText + "): total=" + total +
            " updated=" + updated +
            " skipped_normal=" + skippedNormal +
            " failed=" + failed
        );
    }

    function appendLogText(fileObj, newText) {
        var existing = "";
        if (fileObj.exists) {
            if (fileObj.open("r")) {
                fileObj.encoding = "UTF-8";
                existing = fileObj.read();
                fileObj.close();
            }
        }
        if (!ensureFolderExists(fileObj.parent)) {
            return;
        }
        if (!fileObj.open("w")) {
            return;
        }
        fileObj.encoding = "UTF-8";
        if (existing) {
            fileObj.write(existing + "\n");
        }
        fileObj.write(newText);
        fileObj.close();
    }

    function writeProgress(progressData) {
        try {
            var queueRoot = "";
            // 优先使用 watcher 设置的全局变量（副本自带项目根）
            if (typeof $.global.__AUTO_RAINBOW_PROJECT_ROOT__ === "string" && $.global.__AUTO_RAINBOW_PROJECT_ROOT__) {
                var candidate = $.global.__AUTO_RAINBOW_PROJECT_ROOT__ + "/workspace/.runtime/queue";
                if (Folder(candidate).exists) {
                    queueRoot = candidate;
                }
            }
            // 回退：统一路径索引（workspace/.runtime/paths.json）
            if (!queueRoot) {
                var projRoot = resolveDispatchProjectRoot();
                if (projRoot) {
                    var fallback = projRoot + "/workspace/.runtime/queue";
                    if (Folder(fallback).exists) {
                        queueRoot = fallback;
                    }
                }
            }
            // 回退：从脚本位置推算
            if (!queueRoot) {
                try {
                    var scriptFile = File($.fileName);
                    var scriptDir = scriptFile.parent;
                    if (scriptDir && scriptDir.parent && scriptDir.parent.parent) {
                        var projectRoot = scriptDir.parent.parent.fsName;
                        var fallback2 = projectRoot + "/workspace/.runtime/queue";
                        if (Folder(fallback2).exists) {
                            queueRoot = fallback2;
                        }
                    }
                } catch (e2) {
                }
            }
            if (!queueRoot) return;
            var pf = File(queueRoot + "/progress.json");
            if (!pf.open("w")) return;
            pf.encoding = "UTF-8";
            pf.write(stringifyJsonText(progressData, false));
            pf.close();
        } catch (e) {}
    }

    function writeTaskResults(taskFilePath, resultData) {
        try {
            if (!taskFilePath) {
                return;
            }
            var taskFile = File(taskFilePath);
            if (!taskFile.exists) {
                return;
            }
            var data = readJsonFile(taskFile);
            data.completed_at = nowText();
            data.status = resultData.status || "done";
            data.ok = resultData.ok || 0;
            data.fail = resultData.fail || 0;
            data.results = resultData.results || [];
            if (resultData.task_id && !data.task_id) {
                data.task_id = resultData.task_id;
            }
            writeTextFile(taskFile, stringifyJsonText(data, true));
        } catch (e) {}
    }

    function fileStemFromPath(pathText) {
        var name = String(pathText || "");
        var slash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
        if (slash >= 0) {
            name = name.slice(slash + 1);
        }
        var dot = name.lastIndexOf(".");
        return dot > 0 ? name.slice(0, dot) : name;
    }

    function copyTaskFileToQueueDir(taskFilePath, projectRoot, dirName) {
        if (!taskFilePath || !projectRoot) {
            return "";
        }
        var src = File(taskFilePath);
        if (!src.exists) {
            return "";
        }
        var dir = Folder(projectRoot + "/workspace/.runtime/queue/" + dirName);
        if (!ensureFolderExists(dir)) {
            return "";
        }
        var target = File(dir.fsName + "/" + src.name);
        if (target.exists) {
            try { target.remove(); } catch (e0) {}
        }
        if (!src.copy(target.fsName)) {
            return "";
        }
        try { src.remove(); } catch (e1) {}
        return target.fsName;
    }

    function removeQueueProgress(projectRoot) {
        try {
            var progressFile = File(projectRoot + "/workspace/.runtime/queue/progress.json");
            if (progressFile.exists) {
                progressFile.remove();
            }
        } catch (e) {}
    }

    function main() {
        var logs = [];
        pushLog(logs, "开始执行分发排版");
        var progressUi = null;
        var isBatchMode = !!(typeof $.global !== "undefined" && $.global.__AUTO_RAINBOW_WATCHER_INSTALLED__);
        var runningTaskFile = "";
        var runningTaskId = "";
        var runningTaskDirect = false;

        try {
            // 2026-08-18：不再读家目录配置。项目根由
            // resolveDispatchProjectRoot() 解析（全局注入 / 脚本位置反推），
            // 目录路径从统一路径索引 workspace/.runtime/paths.json 读取，
            // 业务配置从 workspace/.runtime/autorainbow_config.json 读取。
            var scriptFile = File($.fileName);
            var scriptFolder = scriptFile.parent;
            var projectRoot = resolveDispatchProjectRoot();
            if (!projectRoot) {
                throw new Error("未找到项目根目录（无 watcher 全局、无注入常量、脚本位置反推失败）");
            }
            $.global.__AUTO_RAINBOW_PROJECT_ROOT__ = projectRoot;

            var mergedCfg = {};
            var pathsCfg = {};
            var pathsFile = File(projectRoot + "/workspace/.runtime/paths.json");
            if (pathsFile.exists) {
                try {
                    pathsCfg = readJsonFile(pathsFile);
                } catch (ePaths) {
                    pathsCfg = {};
                }
            }
            var mergedCfgFile = File(projectRoot + "/workspace/.runtime/autorainbow_config.json");
            if (mergedCfgFile.exists) {
                try {
                    mergedCfg = readJsonFile(mergedCfgFile);
                } catch (eCfg) {
                    mergedCfg = {};
                }
            }
            // 统一路径索引的 dirs 平铺进配置，供各模板脚本使用
            (function mergeDirs(src) {
                for (var dk in src) {
                    if (src.hasOwnProperty(dk)) {
                        mergedCfg[dk] = src[dk];
                    }
                }
            })(pathsCfg.dirs || {});
            if (pathsCfg.project_root) {
                mergedCfg.project_root = pathsCfg.project_root;
            }
            if (!mergedCfg.project_root) {
                mergedCfg.project_root = projectRoot;
            }

            var diagFile = File(projectRoot + "/workspace/.runtime/logs/dispatch_debug.log");
            writeTextFile(diagFile, "[" + nowText() + "] dispatch started, projectRoot=" + projectRoot + "\n");

            var templatesRootPath = mergedCfg.templates_dir || mergedCfg.templates_root_dir || "workspace/templates";
            var templatesRoot = Folder(resolveFile(Folder(projectRoot), templatesRootPath).fsName);
            if (!templatesRoot.exists) {
                throw new Error("模板根目录不存在: " + templatesRoot.fsName);
            }

            var workspacePath = mergedCfg.outputs_dir || mergedCfg.doc_workspace_dir || "workspace/outputs";
            var workspaceFolder = Folder(resolveFile(Folder(projectRoot), workspacePath).fsName);
            if (!workspaceFolder.exists) {
                throw new Error("文档输出目录不存在: " + workspaceFolder.fsName);
            }

            var outputJsonFiles = [];
            
            // 读取任务文件，获取本次要处理的文件列表
            var taskFiles = null;
            var runningTaskFileFromGlobal = $.global.__AUTO_RAINBOW_RUNNING_TASK_FILE__;
            if (runningTaskFileFromGlobal) {
                runningTaskFile = runningTaskFileFromGlobal;
            }
            if (!runningTaskFile) {
                // 从 _pipeline_params.json 读取（直接调用时使用）
                try {
                    var scriptFile = File($.fileName);
                    var paramsFile = File(scriptFile.parent.fsName + "/_pipeline_params.json");
                    if (paramsFile.exists) {
                        var pData = readJsonFile(paramsFile);
                        if (pData.pipeline_task_file) {
                            runningTaskFile = pData.pipeline_task_file;
                        }
                        runningTaskDirect = String(pData.pipeline_direct_task || "") === "1";
                        if (pData.pipeline_task_id) {
                            runningTaskId = String(pData.pipeline_task_id);
                        }
                        if (runningTaskDirect) {
                            $.global.__AUTO_RAINBOW_DIRECT_TASK_FILE__ = runningTaskFile;
                        }
                    }
                } catch (e) {}
            }
            if (runningTaskFile) {
                try {
                    var taskFileObj = File(runningTaskFile);
                    if (taskFileObj.exists) {
                        var taskData = readJsonFile(taskFileObj);
                        if (!runningTaskId) {
                            runningTaskId = String(taskData.task_id || fileStemFromPath(runningTaskFile));
                        }
                        if (taskData.files && taskData.files instanceof Array) {
                            taskFiles = taskData.files;
                        }
                    }
                } catch (e) {}
            }
            if (runningTaskDirect) {
                // 浏览器手动点击“开始处理”时保留 InDesign 进度窗和完成弹窗；
                // watcher 自动捡 pending 任务时仍走静默批处理。
                isBatchMode = false;
            }
            
            if (taskFiles && taskFiles.length > 0) {
                // 只处理任务文件中指定的文件
                for (var ti = 0; ti < taskFiles.length; ti++) {
                    var f = File(taskFiles[ti]);
                    if (f.exists) {
                        outputJsonFiles.push(f);
                    }
                }
                appendLogText(diagFile, "[" + nowText() + "] using task file list: " + taskFiles.length + " files\n");
            } else {
                throw new Error("缺少有效任务文件列表，已停止以避免扫描全部缓存");
            }
            
            outputJsonFiles.sort(function (a, b) {
                if (a.fsName < b.fsName) {
                    return -1;
                }
                if (a.fsName > b.fsName) {
                    return 1;
                }
                return 0;
            });

            if (outputJsonFiles.length === 0) {
                throw new Error("未发现任何 output.json: " + workspaceFolder.fsName);
            }

            var diagMsg = "[" + nowText() + "] found " + outputJsonFiles.length + " output.json files\n";
            for (var dbg = 0; dbg < outputJsonFiles.length; dbg++) {
                diagMsg += "  - " + outputJsonFiles[dbg].fsName + "\n";
            }
            appendLogText(diagFile, diagMsg);

            if (!isBatchMode) {
                progressUi = createProgressUi(outputJsonFiles.length);
                updateProgressUi(progressUi, 0, "开始分发...");
            }

            var progressTotal = outputJsonFiles.length;
            var progressResults = [];

            var okCount = 0;
            var failCount = 0;
            var generatedInddPaths = [];

            var i;
            for (i = 0; i < outputJsonFiles.length; i += 1) {
                var oneOutputJson = outputJsonFiles[i];
                var progressDocName = oneOutputJson.parent ? oneOutputJson.parent.name : oneOutputJson.name;
                writeProgress({
                    task_id: runningTaskId,
                    task_path: runningTaskFile,
                    total: progressTotal,
                    current: i + 1,
                    current_doc: progressDocName,
                    status: "processing",
                    ok: okCount,
                    fail: failCount,
                    results: progressResults
                });
                updateProgressUi(progressUi, i, "处理中: " + oneOutputJson.name);
                try {
                    var records = readJsonFile(oneOutputJson);
                    if (!(records instanceof Array) || records.length === 0) {
                        throw new Error("记录为空或格式错误: " + oneOutputJson.fsName);
                    }

                var first = records[0];
                var templateId = String(first.template_id || "");
                if (!templateId) {
                    throw new Error("记录缺少 template_id: " + oneOutputJson.fsName);
                }

                var templateFolder = Folder(templatesRoot.fsName + "/" + templateId);
                if (!templateFolder.exists) {
                    throw new Error("模板目录不存在: " + templateFolder.fsName);
                }

                var templateCfg = mergedCfg.templates && mergedCfg.templates[templateId];
                if (!templateCfg) {
                    throw new Error("模板配置不存在: " + templateId);
                }
                var layoutMode = normalizeLayoutMode(templateCfg.layout_mode);
                var layoutScriptName = templateCfg.layout_script || defaultScriptByMode(layoutMode);
                var layoutScriptFile = resolveTemplateScriptFile(layoutScriptName, Folder(projectRoot), scriptFolder);
                var templateInddFile = findTemplateInddFile(templateFolder);
                var outputInddFile = buildOutputInddPath(oneOutputJson, records);
                var removedOldOutput = removeExistingOutputIndd(outputInddFile);

                pushLog(logs, "开始处理: " + oneOutputJson.fsName);
                pushLog(logs, "模板: " + templateId + "，mode=" + layoutMode + "，脚本=" + layoutScriptFile.fsName);
                pushLog(logs, "输出: " + outputInddFile.fsName);
                if (removedOldOutput) {
                    pushLog(logs, "已删除旧导出: " + outputInddFile.fsName);
                }

                appendLogText(diagFile, "[" + nowText() + "] processing: " + oneOutputJson.name + "\n  templateId=" + templateId + " mode=" + layoutMode + "\n  script=" + layoutScriptFile.fsName + "\n  templateIndd=" + templateInddFile.fsName + "\n  outputIndd=" + outputInddFile.fsName + "\n");

                clearPipelineArgs();
                writePipelineParams({
                    pipeline_batch_mode: "1",
                    pipeline_input_json: oneOutputJson.fsName,
                    pipeline_output_indd: outputInddFile.fsName,
                    pipeline_target_template_id: templateId,
                    pipeline_template_indd: templateInddFile.fsName,
                    pipeline_config_path: mergedCfgFile.fsName
                });

                    var doc = null;
                    runWithBatchInteractionPolicy(function () {
                        try {
                            doc = app.open(templateInddFile);
                        } catch (eOpen) {
                            throw new Error("打开模板失败: " + templateInddFile.fsName + "；错误=" + eOpen);
                        }
                        if (!doc || !doc.isValid) {
                            throw new Error("模板打开后文档无效: " + templateInddFile.fsName);
                        }
                        pushLog(logs, "模板已打开: " + templateInddFile.fsName + " 页数=" + doc.pages.length);

                        updateOutdatedLinksQuietly(doc, logs, "打开模板后");
                        pushLog(logs, "开始执行排版脚本: " + layoutScriptFile.fsName);
                        $.evalFile(layoutScriptFile);
                        pushLog(logs, "排版脚本执行完成: " + layoutScriptFile.fsName);
                    });

                if (!outputInddFile.exists) {
                    throw new Error("脚本执行后未生成 INDD: " + outputInddFile.fsName);
                }

                // 若脚本未主动关闭文档，这里兜底关闭
                try {
                    if (doc && doc.isValid) {
                        doc.close(SaveOptions.NO);
                    }
                } catch (eClose) {
                }

                    okCount += 1;
                    progressResults.push({
                        doc: progressDocName,
                        cache_path: oneOutputJson.fsName,
                        output_path: outputInddFile.fsName,
                        status: "done"
                    });
                    generatedInddPaths.push(outputInddFile.fsName);
                    pushLog(logs, "完成: " + outputInddFile.fsName);
                } catch (eOne) {
                    failCount += 1;
                    progressResults.push({
                        doc: progressDocName,
                        cache_path: oneOutputJson.fsName,
                        status: "fail",
                        error: String(eOne).slice(0, 200)
                    });
                    pushLog(logs, "失败: " + oneOutputJson.fsName + "，错误=" + eOne);

                    appendLogText(diagFile, "[" + nowText() + "] DOC FAIL: " + oneOutputJson.fsName + "\n  error: " + String(eOne).slice(0, 300) + "\n");

                // 失败场景兜底关闭当前活动文档，避免锁模板
                    try {
                        if (app.documents.length > 0) {
                            getActiveDocumentSafe().close(SaveOptions.NO);
                        }
                    } catch (eClose2) {
                    }
                } finally {
                    clearPipelineArgs();
                    updateProgressUi(
                        progressUi,
                        i + 1,
                        "已完成: " + (i + 1) + "/" + outputJsonFiles.length + "（成功" + okCount + "，失败" + failCount + "）"
                    );
                }
            }

            writeProgress({
                task_id: runningTaskId,
                task_path: runningTaskFile,
                total: progressTotal,
                current: progressTotal,
                current_doc: "",
                status: "done",
                ok: okCount,
                fail: failCount,
                results: progressResults
            });

            // 2026-08-16：logs_dir 配置已是 workspace/.runtime/logs（勿再拼 /logs/）
            var dispatchLogPath = mergedCfg.dispatch_log_file || (mergedCfg.logs_dir || "workspace/.runtime/logs") + "/dispatch.log";
            var dispatchLogFile = resolveFile(Folder(projectRoot), dispatchLogPath);
            pushLog(logs, "成功:" + okCount + " 失败:" + failCount);
            appendLogText(dispatchLogFile, logs.join("\n"));
            writeTaskResults(runningTaskFile, {
                status: "done",
                task_id: runningTaskId,
                ok: okCount,
                fail: failCount,
                results: progressResults
            });
            if (!isBatchMode && generatedInddPaths.length > 0) {
                var openAll = confirm("本次已生成 " + generatedInddPaths.length + " 个 INDD。\r是否打开全部文件？");
                if (openAll) {
                    var k;
                    for (k = 0; k < generatedInddPaths.length; k += 1) {
                        var f = File(generatedInddPaths[k]);
                        if (f.exists) {
                            try {
                                app.open(f);
                            } catch (eOpenOut) {
                                pushLog(logs, "打开输出 INDD 失败: " + f.fsName + "，错误=" + eOpenOut);
                            }
                        }
                    }
                    // 2026-08-07：打开输出后的附加日志不再重复写 dispatch.log（logs 已在 1261 行写过）
                }
            }

            if (!isBatchMode) {
                updateProgressUi(progressUi, outputJsonFiles.length, "分发完成");
                alert("分发完成\r\n成功: " + okCount + "\r\n失败: " + failCount + "\r\n日志: " + dispatchLogFile.fsName);
            }

            appendLogText(diagFile, "[" + nowText() + "] dispatch completed: ok=" + okCount + " fail=" + failCount + "\n");

            // 批处理完成后只清理 done 任务；_cache JSON 是编辑核心文件，必须保留。
            if (isBatchMode) {
                try {
                    var doneDir = Folder(projectRoot + "/workspace/.runtime/queue/done");
                    if (doneDir && doneDir.exists) {
                        var doneFiles = doneDir.getFiles("*.json");
                        for (var df = 0; df < doneFiles.length; df++) {
                            try {
                                doneFiles[df].remove();
                            } catch (e) {}
                        }
                    }
                } catch (e) {}
            }
            if (runningTaskDirect) {
                copyTaskFileToQueueDir(runningTaskFile, projectRoot, "done");
                removeQueueProgress(projectRoot);
                try { delete $.global.__AUTO_RAINBOW_DIRECT_TASK_FILE__; } catch (eDirectDone) {}
            }
        } finally {
            closeProgressUi(progressUi);
        }
    }

    try {
        main();
    } catch (err) {
        var isBatch = !!(typeof $.global !== "undefined" && $.global.__AUTO_RAINBOW_WATCHER_INSTALLED__);
        try {
            // 2026-08-18：fatal 处理同样不再读家目录配置，走统一项目根解析
            var _projRoot = resolveDispatchProjectRoot();
            if (_projRoot) {
                var _diagFile = File(_projRoot + "/workspace/.runtime/logs/dispatch_debug.log");
                appendLogText(_diagFile, "[" + nowText() + "] FATAL ERROR: " + String(err).slice(0, 500) + "\n");
                    var _directTaskFile = "";
                    try {
                        _directTaskFile = $.global.__AUTO_RAINBOW_DIRECT_TASK_FILE__ || "";
                    } catch (_e0) {}
                    if (_directTaskFile) {
                        var _fatalResults = [];
                        try {
                            var _directTaskData = readJsonFile(File(_directTaskFile));
                            if (_directTaskData.files && _directTaskData.files instanceof Array) {
                                for (var _fi = 0; _fi < _directTaskData.files.length; _fi += 1) {
                                    _fatalResults.push({
                                        status: "fail",
                                        cache_path: _directTaskData.files[_fi],
                                        error: String(err).slice(0, 200)
                                    });
                                }
                            }
                        } catch (_eReadTask) {}
                        if (_fatalResults.length === 0) {
                            _fatalResults.push({
                                status: "fail",
                                cache_path: "",
                                error: String(err).slice(0, 200)
                            });
                        }
                        writeTaskResults(_directTaskFile, {
                            status: "error",
                            task_id: fileStemFromPath(_directTaskFile),
                            ok: 0,
                            fail: _fatalResults.length,
                            results: _fatalResults
                        });
                        copyTaskFileToQueueDir(_directTaskFile, _projRoot, "error");
                        removeQueueProgress(_projRoot);
                        try { delete $.global.__AUTO_RAINBOW_DIRECT_TASK_FILE__; } catch (_e1) {}
                        isBatch = true;
                    }
                }
        } catch (_e) {}
        if (!isBatch) {
            alert("分发脚本执行失败: " + err);
        }
        throw err;
    }
}());
