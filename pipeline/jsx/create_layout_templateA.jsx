function parseJsonText(text) {
    if (typeof JSON !== "undefined" && JSON.parse) {
        return JSON.parse(text);
    }
    return eval("(" + text + ")");
}

function stringifyJsonText(obj, pretty) {
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

    return parseJsonText(content);
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

function readRecordsFromWorkspace(projectRoot, config, logs) {
    var workspacePath = config.doc_workspace_dir || "B_outputs";
    var workspaceFolder = Folder(resolveFile(projectRoot, workspacePath).fsName);
    if (!workspaceFolder.exists) {
        throw new Error("未找到文档输出目录: " + workspaceFolder.fsName);
    }

    var jsonFiles = [];
    collectWorkspaceOutputJsonFiles(workspaceFolder, jsonFiles);
    var records = [];
    var i;

    for (i = 0; i < jsonFiles.length; i += 1) {
        var f = jsonFiles[i];
        if (!(f instanceof File)) {
            continue;
        }
        if (String(f.name).toLowerCase() !== "output.json") {
            continue;
        }
        if (f.fsName.indexOf("/_legacy_") >= 0 || f.fsName.indexOf("\\_legacy_") >= 0) {
            continue;
        }

        var one = readJsonFile(f);
        if (!(one instanceof Array)) {
            throw new Error("文档输出 JSON 顶层必须是数组: " + f.fsName);
        }
        var j;
        for (j = 0; j < one.length; j += 1) {
            records.push(one[j]);
        }
    }

    if (records.length === 0) {
        throw new Error("未找到可用的文档 output.json（目录: " + workspaceFolder.fsName + "）");
    }

    records.sort(function (a, b) {
        var aDoc = String(a.doc_name || "");
        var bDoc = String(b.doc_name || "");
        if (aDoc < bDoc) {
            return -1;
        }
        if (aDoc > bDoc) {
            return 1;
        }
        var ai = Number(a.index || 0);
        var bi = Number(b.index || 0);
        return ai - bi;
    });

    pushLog(logs, "已从文档输出目录聚合记录: " + records.length + " 条");
    return records;
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

function writeLogFile(fileObj, logs) {
    if (!ensureFolderExists(fileObj.parent)) {
        return;
    }
    if (!fileObj.open("w")) {
        return;
    }

    fileObj.encoding = "UTF-8";
    fileObj.write(logs.join("\n"));
    fileObj.close();
}

function writeTextFile(fileObj, textValue) {
    if (!ensureFolderExists(fileObj.parent)) {
        return false;
    }
    if (!fileObj.open("w")) {
        return false;
    }
    fileObj.encoding = "UTF-8";
    fileObj.write(textValue);
    fileObj.close();
    return true;
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

function createPageBreakReport(inputJsonPath) {
    return {
        input_json: inputJsonPath || "",
        auto_break_indices: [],
        records: [],
        seen: {}
    };
}

function recordAutoPageBreak(report, itemIndex, modeText, docName, reasonText) {
    var n = Number(itemIndex);
    if (!report || isNaN(n) || n <= 1) {
        return;
    }
    var key = String(n);
    if (!report.seen[key]) {
        report.seen[key] = true;
        report.auto_break_indices.push(n);
    }
    report.records.push({
        index: n,
        mode: String(modeText || ""),
        doc_name: String(docName || ""),
        reason: String(reasonText || "")
    });
}

function getPageBreakReportFile(projectRoot, inputJsonPath) {
    if (!inputJsonPath) {
        return null;
    }
    var inputFile = File(inputJsonPath);
    var nameText = String(inputFile.name || "page_breaks.json");
    var dotIdx = nameText.lastIndexOf(".");
    if (dotIdx > 0) {
        nameText = nameText.substring(0, dotIdx);
    }
    return File(projectRoot.fsName + "/workspace/B_outputs/_page_breaks/" + nameText + ".json");
}

function writePageBreakReport(projectRoot, inputJsonPath, report, logs) {
    var reportFile = getPageBreakReportFile(projectRoot, inputJsonPath);
    if (!reportFile) {
        return;
    }
    var payload = {
        input_json: inputJsonPath || "",
        auto_break_indices: report && report.auto_break_indices ? report.auto_break_indices : [],
        records: report && report.records ? report.records : [],
        updated_at: nowText()
    };
    if (writeTextFile(reportFile, stringifyJsonText(payload, true))) {
        pushLog(logs, "已记录自动分页: " + reportFile.fsName + "，分页点=" + payload.auto_break_indices.length);
    } else {
        pushLog(logs, "记录自动分页失败: " + reportFile.fsName);
    }
}

function closeOpenDocumentByPath(targetFile, keepDoc, logs) {
    if (!targetFile) {
        return 0;
    }
    var closed = 0;
    var targetPath = "";
    try {
        targetPath = File(targetFile).fsName;
    } catch (e0) {
        targetPath = String(targetFile);
    }
    var i;
    for (i = app.documents.length - 1; i >= 0; i -= 1) {
        var oneDoc = null;
        try {
            oneDoc = app.documents[i];
        } catch (e1) {
            continue;
        }
        if (!oneDoc || !oneDoc.isValid || oneDoc === keepDoc) {
            continue;
        }
        try {
            if (oneDoc.saved && oneDoc.fullName && File(oneDoc.fullName).fsName === targetPath) {
                oneDoc.close(SaveOptions.NO);
                closed += 1;
                pushLog(logs, "已关闭占用输出文件的 InDesign 文档: " + targetPath);
            }
        } catch (e2) {
            pushLog(logs, "关闭占用输出文件的文档失败: " + targetPath + "，错误=" + e2);
        }
    }
    return closed;
}

// 缓存的参数对象（避免重复读取文件）
var _pipelineParamsCache = null;

function loadPipelineParams() {
    if (_pipelineParamsCache !== null) {
        return _pipelineParamsCache;
    }
    try {
        var scriptFile = File($.fileName);
        var scriptFolder = scriptFile.parent;
        var paramsFile = File(scriptFolder.fsName + "/_pipeline_params.json");
        if (paramsFile.exists) {
            if (paramsFile.open("r")) {
                paramsFile.encoding = "UTF-8";
                var text = paramsFile.read();
                paramsFile.close();
                if (text.charCodeAt(0) === 0xFEFF) {
                    text = text.slice(1);
                }
                _pipelineParamsCache = parseJsonText(text);
                return _pipelineParamsCache;
            }
        }
    } catch (e1) {
    }
    _pipelineParamsCache = {};
    return _pipelineParamsCache;
}

function getScriptArgValue(nameText) {
    var params = loadPipelineParams();
    return params[nameText] || null;
}

function isTruthyArg(valueText) {
    var text = String(valueText || "").toLowerCase();
    return text === "1" || text === "true" || text === "yes";
}

function toNumberOrDefault(value, defaultValue) {
    var num = Number(value);
    if (isNaN(num)) {
        return defaultValue;
    }
    return num;
}

function findPageItemByLabel(page, labelName) {
    if (!labelName) {
        return null;
    }

    var items = page.allPageItems;
    var i;
    for (i = 0; i < items.length; i += 1) {
        if (items[i].label === labelName) {
            return items[i];
        }
    }
    return null;
}

function findPageItemByLabels(page, labelNames) {
    if (!labelNames || !(labelNames instanceof Array)) {
        return null;
    }
    var i;
    for (i = 0; i < labelNames.length; i += 1) {
        var label = labelNames[i];
        if (!label) {
            continue;
        }
        var item = findPageItemByLabel(page, label);
        if (item) {
            return item;
        }
    }
    return null;
}

function buildDividerLabelCandidates(labelText) {
    var text = String(labelText || "");
    var list = [];
    var seen = {};

    function addOne(v) {
        var key = String(v || "");
        if (!key) {
            return;
        }
        if (seen[key]) {
            return;
        }
        seen[key] = true;
        list.push(key);
    }

    addOne(text);
    // 兼容 divde/divide 常见拼写差异
    addOne(text.split("divde").join("divide"));
    addOne(text.split("divide").join("divde"));
    // 兼容下划线风格差异
    addOne(text.split("__").join("_"));

    return list;
}

function collectPageLabels(page, maxCount) {
    var labels = [];
    var seen = {};
    var limit = Number(maxCount);
    if (isNaN(limit) || limit <= 0) {
        limit = 80;
    }
    if (!page || !page.isValid) {
        return labels;
    }
    var items = page.allPageItems;
    var i;
    for (i = 0; i < items.length; i += 1) {
        var label = "";
        try {
            label = String(items[i].label || "");
        } catch (e1) {
            label = "";
        }
        if (!label || seen[label]) {
            continue;
        }
        seen[label] = true;
        labels.push(label);
        if (labels.length >= limit) {
            break;
        }
    }
    return labels;
}

function collectConfigCandidates(baseFolder, activeDoc) {
    var candidates = [];
    var seen = {};
    var roots = [];

    roots.push(baseFolder);

    try {
        if (activeDoc && activeDoc.saved && activeDoc.fullName) {
            roots.unshift(File(activeDoc.fullName).parent);
        }
    } catch (e1) {
    }

    var r;
    for (r = 0; r < roots.length; r += 1) {
        var current = roots[r];
        var guard = 0;

        while (current && current.fsName && guard < 30) {
            var paths = [
                current.fsName + "/workspace/A_templates/config.json",
                current.fsName + "/workspace/config.json",
                current.fsName + "/D/A_templates/config.json",
                current.fsName + "/D/config.json",
                current.fsName + "/A_templates/config.json",
                current.fsName + "/config.json"
            ];
            var i;
            for (i = 0; i < paths.length; i += 1) {
                var p = paths[i];
                if (!seen[p]) {
                    seen[p] = true;
                    candidates.push(File(p));
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
    if (!parentFolder) {
        return null;
    }

    // 全局配置：.../A_templates/config.json
    if (parentFolder.name === "A_templates") {
        return parentFolder.parent;
    }

    // 模板内配置：.../A_templates/<template_id>/config.json
    if (parentFolder.parent && parentFolder.parent.name === "A_templates") {
        return parentFolder.parent.parent;
    }

    // 兜底：返回 config 所在目录
    return parentFolder;
}

function normalizeLayoutMode(modeText) {
    var raw = String(modeText || "");
    var key = raw.toLowerCase();
    key = key.replace(/^\s+|\s+$/g, "");

    // 兼容旧命名迁移
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

function validateTemplateConfig(templateId, t) {
    if (!t || typeof t !== "object") {
        throw new Error("模板配置无效: " + templateId);
    }

    var baseSourceIndex = Number(t.source_page_index || 1);
    if (isNaN(baseSourceIndex) || baseSourceIndex < 1) {
        throw new Error("模板 source_page_index 无效: " + templateId);
    }

    var bodyTextLabel = t.body_text_proto_label || t.text_proto_label || "proto_text";
    var bodyImageLabel = t.body_image_proto_label || t.image_proto_label || "proto_image";

    return {
        layout_mode: normalizeLayoutMode(t.layout_mode),
        source_page_index: baseSourceIndex,
        body_text_proto_label: bodyTextLabel,
        body_image_proto_label: bodyImageLabel,
        card_proto_label: t.card_proto_label || "proto_card",
        main_heading_label: t.main_heading_label || "main_heading",
        sub_heading_label: t.sub_heading_label || "sub_heading",
        title_image_label: t.title_image_label || "title_image",
        column_space_label: t.column_space_label || "column_space",
        column_space2_label: t.column_space2_label || "column_space2",
        photo_group_label: t.photo_group_label || "photo_group",
        first_group_source_page_index: Number(t.first_group_source_page_index || baseSourceIndex || 1),
        other_group_source_page_index: Number(t.other_group_source_page_index || 2),
        first_divider_label: t.first_divider_label || "divide_line_birthday",
        first_image_proto_label: t.first_image_proto_label || "birthday_image",
        first_text_proto_label: t.first_text_proto_label || "birthday_text",
        other_heading_label: t.other_heading_label || "paragraph_heading",
        other_divider_label: t.other_divider_label || "divide_line",
        other_image_proto_label: t.other_image_proto_label || "proto_image",
        other_text_proto_label: t.other_text_proto_label || "proto_text",
        divider_offset_from_heading: toNumberOrDefault(t.divider_offset_from_heading, -12),
        photo_top_gap: toNumberOrDefault(t.photo_top_gap, 48),
        text_top_gap: toNumberOrDefault(t.text_top_gap, 48),
        photo_row_gap: toNumberOrDefault(t.photo_row_gap, 12),
        start_y: t.start_y,
        continue_start_y: t.continue_start_y,
        content_bottom_soft: t.content_bottom_soft,
        content_bottom_hard: t.content_bottom_hard,
        content_bottom: t.content_bottom
    };
}

function getTemplatesRootFolder(projectRoot, globalConfig) {
    var templatesRootPath = globalConfig.templates_root_dir || "A_templates";
    return Folder(resolveFile(projectRoot, templatesRootPath).fsName);
}

function loadTemplateSpecById(templateId, projectRoot, globalConfig, cacheMap) {
    if (cacheMap[templateId]) {
        return cacheMap[templateId];
    }

    var templateCfg = null;

    if (globalConfig && globalConfig.templates && globalConfig.templates[templateId]) {
        templateCfg = globalConfig.templates[templateId];
    } else {
        var templatesRoot = getTemplatesRootFolder(projectRoot, globalConfig);
        var templateFolder = Folder(templatesRoot.fsName + "/" + templateId);
        var templateConfigFile = File(templateFolder.fsName + "/config.json");

        if (!templateConfigFile.exists) {
            throw new Error("未找到模板专属配置文件: " + templateConfigFile.fsName);
        }

        var raw = readJsonFile(templateConfigFile);
        templateCfg = raw;
        if (raw && raw.template && typeof raw.template === "object") {
            templateCfg = raw.template;
        }
    }

    var spec = validateTemplateConfig(templateId, templateCfg);
    cacheMap[templateId] = spec;
    return spec;
}

function duplicateTemplatePage(doc, templateSpec) {
    var sourceIndex = Number(templateSpec.source_page_index);
    if (isNaN(sourceIndex) || sourceIndex < 1 || sourceIndex > doc.pages.length) {
        throw new Error("source_page_index 超出范围: " + templateSpec.source_page_index);
    }

    var sourcePage = doc.pages[sourceIndex - 1];
    return duplicatePageSafely(doc, sourcePage);
}

function captureOriginalSpreadIds(doc) {
    var ids = {};
    if (!doc || !doc.isValid) {
        return ids;
    }

    var i;
    for (i = 0; i < doc.spreads.length; i += 1) {
        var sp = doc.spreads[i];
        if (sp && sp.isValid) {
            ids[String(sp.id)] = true;
        }
    }
    return ids;
}

function removeOriginalTemplateSpreads(doc, originalSpreadIds, logs) {
    if (!doc || !doc.isValid || !originalSpreadIds) {
        return;
    }

    var toRemove = [];
    var i;
    for (i = 0; i < doc.spreads.length; i += 1) {
        var sp = doc.spreads[i];
        if (!sp || !sp.isValid) {
            continue;
        }
        if (originalSpreadIds[String(sp.id)]) {
            toRemove.push(sp);
        }
    }

    if (toRemove.length === 0) {
        return;
    }

    for (i = toRemove.length - 1; i >= 0; i -= 1) {
        if (doc.pages.length <= 1) {
            break;
        }
        try {
            if (toRemove[i] && toRemove[i].isValid) {
                toRemove[i].remove();
            }
        } catch (e1) {
            pushLog(logs, "删除模板初始跨页失败: " + e1);
        }
    }
}

function clearFrameContents(frameObj) {
    if (!frameObj || !frameObj.isValid) {
        return;
    }

    try {
        frameObj.contents = "";
    } catch (e1) {
    }

    try {
        while (frameObj.allGraphics.length > 0) {
            frameObj.allGraphics[0].remove();
        }
    } catch (e2) {
    }
}

function duplicatePrototypeToPage(protoItem, targetPage) {
    if (!protoItem || !protoItem.isValid) {
        return null;
    }

    function markClonedItem(itemObj, protoRef) {
        if (!itemObj || !itemObj.isValid) {
            return itemObj;
        }

        var base = "auto_cloned_item";
        try {
            var labelText = String(protoRef && protoRef.label ? protoRef.label : "");
            if (labelText) {
                base = "auto_" + labelText;
            } else {
                base = "auto_" + String(itemObj.constructor.name || "item").toLowerCase();
            }
        } catch (e1) {
        }

        var uniqueSuffix = String((new Date()).getTime()) + "_" + String(Math.floor(Math.random() * 100000));
        try {
            itemObj.name = base + "_" + uniqueSuffix;
        } catch (e2) {
        }
        try {
            // 放置元素不再保留原型 label，避免后续按 label 检索时误命中
            itemObj.label = "";
        } catch (e3) {
        }

        return itemObj;
    }

    try {
        // 直接复制原型对象到目标页，可最大程度保留对象级格式与局部覆盖
        return markClonedItem(protoItem.duplicate(targetPage), protoItem);
    } catch (e1) {
    }

    try {
        var cloned = protoItem.duplicate();
        if (targetPage && targetPage.isValid) {
            cloned.move(targetPage);
        }
        return markClonedItem(cloned, protoItem);
    } catch (e2) {
    }

    return null;
}

function safeRead(getterFn, fallbackValue) {
    try {
        return getterFn();
    } catch (e1) {
        return fallbackValue;
    }
}

function safeRun(runFn) {
    try {
        return runFn();
    } catch (e1) {
        return undefined;
    }
}

function cloneArrayValue(value) {
    if (value && value.constructor === Array) {
        return value.slice(0);
    }
    return value;
}

function captureTextWrapSpec(pageItem) {
    if (!pageItem || !pageItem.isValid || !pageItem.textWrapPreferences) {
        return null;
    }

    var tw = pageItem.textWrapPreferences;
    var keys = ["textWrapMode", "textWrapOffset", "textWrapSide", "inverse", "applyToMasterPageOnly"];
    var spec = {}, i, key, val;
    for (i = 0; i < keys.length; i += 1) {
        key = keys[i];
        val = safeRead(function () { return tw[key]; }, undefined);
        if (val !== undefined) {
            spec[key] = key === "textWrapOffset" ? cloneArrayValue(val) : val;
        }
    }
    return spec;
}

function applyTextWrapSpec(pageItem, textWrapSpec) {
    if (!pageItem || !pageItem.isValid || !textWrapSpec || !pageItem.textWrapPreferences) {
        return;
    }

    var tw = pageItem.textWrapPreferences;
    var keys = ["textWrapMode", "textWrapOffset", "textWrapSide", "inverse", "applyToMasterPageOnly"];
    var i, key, val;
    for (i = 0; i < keys.length; i += 1) {
        key = keys[i];
        if (textWrapSpec[key] === undefined) {
            continue;
        }
        val = key === "textWrapOffset" ? cloneArrayValue(textWrapSpec[key]) : textWrapSpec[key];
        safeRun(function () { tw[key] = val; });
    }
}

function captureTextFramePrefSpec(textFrame) {
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
    var spec = {}, i, key, val;
    for (i = 0; i < keys.length; i += 1) {
        key = keys[i];
        val = safeRead(function () { return tfp[key]; }, undefined);
        if (val !== undefined) {
            spec[key] = key === "insetSpacing" ? cloneArrayValue(val) : val;
        }
    }
    return spec;
}

function applyTextFramePrefSpec(textFrame, prefSpec) {
    if (!textFrame || !textFrame.isValid || !prefSpec || !textFrame.textFramePreferences) {
        return;
    }

    var tfp = textFrame.textFramePreferences;
    var keys = [
        "insetSpacing", "verticalJustification", "firstBaselineOffset", "minimumFirstBaselineOffset",
        "textColumnCount", "textColumnGutter", "useFixedColumnWidth", "fixedColumnWidth", "ignoreWrap",
        "autoSizingReferencePoint", "useNoLineBreaksForAutoSizing", "useMinimumHeightForAutoSizing",
        "minimumHeightForAutoSizing", "useMinimumWidthForAutoSizing", "minimumWidthForAutoSizing",
        "autoSizingType"
    ];
    var i, key, val;
    for (i = 0; i < keys.length; i += 1) {
        key = keys[i];
        if (prefSpec[key] === undefined) {
            continue;
        }
        val = key === "insetSpacing" ? cloneArrayValue(prefSpec[key]) : prefSpec[key];
        safeRun(function () { tfp[key] = val; });
    }
}

function fitImageLikeTemplate(frameObj) {
    safeRun(function () { frameObj.fit(FitOptions.FILL_PROPORTIONALLY); });
    safeRun(function () { frameObj.fit(FitOptions.CENTER_CONTENT); });
}

function fitImageLeftAlignedContent(frameObj) {
    fitImageLikeTemplate(frameObj);

    try {
        if (!frameObj || !frameObj.isValid || !frameObj.allGraphics || frameObj.allGraphics.length === 0) {
            return;
        }
        var graphic = frameObj.allGraphics[0];
        if (!graphic || !graphic.isValid) {
            return;
        }

        var frameBounds = frameObj.geometricBounds;
        var graphicBounds = graphic.geometricBounds;
        var gWidth = graphicBounds[3] - graphicBounds[1];

        // 生日图规则：对齐图片内容（红框）左边到容器（蓝框）左边
        graphic.geometricBounds = [graphicBounds[0], frameBounds[1], graphicBounds[2], frameBounds[1] + gWidth];
    } catch (e1) {
    }
}

function fitImageHeightMatchedWithAlign(frameObj, alignMode) {
    fitImageLikeTemplate(frameObj);

    try {
        if (!frameObj || !frameObj.isValid || !frameObj.allGraphics || frameObj.allGraphics.length === 0) {
            return;
        }
        var graphic = frameObj.allGraphics[0];
        if (!graphic || !graphic.isValid) {
            return;
        }

        var frameBounds = frameObj.geometricBounds;
        var frameHeight = frameBounds[2] - frameBounds[0];
        if (frameHeight <= 0) {
            return;
        }

        var gb = graphic.geometricBounds;
        var graphicHeight = gb[2] - gb[0];
        if (graphicHeight <= 0) {
            return;
        }

        // 周边第2页起规则：图片内容高度必须等于容器高度（等比缩放）
        var scaleFactor = frameHeight / graphicHeight;
        if (Math.abs(scaleFactor - 1) > 0.0001) {
            var hScale = 100;
            var vScale = 100;
            try {
                hScale = Number(graphic.horizontalScale);
            } catch (e2) {
            }
            try {
                vScale = Number(graphic.verticalScale);
            } catch (e3) {
            }
            if (isNaN(hScale) || hScale <= 0) {
                hScale = 100;
            }
            if (isNaN(vScale) || vScale <= 0) {
                vScale = 100;
            }
            graphic.horizontalScale = hScale * scaleFactor;
            graphic.verticalScale = vScale * scaleFactor;
        }

        // 二次校正高度，尽量贴齐容器高度
        gb = graphic.geometricBounds;
        graphicHeight = gb[2] - gb[0];
        if (graphicHeight > 0 && Math.abs(graphicHeight - frameHeight) > 0.01) {
            scaleFactor = frameHeight / graphicHeight;
            if (Math.abs(scaleFactor - 1) > 0.0001) {
                graphic.horizontalScale = Number(graphic.horizontalScale) * scaleFactor;
                graphic.verticalScale = Number(graphic.verticalScale) * scaleFactor;
                gb = graphic.geometricBounds;
            }
        }

        var gWidth = gb[3] - gb[1];
        var gHeight = gb[2] - gb[0];
        var left = frameBounds[1];
        if (alignMode === "center") {
            // 通用规则：水平居中
            var frameCenterX = (frameBounds[1] + frameBounds[3]) / 2;
            left = frameCenterX - gWidth / 2;
        }

        // 最终定位：顶部对齐容器，高度保持与容器一致
        graphic.geometricBounds = [frameBounds[0], left, frameBounds[0] + gHeight, left + gWidth];
    } catch (e4) {
    }
}

function fitImageHeightMatched(frameObj) {
    // 周边第2页起特例：左对齐
    fitImageHeightMatchedWithAlign(frameObj, "left");
}

function fitImageTemplateDSecondPageAdaptive(frameObj) {
    try {
        if (!frameObj || !frameObj.isValid || !frameObj.allGraphics || frameObj.allGraphics.length === 0) {
            return;
        }
        var graphic = frameObj.allGraphics[0];
        if (!graphic || !graphic.isValid) {
            return;
        }

        var frameBounds = frameObj.geometricBounds;
        var frameTop = frameBounds[0];
        var frameLeft = frameBounds[1];
        var frameRight = frameBounds[3];
        var frameWidth = frameRight - frameLeft;
        if (frameWidth <= 0) {
            return;
        }

        var gb = graphic.geometricBounds;
        var gWidth = gb[3] - gb[1];
        var gHeight = gb[2] - gb[0];
        if (gWidth <= 0 || gHeight <= 0) {
            return;
        }

        var ratio = gWidth / gHeight;

        // 宽高比小于 2/3：沿用原有“高度匹配 + 左对齐”逻辑
        if (ratio < (2 / 3)) {
            fitImageHeightMatched(frameObj);
            return;
        }

        // 其余情况：按容器宽度匹配，并让容器高度跟随图片高度
        var scaleByWidth = frameWidth / gWidth;
        if (Math.abs(scaleByWidth - 1) > 0.0001) {
            var hScale = 100;
            var vScale = 100;
            try {
                hScale = Number(graphic.horizontalScale);
            } catch (e1) {
            }
            try {
                vScale = Number(graphic.verticalScale);
            } catch (e2) {
            }
            if (isNaN(hScale) || hScale <= 0) {
                hScale = 100;
            }
            if (isNaN(vScale) || vScale <= 0) {
                vScale = 100;
            }
            graphic.horizontalScale = hScale * scaleByWidth;
            graphic.verticalScale = vScale * scaleByWidth;
        }

        gb = graphic.geometricBounds;
        gHeight = gb[2] - gb[0];
        if (gHeight <= 0) {
            return;
        }

        // 图片宽度锁定为容器宽度，并顶部左侧对齐
        graphic.geometricBounds = [frameTop, frameLeft, frameTop + gHeight, frameRight];
        // 容器高度跟随图片高度
        frameObj.geometricBounds = [frameTop, frameLeft, frameTop + gHeight, frameRight];
    } catch (e3) {
    }
}

function fitImageCoverCentered(frameObj) {
    fitImageLikeTemplate(frameObj);

    try {
        if (!frameObj || !frameObj.isValid || !frameObj.allGraphics || frameObj.allGraphics.length === 0) {
            return;
        }
        var graphic = frameObj.allGraphics[0];
        if (!graphic || !graphic.isValid) {
            return;
        }

        var frameBounds = frameObj.geometricBounds;
        var frameHeight = frameBounds[2] - frameBounds[0];
        var frameWidth = frameBounds[3] - frameBounds[1];
        if (frameHeight <= 0 || frameWidth <= 0) {
            return;
        }

        var gb = graphic.geometricBounds;
        var gHeight = gb[2] - gb[0];
        var gWidth = gb[3] - gb[1];
        if (gHeight <= 0 || gWidth <= 0) {
            return;
        }

        // 先按高度匹配
        var scaleByHeight = frameHeight / gHeight;
        var targetScale = scaleByHeight;

        // 若高度匹配后宽度不足，则改按宽度匹配，确保覆盖容器
        var widthAfterHeight = gWidth * scaleByHeight;
        if (widthAfterHeight < frameWidth) {
            targetScale = frameWidth / gWidth;
        }

        if (Math.abs(targetScale - 1) > 0.0001) {
            var hScale = 100;
            var vScale = 100;
            try {
                hScale = Number(graphic.horizontalScale);
            } catch (e1) {
            }
            try {
                vScale = Number(graphic.verticalScale);
            } catch (e2) {
            }
            if (isNaN(hScale) || hScale <= 0) {
                hScale = 100;
            }
            if (isNaN(vScale) || vScale <= 0) {
                vScale = 100;
            }
            graphic.horizontalScale = hScale * targetScale;
            graphic.verticalScale = vScale * targetScale;
        }

        // 覆盖后保持水平居中
        safeRun(function () { frameObj.fit(FitOptions.CENTER_CONTENT); });
    } catch (e3) {
    }
}

function applyTitleArea(state, headingData, logs) {
    if (state.mainHeading && state.mainHeading.isValid) {
        clearFrameContents(state.mainHeading);
        state.mainHeading.contents = headingData.mainText || "";
    }

    if (state.subHeading && state.subHeading.isValid) {
        clearFrameContents(state.subHeading);
        state.subHeading.contents = headingData.subText || "";
    }

    if (state.titleImage && state.titleImage.isValid) {
        clearFrameContents(state.titleImage);

        if (headingData.titleImagePath) {
            var imgFile = File(headingData.titleImagePath);
            if (imgFile.exists) {
                state.titleImage.place(imgFile);
                fitImageCoverCentered(state.titleImage);
            } else {
                pushLog(logs, "标题图不存在，已跳过，路径=" + headingData.titleImagePath);
            }
        } else {
            pushLog(logs, "未找到可用于标题图的图片");
        }
    }
}

function normalizeTextForInDesign(rawText) {
    if (rawText === null || rawText === undefined) {
        return "";
    }
    var text = String(rawText);
    text = text.replace(/\r\n/g, "\r");
    text = text.replace(/\n/g, "\r");
    return text;
}

function createPageState(doc, templateSpec, headingData, logs) {
    var page = duplicateTemplatePage(doc, templateSpec);

    var bodyTextProto = findPageItemByLabel(page, templateSpec.body_text_proto_label);
    var bodyImageProto = findPageItemByLabel(page, templateSpec.body_image_proto_label);

    if (!bodyTextProto) {
        throw new Error("新页面中未找到正文文本原型框 label: " + templateSpec.body_text_proto_label);
    }
    if (!bodyImageProto) {
        throw new Error("新页面中未找到正文图片原型框 label: " + templateSpec.body_image_proto_label);
    }

    var mainHeading = findPageItemByLabel(page, templateSpec.main_heading_label);
    var subHeading = findPageItemByLabel(page, templateSpec.sub_heading_label);
    var titleImage = findPageItemByLabel(page, templateSpec.title_image_label);
    var columnSpace = findPageItemByLabel(page, templateSpec.column_space_label);

    var bodyTextBounds = bodyTextProto.geometricBounds;
    var pageBounds = page.bounds;

    var startY = toNumberOrDefault(templateSpec.start_y, bodyTextBounds[0]);
    var gapY = toNumberOrDefault(templateSpec.gap_y, 48);

    var softBottom = templateSpec.content_bottom_soft;
    var hardBottom = templateSpec.content_bottom_hard;
    var fallbackBottom = templateSpec.content_bottom;

    if (softBottom === undefined || softBottom === null) {
        softBottom = fallbackBottom;
    }
    if (hardBottom === undefined || hardBottom === null) {
        hardBottom = fallbackBottom;
    }

    softBottom = toNumberOrDefault(softBottom, pageBounds[2]);
    hardBottom = toNumberOrDefault(hardBottom, pageBounds[2]);

    if (hardBottom < softBottom) {
        throw new Error("content_bottom_hard 不能小于 content_bottom_soft");
    }

    var bodyStartY = startY;
    if (columnSpace && columnSpace.isValid) {
        bodyStartY = columnSpace.geometricBounds[2];
    }

    var state = {
        page: page,
        bodyTextProto: bodyTextProto,
        bodyImageProto: bodyImageProto,
        bodyTextProtoRef: bodyTextProto,
        bodyImageProtoRef: bodyImageProto,
        bodyTextSpec: {
            x1: bodyTextBounds[1],
            x2: bodyTextBounds[3],
            baseHeight: bodyTextBounds[2] - bodyTextBounds[0],
            objectStyle: bodyTextProto.appliedObjectStyle,
            textFramePrefSpec: captureTextFramePrefSpec(bodyTextProto),
            paragraphStyle: (function () {
                try {
                    return bodyTextProto.parentStory.texts[0].appliedParagraphStyle;
                } catch (e1) {
                    return null;
                }
            }())
        },
        bodyImageSpec: {
            x1: bodyImageProto.geometricBounds[1],
            x2: bodyImageProto.geometricBounds[3],
            height: bodyImageProto.geometricBounds[2] - bodyImageProto.geometricBounds[0],
            objectStyle: bodyImageProto.appliedObjectStyle,
            textWrapSpec: captureTextWrapSpec(bodyImageProto)
        },
        mainHeading: mainHeading,
        subHeading: subHeading,
        titleImage: titleImage,
        columnSpace: columnSpace,
        cursorY: bodyStartY,
        lastPlacedBottom: null,
        // 续页默认从页面上内框线开始；若模板显式配置 continue_start_y 则优先使用配置
        continuationStartY: toNumberOrDefault(templateSpec.continue_start_y, getPageInnerTop(page)),
        pageMarginSpec: capturePageMarginSpec(page),
        gapY: gapY,
        contentBottomSoft: softBottom,
        contentBottomHard: hardBottom
    };

    applyTitleArea(state, headingData, logs);

    return state;
}

function buildDocGroups(records) {
    var groups = [];
    var currentGroup = null;
    var i;

    for (i = 0; i < records.length; i += 1) {
        var item = records[i];

        if (!item.doc_name) {
            throw new Error("记录缺少 doc_name，index=" + item.index);
        }
        if (!item.template_id) {
            throw new Error("记录缺少 template_id，index=" + item.index);
        }

        if (!currentGroup || currentGroup.doc_name !== item.doc_name) {
            currentGroup = {
                doc_name: item.doc_name,
                template_id: item.template_id,
                items: []
            };
            groups.push(currentGroup);
        }

        if (currentGroup.template_id !== item.template_id) {
            throw new Error("同一连续 doc_name 出现多个 template_id: " + item.doc_name);
        }

        currentGroup.items.push(item);
    }

    return groups;
}

function extractHeadingData(items) {
    var mainText = null;
    var subText = null;
    var titleImagePath = null;
    var consumedTextIndexes = {};

    var i;
    for (i = 0; i < items.length; i += 1) {
        var item = items[i];

        if (item.type === "text") {
            if (mainText === null) {
                mainText = item.content || "";
                consumedTextIndexes[String(item.index)] = true;
                continue;
            }

            if (subText === null) {
                subText = item.content || "";
                consumedTextIndexes[String(item.index)] = true;
                continue;
            }
        }

        if (item.type === "image" && !titleImagePath) {
            titleImagePath = item.src || null;
        }
    }

    return {
        mainText: mainText,
        subText: subText,
        titleImagePath: titleImagePath,
        consumedTextIndexes: consumedTextIndexes
    };
}

function placeTextItem(state, textContent) {
    var spec = state.bodyTextSpec;
    var x1 = spec.x1;
    var x2 = spec.x2;
    var protoHeight = spec.baseHeight;

    var frame = duplicatePrototypeToPage(state.bodyTextProtoRef, state.page);
    if (!frame || !frame.isValid) {
        frame = state.page.textFrames.add();
        try {
            if (spec.objectStyle && spec.objectStyle.isValid) {
                frame.appliedObjectStyle = spec.objectStyle;
            }
        } catch (e1) {
        }

        applyTextFramePrefSpec(frame, spec.textFramePrefSpec);
    }

    frame.geometricBounds = [state.cursorY, x1, state.cursorY + protoHeight, x2];

    frame.contents = normalizeTextForInDesign(textContent);

    try {
        // 输入文本后重排，使自动尺寸按模板设置生效
        frame.parentStory.recompose();
    } catch (e2) {
    }

    try {
        // 回写一次文本框偏好，避免个别版本在写入内容后丢失自动尺寸设置
        applyTextFramePrefSpec(frame, spec.textFramePrefSpec);
    } catch (e3) {
    }

    // 最终再锁一次宽度，防止样式造成宽度漂移
    try {
        var gb = frame.geometricBounds;
        frame.geometricBounds = [gb[0], x1, gb[2], x2];
    } catch (e4) {
    }

    return frame;
}

function placeImageItem(state, imagePath) {
    var spec = state.bodyImageSpec;
    var x1 = spec.x1;
    var x2 = spec.x2;
    var h = spec.height;

    var frame = duplicatePrototypeToPage(state.bodyImageProtoRef, state.page);
    if (!frame || !frame.isValid) {
        frame = state.page.rectangles.add();
        try {
            if (spec.objectStyle && spec.objectStyle.isValid) {
                frame.appliedObjectStyle = spec.objectStyle;
            }
        } catch (e1) {
        }
        applyTextWrapSpec(frame, spec.textWrapSpec);
    }

    frame.geometricBounds = [state.cursorY, x1, state.cursorY + h, x2];
    clearFrameContents(frame);
    frame.place(File(imagePath));
    fitImageCoverCentered(frame);

    return frame;
}

function nextPageState(doc, baseState, logs, docName) {
    var page = doc.pages.add(LocationOptions.AFTER, doc.pages.lastItem());
    applyPageMarginSpec(page, baseState.pageMarginSpec);
    var pageTop = getPageInnerTop(page);
    var continueStart = baseState.continuationStartY;
    if (continueStart === null || continueStart === undefined || isNaN(Number(continueStart))) {
        continueStart = pageTop;
    }

    var state = {
        page: page,
        bodyTextProto: null,
        bodyImageProto: null,
        bodyTextProtoRef: baseState.bodyTextProtoRef || baseState.bodyTextProto,
        bodyImageProtoRef: baseState.bodyImageProtoRef || baseState.bodyImageProto,
        bodyTextSpec: baseState.bodyTextSpec,
        bodyImageSpec: baseState.bodyImageSpec,
        cursorY: continueStart,
        lastPlacedBottom: null,
        continuationStartY: continueStart,
        pageMarginSpec: baseState.pageMarginSpec,
        gapY: baseState.gapY,
        contentBottomSoft: baseState.contentBottomSoft,
        contentBottomHard: baseState.contentBottomHard
    };
    pushLog(logs, "文档续页: " + docName + "，新页索引=" + state.page.documentOffset);
    return state;
}

function getPageMarginValue(page, edgeName, fallback) {
    if (!page || !page.isValid) {
        return fallback;
    }

    var val = fallback;
    try {
        val = Number(page.marginPreferences[edgeName]);
        if (isNaN(val)) {
            val = fallback;
        }
    } catch (e1) {
        val = fallback;
    }

    return val;
}

function getPageInnerBottom(page) {
    if (!page || !page.isValid) {
        return null;
    }
    var pb = page.bounds;
    return pb[2] - getPageMarginValue(page, "bottom", 0);
}

function getPageInnerTop(page) {
    if (!page || !page.isValid) {
        return null;
    }
    var pb = page.bounds;
    return pb[0] + getPageMarginValue(page, "top", 0);
}

function capturePageMarginSpec(page) {
    if (!page || !page.isValid || !page.marginPreferences) {
        return null;
    }
    var mp = page.marginPreferences;
    var spec = {};
    try { spec.top = mp.top; } catch (e1) {}
    try { spec.bottom = mp.bottom; } catch (e2) {}
    try { spec.left = mp.left; } catch (e3) {}
    try { spec.right = mp.right; } catch (e4) {}
    try { spec.columnCount = mp.columnCount; } catch (e5) {}
    try { spec.columnGutter = mp.columnGutter; } catch (e6) {}
    return spec;
}

function applyPageMarginSpec(page, spec) {
    if (!page || !page.isValid || !spec || !page.marginPreferences) {
        return;
    }
    var mp = page.marginPreferences;
    try { if (spec.top !== undefined) { mp.top = spec.top; } } catch (e1) {}
    try { if (spec.bottom !== undefined) { mp.bottom = spec.bottom; } } catch (e2) {}
    try { if (spec.left !== undefined) { mp.left = spec.left; } } catch (e3) {}
    try { if (spec.right !== undefined) { mp.right = spec.right; } } catch (e4) {}
    try { if (spec.columnCount !== undefined) { mp.columnCount = spec.columnCount; } } catch (e5) {}
    try { if (spec.columnGutter !== undefined) { mp.columnGutter = spec.columnGutter; } } catch (e6) {}
}

function getEffectiveBottomSoft(state) {
    var soft = state.contentBottomSoft;
    if (soft === null || soft === undefined || isNaN(Number(soft))) {
        return getPageInnerBottom(state.page);
    }
    return Number(soft);
}

function getEffectiveBottomHard(state) {
    var hard = state.contentBottomHard;
    if (hard === null || hard === undefined || isNaN(Number(hard))) {
        hard = getPageInnerBottom(state.page);
    } else {
        hard = Number(hard);
    }

    var soft = getEffectiveBottomSoft(state);
    if (hard < soft) {
        hard = soft;
    }
    return hard;
}

function fitPageBottomToLastItem(state, logs, reasonText) {
    if (!state || !state.page || !state.page.isValid) {
        return;
    }
    if (state.lastPlacedBottom === null || state.lastPlacedBottom === undefined) {
        return;
    }

    var page = state.page;
    var pb = page.bounds;
    var pageTop = pb[0];
    var pageLeft = pb[1];
    var pageBottom = pb[2];
    var pageRight = pb[3];
    var pageWidth = pageRight - pageLeft;
    var bottomMargin = getPageMarginValue(page, "bottom", 0);

    var targetBottom = state.lastPlacedBottom + bottomMargin;
    if (targetBottom <= pageTop + 1) {
        targetBottom = pageTop + 1;
    }

    if (Math.abs(targetBottom - pageBottom) < 0.5) {
        return;
    }

    var targetHeight = targetBottom - pageTop;
    if (targetHeight <= 1) {
        return;
    }

    try {
        // 以页面左上角为锚点修改页面高度，让最后元素底边贴到下内框线
        page.resize(
            CoordinateSpaces.INNER_COORDINATES,
            AnchorPoint.TOP_LEFT_ANCHOR,
            ResizeMethods.REPLACING_CURRENT_DIMENSIONS_WITH,
            [pageWidth, targetHeight]
        );
        pushLog(logs, "页面高度已贴合内容(" + reasonText + "): 页索引=" + page.documentOffset + "，目标底边=" + targetBottom);
        return;
    } catch (e2) {
    }

    try {
        // 兼容兜底：若页面尺寸不可改，改下边距使下内框线贴合最后元素
        var newBottomMargin = Math.max(0, pageBottom - state.lastPlacedBottom);
        page.marginPreferences.bottom = newBottomMargin;
        pushLog(logs, "页面高度调整失败，已改下边距贴合内容(" + reasonText + "): 页索引=" + page.documentOffset + "，bottomMargin=" + newBottomMargin);
    } catch (e3) {
        pushLog(logs, "页面贴合失败(" + reasonText + "): 页索引=" + page.documentOffset + "，错误=" + e3);
    }
}

function cleanupPrototypeItems(baseState, logs) {
    try {
        if (baseState && baseState.bodyTextProto && baseState.bodyTextProto.isValid) {
            baseState.bodyTextProto.remove();
        }
    } catch (e1) {
        pushLog(logs, "清理正文文本原型框失败: " + e1);
    }
    try {
        if (baseState && baseState.bodyImageProto && baseState.bodyImageProto.isValid) {
            baseState.bodyImageProto.remove();
        }
    } catch (e2) {
        pushLog(logs, "清理正文图片原型框失败: " + e2);
    }
}

function cleanupOnePrototype(item, logs, textMsg) {
    try {
        if (item && item.isValid) {
            item.remove();
        }
    } catch (e1) {
        pushLog(logs, textMsg + ": " + e1);
    }
}

function duplicatePageSafely(doc, sourcePage) {
    function ensurePageShuffleEnabled(docObj) {
        try {
            docObj.allowPageShuffle = true;
        } catch (e1) {
        }
        try {
            var s;
            for (s = 0; s < docObj.spreads.length; s += 1) {
                docObj.spreads[s].allowPageShuffle = true;
            }
        } catch (e2) {
        }
    }

    function duplicateSpreadAndGetTargetPage(docObj, srcPage) {
        var srcSpread = srcPage.parent;
        if (!srcSpread || !srcSpread.isValid) {
            throw new Error("源页面不在有效 spread 中");
        }

        var srcPages = srcSpread.pages;
        var relPageIndex = -1;
        var i;
        for (i = 0; i < srcPages.length; i += 1) {
            if (srcPages[i] === srcPage || (srcPages[i].id && srcPages[i].id === srcPage.id)) {
                relPageIndex = i;
                break;
            }
        }
        if (relPageIndex < 0) {
            throw new Error("无法定位源页面在 spread 内的位置");
        }

        var newSpread = srcSpread.duplicate(LocationOptions.AFTER, docObj.spreads.lastItem());
        if (!newSpread || !newSpread.isValid) {
            throw new Error("spread 复制后对象无效");
        }
        if (!newSpread.pages || newSpread.pages.length === 0) {
            throw new Error("spread 复制后不包含页面");
        }
        if (relPageIndex >= newSpread.pages.length) {
            throw new Error("spread 复制后页数不足，目标页索引=" + relPageIndex + "，新spread页数=" + newSpread.pages.length);
        }

        var targetPage = newSpread.pages[relPageIndex];

        // 复制 spread 后仅保留目标页，避免未使用的同跨页页面导致页数膨胀
        if (newSpread.pages.length > 1) {
            var pagesToRemove = [];
            var p;
            for (p = 0; p < newSpread.pages.length; p += 1) {
                var onePage = newSpread.pages[p];
                if (!(onePage === targetPage || (onePage.id && targetPage.id && onePage.id === targetPage.id))) {
                    pagesToRemove.push(onePage);
                }
            }
            for (p = pagesToRemove.length - 1; p >= 0; p -= 1) {
                try {
                    if (pagesToRemove[p] && pagesToRemove[p].isValid && docObj.pages.length > 1) {
                        pagesToRemove[p].remove();
                    }
                } catch (eRemove) {
                }
            }
        }

        return targetPage;
    }

    if (!doc || !doc.isValid || !sourcePage || !sourcePage.isValid) {
        throw new Error("复制模板页失败：文档或源页面无效");
    }

    ensurePageShuffleEnabled(doc);

    try {
        // 统一改为复制 spread，避免 page 复制触发 spread 页数上限问题
        return duplicateSpreadAndGetTargetPage(doc, sourcePage);
    } catch (e1) {
    }

    ensurePageShuffleEnabled(doc);

    try {
        return duplicateSpreadAndGetTargetPage(doc, sourcePage);
    } catch (e4) {
        throw new Error("复制模板页失败，源页索引=" + (sourcePage.documentOffset + 1) + "，spread复制错误=" + e4);
    }
}

function duplicateTemplatePageByIndex(doc, sourceIndex) {
    var idx = Number(sourceIndex);
    if (isNaN(idx) || idx < 1 || idx > doc.pages.length) {
        throw new Error("source_page_index 超出范围: " + sourceIndex);
    }
    var sourcePage = doc.pages[idx - 1];
    return duplicatePageSafely(doc, sourcePage);
}

function buildTextSpecFromProto(textProto) {
    var bounds = textProto.geometricBounds;
    return {
        x1: bounds[1],
        x2: bounds[3],
        baseHeight: bounds[2] - bounds[0],
        objectStyle: textProto.appliedObjectStyle,
        textFramePrefSpec: captureTextFramePrefSpec(textProto),
        paragraphStyle: (function () {
            try {
                return textProto.parentStory.texts[0].appliedParagraphStyle;
            } catch (e1) {
                return null;
            }
        }())
    };
}

function buildImageSpecFromProto(imageProto) {
    var bounds = imageProto.geometricBounds;
    return {
        x1: bounds[1],
        x2: bounds[3],
        height: bounds[2] - bounds[0],
        objectStyle: imageProto.appliedObjectStyle,
        textWrapSpec: captureTextWrapSpec(imageProto)
    };
}

function buildBoxSpecFromProto(pageItem) {
    var bounds = pageItem.geometricBounds;
    return {
        x1: bounds[1],
        x2: bounds[3],
        height: bounds[2] - bounds[0]
    };
}

function placeFixedItemFromSpec(state, protoRef, itemSpec) {
    var item = duplicatePrototypeToPage(protoRef, state.page);
    if (!item || !item.isValid) {
        throw new Error("复制原型对象失败，label=" + (protoRef ? protoRef.label : ""));
    }
    item.geometricBounds = [state.cursorY, itemSpec.x1, state.cursorY + itemSpec.height, itemSpec.x2];
    return item;
}

function nextPageStateFromBase(doc, baseState, logs, docName) {
    var page = doc.pages.add(LocationOptions.AFTER, doc.pages.lastItem());
    applyPageMarginSpec(page, baseState.pageMarginSpec);

    var pageTop = getPageInnerTop(page);
    var continueStart = baseState.continuationStartY;
    if (continueStart === null || continueStart === undefined || isNaN(Number(continueStart))) {
        continueStart = pageTop;
    }

    var state = {
        page: page,
        cursorY: continueStart,
        lastPlacedBottom: null,
        continuationStartY: continueStart,
        pageMarginSpec: baseState.pageMarginSpec,
        gapY: baseState.gapY,
        contentBottomSoft: baseState.contentBottomSoft,
        contentBottomHard: baseState.contentBottomHard
    };

    var carryKeys = [
        "bodyTextProtoRef", "bodyImageProtoRef", "cardProtoRef", "columnSpace2ProtoRef", "photoGroupProtoRef",
        "bodyTextSpec", "bodyImageSpec", "cardSpec", "columnSpace2Spec", "photoGroupSpec"
    ];
    var i;
    for (i = 0; i < carryKeys.length; i += 1) {
        if (baseState[carryKeys[i]] !== undefined) {
            state[carryKeys[i]] = baseState[carryKeys[i]];
        }
    }

    pushLog(logs, "文档续页: " + docName + "，新页索引=" + state.page.documentOffset);
    return state;
}

function resolveBottomRange(templateSpec, page) {
    var pageBounds = page.bounds;
    var softBottom = templateSpec.content_bottom_soft;
    var hardBottom = templateSpec.content_bottom_hard;
    var fallbackBottom = templateSpec.content_bottom;

    if (softBottom === undefined || softBottom === null) {
        softBottom = fallbackBottom;
    }
    if (hardBottom === undefined || hardBottom === null) {
        hardBottom = fallbackBottom;
    }

    softBottom = toNumberOrDefault(softBottom, pageBounds[2]);
    hardBottom = toNumberOrDefault(hardBottom, pageBounds[2]);
    if (hardBottom < softBottom) {
        throw new Error("content_bottom_hard 不能小于 content_bottom_soft");
    }

    return {
        softBottom: softBottom,
        hardBottom: hardBottom
    };
}

function createPageStateTemplateB(doc, templateSpec) {
    var page = duplicateTemplatePage(doc, templateSpec);
    var bodyTextProto = findPageItemByLabel(page, templateSpec.body_text_proto_label);
    var bodyImageProto = findPageItemByLabel(page, templateSpec.body_image_proto_label);
    var cardProto = findPageItemByLabel(page, templateSpec.card_proto_label);
    var columnSpace = findPageItemByLabel(page, templateSpec.column_space_label);

    if (!bodyTextProto) {
        throw new Error("templateB 缺少正文文本原型框: " + templateSpec.body_text_proto_label);
    }
    if (!bodyImageProto) {
        throw new Error("templateB 缺少正文图片原型框: " + templateSpec.body_image_proto_label);
    }
    if (!cardProto) {
        throw new Error("templateB 缺少装饰原型框: " + templateSpec.card_proto_label);
    }

    var range = resolveBottomRange(templateSpec, page);
    var bodyStartY = bodyTextProto.geometricBounds[0];
    if (columnSpace && columnSpace.isValid) {
        bodyStartY = columnSpace.geometricBounds[2];
    }

    return {
        page: page,
        bodyTextProto: bodyTextProto,
        bodyImageProto: bodyImageProto,
        cardProto: cardProto,
        bodyTextProtoRef: bodyTextProto,
        bodyImageProtoRef: bodyImageProto,
        cardProtoRef: cardProto,
        bodyTextSpec: buildTextSpecFromProto(bodyTextProto),
        bodyImageSpec: buildImageSpecFromProto(bodyImageProto),
        cardSpec: buildBoxSpecFromProto(cardProto),
        cursorY: bodyStartY,
        lastPlacedBottom: null,
        continuationStartY: toNumberOrDefault(templateSpec.continue_start_y, getPageInnerTop(page)),
        pageMarginSpec: capturePageMarginSpec(page),
        gapY: 0,
        contentBottomSoft: range.softBottom,
        contentBottomHard: range.hardBottom
    };
}

function buildModeBUnits(items) {
    var units = [];
    var pendingImages = [];
    var pendingBreak = false;
    var i;
    for (i = 0; i < items.length; i += 1) {
        var item = items[i];
        if (item.page_break_before) {
            pendingBreak = true;
        }
        if (item.type === "image") {
            pendingImages.push({
                index: item.index,
                src: item.src || "",
                pageBreakBefore: !!item.page_break_before
            });
            continue;
        }
        if (item.type === "text") {
            var imageInfo = pendingImages.length > 0 ? pendingImages.shift() : null;
            var imageSrc = imageInfo ? imageInfo.src : "";
            units.push({
                startIndex: imageInfo ? imageInfo.index : item.index,
                textIndex: item.index,
                text: item.content || "",
                withImage: !!imageSrc,
                imageSrc: imageSrc,
                pageBreakBefore: pendingBreak || !!(imageInfo && imageInfo.pageBreakBefore)
            });
            pendingBreak = false;
        }
    }
    return units;
}

function placeModeBImageItem(state, imagePath, logs) {
    var spec = state.bodyImageSpec;
    var frame = duplicatePrototypeToPage(state.bodyImageProtoRef, state.page);
    if (!frame || !frame.isValid) {
        throw new Error("复制图片原型失败");
    }
    frame.geometricBounds = [state.cursorY, spec.x1, state.cursorY + spec.height, spec.x2];
    if (imagePath) {
        var imgFile = File(imagePath);
        if (imgFile.exists) {
            clearFrameContents(frame);
            frame.place(imgFile);
            fitImageCoverCentered(frame);
        } else {
            pushLog(logs, "templateB 图片不存在，保留模板原图，路径=" + imagePath);
        }
    }
    return frame;
}

function processGroupTemplateB(doc, group, templateSpec, logs, pageBreakReport) {
    var result = {
        createdPageCount: 0,
        placedTextCount: 0,
        placedImageCount: 0,
        firstPage: null
    };

    var baseState = createPageStateTemplateB(doc, templateSpec);
    var state = baseState;
    var units = buildModeBUnits(group.items);

    result.createdPageCount += 1;
    result.firstPage = state.page;

    var i;
    for (i = 0; i < units.length; i += 1) {
        var unit = units[i];

        if (unit.pageBreakBefore && i > 0) {
            fitPageBottomToLastItem(state, logs, "templateB 手动分页前");
            state = nextPageStateFromBase(doc, baseState, logs, group.doc_name);
            result.createdPageCount += 1;
        }

        if (state.cursorY > getEffectiveBottomSoft(state)) {
            recordAutoPageBreak(pageBreakReport, unit.startIndex, "templateB", group.doc_name, "soft");
            fitPageBottomToLastItem(state, logs, "templateB soft换页前");
            state = nextPageStateFromBase(doc, baseState, logs, group.doc_name);
            result.createdPageCount += 1;
        }

        if (unit.withImage) {
            if (state.cursorY + state.bodyImageSpec.height > getEffectiveBottomHard(state)) {
                recordAutoPageBreak(pageBreakReport, unit.startIndex, "templateB", group.doc_name, "image hard");
                fitPageBottomToLastItem(state, logs, "templateB image hard换页前");
                state = nextPageStateFromBase(doc, baseState, logs, group.doc_name);
                result.createdPageCount += 1;
            }
            var imgFrame = placeModeBImageItem(state, unit.imageSrc, logs);
            var imgBottom = imgFrame.geometricBounds[2];
            state.cursorY = imgBottom + state.gapY;
            state.lastPlacedBottom = imgBottom;
            result.placedImageCount += 1;
        }

        var textFrame = placeTextItem(state, unit.text);
        var textBottom = textFrame.geometricBounds[2];
        if (textBottom > getEffectiveBottomHard(state)) {
            textFrame.remove();
            recordAutoPageBreak(pageBreakReport, unit.startIndex, "templateB", group.doc_name, "text hard");
            fitPageBottomToLastItem(state, logs, "templateB text hard换页前");
            state = nextPageStateFromBase(doc, baseState, logs, group.doc_name);
            result.createdPageCount += 1;
            textFrame = placeTextItem(state, unit.text);
            textBottom = textFrame.geometricBounds[2];
        }
        state.cursorY = textBottom + state.gapY;
        state.lastPlacedBottom = textBottom;
        result.placedTextCount += 1;

        if (state.cursorY + state.cardSpec.height > getEffectiveBottomHard(state)) {
            fitPageBottomToLastItem(state, logs, "templateB card hard换页前");
            state = nextPageStateFromBase(doc, baseState, logs, group.doc_name);
            result.createdPageCount += 1;
        }
        var cardFrame = placeFixedItemFromSpec(state, state.cardProtoRef, state.cardSpec);
        var cardBottom = cardFrame.geometricBounds[2];
        state.cursorY = cardBottom + state.gapY;
        state.lastPlacedBottom = cardBottom;
    }

    fitPageBottomToLastItem(state, logs, "templateB 文档组结束");
    cleanupOnePrototype(baseState.bodyTextProto, logs, "清理 templateB 文本原型失败");
    cleanupOnePrototype(baseState.bodyImageProto, logs, "清理 templateB 图片原型失败");
    cleanupOnePrototype(baseState.cardProto, logs, "清理 templateB 装饰原型失败");
    return result;
}

function createPageStateTemplateC(doc, templateSpec, headingData) {
    var page = duplicateTemplatePage(doc, templateSpec);
    var bodyTextProto = findPageItemByLabel(page, templateSpec.body_text_proto_label);
    var columnSpace = findPageItemByLabel(page, templateSpec.column_space_label);
    var columnSpace2Proto = findPageItemByLabel(page, templateSpec.column_space2_label);
    var photoGroupProto = findPageItemByLabel(page, templateSpec.photo_group_label);
    var mainHeading = findPageItemByLabel(page, templateSpec.main_heading_label);
    var subHeading = findPageItemByLabel(page, templateSpec.sub_heading_label);

    if (!bodyTextProto) {
        throw new Error("templateC 缺少正文文本原型框: " + templateSpec.body_text_proto_label);
    }
    if (!columnSpace2Proto) {
        throw new Error("templateC 缺少 column_space2 对象: " + templateSpec.column_space2_label);
    }
    if (!photoGroupProto) {
        throw new Error("templateC 缺少 photo_group 对象: " + templateSpec.photo_group_label);
    }

    if (mainHeading && mainHeading.isValid) {
        clearFrameContents(mainHeading);
        mainHeading.contents = headingData.mainText || "";
    }
    if (subHeading && subHeading.isValid) {
        clearFrameContents(subHeading);
        subHeading.contents = headingData.subText || "";
    }

    var bodyStartY = bodyTextProto.geometricBounds[0];
    if (columnSpace && columnSpace.isValid) {
        bodyStartY = columnSpace.geometricBounds[2];
    }
    var range = resolveBottomRange(templateSpec, page);

    return {
        page: page,
        bodyTextProto: bodyTextProto,
        columnSpace2Proto: columnSpace2Proto,
        photoGroupProto: photoGroupProto,
        bodyTextProtoRef: bodyTextProto,
        columnSpace2ProtoRef: columnSpace2Proto,
        photoGroupProtoRef: photoGroupProto,
        bodyTextSpec: buildTextSpecFromProto(bodyTextProto),
        columnSpace2Spec: buildBoxSpecFromProto(columnSpace2Proto),
        photoGroupSpec: buildBoxSpecFromProto(photoGroupProto),
        cursorY: bodyStartY,
        lastPlacedBottom: null,
        continuationStartY: toNumberOrDefault(templateSpec.continue_start_y, getPageInnerTop(page)),
        pageMarginSpec: capturePageMarginSpec(page),
        gapY: 0,
        contentBottomSoft: range.softBottom,
        contentBottomHard: range.hardBottom
    };
}

function processGroupTemplateC(doc, group, templateSpec, logs) {
    var result = {
        createdPageCount: 0,
        placedTextCount: 0,
        placedImageCount: 0,
        firstPage: null
    };

    var headingData = extractHeadingData(group.items);
    var baseState = createPageStateTemplateC(doc, templateSpec, headingData);
    var state = baseState;

    result.createdPageCount += 1;
    result.firstPage = state.page;

    var i;
    for (i = 0; i < group.items.length; i += 1) {
        var item = group.items[i];
        var itemIndexKey = String(item.index);

        if (item.type === "text" && headingData.consumedTextIndexes[itemIndexKey]) {
            continue;
        }
        if (item.type !== "text") {
            continue;
        }

        var textFrame = placeTextItem(state, item.content || "");
        var textBottom = textFrame.geometricBounds[2];
        state.cursorY = textBottom + state.gapY;
        state.lastPlacedBottom = textBottom;
        result.placedTextCount += 1;
    }

    var columnSpace2Item = placeFixedItemFromSpec(state, state.columnSpace2ProtoRef, state.columnSpace2Spec);
    var columnSpace2Bottom = columnSpace2Item.geometricBounds[2];
    state.cursorY = columnSpace2Bottom + state.gapY;
    state.lastPlacedBottom = columnSpace2Bottom;

    var photoGroupItem = placeFixedItemFromSpec(state, state.photoGroupProtoRef, state.photoGroupSpec);
    var photoGroupBottom = photoGroupItem.geometricBounds[2];
    state.cursorY = photoGroupBottom + state.gapY;
    state.lastPlacedBottom = photoGroupBottom;

    fitPageBottomToLastItem(state, logs, "templateC 文档组结束");
    cleanupOnePrototype(baseState.bodyTextProto, logs, "清理 templateC 文本原型失败");
    cleanupOnePrototype(baseState.columnSpace2Proto, logs, "清理 templateC column_space2 原型失败");
    cleanupOnePrototype(baseState.photoGroupProto, logs, "清理 templateC photo_group 原型失败");
    return result;
}

function splitTitleAndBodyText(textValue) {
    var raw = String(textValue || "");
    raw = raw.replace(/\r\n/g, "\n");
    raw = raw.replace(/\r/g, "\n");
    var lines = raw.split("\n");
    var titleText = lines.length > 0 ? lines[0] : "";
    var bodyText = lines.length > 1 ? lines.slice(1).join("\n") : "";
    return {
        titleText: titleText,
        bodyText: bodyText
    };
}

function buildTemplateDTextGroups(items) {
    var groups = [];
    var current = null;
    var i;
    for (i = 0; i < items.length; i += 1) {
        var item = items[i];
        if (item.type === "text") {
            var txt = item.content || "";
            if (!current || item.page_break_before) {
                current = {
                    startIndex: item.index,
                    manualBreak: !!item.page_break_before,
                    textParts: [txt],
                    imageItems: []
                };
                groups.push(current);
            } else if (current.imageItems.length === 0) {
                // 同一组中在首张图片前出现的连续文本，合并为一个文本块
                current.textParts.push(txt);
            } else {
                // 当前组已进入图片区，新的文本意味着新组开始
                current = {
                    startIndex: item.index,
                    manualBreak: false,
                    textParts: [txt],
                    imageItems: []
                };
                groups.push(current);
            }
            continue;
        }
        if (item.type === "image" && current) {
            current.imageItems.push(item);
        }
    }

    // 兼容旧调用结构：输出 textItem + imageItems
    var normalized = [];
    for (i = 0; i < groups.length; i += 1) {
        var g = groups[i];
        var mergedText = "";
        if (g.textParts && g.textParts.length > 0) {
            mergedText = g.textParts.join("\n");
        }
        normalized.push({
            startIndex: g.startIndex,
            manualBreak: !!g.manualBreak,
            textItem: {
                content: mergedText
            },
            imageItems: g.imageItems || []
        });
    }
    return normalized;
}

function buildPhotoRowPriorityOrder(rowCount) {
    var order = [];
    if (rowCount <= 0) {
        return order;
    }
    if (rowCount === 1) {
        return [0];
    }
    if (rowCount === 2) {
        return [0, 1];
    }

    var step;
    if (rowCount % 2 === 1) {
        var mid = Math.floor(rowCount / 2);
        order.push(mid);
        step = 1;
        while (order.length < rowCount) {
            var top = mid - step;
            var bottom = mid + step;
            if (top >= 0) {
                order.push(top);
            }
            if (bottom < rowCount) {
                order.push(bottom);
            }
            step += 1;
        }
        return order;
    }

    var midLeft = rowCount / 2 - 1;
    var midRight = rowCount / 2;
    order.push(midLeft);
    order.push(midRight);
    step = 1;
    while (order.length < rowCount) {
        var topIdx = midLeft - step;
        var bottomIdx = midRight + step;
        if (topIdx >= 0) {
            order.push(topIdx);
        }
        if (bottomIdx < rowCount) {
            order.push(bottomIdx);
        }
        step += 1;
    }
    return order;
}

function buildPhotoRowCounts(totalCount) {
    var n = Number(totalCount);
    if (isNaN(n) || n <= 0) {
        return [];
    }
    if (n <= 3) {
        return [n];
    }

    var rowCount = Math.ceil(n / 3);
    var counts = [];
    var i;
    for (i = 0; i < rowCount; i += 1) {
        counts.push(2);
    }

    var remaining = n - rowCount * 2;
    var order = buildPhotoRowPriorityOrder(rowCount);
    while (remaining > 0) {
        var changed = false;
        for (i = 0; i < order.length && remaining > 0; i += 1) {
            var idx = order[i];
            if (counts[idx] < 3) {
                counts[idx] += 1;
                remaining -= 1;
                changed = true;
            }
        }
        if (!changed) {
            break;
        }
    }
    return counts;
}

function buildRowXBounds(imageCount, centerX, imageWidth) {
    var w = Number(imageWidth);
    if (isNaN(w) || w <= 0) {
        throw new Error("图片宽度无效: " + imageWidth);
    }

    if (imageCount <= 1) {
        return [[centerX - w / 2, centerX + w / 2]];
    }
    if (imageCount === 2) {
        return [
            [centerX - w, centerX],
            [centerX, centerX + w]
        ];
    }
    return [
        [centerX - 1.5 * w, centerX - 0.5 * w],
        [centerX - 0.5 * w, centerX + 0.5 * w],
        [centerX + 0.5 * w, centerX + 1.5 * w]
    ];
}

function buildRowXBoundsLeftAligned(imageCount, leftX, imageWidth) {
    var w = Number(imageWidth);
    if (isNaN(w) || w <= 0) {
        throw new Error("图片宽度无效: " + imageWidth);
    }

    if (imageCount <= 1) {
        return [[leftX, leftX + w]];
    }
    if (imageCount === 2) {
        return [
            [leftX, leftX + w],
            [leftX + w, leftX + 2 * w]
        ];
    }
    return [
        [leftX, leftX + w],
        [leftX + w, leftX + 2 * w],
        [leftX + 2 * w, leftX + 3 * w]
    ];
}

function keepFrameTopGap(frame, targetTop) {
    if (!frame || !frame.isValid) {
        return;
    }
    var gb = frame.geometricBounds;
    var h = gb[2] - gb[0];
    frame.geometricBounds = [targetTop, gb[1], targetTop + h, gb[3]];
}

function processGroupTemplateD(doc, group, templateSpec, logs, pageBreakReport) {
    var result = {
        createdPageCount: 0,
        placedTextCount: 0,
        placedImageCount: 0,
        firstPage: null
    };

    var contentGroups = buildTemplateDTextGroups(group.items);
    if (contentGroups.length === 0) {
        pushLog(logs, "templateD 未找到可用文本组: " + group.doc_name);
        return result;
    }

    var g;
    for (g = 0; g < contentGroups.length; g += 1) {
        var cg = contentGroups[g];
        var isFirstGroup = g === 0;
        if (!isFirstGroup && !cg.manualBreak) {
            recordAutoPageBreak(pageBreakReport, cg.startIndex, "templateD", group.doc_name, "text group");
        }
        var splitText = splitTitleAndBodyText(cg.textItem.content || "");
        var pageIndex = isFirstGroup ? templateSpec.first_group_source_page_index : templateSpec.other_group_source_page_index;
        var sourcePage = doc.pages[Number(pageIndex) - 1];
        var sourceLabels = collectPageLabels(sourcePage, 80).join(", ");
        var page = duplicateTemplatePageByIndex(doc, pageIndex);
        result.createdPageCount += 1;
        if (!result.firstPage) {
            result.firstPage = page;
        }

        var dividerLabel = isFirstGroup ? templateSpec.first_divider_label : templateSpec.other_divider_label;
        var imageLabel = isFirstGroup ? templateSpec.first_image_proto_label : templateSpec.other_image_proto_label;
        var textLabel = isFirstGroup ? templateSpec.first_text_proto_label : templateSpec.other_text_proto_label;

        var dividerItem = findPageItemByLabels(page, buildDividerLabelCandidates(dividerLabel));
        var imageProto = findPageItemByLabel(page, imageLabel);
        var textProto = findPageItemByLabel(page, textLabel);
        if (!dividerItem) {
            throw new Error(
                "templateD 缺少分隔线对象: " + dividerLabel +
                "；组序号=" + (g + 1) +
                "；源页索引=" + pageIndex +
                "；源页label=" + sourceLabels +
                "；复制页label=" + collectPageLabels(page, 80).join(", ")
            );
        }
        if (!imageProto) {
            throw new Error("templateD 缺少图片原型框: " + imageLabel);
        }
        if (!textProto) {
            throw new Error("templateD 缺少文本原型框: " + textLabel);
        }

        if (!isFirstGroup) {
            var headingItem = findPageItemByLabel(page, templateSpec.other_heading_label);
            if (!headingItem) {
                throw new Error("templateD 缺少标题对象: " + templateSpec.other_heading_label + "；本页可见label=" + collectPageLabels(page, 80).join(", "));
            }
            if (headingItem.isValid && headingItem.contents !== undefined) {
                clearFrameContents(headingItem);
                headingItem.contents = splitText.titleText || "";
            }
            var headingBottom = headingItem.geometricBounds[2];
            var dividerBounds = dividerItem.geometricBounds;
            var dividerHeight = dividerBounds[2] - dividerBounds[0];
            var dividerTop = headingBottom + templateSpec.divider_offset_from_heading;
            dividerItem.geometricBounds = [dividerTop, dividerBounds[1], dividerTop + dividerHeight, dividerBounds[3]];
        }

        var validImageFiles = [];
        var ii;
        for (ii = 0; ii < cg.imageItems.length; ii += 1) {
            var imagePath = cg.imageItems[ii].src || "";
            var imageFile = File(imagePath);
            if (imageFile.exists) {
                validImageFiles.push(imageFile.fsName);
            } else {
                pushLog(logs, "templateD 图片不存在，已跳过，路径=" + imagePath);
            }
        }

        var dividerBottom = dividerItem.geometricBounds[2];
        var imageSpec = buildImageSpecFromProto(imageProto);
        var bodyText = splitText.bodyText;
        var textStartY = dividerBottom + templateSpec.text_top_gap;

        if (isFirstGroup) {
            // 第1组保留原有生日图网格排版规则
            var imageWidth = imageSpec.x2 - imageSpec.x1;
            var photoStartY = dividerBottom + templateSpec.photo_top_gap;
            var photoBottom = dividerBottom;

            if (validImageFiles.length > 0) {
                var rowCounts = buildPhotoRowCounts(validImageFiles.length);
                var imageIndex = 0;
                var rowIdx;
                for (rowIdx = 0; rowIdx < rowCounts.length; rowIdx += 1) {
                    var rowCount = rowCounts[rowIdx];
                    var rowTop = photoStartY + rowIdx * (imageSpec.height + templateSpec.photo_row_gap);
                    // 周边第1页生日图统一按图片原型左边界对齐
                    var xBoundsList = buildRowXBoundsLeftAligned(rowCount, imageSpec.x1, imageWidth);
                    var cellIdx;
                    for (cellIdx = 0; cellIdx < rowCount; cellIdx += 1) {
                        var frame = duplicatePrototypeToPage(imageProto, page);
                        if (!frame || !frame.isValid) {
                            throw new Error("templateD 复制图片原型失败");
                        }
                        var xBounds = xBoundsList[cellIdx];
                        frame.geometricBounds = [rowTop, xBounds[0], rowTop + imageSpec.height, xBounds[1]];
                        clearFrameContents(frame);
                        frame.place(File(validImageFiles[imageIndex]));
                        fitImageLeftAlignedContent(frame);
                        imageIndex += 1;
                        result.placedImageCount += 1;
                    }
                    photoBottom = rowTop + imageSpec.height;
                }
            }

            textStartY = (validImageFiles.length > 0 ? photoBottom : dividerBottom) + templateSpec.text_top_gap;
        } else {
            // 第2组开始：图片按普通纵向排列，固定 gap=48
            var normalGap = 48;
            var cursorY = dividerBottom + normalGap;
            var imgIdx;
            for (imgIdx = 0; imgIdx < validImageFiles.length; imgIdx += 1) {
                var lineFrame = duplicatePrototypeToPage(imageProto, page);
                if (!lineFrame || !lineFrame.isValid) {
                    throw new Error("templateD 复制图片原型失败");
                }
                lineFrame.geometricBounds = [cursorY, imageSpec.x1, cursorY + imageSpec.height, imageSpec.x2];
                clearFrameContents(lineFrame);
                lineFrame.place(File(validImageFiles[imgIdx]));
                fitImageTemplateDSecondPageAdaptive(lineFrame);
                cursorY = lineFrame.geometricBounds[2] + normalGap;
                result.placedImageCount += 1;
            }
            textStartY = cursorY;
        }

        var textState = {
            page: page,
            cursorY: textStartY,
            bodyTextProtoRef: textProto,
            bodyTextSpec: buildTextSpecFromProto(textProto)
        };
        var textFrame = placeTextItem(textState, bodyText);
        // 固定正文与上方元素间距，避免文本框因自动尺寸参考点造成贴底偏移
        keepFrameTopGap(textFrame, textStartY);
        var textBottom = textFrame.geometricBounds[2];
        result.placedTextCount += 1;

        fitPageBottomToLastItem({
            page: page,
            lastPlacedBottom: textBottom
        }, logs, "templateD 文本组结束");

        cleanupOnePrototype(imageProto, logs, "清理 templateD 图片原型失败");
        cleanupOnePrototype(textProto, logs, "清理 templateD 文本原型失败");
    }

    return result;
}

function main() {
    var logs = [];
    pushLog(logs, "开始执行 InDesign 自动排版");

    var batchMode = isTruthyArg(getScriptArgValue("pipeline_batch_mode"));
    var inputJsonArg = getScriptArgValue("pipeline_input_json");
    var outputInddArg = getScriptArgValue("pipeline_output_indd");
    var forcedTemplateIdArg = getScriptArgValue("pipeline_target_template_id");
    var forcedLayoutModeArg = getScriptArgValue("pipeline_force_layout_mode");
    var templateInddArg = getScriptArgValue("pipeline_template_indd");
    var configPathArg = getScriptArgValue("pipeline_config_path");

    if (app.documents.length === 0) {
        if (batchMode && templateInddArg) {
            var templateFile = File(templateInddArg);
            if (!templateFile.exists) {
                throw new Error("批处理模板文件不存在: " + templateInddArg);
            }
            app.open(templateFile, false);
            pushLog(logs, "批处理自动打开模板文档: " + templateFile.fsName);
        } else {
            throw new Error("请先打开一个 InDesign 文档，再运行脚本");
        }
    }

    if (app.documents.length === 0) {
        throw new Error("未找到可用文档，无法继续执行");
    }

    var scriptFile = File($.fileName);
    var baseFolder = scriptFile.parent;

    var configFile;
    if (configPathArg) {
        configFile = File(configPathArg);
        if (!configFile.exists) {
            throw new Error("指定的配置文件不存在: " + configPathArg);
        }
    } else {
        configFile = getConfigFile(baseFolder, app.activeDocument);
    }
    var config = readJsonFile(configFile);
    var projectRootFolder = getProjectRootFromConfig(configFile);
    var projectRoot = config.project_root ? Folder(config.project_root) : projectRootFolder;
    if (!projectRoot || !projectRoot.exists) {
        throw new Error("项目根目录无效: " + (projectRoot ? projectRoot.fsName : "null"));
    }

    var records;
    var sourceInputJsonPath = "";
    if (inputJsonArg) {
        var inputJsonFile = File(inputJsonArg);
        records = readJsonFile(inputJsonFile);
        sourceInputJsonPath = inputJsonFile.fsName;
        pushLog(logs, "读取单文档 JSON: " + inputJsonFile.fsName);
    } else if (config.output_json) {
        var outputJsonFile = resolveFile(projectRoot, config.output_json);
        records = readJsonFile(outputJsonFile);
        sourceInputJsonPath = outputJsonFile.fsName;
        pushLog(logs, "读取汇总 JSON: " + outputJsonFile.fsName);
    } else {
        records = readRecordsFromWorkspace(projectRoot, config, logs);
    }

    if (!(records instanceof Array)) {
        throw new Error("output.json 顶层必须是数组");
    }

    var groups = buildDocGroups(records);
    var doc = app.activeDocument;
    var originalSpreadIds = captureOriginalSpreadIds(doc);
    var firstCreatedPage = null;
    var placedTextCount = 0;
    var placedImageCount = 0;
    var createdPageCount = 0;
    var skippedGroupCount = 0;
    var templateSpecCache = {};
    var pageBreakReport = createPageBreakReport(sourceInputJsonPath);

    var g;
    for (g = 0; g < groups.length; g += 1) {
        var group = groups[g];
        if (forcedTemplateIdArg && String(group.template_id) !== String(forcedTemplateIdArg)) {
            skippedGroupCount += 1;
            pushLog(logs, "跳过非目标 template_id 文档组: " + group.doc_name + "，模板=" + group.template_id + "，目标=" + forcedTemplateIdArg);
            continue;
        }
        var templateSpec = loadTemplateSpecById(group.template_id, projectRoot, config, templateSpecCache);
        var runtimeLayoutMode = forcedLayoutModeArg ? normalizeLayoutMode(forcedLayoutModeArg) : templateSpec.layout_mode;

        pushLog(logs, "开始处理文档组: " + group.doc_name + "，模板=" + group.template_id + "，mode=" + runtimeLayoutMode);

        if (runtimeLayoutMode === "templateB") {
            var resultB = processGroupTemplateB(doc, group, templateSpec, logs, pageBreakReport);
            createdPageCount += resultB.createdPageCount;
            placedTextCount += resultB.placedTextCount;
            placedImageCount += resultB.placedImageCount;
            if (!firstCreatedPage && resultB.firstPage) {
                firstCreatedPage = resultB.firstPage;
            }
            continue;
        }

        if (runtimeLayoutMode === "templateC") {
            var resultC = processGroupTemplateC(doc, group, templateSpec, logs);
            createdPageCount += resultC.createdPageCount;
            placedTextCount += resultC.placedTextCount;
            placedImageCount += resultC.placedImageCount;
            if (!firstCreatedPage && resultC.firstPage) {
                firstCreatedPage = resultC.firstPage;
            }
            continue;
        }

        if (runtimeLayoutMode === "templateD") {
            var resultD = processGroupTemplateD(doc, group, templateSpec, logs, pageBreakReport);
            createdPageCount += resultD.createdPageCount;
            placedTextCount += resultD.placedTextCount;
            placedImageCount += resultD.placedImageCount;
            if (!firstCreatedPage && resultD.firstPage) {
                firstCreatedPage = resultD.firstPage;
            }
            continue;
        }

        if (runtimeLayoutMode !== "templateA") {
            skippedGroupCount += 1;
            pushLog(logs, "跳过未知 layout_mode 文档组: " + group.doc_name + "，模板=" + group.template_id + "，layout_mode=" + runtimeLayoutMode);
            continue;
        }
        var headingData = extractHeadingData(group.items);

        var baseState = createPageState(doc, templateSpec, headingData, logs);
        var state = baseState;
        createdPageCount += 1;
        if (!firstCreatedPage) {
            firstCreatedPage = state.page;
        }

        var i;
        for (i = 0; i < group.items.length; i += 1) {
            var item = group.items[i];
            var itemIndexKey = String(item.index);

            // 第一个与第二个文本用于主副标题，不再进入正文
            if (item.type === "text" && headingData.consumedTextIndexes[itemIndexKey]) {
                continue;
            }

            // soft 区间规则：当前项不回退，下一项开始前再换页
            if (item.page_break_before && state.lastPlacedBottom !== null && state.lastPlacedBottom !== undefined) {
                fitPageBottomToLastItem(state, logs, "手动分页前");
                state = nextPageState(doc, baseState, logs, group.doc_name);
                createdPageCount += 1;
            }

            // soft 区间规则：当前项不回退，下一项开始前再换页
            if (state.cursorY > getEffectiveBottomSoft(state)) {
                recordAutoPageBreak(pageBreakReport, item.index, "templateA", group.doc_name, "soft");
                fitPageBottomToLastItem(state, logs, "soft换页前");
                state = nextPageState(doc, baseState, logs, group.doc_name);
                createdPageCount += 1;
            }

            if (item.type === "text") {
                var textFrame = placeTextItem(state, item.content || "");
                var textBottom = textFrame.geometricBounds[2];

                if (textBottom > getEffectiveBottomHard(state)) {
                    textFrame.remove();
                    recordAutoPageBreak(pageBreakReport, item.index, "templateA", group.doc_name, "text hard");
                    fitPageBottomToLastItem(state, logs, "text hard换页前");
                    state = nextPageState(doc, baseState, logs, group.doc_name);
                    createdPageCount += 1;
                    textFrame = placeTextItem(state, item.content || "");
                    textBottom = textFrame.geometricBounds[2];

                    if (textBottom > getEffectiveBottomHard(state)) {
                        pushLog(logs, "文本超出 hard 边界，已保留当前结果，index=" + item.index);
                    }
                }

                state.cursorY = textBottom + state.gapY;
                state.lastPlacedBottom = textBottom;
                placedTextCount += 1;
            } else if (item.type === "image") {
                var imageFile = File(item.src || "");
                if (!imageFile.exists) {
                    pushLog(logs, "图片不存在，已跳过，index=" + item.index + "，路径=" + (item.src || ""));
                    continue;
                }

                var imageHeight = state.bodyImageSpec.height;

                if (state.cursorY + imageHeight > getEffectiveBottomHard(state)) {
                    recordAutoPageBreak(pageBreakReport, item.index, "templateA", group.doc_name, "image hard");
                    fitPageBottomToLastItem(state, logs, "image hard换页前");
                    state = nextPageState(doc, baseState, logs, group.doc_name);
                    createdPageCount += 1;
                }

                var imageFrame = placeImageItem(state, imageFile.fsName);
                var imageBottom = imageFrame.geometricBounds[2];
                state.cursorY = imageBottom + state.gapY;
                state.lastPlacedBottom = imageBottom;
                placedImageCount += 1;
            } else {
                pushLog(logs, "未知元素类型，已跳过，index=" + item.index + "，type=" + item.type);
            }
        }

        fitPageBottomToLastItem(state, logs, "文档组结束");
        cleanupPrototypeItems(baseState, logs);
    }

    var logPath = config.log_file || "indesign_layout.log";
    var logFile = resolveFile(projectRoot, logPath);
    writePageBreakReport(projectRoot, sourceInputJsonPath, pageBreakReport, logs);
    pushLog(logs, "执行完成");
    writeLogFile(logFile, logs);

    if (batchMode && outputInddArg) {
        if (createdPageCount > 0) {
            removeOriginalTemplateSpreads(doc, originalSpreadIds, logs);
        }
        var outputFile = File(outputInddArg);
        if (!ensureFolderExists(outputFile.parent)) {
            throw new Error("输出目录创建失败: " + outputFile.parent.fsName);
        }

        closeOpenDocumentByPath(outputFile, doc, logs);
        doc.save(outputFile);
        pushLog(logs, "已输出 INDD: " + outputFile.fsName);
        writeLogFile(logFile, logs);

        try {
            doc.close(SaveOptions.NO);
        } catch (eClose) {
        }
        return;
    }

    try {
        if (firstCreatedPage && app.layoutWindows.length > 0) {
            app.layoutWindows[0].activePage = firstCreatedPage;
        }
    } catch (e1) {
    }

    alert("templateA 排版完成\r新增页面: " + createdPageCount + "\r正文文本: " + placedTextCount + "\r正文图片: " + placedImageCount + "\r跳过文档组: " + skippedGroupCount + "\r日志: " + logFile.fsName);
}

try {
    main();
} catch (err) {
    var isBatch = isTruthyArg(getScriptArgValue("pipeline_batch_mode"));
    if (isBatch) {
        throw err;
    }
    alert("脚本执行失败: " + err);
}
