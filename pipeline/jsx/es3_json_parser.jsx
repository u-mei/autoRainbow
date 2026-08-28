/**
 * es3_json_parser.jsx —— ExtendScript (ES3) 手写 JSON 解析器（无 eval）。
 *
 * InDesign 2026 的 ExtendScript 环境没有原生 JSON 对象（实测 typeof JSON === "undefined"），
 * 各脚本必须使用本解析器解析 JSON 文件。此文件是**权威副本**：
 * 修改后需同步注入到以下文件的 safeParseJSON / parseJsonText / parseJsonText 实现：
 *   - core_runtime_params.jsx
 *   - create_layout_startup_watcher.jsx
 *   - create_layout_dispatch.jsx
 *   - create_layout_templateB.jsx / templateC.jsx / templateD.jsx
 *   - export_page_snapshot.jsx
 *
 * 使用方法：把 parseES3Json 函数体复制进目标脚本（或 evalFile 本文件后调用）。
 */

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
