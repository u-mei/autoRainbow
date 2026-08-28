(function () {
    var root = $.global.__AUTORAINBOW_CORE__ || ($.global.__AUTORAINBOW_CORE__ = {});
    if (root.templateConfig) {
        return;
    }
    if (!root.runtimeParams) {
        throw new Error("core_runtime_params.jsx 必须先加载");
    }

    var runtime = root.runtimeParams;
    var api = {};

    api.resolveFile = function (baseFolder, pathText) {
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
    };

    api.readJsonFile = function (fileObj) {
        if (!fileObj.exists) {
            throw new Error("文件不存在: " + fileObj.fsName);
        }
        if (!fileObj.open("r")) {
            throw new Error("文件打开失败: " + fileObj.fsName);
        }
        fileObj.encoding = "UTF-8";
        var content = fileObj.read();
        fileObj.close();
        return runtime.parseJsonText(content);
    };

    api.collectConfigCandidates = function (baseFolder, activeDoc) {
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
                    current.fsName + "/workspace/templates/config.json",
                    current.fsName + "/workspace/config.json",
                    current.fsName + "/D/templates/config.json",
                    current.fsName + "/D/config.json",
                    current.fsName + "/templates/config.json",
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
    };

    api.getConfigFile = function (baseFolder, activeDoc) {
        var candidates = api.collectConfigCandidates(baseFolder, activeDoc);
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
    };

    api.getProjectRootFromConfig = function (configFile) {
        var parentFolder = configFile.parent;
        if (!parentFolder) {
            return null;
        }
        if (parentFolder.name === "templates") {
            return parentFolder.parent;
        }
        if (parentFolder.parent && parentFolder.parent.name === "templates") {
            return parentFolder.parent.parent;
        }
        return parentFolder;
    };

    api.normalizeLayoutMode = function (modeText) {
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
    };

    api.validateTemplateConfig = function (templateId, t) {
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
            layout_mode: api.normalizeLayoutMode(t.layout_mode),
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
            divider_offset_from_heading: runtime.toNumberOrDefault(t.divider_offset_from_heading, -12),
            photo_top_gap: runtime.toNumberOrDefault(t.photo_top_gap, 48),
            text_top_gap: runtime.toNumberOrDefault(t.text_top_gap, 48),
            photo_row_gap: runtime.toNumberOrDefault(t.photo_row_gap, 12),
            start_y: t.start_y,
            continue_start_y: t.continue_start_y,
            content_bottom_soft: t.content_bottom_soft,
            content_bottom_hard: t.content_bottom_hard,
            content_bottom: t.content_bottom
        };
    };

    api.getTemplatesRootFolder = function (projectRoot, globalConfig) {
        var templatesRootPath = globalConfig.templates_dir || globalConfig.templates_root_dir || "templates";
        return Folder(api.resolveFile(projectRoot, templatesRootPath).fsName);
    };

    api.loadTemplateSpecById = function (templateId, projectRoot, globalConfig, cacheMap) {
        if (cacheMap[templateId]) {
            return cacheMap[templateId];
        }
        var templateCfg = null;
        if (globalConfig && globalConfig.templates && globalConfig.templates[templateId]) {
            templateCfg = globalConfig.templates[templateId];
        } else {
            var templatesRoot = api.getTemplatesRootFolder(projectRoot, globalConfig);
            var templateFolder = Folder(templatesRoot.fsName + "/" + templateId);
            var templateConfigFile = File(templateFolder.fsName + "/config.json");
            if (!templateConfigFile.exists) {
                throw new Error("未找到模板专属配置文件: " + templateConfigFile.fsName);
            }
            var raw = api.readJsonFile(templateConfigFile);
            templateCfg = raw;
            if (raw && raw.template && typeof raw.template === "object") {
                templateCfg = raw.template;
            }
        }
        var spec = api.validateTemplateConfig(templateId, templateCfg);
        // 页尾均匀裁剪（全局开关，仅 templateB 消费）：非最后一页从最下方减少该高度
        spec.page_bottom_trim_px = runtime.toNumberOrDefault(globalConfig.page_bottom_trim_px, 60);
        cacheMap[templateId] = spec;
        return spec;
    };

    root.templateConfig = api;
}());
