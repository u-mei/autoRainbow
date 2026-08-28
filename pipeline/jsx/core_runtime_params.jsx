(function () {
    var root = $.global.__AUTORAINBOW_CORE__ || ($.global.__AUTORAINBOW_CORE__ = {});
    if (root.runtimeParams) {
        return;
    }

    var api = {};

    api.parseJsonText = function (text) {
        if (typeof JSON !== "undefined" && JSON.parse) {
            return JSON.parse(text);
        }
        return parseES3Json(text);
    };

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


    api.stringifyJsonText = function (obj, pretty) {
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
    };

    api.loadPipelineParams = function (scriptFilePath) {
        // 2026-08-24 修复：不缓存。core_runtime_params 带"已初始化跳过"保护，
        // 同一 InDesign 会话内连续处理多任务时（如处理全部），缓存会残留上一个任务的参数
        // （input_json/template_id），导致后续任务（如 templateD）读到错误参数而失败
        // （新页面中未找到正文文本原型框 label: proto_text）或静默排错内容。
        try {
            var scriptFile = File(scriptFilePath || $.fileName);
            var scriptFolder = scriptFile.parent;
            var paramsFile = File(scriptFolder.fsName + "/_pipeline_params.json");
            if (paramsFile.exists && paramsFile.open("r")) {
                paramsFile.encoding = "UTF-8";
                var text = paramsFile.read();
                paramsFile.close();
                if (text.charCodeAt(0) === 0xFEFF) {
                    text = text.slice(1);
                }
                return api.parseJsonText(text);
            }
        } catch (e1) {
        }
        return {};
    };

    api.getScriptArgValue = function (nameText, scriptFilePath) {
        var params = api.loadPipelineParams(scriptFilePath);
        return params[nameText] || null;
    };

    api.isTruthyArg = function (valueText) {
        var text = String(valueText || "").toLowerCase();
        return text === "1" || text === "true" || text === "yes";
    };

    api.toNumberOrDefault = function (value, defaultValue) {
        var num = Number(value);
        if (isNaN(num)) {
            return defaultValue;
        }
        return num;
    };

    root.runtimeParams = api;
}());
