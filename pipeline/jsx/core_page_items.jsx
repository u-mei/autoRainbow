(function () {
    var root = $.global.__AUTORAINBOW_CORE__ || ($.global.__AUTORAINBOW_CORE__ = {});
    if (root.pageItems) {
        return;
    }

    var api = {};

    api.findPageItemByLabel = function (page, labelName) {
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
    };

    api.findPageItemByLabels = function (page, labelNames) {
        if (!labelNames || !(labelNames instanceof Array)) {
            return null;
        }
        var i;
        for (i = 0; i < labelNames.length; i += 1) {
            var label = labelNames[i];
            if (!label) {
                continue;
            }
            var item = api.findPageItemByLabel(page, label);
            if (item) {
                return item;
            }
        }
        return null;
    };

    api.buildDividerLabelCandidates = function (labelText) {
        var text = String(labelText || "");
        var list = [];
        var seen = {};

        function addOne(v) {
            var key = String(v || "");
            if (!key || seen[key]) {
                return;
            }
            seen[key] = true;
            list.push(key);
        }

        addOne(text);
        addOne(text.split("divde").join("divide"));
        addOne(text.split("divide").join("divde"));
        addOne(text.split("__").join("_"));
        return list;
    };

    api.collectPageLabels = function (page, maxCount) {
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
    };

    root.pageItems = api;
}());
