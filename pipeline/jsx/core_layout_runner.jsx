(function () {
    var root = $.global.__AUTORAINBOW_CORE__ || ($.global.__AUTORAINBOW_CORE__ = {});
    if (root.layoutRunner) {
        return;
    }

    var api = {};

    api.runMain = function (completionLabel) {
        var logs = [];
        pushLog(logs, "开始执行 InDesign 自动排版");
        var dbgFile = getDebugLogFile("runmain_debug.log");
        function dbgLog(msg) {
            try {
                if (!dbgFile.open("a")) { return; }
                dbgFile.encoding = "UTF-8";
                dbgFile.write("[" + String(new Date()) + "] runMain: " + msg + "\n");
                dbgFile.close();
            } catch (eD) {
            }
        }
        dbgLog("runMain 进入 label=" + completionLabel);

        // 2026-08-18：调试日志统一写 workspace/.runtime/logs/（不再写 ~），
        // 通过 watcher 注入的项目根常量定位；取不到时回退到脚本位置反推。
        function getDebugLogFile(name) {
            var rootFolder = "";
            if (typeof $.global.__AUTO_RAINBOW_PROJECT_ROOT__ === "string" && $.global.__AUTO_RAINBOW_PROJECT_ROOT__) {
                rootFolder = $.global.__AUTO_RAINBOW_PROJECT_ROOT__;
            }
            if (typeof __AUTO_INJECTED_PROJECT_ROOT__ === "string" && __AUTO_INJECTED_PROJECT_ROOT__) {
                rootFolder = __AUTO_INJECTED_PROJECT_ROOT__;
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
                return File(rootFolder + "/workspace/.runtime/logs/" + name);
            }
            return File("~/autoRainbow_" + name);
        }

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
        // 2026-08-18：业务配置不含路径键——合并同目录 paths.json 的 dirs 平铺进 config，
        // 使 outputs_dir/templates_dir/work_dir 等在任何 layout 脚本内可用。
        try {
            var pathsFileSidecar = File(configFile.parent.fsName + "/paths.json");
            if (pathsFileSidecar.exists) {
                var pathsSidecar = readJsonFile(pathsFileSidecar);
                var dirsSidecar = (pathsSidecar && pathsSidecar.dirs) || {};
                for (var dsk in dirsSidecar) {
                    if (dirsSidecar.hasOwnProperty(dsk) && !config[dsk]) {
                        config[dsk] = dirsSidecar[dsk];
                    }
                }
            }
        } catch (eSidecar) {
        }
        // 2026-08-18：项目根优先取 dispatch 已设置的全局常量（watcher 注入）
        // 或配置显式 project_root；配置位于 workspace/.runtime/ 时
        // getProjectRootFromConfig 无法从位置反推，必须走前两者。
        var projectRoot = null;
        if (typeof $.global.__AUTO_RAINBOW_PROJECT_ROOT__ === "string" && $.global.__AUTO_RAINBOW_PROJECT_ROOT__) {
            var gRoot = Folder($.global.__AUTO_RAINBOW_PROJECT_ROOT__);
            if (gRoot.exists) {
                projectRoot = gRoot;
            }
        }
        if (!projectRoot && (typeof __AUTO_INJECTED_PROJECT_ROOT__ === "string" && __AUTO_INJECTED_PROJECT_ROOT__)) {
            var iRoot = Folder(__AUTO_INJECTED_PROJECT_ROOT__);
            if (iRoot.exists) {
                projectRoot = iRoot;
            }
        }
        if (!projectRoot && config.project_root) {
            projectRoot = Folder(config.project_root);
        }
        if (!projectRoot) {
            projectRoot = getProjectRootFromConfig(configFile);
        }
        if (!projectRoot || !projectRoot.exists) {
            throw new Error("项目根目录无效: " + (projectRoot ? projectRoot.fsName : "null"));
        }

        var records;
        var sourceInputJsonPath = "";
        if (inputJsonArg) {
            var inputJsonFile = File(inputJsonArg);
            dbgLog("读取缓存 JSON: " + inputJsonArg);
            records = readJsonFile(inputJsonFile);
            sourceInputJsonPath = inputJsonFile.fsName;
            pushLog(logs, "读取单文档 JSON: " + inputJsonFile.fsName);
        } else if (config.output_json) {            var outputJsonFile = resolveFile(projectRoot, config.output_json);
            records = readJsonFile(outputJsonFile);
            sourceInputJsonPath = outputJsonFile.fsName;
            pushLog(logs, "读取汇总 JSON: " + outputJsonFile.fsName);
        } else {
            records = readRecordsFromWorkspace(projectRoot, config, logs);
        }

        if (!(records instanceof Array)) {
            dbgLog("records 不是数组: " + (typeof records));
            throw new Error("output.json 顶层必须是数组");
        }
        dbgLog("records 读取成功, 长度=" + records.length);

        var groups = buildDocGroups(records);
        dbgLog("buildDocGroups 完成, 组数=" + groups.length);
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
            dbgLog("处理文档组: " + group.doc_name + " mode=" + runtimeLayoutMode + " items=" + (group.items ? group.items.length : 0));

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

                if (item.type === "text" && headingData.consumedTextIndexes[itemIndexKey]) {
                    continue;
                }

                if (item.page_break_before && state.lastPlacedBottom !== null && state.lastPlacedBottom !== undefined) {
                    fitPageBottomToLastItem(state, logs, "手动分页前");
                    state = nextPageState(doc, baseState, logs, group.doc_name);
                    createdPageCount += 1;
                }

                // 2026-08-06：移除 soft 自动分页——分页点由前端按 style_profile 计算
                // （page_break_before），JSX 只尊重分页点，保证编辑器显示与实际排版一致。
                // 2026-08-06：移除 hard 兜底（image/text）——分页计算器按"图片收尾优先、
                // 溢出允许"布局（用户原则），页 1 底边可略超 hard（如 5_音乐专题 4126>4000）；
                // hard 兜底在此场景误触发强制换页，导致实际 4 页 vs 前端 3 页。
                // 页面超高由 fitPageBottomToLastItem 拉高页面解决，物理上无溢出风险。

                if (item.type === "text") {
                    var textFrame = placeTextItem(state, item.content || "");
                    var textBottom = textFrame.geometricBounds[2];

                    state.cursorY = textBottom + state.gapY;
                    state.lastPlacedBottom = textBottom;
                    placedTextCount += 1;
                } else if (item.type === "image") {
                    var imageFile = File(item.src || "");
                    if (!imageFile.exists) {
                        pushLog(logs, "图片不存在，已跳过，index=" + item.index + "，路径=" + (item.src || ""));
                        continue;
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

        // 2026-08-18：布局日志默认写项目内 logs_dir（不再写项目根 indesign_layout.log）
        var logPath = config.log_file || (config.logs_dir || "workspace/.runtime/logs") + "/indesign_layout.log";
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

        alert((completionLabel || "templateA") + " 排版完成\r新增页面: " + createdPageCount + "\r正文文本: " + placedTextCount + "\r正文图片: " + placedImageCount + "\r跳过文档组: " + skippedGroupCount + "\r日志: " + logFile.fsName);
    };

    root.layoutRunner = api;
}());
