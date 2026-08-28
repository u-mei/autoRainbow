#target "autoRainbowSnapshot"

(function () {
    function parseJsonText(text) {
        if (typeof JSON !== "undefined" && JSON.parse) {
            try {
                return JSON.parse(text);
            } catch (e) {
            }
        }
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

    function stringifyJsonText(obj) {
        try {
            if (typeof JSON !== "undefined" && JSON.stringify) {
                return JSON.stringify(obj, null, 2);
            }
        } catch (e) {}
        return String(obj);
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

    function appendLogFile(fileObj, textValue) {
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
        fileObj.write(existing + textValue);
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

    function safeRead(getterFn, fallbackValue) {
        try {
            return getterFn();
        } catch (e1) {
            return fallbackValue;
        }
    }

    function getPipelineParamsFile() {
        var scriptFile = File($.fileName);
        var scriptFolder = scriptFile.parent;
        return File(scriptFolder.fsName + "/_pipeline_params.json");
    }

    function loadPipelineParams() {
        var paramsFile = getPipelineParamsFile();
        if (!paramsFile.exists) {
            return {};
        }
        if (!paramsFile.open("r")) {
            return {};
        }
        paramsFile.encoding = "UTF-8";
        var text = paramsFile.read();
        paramsFile.close();
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.slice(1);
        }
        try {
            return parseJsonText(text);
        } catch (e1) {
            return {};
        }
    }

    function collectWorkspaceInddFiles(folderObj, list) {
        var entries = folderObj.getFiles();
        var i;
        for (i = 0; i < entries.length; i += 1) {
            var entry = entries[i];
            if (entry instanceof Folder) {
                if (entry.name && entry.name.indexOf("_legacy_") === 0) {
                    continue;
                }
                if (entry.name === "queue" || entry.name === "logs") {
                    continue;
                }
                collectWorkspaceInddFiles(entry, list);
            } else if (entry instanceof File) {
                var lower = String(entry.name).toLowerCase();
                if (lower.indexOf(".indd") >= 0 && lower.indexOf("indd") === lower.length - 4) {
                    list.push(entry);
                }
            }
        }
    }

    function collectOutputJsonFiles(folderObj, list) {
        var entries = folderObj.getFiles();
        var i;
        for (i = 0; i < entries.length; i += 1) {
            var entry = entries[i];
            if (entry instanceof Folder) {
                if (entry.name && entry.name.indexOf("_legacy_") === 0) {
                    continue;
                }
                if (entry.name === "queue" || entry.name === "logs") {
                    continue;
                }
                collectOutputJsonFiles(entry, list);
            } else if (entry instanceof File) {
                if (String(entry.name).toLowerCase() === "output.json") {
                    list.push(entry);
                }
            }
        }
    }

    function findMatchingIndd(inddFiles, outputJsonFile) {
        var jsonFolder = outputJsonFile.parent.fsName;
        var i;
        for (i = 0; i < inddFiles.length; i += 1) {
            if (inddFiles[i].parent.fsName === jsonFolder) {
                return inddFiles[i];
            }
        }
        return null;
    }

    function collectPageItemsRecursive(pageItems, depth, maxDepth) {
        var items = [];
        if (depth > maxDepth) {
            return items;
        }
        var i;
        for (i = 0; i < pageItems.length; i += 1) {
            var item = pageItems[i];
            if (!item || !item.isValid) {
                continue;
            }
            var entry = {
                label: safeRead(function () { return item.label; }, ""),
                geometricBounds: safeRead(function () { return item.geometricBounds; }, []),
                itemType: safeRead(function () { return String(item.constructor.name || "unknown"); }, "unknown"),
                contents: safeRead(function () { return String(item.contents || "").slice(0, 200); }, ""),
                imageCount: safeRead(function () {
                    try { return item.allGraphics ? item.allGraphics.length : 0; } catch (e) { return 0; }
                }, 0),
                appliedObjectStyle: safeRead(function () {
                    return item.appliedObjectStyle && item.appliedObjectStyle.isValid
                        ? item.appliedObjectStyle.name : null;
                }, null),
                locked: safeRead(function () { return !!item.locked; }, false),
                hidden: safeRead(function () { return !!item.hidden; }, false),
                name: safeRead(function () { return String(item.name || ""); }, "")
            };

            var children = safeRead(function () {
                if (item.constructor.name === "Group") {
                    return item.pageItems;
                }
                if (item.allPageItems && item.allPageItems.length > 0) {
                    return item.allPageItems;
                }
                return null;
            }, null);
            if (children && children.length > 0) {
                entry.children = collectPageItemsRecursive(children, depth + 1, maxDepth);
            }

            items.push(entry);
        }
        return items;
    }

    function exportPageAsImage(doc, page, pageNum, outputFolder, logs) {
        var imgFile = File(outputFolder.fsName + "/page_" + pageNum + ".jpg");

        try {
            // 保存当前 JPEG 导出偏好
            var oldJpegPrefs = {};
            try {
                oldJpegPrefs.pageString = app.jpegExportPreferences.pageString;
                oldJpegPrefs.exportResolution = app.jpegExportPreferences.exportResolution;
                oldJpegPrefs.jpegQuality = app.jpegExportPreferences.jpegQuality;
                oldJpegPrefs.jpegRenderingStyle = app.jpegExportPreferences.jpegRenderingStyle;
                oldJpegPrefs.exportCropMarks = app.jpegExportPreferences.exportCropMarks;
            } catch (e) {}

            var jpegPref = app.jpegExportPreferences;
            jpegPref.pageString = String(pageNum);
            jpegPref.exportResolution = 300;
            jpegPref.jpegQuality = JPEGOptionsQuality.MAXIMUM;
            jpegPref.jpegRenderingStyle = JPEGOptionsFormat.BASELINE_ENCODING;
            jpegPref.exportCropMarks = false;

            doc.exportFile(ExportFormat.JPG_FORMAT, imgFile);
            pushLog(logs, "已导出第 " + pageNum + " 页: " + imgFile.fsName);
            return true;
        } catch (e1) {
            pushLog(logs, "导出第 " + pageNum + " 页失败: " + e1 + "，尝试 PNG 导出");

            try {
                var pngFile = File(outputFolder.fsName + "/page_" + pageNum + ".png");
                doc.exportFile(ExportFormat.PNG_FORMAT, pngFile);
                pushLog(logs, "已导出第 " + pageNum + " 页(PNG): " + pngFile.fsName);
                return true;
            } catch (e2) {
                pushLog(logs, "PNG 导出也失败: " + e2);
                return false;
            }
        }
    }

    function processOneIndd(inddFile, logs, projectRoot) {
        pushLog(logs, "开始处理快照: " + inddFile.fsName);

        var doc = null;
        try {
            doc = app.open(inddFile);
        } catch (eOpen) {
            pushLog(logs, "打开 INDD 失败: " + inddFile.fsName + "，错误=" + eOpen);
            return false;
        }

        if (!doc || !doc.isValid) {
            pushLog(logs, "打开后文档无效: " + inddFile.fsName);
            return false;
        }

        var docName = doc.name.replace(/\.[^.]+$/, "");
        // 2026-08-16 新结构：快照/金标放 outputs/work/snapshots/{docName}/_snapshots/
        var snapBase = projectRoot
            ? Folder(projectRoot.fsName + "/workspace/outputs/work/snapshots/" + docName)
            : Folder(doc.fullName.parent.fsName);
        var snapDir = Folder(snapBase.fsName + "/_snapshots");
        ensureFolderExists(snapDir);
        var ok = true;

        // 1. 导出每页为图片
        pushLog(logs, "文档共 " + doc.pages.length + " 页");

        var i;
        for (i = 0; i < doc.pages.length; i += 1) {
            var exported = exportPageAsImage(doc, doc.pages[i], i + 1, snapDir, logs);
            if (!exported) {
                ok = false;
            }
        }

        // 2. 提取结构 JSON
        var structure = {
            docName: docName,
            pageCount: doc.pages.length,
            documentPreferences: {
                pageWidth: safeRead(function () { return doc.documentPreferences.pageWidth; }, 0),
                pageHeight: safeRead(function () { return doc.documentPreferences.pageHeight; }, 0),
                pageOrientation: safeRead(function () { return doc.documentPreferences.pageOrientation; }, "")
            },
            pages: []
        };

        for (i = 0; i < doc.pages.length; i += 1) {
            var page = doc.pages[i];
            var pageInfo = {
                index: i,
                bounds: safeRead(function () { return page.bounds; }, []),
                marginPreferences: safeRead(function () {
                    return {
                        top: page.marginPreferences.top,
                        bottom: page.marginPreferences.bottom,
                        left: page.marginPreferences.left,
                        right: page.marginPreferences.right
                    };
                }, {}),
                items: collectPageItemsRecursive(page.allPageItems, 0, 3)
            };
            structure.pages.push(pageInfo);
        }

        var structureFile = File(snapDir.fsName + "/structure.json");
        writeTextFile(structureFile, stringifyJsonText(structure));
        pushLog(logs, "结构 JSON 已写入: " + structureFile.fsName);

        doc.close(SaveOptions.NO);
        pushLog(logs, "快照完成: " + (ok ? "成功" : "部分失败"));
        return ok;
    }

    function main() {
        var logs = [];
        pushLog(logs, "====================");
        pushLog(logs, "开始页面快照导出");

        var params = loadPipelineParams();
        var specificInddPath = params.pipeline_snapshot_indd || null;

        var projectRoot = null;
        if (typeof $.global.__AUTO_RAINBOW_PROJECT_ROOT__ === "string") {
            projectRoot = Folder($.global.__AUTO_RAINBOW_PROJECT_ROOT__);
        }

        if (specificInddPath) {
            // 处理单个指定的 .indd
            var inddFile = File(specificInddPath);
            if (!inddFile.exists) {
                pushLog(logs, "指定的 INDD 不存在: " + specificInddPath);
            } else {
                processOneIndd(inddFile, logs, projectRoot);
            }
        } else if (projectRoot) {
            // 自动扫描 workspace 下所有 .indd
            var workspaceFolder = Folder(projectRoot.fsName + "/workspace/outputs");
            if (!workspaceFolder.exists) {
                pushLog(logs, "outputs 目录不存在: " + workspaceFolder.fsName);
            } else {
                var inddFiles = [];
                collectWorkspaceInddFiles(workspaceFolder, inddFiles);
                pushLog(logs, "发现 " + inddFiles.length + " 个 .indd 文件");

                var successCount = 0;
                var failCount = 0;
                var j;
                for (j = 0; j < inddFiles.length; j += 1) {
                    if (processOneIndd(inddFiles[j], logs, projectRoot)) {
                        successCount += 1;
                    } else {
                        failCount += 1;
                    }
                }
                pushLog(logs, "全部完成: 成功=" + successCount + " 失败=" + failCount);
            }
        } else {
            pushLog(logs, "未指定 INDD 路径，也未检测到项目根目录");
        }

        // 写入日志
        var logFile = File(Folder($.fileName).parent.fsName + "/_snapshot_log.txt");
        appendLogFile(logFile, logs.join("\n"));

        if (!(typeof $.global !== "undefined" && $.global.__AUTO_RAINBOW_WATCHER_INSTALLED__)) {
            $.writeln(logs.join("\n"));
        }
    }

    try {
        main();
    } catch (err) {
        var msg = "快照脚本执行失败: " + err;
        $.writeln(msg);
        if (!(typeof $.global !== "undefined" && $.global.__AUTO_RAINBOW_WATCHER_INSTALLED__)) {
            alert(msg);
        }
    }
}());
