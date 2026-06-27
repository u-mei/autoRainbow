(function () {
    function safeParseJSON(text) {
        try { if (typeof JSON !== "undefined" && JSON.parse) { return JSON.parse(text); } } catch (e) {}
        return eval("(" + text + ")");
    }
    function safeStringifyJSON(obj) {
        if (typeof JSON !== "undefined" && JSON.stringify) { return JSON.stringify(obj, null, 2); }
        var k, v, parts = [];
        for (k in obj) { if (obj.hasOwnProperty(k)) { v = obj[k]; parts.push('  "' + k + '": ' + (typeof v === "string" ? '"' + String(v).replace(/"/g, '\\"') + '"' : String(v))); } }
        return "{\n" + parts.join(",\n") + "\n}";
    }

    var scriptFile = File($.fileName);
    var engineFile = File(scriptFile.parent.fsName + "/create_layout_templateA.jsx");

    if (!engineFile.exists) {
        alert("未找到模板引擎脚本: " + engineFile.fsName);
        return;
    }

    // 读取现有参数文件，添加 force_layout_mode
    var paramsFile = File(scriptFile.parent.fsName + "/_pipeline_params.json");
    var params = {};
    if (paramsFile.exists) {
        try {
            if (paramsFile.open("r")) {
                paramsFile.encoding = "UTF-8";
                var text = paramsFile.read();
                paramsFile.close();
                if (text.charCodeAt(0) === 0xFEFF) {
                    text = text.slice(1);
                }
                params = safeParseJSON(text);
            }
        } catch (e1) {
        }
    }
    params.pipeline_force_layout_mode = "templateD";

    // 写回参数文件
    if (paramsFile.open("w")) {
        paramsFile.encoding = "UTF-8";
        paramsFile.write(safeStringifyJSON(params));
        paramsFile.close();
    }

    try {
        $.evalFile(engineFile);
    } finally {
        delete params.pipeline_force_layout_mode;
        if (paramsFile.open("w")) {
            paramsFile.encoding = "UTF-8";
            paramsFile.write(safeStringifyJSON(params));
            paramsFile.close();
        }
    }
}());
