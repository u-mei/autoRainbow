/**
 * extract_template_style_profile.jsx
 *
 * 从模板 .indd 提取完整样式记录，写入 templates/<template_id>/style_profile.json。
 * 记录页面上所有可追踪对象（按 label 归类）的几何与文本样式，以及分页计算所需
 * 的布局参数（start_y / gap_y / continue_start_y / soft / hard 兜底值）。
 *
 * 设计文档：docs/templates/模板样式记录与前端分页计算设计.md
 *
 * 注意：不要加 #target / #targetengine 指令——脚本通过 AppleScript do script
 * 执行，该指令在 do script 下不会被忽略，会导致脚本静默不执行。
 *
 * 输入（_pipeline_params.json）：
 *   pipeline_extract_template_id  模板 ID
 * 输出：
 *   workspace/templates/<id>/style_profile.json
 */

(function () {
    var _dbg = null;
    // 2026-08-18：调试日志统一写 workspace/.runtime/logs/（不再写 ~）：
    // 脚本位于 pipeline/jsx/ → 反推项目根；或使用注入/全局常量。
    function getDebugLogFile() {
        var rootFolder = "";
        if (typeof __AUTO_INJECTED_PROJECT_ROOT__ === "string" && __AUTO_INJECTED_PROJECT_ROOT__) {
            rootFolder = __AUTO_INJECTED_PROJECT_ROOT__;
        }
        if (typeof $.global.__AUTO_RAINBOW_PROJECT_ROOT__ === "string" && $.global.__AUTO_RAINBOW_PROJECT_ROOT__) {
            rootFolder = $.global.__AUTO_RAINBOW_PROJECT_ROOT__;
        }
        if (!rootFolder) {
            try {
                var scriptFile = File($.fileName);
                var scriptDir = scriptFile.parent;   // pipeline/jsx
                if (scriptDir && scriptDir.parent && scriptDir.parent.parent) {
                    rootFolder = scriptDir.parent.parent.fsName;
                }
            } catch (e) {
            }
        }
        if (rootFolder) {
            return File(rootFolder + "/workspace/.runtime/logs/style_extract_debug.log");
        }
        return File(Folder("~").fsName + "/autoRainbow_style_extract_debug.txt");
    }
    function debugWrite(msg) {
        try {
            if (!_dbg) {
                _dbg = getDebugLogFile();
            }
            if (_dbg.open("a")) {
                _dbg.encoding = "UTF-8";
                _dbg.writeln(msg);
                _dbg.close();
            }
        } catch (e) {
        }
    }

    debugWrite("script started, fileName=" + String($.fileName) + ", app=" + String(app.name));
    var paramsFile = File(Folder($.fileName).parent.fsName + "/_pipeline_params.json");
    debugWrite("paramsFile=" + paramsFile.fsName + ", exists=" + paramsFile.exists);
    var templateId = "";
    if (paramsFile.exists && paramsFile.open("r")) {
        paramsFile.encoding = "UTF-8";
        var text = paramsFile.read();
        paramsFile.close();
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.slice(1);
        }
        try {
            var parsedParams = parseJsonText(text);
            templateId = String(parsedParams.pipeline_extract_template_id || "");
        } catch (e) {
            debugWrite("params parse failed: " + e);
        }
    }
    debugWrite("templateId=" + templateId);
    if (!templateId) {
        alert("未指定要提取的模板 ID（pipeline_extract_template_id）");
        return;
    }

    // ExtendScript 没有原生 JSON 对象（InDesign 2026 实测 typeof JSON === "undefined"）。
    // 使用手写 ES3 JSON 解析器（不用 eval，安全）。
    function parseJsonText(text) {
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

    function stringifyJson(obj, pretty) {
        try {
            if (typeof JSON !== "undefined" && JSON.stringify) {
                return pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
            }
        } catch (e) {
        }

        function quoteString(value) {
            return "\"" + String(value)
                .replace(/\\/g, "\\\\")
                .replace(/"/g, "\\\"")
                .replace(/\r/g, "\\r")
                .replace(/\n/g, "\\n")
                .replace(/\t/g, "\\t") + "\"";
        }

        function encode(value, level) {
            var i;
            var k;
            var keys;
            var parts;
            var indent;
            var childIndent;
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

    function safeRead(fn, fallback) {
        try {
            var v = fn();
            return v === undefined ? fallback : v;
        } catch (e) {
            return fallback;
        }
    }

    function cloneArrayValue(val) {
        if (!(val instanceof Array)) {
            return val;
        }
        var out = [];
        for (var i = 0; i < val.length; i += 1) {
            out.push(val[i]);
        }
        return out;
    }

    function enumName(val) {
        if (val === null || val === undefined) {
            return "";
        }
        return String(val);
    }

    function resolveProjectRoot() {
        // 2026-08-18：不再读家目录配置。项目根 = 注入常量 / 全局变量 /
        // 脚本位置反推；配置从项目内 workspace/.runtime/ 读取。
        var rootFolder = "";
        if (typeof __AUTO_INJECTED_PROJECT_ROOT__ === "string" && __AUTO_INJECTED_PROJECT_ROOT__) {
            rootFolder = __AUTO_INJECTED_PROJECT_ROOT__;
        }
        if (typeof $.global.__AUTO_RAINBOW_PROJECT_ROOT__ === "string" && $.global.__AUTO_RAINBOW_PROJECT_ROOT__) {
            rootFolder = $.global.__AUTO_RAINBOW_PROJECT_ROOT__;
        }
        if (!rootFolder) {
            try {
                var scriptFile = File($.fileName);
                var scriptDir = scriptFile.parent;   // pipeline/jsx
                if (scriptDir && scriptDir.parent && scriptDir.parent.parent) {
                    rootFolder = scriptDir.parent.parent.fsName;
                }
            } catch (e) {
            }
        }
        if (!rootFolder) {
            return null;
        }
        var merged = {};
        var pathsFile = File(rootFolder + "/workspace/.runtime/paths.json");
        if (pathsFile.exists) {
            try {
                if (pathsFile.open("r")) {
                    pathsFile.encoding = "UTF-8";
                    var ptext = pathsFile.read();
                    pathsFile.close();
                    if (ptext.charCodeAt(0) === 0xFEFF) {
                        ptext = ptext.slice(1);
                    }
                    var pcfg = parseJsonText(ptext);
                    if (pcfg) {
                        for (var pk in pcfg) {
                            if (pcfg.hasOwnProperty(pk)) {
                                merged[pk] = pcfg[pk];
                            }
                        }
                    }
                }
            } catch (e) {
            }
        }
        var cfgFile = File(rootFolder + "/workspace/.runtime/autorainbow_config.json");
        if (cfgFile.exists) {
            try {
                if (cfgFile.open("r")) {
                    cfgFile.encoding = "UTF-8";
                    var ctext = cfgFile.read();
                    cfgFile.close();
                    if (ctext.charCodeAt(0) === 0xFEFF) {
                        ctext = ctext.slice(1);
                    }
                    var cfg = parseJsonText(ctext);
                    if (cfg) {
                        for (var ck in cfg) {
                            if (cfg.hasOwnProperty(ck)) {
                                merged[ck] = cfg[ck];
                            }
                        }
                    }
                }
            } catch (e) {
            }
        }
        merged.project_root = rootFolder;
        // 路径索引 dirs 平铺，供模板脚本使用
        var pd = (merged && merged.dirs) || {};
        for (var dk in pd) {
            if (pd.hasOwnProperty(dk)) {
                merged[dk] = pd[dk];
            }
        }
        return merged;
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

    function captureTextFramePrefs(textFrame) {
        if (!textFrame || !textFrame.isValid || !textFrame.textFramePreferences) {
            return null;
        }
        var tfp = textFrame.textFramePreferences;
        var keys = [
            "insetSpacing", "verticalJustification", "firstBaselineOffset", "minimumFirstBaselineOffset",
            "textColumnCount", "textColumnGutter", "useFixedColumnWidth", "fixedColumnWidth", "ignoreWrap",
            "autoSizingType", "autoSizingReferencePoint", "useNoLineBreaksForAutoSizing",
            "useMinimumHeightForAutoSizing", "minimumHeightForAutoSizing",
            "useMinimumWidthForAutoSizing", "minimumWidthForAutoSizing"
        ];
        var spec = {};
        for (var i = 0; i < keys.length; i += 1) {
            var key = keys[i];
            var val = safeRead(function () { return tfp[key]; }, undefined);
            if (val !== undefined) {
                spec[key] = key === "insetSpacing" ? cloneArrayValue(val) : val;
            }
        }
        return spec;
    }

    function captureTextWrapPrefs(pageItem) {
        if (!pageItem || !pageItem.isValid || !pageItem.textWrapPreferences) {
            return null;
        }
        var tw = pageItem.textWrapPreferences;
        var keys = ["textWrapMode", "textWrapOffset", "textWrapSide", "inverse", "applyToMasterPageOnly"];
        var spec = {};
        for (var i = 0; i < keys.length; i += 1) {
            var key = keys[i];
            var val = safeRead(function () { return tw[key]; }, undefined);
            if (val !== undefined) {
                spec[key] = key === "textWrapOffset" ? cloneArrayValue(val) : val;
            }
        }
        return spec;
    }

    function captureTextStyle(paragraph) {
        if (!paragraph) {
            return null;
        }
        var style = {};
        style.font = safeRead(function () { return paragraph.appliedFont.name; }, "");
        style.font_style = safeRead(function () { return paragraph.fontStyle; }, "");
        style.point_size = safeRead(function () { return Number(paragraph.pointSize); }, 12);
        var leading = safeRead(function () { return paragraph.leading; }, "auto");
        style.leading = (typeof leading === "number") ? Number(leading) : String(leading);
        style.first_line_indent = safeRead(function () { return Number(paragraph.firstLineIndent); }, 0);
        style.space_before = safeRead(function () { return Number(paragraph.spaceBefore); }, 0);
        style.space_after = safeRead(function () { return Number(paragraph.spaceAfter); }, 0);
        style.alignment = enumName(safeRead(function () { return paragraph.justification; }, ""));
        style.paragraph_style = safeRead(function () { return paragraph.appliedParagraphStyle.name; }, "");
        return style;
    }

    function captureBounds(item) {
        var gb = safeRead(function () { return item.geometricBounds; }, null);
        if (!(gb instanceof Array) || gb.length < 4) {
            return null;
        }
        return {
            top: Number(gb[0]),
            left: Number(gb[1]),
            bottom: Number(gb[2]),
            right: Number(gb[3])
        };
    }

    function captureObject(item) {
        var kind = "";
        try {
            if (item instanceof TextFrame) {
                kind = "text_frame";
            } else if (item instanceof Rectangle) {
                kind = "rectangle";
            } else if (item instanceof Oval) {
                kind = "oval";
            } else if (item instanceof Polygon) {
                kind = "polygon";
            } else if (item instanceof Group) {
                kind = "group";
            } else if (item instanceof GraphicLine) {
                kind = "graphic_line";
            } else {
                kind = "page_item";
            }
        } catch (e) {
            kind = "page_item";
        }

        var record = {
            kind: kind,
            bounds: captureBounds(item)
        };

        var objStyle = safeRead(function () { return item.appliedObjectStyle.name; }, "");
        if (objStyle) {
            record.object_style = objStyle;
        }

        if (kind === "text_frame") {
            var story = safeRead(function () { return item.parentStory; }, null);
            if (story) {
                var texts = safeRead(function () { return story.texts; }, []);
                if (texts && texts.length > 0) {
                    record.text = captureTextStyle(texts[0]);
                }
            }
            var prefs = captureTextFramePrefs(item);
            if (prefs) {
                record.text_frame_prefs = prefs;
            }
            record.contents_preview = safeRead(function () { return String(item.contents).slice(0, 60); }, "");
        } else {
            var tw = captureTextWrapPrefs(item);
            if (tw) {
                record.text_wrap_prefs = tw;
            }
        }

        return record;
    }

    function countKeys(obj) {
        var n = 0;
        var k;
        for (k in obj) {
            if (obj.hasOwnProperty(k)) {
                n += 1;
            }
        }
        return n;
    }

    function extractSinglePage(doc, pageIndex, templateCfg, opts) {
        // pageIndex 为 1-based（模板配置语义），doc.pages 为 0-based
        // opts: { textLabel, imageLabel } 可选，templateD 双页各自的原型 label
        var page = doc.pages[pageIndex - 1];
        if (!page) {
            return null;
        }
        var pb = page.bounds;
        var pageInfo = {
            page_width: Number(pb[3] - pb[1]),
            page_height: Number(pb[2] - pb[0]),
            margin: {
                top: safeRead(function () { return Number(page.marginPreferences.top); }, 0),
                bottom: safeRead(function () { return Number(page.marginPreferences.bottom); }, 0),
                left: safeRead(function () { return Number(page.marginPreferences.left); }, 0),
                right: safeRead(function () { return Number(page.marginPreferences.right); }, 0)
            },
            column_count: safeRead(function () { return Number(page.marginPreferences.columnCount); }, 1),
            column_gutter: safeRead(function () { return Number(page.marginPreferences.columnGutter); }, 0),
            source_page_index: pageIndex
        };

        var objects = {};
        var unlabeledCount = 0;
        var items = page.allPageItems;
        var i;
        for (i = 0; i < items.length; i += 1) {
            var item = items[i];
            var label = safeRead(function () { return String(item.label || ""); }, "");
            var record = captureObject(item);
            if (!label) {
                unlabeledCount += 1;
                continue;
            }
            if (!objects[label]) {
                objects[label] = [];
            }
            objects[label].push(record);
        }

        // ---- 布局参数 ----
        var protoText = null;
        var protoImage = null;
        var columnSpace = null;
        var bodyTextLabel = String(opts && opts.textLabel ? opts.textLabel : (templateCfg.body_text_proto_label || "proto_text"));
        var bodyImageLabel = String(opts && opts.imageLabel ? opts.imageLabel : (templateCfg.body_image_proto_label || "proto_image"));
        var columnSpaceLabel = String(templateCfg.column_space_label || "");

        if (objects[bodyTextLabel] && objects[bodyTextLabel].length > 0) {
            protoText = objects[bodyTextLabel][0];
        }
        if (objects[bodyImageLabel] && objects[bodyImageLabel].length > 0) {
            protoImage = objects[bodyImageLabel][0];
        }
        if (columnSpaceLabel && objects[columnSpaceLabel] && objects[columnSpaceLabel].length > 0) {
            columnSpace = objects[columnSpaceLabel][0];
        }

        var pageTopInner = pb[0] + pageInfo.margin.top;
        var startY = null;
        if (columnSpace && columnSpace.bounds) {
            startY = columnSpace.bounds.bottom;
        } else if (protoText && protoText.bounds) {
            startY = protoText.bounds.top;
        }
        if (startY === null) {
            startY = pageTopInner;
        }
        if (Number(templateCfg.start_y)) {
            startY = Number(templateCfg.start_y);
        }

        var gapY = Number(templateCfg.gap_y) || 48;
        var continueStartY = Number(templateCfg.continue_start_y) || pageTopInner;

        var soft = Number(templateCfg.content_bottom_soft);
        var hard = Number(templateCfg.content_bottom_hard);
        if (isNaN(soft)) {
            soft = pb[2] - pageInfo.margin.bottom;
        }
        if (isNaN(hard)) {
            hard = pb[2] - pageInfo.margin.bottom;
        }
        if (hard < soft) {
            hard = soft;
        }

        var layoutParams = {
            start_y: Number(startY),
            gap_y: Number(gapY),
            continue_start_y: Number(continueStartY),
            content_bottom_soft: Number(soft),
            content_bottom_hard: Number(hard),
            body_text_width: protoText && protoText.bounds ? Number(protoText.bounds.right - protoText.bounds.left) : null,
            body_image_height: protoImage && protoImage.bounds ? Number(protoImage.bounds.bottom - protoImage.bounds.top) : null
        };

        return {
            page: pageInfo,
            objects: objects,
            _unlabeled_count: unlabeledCount,
            layout_params: layoutParams
        };
    }

    function appendLogFile(fileObj, textValue) {
        try {
            ensureFolder(fileObj.parent);
            if (fileObj.open("a")) {
                fileObj.encoding = "UTF-8";
                fileObj.writeln(textValue);
                fileObj.close();
            }
        } catch (e) {
        }
    }

    function main() {
        var mergedCfg = resolveProjectRoot();
        if (!mergedCfg) {
            alert("未找到项目根目录（无注入常量/全局变量/脚本位置反推失败），无法提取模板样式");
            return;
        }
        var projectRoot = mergedCfg.project_root;
        var logFile = File(projectRoot + "/workspace/.runtime/logs/style_extract.log");
        appendLogFile(logFile, "[" + new Date().toLocaleString() + "] 开始提取模板样式: " + templateId);
        var templatesRoot = Folder(projectRoot + "/workspace/templates");
        var templateFolder = Folder(templatesRoot.fsName + "/" + templateId);
        if (!templateFolder.exists) {
            appendLogFile(logFile, "模板目录不存在: " + templateFolder.fsName);
            alert("模板目录不存在: " + templateFolder.fsName);
            return;
        }

        var templateCfg = (mergedCfg.templates && mergedCfg.templates[templateId]) || {};
        var layoutMode = String(templateCfg.layout_mode || "templateA");

        // 确定要提取的模板页（1-based）：
        // templateD 为双页模板，按 first/other 两个源页分别提取；
        // 其余模板按 source_page_index 提取单页。
        var pageIndexes = [];
        if (layoutMode === "templateD") {
            pageIndexes.push(Number(templateCfg.first_group_source_page_index || 1));
            pageIndexes.push(Number(templateCfg.other_group_source_page_index || 2));
        } else {
            pageIndexes.push(Number(templateCfg.source_page_index || 1));
        }
        var seenIndexes = {};
        var uniqueIndexes = [];
        var pi;
        for (pi = 0; pi < pageIndexes.length; pi += 1) {
            var idx = Number(pageIndexes[pi]);
            if (!seenIndexes[idx]) {
                seenIndexes[idx] = 1;
                uniqueIndexes.push(idx);
            }
        }

        // 找模板 indd 文件
        var inddFile = null;
        var files = templateFolder.getFiles("*.indd");
        if (files && files.length > 0) {
            files.sort(function (a, b) {
                return (a.modified.getTime ? a.modified.getTime() : 0) - (b.modified.getTime ? b.modified.getTime() : 0);
            });
            inddFile = files[files.length - 1];
        }
        if (!inddFile) {
            appendLogFile(logFile, "模板目录中没有 .indd 文件: " + templateFolder.fsName);
            alert("模板目录中没有 .indd 文件: " + templateFolder.fsName);
            return;
        }

        var doc = null;
        try {
            doc = app.open(inddFile, false);
        } catch (eOpen) {
            appendLogFile(logFile, "打开模板失败: " + inddFile.fsName + "；错误=" + eOpen);
            alert("打开模板失败: " + inddFile.fsName + "；错误=" + eOpen);
            return;
        }
        if (!doc || !doc.isValid) {
            appendLogFile(logFile, "模板打开后文档无效: " + inddFile.fsName);
            alert("模板打开后文档无效");
            return;
        }

        var profile = {
            schema_version: 2,
            template_id: templateId,
            layout_mode: layoutMode,
            extracted_from: inddFile.name,
            extracted_at: new Date().toLocaleString(),
            template_file_mtime: safeRead(function () { return inddFile.modified.toLocaleString(); }, ""),
            page: null,
            objects: {},
            _unlabeled_count: 0,
            layout_params: {},
            pages: {}
        };

        try {
            var pagesOut = profile.pages;
            var firstPage = null;
            for (pi = 0; pi < uniqueIndexes.length; pi += 1) {
                var pageIndex = uniqueIndexes[pi];
                var pageOpts = null;
                if (layoutMode === "templateD") {
                    var isFirst = pageIndex === Number(templateCfg.first_group_source_page_index || 1);
                    pageOpts = isFirst ? {
                        textLabel: String(templateCfg.first_text_proto_label || "birthday_text"),
                        imageLabel: String(templateCfg.first_image_proto_label || "birthday_image")
                    } : {
                        textLabel: String(templateCfg.other_text_proto_label || "proto_text"),
                        imageLabel: String(templateCfg.other_image_proto_label || "proto_image")
                    };
                }
                var extracted = extractSinglePage(doc, pageIndex, templateCfg, pageOpts);
                if (!extracted) {
                    appendLogFile(logFile, "无法定位源页 page_index=" + pageIndex + "（文档页数=" + doc.pages.length + "）");
                    continue;
                }
                pagesOut[String(pageIndex)] = extracted;
                if (!firstPage) {
                    firstPage = extracted;
                }
            }
            if (!firstPage) {
                throw new Error("未提取到任何模板页（请检查模板页数与配置）");
            }

            // 兼容字段：顶层 page/objects/layout_params 指向第一页
            profile.page = firstPage.page;
            profile.objects = firstPage.objects;
            profile._unlabeled_count = firstPage._unlabeled_count;
            profile.layout_params = firstPage.layout_params;

            // ---- 写文件 ----
            var outFile = File(templateFolder.fsName + "/style_profile.json");
            ensureFolder(outFile.parent);
            if (outFile.open("w")) {
                outFile.encoding = "UTF-8";
                outFile.write(stringifyJson(profile, true));
                outFile.close();
                appendLogFile(logFile, "样式提取完成: " + outFile.fsName + "，页数=" + uniqueIndexes.length + "，第一页 label 数=" + countKeys(profile.objects) + "，未标记=" + profile._unlabeled_count + "，start_y=" + profile.layout_params.start_y);
                var alertMsg = "样式提取完成: " + outFile.fsName + "\n提取页: " + uniqueIndexes.join("、") + "\n";
                var pk;
                for (pk in profile.pages) {
                    if (profile.pages.hasOwnProperty(pk)) {
                        alertMsg += "第 " + pk + " 页: " + countKeys(profile.pages[pk].objects) + " 个 label，未标记对象 " + profile.pages[pk]._unlabeled_count + " 个\n";
                    }
                }
                alertMsg += "正文起始 Y=" + profile.layout_params.start_y + "，图片框高=" + profile.layout_params.body_image_height;
                alert(alertMsg);
            } else {
                appendLogFile(logFile, "写入 style_profile.json 失败: " + outFile.fsName);
                alert("写入 style_profile.json 失败: " + outFile.fsName);
            }
        } catch (err) {
            appendLogFile(logFile, "样式提取失败: " + err);
            alert("样式提取失败: " + err);
        } finally {
            try {
                doc.close(SaveOptions.NO);
            } catch (eClose) {
            }
        }
    }

    try {
        main();
    } catch (err) {
        alert("样式提取脚本异常: " + err);
    }
}());
