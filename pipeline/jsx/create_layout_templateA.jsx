(function ensureSharedCoreLoaded() {
    var scriptDir = File($.fileName).parent;
    var sharedFiles = [
        "core_runtime_params.jsx",
        "core_template_config.jsx",
        "core_page_items.jsx",
        "core_output_and_log.jsx",
        "core_page_state.jsx",
        "core_templateB_logic.jsx",
        "core_templateD_logic.jsx",
        "core_layout_runner.jsx"
    ];
    var i;
    for (i = 0; i < sharedFiles.length; i += 1) {
        var sharedFile = File(scriptDir.fsName + "/" + sharedFiles[i]);
        if (!sharedFile.exists) {
            throw new Error("缺少公共核心脚本: " + sharedFile.fsName);
        }
        $.evalFile(sharedFile);
    }
    if (!$.global.__AUTORAINBOW_CORE__ || !$.global.__AUTORAINBOW_CORE__.runtimeParams || !$.global.__AUTORAINBOW_CORE__.templateConfig || !$.global.__AUTORAINBOW_CORE__.pageItems || !$.global.__AUTORAINBOW_CORE__.outputAndLog || !$.global.__AUTORAINBOW_CORE__.pageState || !$.global.__AUTORAINBOW_CORE__.templateBLogic || !$.global.__AUTORAINBOW_CORE__.templateDLogic || !$.global.__AUTORAINBOW_CORE__.layoutRunner) {
        throw new Error("公共核心脚本加载失败");
    }
}());

var __autoRainbowCore = $.global.__AUTORAINBOW_CORE__;

function parseJsonText(text) {
    return __autoRainbowCore.runtimeParams.parseJsonText(text);
}

function stringifyJsonText(obj, pretty) {
    return __autoRainbowCore.runtimeParams.stringifyJsonText(obj, pretty);
}

function resolveFile(baseFolder, pathText) {
    return __autoRainbowCore.templateConfig.resolveFile(baseFolder, pathText);
}

function readJsonFile(fileObj) {
    return __autoRainbowCore.templateConfig.readJsonFile(fileObj);
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
    var workspacePath = config.outputs_dir || config.doc_workspace_dir || "workspace/outputs";
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
    return __autoRainbowCore.outputAndLog.ensureFolderExists(folderObj);
}

function writeLogFile(fileObj, logs) {
    return __autoRainbowCore.outputAndLog.writeLogFile(fileObj, logs);
}

function writeTextFile(fileObj, textValue) {
    return __autoRainbowCore.outputAndLog.writeTextFile(fileObj, textValue);
}

function nowText() {
    return __autoRainbowCore.outputAndLog.nowText();
}

function pushLog(logs, msg) {
    return __autoRainbowCore.outputAndLog.pushLog(logs, msg);
}

function createPageBreakReport(inputJsonPath) {
    return __autoRainbowCore.outputAndLog.createPageBreakReport(inputJsonPath);
}

function recordAutoPageBreak(report, itemIndex, modeText, docName, reasonText) {
    return __autoRainbowCore.outputAndLog.recordAutoPageBreak(report, itemIndex, modeText, docName, reasonText);
}

function getPageBreakReportFile(projectRoot, inputJsonPath) {
    return __autoRainbowCore.outputAndLog.getPageBreakReportFile(projectRoot, inputJsonPath);
}

function writePageBreakReport(projectRoot, inputJsonPath, report, logs) {
    return __autoRainbowCore.outputAndLog.writePageBreakReport(projectRoot, inputJsonPath, report, logs);
}

function closeOpenDocumentByPath(targetFile, keepDoc, logs) {
    return __autoRainbowCore.outputAndLog.closeOpenDocumentByPath(targetFile, keepDoc, logs);
}

function loadPipelineParams() {
    return __autoRainbowCore.runtimeParams.loadPipelineParams($.fileName);
}

function getScriptArgValue(nameText) {
    return __autoRainbowCore.runtimeParams.getScriptArgValue(nameText, $.fileName);
}

function isTruthyArg(valueText) {
    return __autoRainbowCore.runtimeParams.isTruthyArg(valueText);
}

function toNumberOrDefault(value, defaultValue) {
    return __autoRainbowCore.runtimeParams.toNumberOrDefault(value, defaultValue);
}

function findPageItemByLabel(page, labelName) {
    return __autoRainbowCore.pageItems.findPageItemByLabel(page, labelName);
}

function findPageItemByLabels(page, labelNames) {
    return __autoRainbowCore.pageItems.findPageItemByLabels(page, labelNames);
}

function buildDividerLabelCandidates(labelText) {
    return __autoRainbowCore.pageItems.buildDividerLabelCandidates(labelText);
}

function collectPageLabels(page, maxCount) {
    return __autoRainbowCore.pageItems.collectPageLabels(page, maxCount);
}

function collectConfigCandidates(baseFolder, activeDoc) {
    return __autoRainbowCore.templateConfig.collectConfigCandidates(baseFolder, activeDoc);
}

function getConfigFile(baseFolder, activeDoc) {
    return __autoRainbowCore.templateConfig.getConfigFile(baseFolder, activeDoc);
}

function getProjectRootFromConfig(configFile) {
    return __autoRainbowCore.templateConfig.getProjectRootFromConfig(configFile);
}

function normalizeLayoutMode(modeText) {
    return __autoRainbowCore.templateConfig.normalizeLayoutMode(modeText);
}

function validateTemplateConfig(templateId, t) {
    return __autoRainbowCore.templateConfig.validateTemplateConfig(templateId, t);
}

function getTemplatesRootFolder(projectRoot, globalConfig) {
    return __autoRainbowCore.templateConfig.getTemplatesRootFolder(projectRoot, globalConfig);
}

function loadTemplateSpecById(templateId, projectRoot, globalConfig, cacheMap) {
    return __autoRainbowCore.templateConfig.loadTemplateSpecById(templateId, projectRoot, globalConfig, cacheMap);
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

        // 2026-08-16 用户要求：birthday_image 容器内图像布局 = x-8 y-8 w400 h400。
        // 图片内容（红框）相对容器（蓝框）左上角偏移 (-8,-8)，固定尺寸 400×400。
        var contentTop = frameBounds[0] - 8;
        var contentLeft = frameBounds[1] - 8;
        var contentBottom = contentTop + 400;
        var contentRight = contentLeft + 400;
        graphic.geometricBounds = [contentTop, contentLeft, contentBottom, contentRight];
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
    return __autoRainbowCore.templateDLogic.fitImageTemplateDSecondPageAdaptive(frameObj);
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
            // 2026-08-16：统一"行"模型——模板 A 只读首格内容（cols[0]）
            var itemText = "";
            if (item.cols && item.cols.length > 0) {
                itemText = (item.cols[0] && item.cols[0].content) || "";
            } else {
                itemText = item.content || "";
            }
            if (mainText === null) {
                mainText = itemText;
                consumedTextIndexes[String(item.index)] = true;
                continue;
            }

            if (subText === null) {
                subText = itemText;
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

// 2026-08-16：一行多文本块——把文本放入指定列宽（列 x1..x2）。
// 设计文档：private/docs/features/一行多文本块设计方案.md §5.1。
// 必须放在 applyTextFramePrefSpec 之后覆盖列偏好（textColumnCount=1、useFixedColumnWidth=false），
// 否则 7_周边 原型 useFixedColumnWidth=true 会把框宽拉回原型列宽。
function placeTextItemInColumn(state, textContent, colX1, colX2) {
    var spec = state.bodyTextSpec;

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

    frame.geometricBounds = [state.cursorY, colX1, state.cursorY + spec.baseHeight, colX2];

    frame.contents = normalizeTextForInDesign(textContent);

    try {
        frame.parentStory.recompose();
    } catch (e2) {
    }

    try {
        applyTextFramePrefSpec(frame, spec.textFramePrefSpec);
    } catch (e3) {
    }

    // 列偏好覆盖（在 apply 之后）：单列、非固定列宽
    try {
        var tfpCol = frame.textFramePreferences;
        if (tfpCol) {
            tfpCol.textColumnCount = 1;
            tfpCol.useFixedColumnWidth = false;
        }
    } catch (ePref) {
    }

    // 最终锁列宽，防止样式造成宽度漂移
    try {
        var gbCol = frame.geometricBounds;
        frame.geometricBounds = [gbCol[0], colX1, gbCol[2], colX2];
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
    return __autoRainbowCore.templateBLogic.createPageStateTemplateB(doc, templateSpec);
}

function buildModeBUnits(items) {
    return __autoRainbowCore.templateBLogic.buildModeBUnits(items);
}

function placeModeBImageItem(state, imagePath, logs) {
    return __autoRainbowCore.templateBLogic.placeModeBImageItem(state, imagePath, logs);
}

function processGroupTemplateB(doc, group, templateSpec, logs, pageBreakReport) {
    return __autoRainbowCore.templateBLogic.processGroupTemplateB(doc, group, templateSpec, logs, pageBreakReport);
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
    return __autoRainbowCore.templateDLogic.splitTitleAndBodyText(textValue);
}

function buildTemplateDPages(items) {
    return __autoRainbowCore.templateDLogic.buildTemplateDPages(items);
}

function buildPhotoRowPriorityOrder(rowCount) {
    return __autoRainbowCore.templateDLogic.buildPhotoRowPriorityOrder(rowCount);
}

function buildPhotoRowCounts(totalCount) {
    return __autoRainbowCore.templateDLogic.buildPhotoRowCounts(totalCount);
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
    return __autoRainbowCore.templateDLogic.buildRowXBoundsLeftAligned(imageCount, leftX, imageWidth);
}

function keepFrameTopGap(frame, targetTop) {
    return __autoRainbowCore.templateDLogic.keepFrameTopGap(frame, targetTop);
}

function processGroupTemplateD(doc, group, templateSpec, logs, pageBreakReport) {
    return __autoRainbowCore.templateDLogic.processGroupTemplateD(doc, group, templateSpec, logs, pageBreakReport);
}

function main() {
    return __autoRainbowCore.layoutRunner.runMain("templateA");
}

__autoRainbowCore.templateAEntry = __autoRainbowCore.templateAEntry || {};
__autoRainbowCore.templateAEntry.main = main;

if (!$.global.__AUTORAINBOW_SUPPRESS_AUTO_MAIN__) {
    try {
        main();
    } catch (err) {
        var isBatch = isTruthyArg(getScriptArgValue("pipeline_batch_mode"));
        if (isBatch) {
            throw err;
        }
        alert("脚本执行失败: " + err);
    }
}
