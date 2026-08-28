(function () {
    var root = $.global.__AUTORAINBOW_CORE__ || ($.global.__AUTORAINBOW_CORE__ = {});
    if (root.outputAndLog) {
        return;
    }
    if (!root.runtimeParams) {
        throw new Error("core_runtime_params.jsx 必须先加载");
    }

    var runtime = root.runtimeParams;
    var api = {};

    api.ensureFolderExists = function (folderObj) {
        if (!folderObj || folderObj.exists) {
            return true;
        }
        if (folderObj.parent && !folderObj.parent.exists) {
            if (!api.ensureFolderExists(folderObj.parent)) {
                return false;
            }
        }
        return folderObj.create();
    };

    api.writeLogFile = function (fileObj, logs) {
        if (!api.ensureFolderExists(fileObj.parent)) {
            return;
        }
        if (!fileObj.open("w")) {
            return;
        }
        fileObj.encoding = "UTF-8";
        fileObj.write(logs.join("\n"));
        fileObj.close();
    };

    api.writeTextFile = function (fileObj, textValue) {
        if (!api.ensureFolderExists(fileObj.parent)) {
            return false;
        }
        if (!fileObj.open("w")) {
            return false;
        }
        fileObj.encoding = "UTF-8";
        fileObj.write(textValue);
        fileObj.close();
        return true;
    };

    api.nowText = function () {
        var d = new Date();
        var mm = ("0" + (d.getMonth() + 1)).slice(-2);
        var dd = ("0" + d.getDate()).slice(-2);
        var hh = ("0" + d.getHours()).slice(-2);
        var mi = ("0" + d.getMinutes()).slice(-2);
        var ss = ("0" + d.getSeconds()).slice(-2);
        return d.getFullYear() + "-" + mm + "-" + dd + " " + hh + ":" + mi + ":" + ss;
    };

    api.pushLog = function (logs, msg) {
        logs.push("[" + api.nowText() + "] " + msg);
    };

    api.createPageBreakReport = function (inputJsonPath) {
        return {
            input_json: inputJsonPath || "",
            auto_break_indices: [],
            records: [],
            seen: {}
        };
    };

    api.recordAutoPageBreak = function (report, itemIndex, modeText, docName, reasonText) {
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
    };

    api.getPageBreakReportFile = function (projectRoot, inputJsonPath) {
        if (!inputJsonPath) {
            return null;
        }
        var inputFile = File(inputJsonPath);
        var nameText = String(inputFile.name || "page_breaks.json");
        var dotIdx = nameText.lastIndexOf(".");
        if (dotIdx > 0) {
            nameText = nameText.substring(0, dotIdx);
        }
        return File(projectRoot.fsName + "/workspace/outputs/work/page-breaks/" + nameText + ".json");
    };

    api.writePageBreakReport = function (projectRoot, inputJsonPath, report, logs) {
        var reportFile = api.getPageBreakReportFile(projectRoot, inputJsonPath);
        if (!reportFile) {
            return;
        }
        var payload = {
            input_json: inputJsonPath || "",
            auto_break_indices: report && report.auto_break_indices ? report.auto_break_indices : [],
            records: report && report.records ? report.records : [],
            updated_at: api.nowText()
        };
        if (api.writeTextFile(reportFile, runtime.stringifyJsonText(payload, true))) {
            api.pushLog(logs, "已记录自动分页: " + reportFile.fsName + "，分页点=" + payload.auto_break_indices.length);
        } else {
            api.pushLog(logs, "记录自动分页失败: " + reportFile.fsName);
        }
    };

    api.closeOpenDocumentByPath = function (targetFile, keepDoc, logs) {
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
                    api.pushLog(logs, "已关闭占用输出文件的 InDesign 文档: " + targetPath);
                }
            } catch (e2) {
                api.pushLog(logs, "关闭占用输出文件的文档失败: " + targetPath + "，错误=" + e2);
            }
        }
        return closed;
    };

    root.outputAndLog = api;
}());
