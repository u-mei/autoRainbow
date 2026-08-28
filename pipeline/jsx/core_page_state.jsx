(function () {
    var root = $.global.__AUTORAINBOW_CORE__ || ($.global.__AUTORAINBOW_CORE__ = {});
    if (root.pageState) {
        return;
    }
    if (!root.runtimeParams) {
        throw new Error("core_runtime_params.jsx 必须先加载");
    }
    if (!root.outputAndLog) {
        throw new Error("core_output_and_log.jsx 必须先加载");
    }

    var runtime = root.runtimeParams;
    var output = root.outputAndLog;
    var api = {};

    api.getPageMarginValue = function (page, edgeName, fallback) {
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
    };

    api.getPageInnerBottom = function (page) {
        if (!page || !page.isValid) {
            return null;
        }
        var pb = page.bounds;
        return pb[2] - api.getPageMarginValue(page, "bottom", 0);
    };

    api.getPageInnerTop = function (page) {
        if (!page || !page.isValid) {
            return null;
        }
        var pb = page.bounds;
        return pb[0] + api.getPageMarginValue(page, "top", 0);
    };

    api.capturePageMarginSpec = function (page) {
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
    };

    api.applyPageMarginSpec = function (page, spec) {
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
    };

    api.getEffectiveBottomSoft = function (state) {
        var soft = state.contentBottomSoft;
        if (soft === null || soft === undefined || isNaN(Number(soft))) {
            return api.getPageInnerBottom(state.page);
        }
        return Number(soft);
    };

    api.getEffectiveBottomHard = function (state) {
        var hard = state.contentBottomHard;
        if (hard === null || hard === undefined || isNaN(Number(hard))) {
            hard = api.getPageInnerBottom(state.page);
        } else {
            hard = Number(hard);
        }
        var soft = api.getEffectiveBottomSoft(state);
        if (hard < soft) {
            hard = soft;
        }
        return hard;
    };

    api.fitPageBottomToLastItem = function (state, logs, reasonText) {
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
        var bottomMargin = api.getPageMarginValue(page, "bottom", 0);

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
            page.resize(
                CoordinateSpaces.INNER_COORDINATES,
                AnchorPoint.TOP_LEFT_ANCHOR,
                ResizeMethods.REPLACING_CURRENT_DIMENSIONS_WITH,
                [pageWidth, targetHeight]
            );
            output.pushLog(logs, "页面高度已贴合内容(" + reasonText + "): 页索引=" + page.documentOffset + "，目标底边=" + targetBottom);
            return;
        } catch (e2) {
        }

        try {
            var newBottomMargin = Math.max(0, pageBottom - state.lastPlacedBottom);
            page.marginPreferences.bottom = newBottomMargin;
            output.pushLog(logs, "页面高度调整失败，已改下边距贴合内容(" + reasonText + "): 页索引=" + page.documentOffset + "，bottomMargin=" + newBottomMargin);
        } catch (e3) {
            output.pushLog(logs, "页面贴合失败(" + reasonText + "): 页索引=" + page.documentOffset + "，错误=" + e3);
        }
    };

    api.cleanupPrototypeItems = function (baseState, logs) {
        try {
            if (baseState && baseState.bodyTextProto && baseState.bodyTextProto.isValid) {
                baseState.bodyTextProto.remove();
            }
        } catch (e1) {
            output.pushLog(logs, "清理正文文本原型框失败: " + e1);
        }
        try {
            if (baseState && baseState.bodyImageProto && baseState.bodyImageProto.isValid) {
                baseState.bodyImageProto.remove();
            }
        } catch (e2) {
            output.pushLog(logs, "清理正文图片原型框失败: " + e2);
        }
    };

    api.cleanupOnePrototype = function (item, logs, textMsg) {
        try {
            if (item && item.isValid) {
                item.remove();
            }
        } catch (e1) {
            output.pushLog(logs, textMsg + ": " + e1);
        }
    };

    api.nextPageState = function (doc, baseState, logs, docName) {
        var page = doc.pages.add(LocationOptions.AFTER, doc.pages.lastItem());
        api.applyPageMarginSpec(page, baseState.pageMarginSpec);
        var pageTop = api.getPageInnerTop(page);
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
        output.pushLog(logs, "文档续页: " + docName + "，新页索引=" + state.page.documentOffset);
        return state;
    };

    api.nextPageStateFromBase = function (doc, baseState, logs, docName) {
        var page = doc.pages.add(LocationOptions.AFTER, doc.pages.lastItem());
        api.applyPageMarginSpec(page, baseState.pageMarginSpec);

        var pageTop = api.getPageInnerTop(page);
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

        output.pushLog(logs, "文档续页: " + docName + "，新页索引=" + state.page.documentOffset);
        return state;
    };

    api.resolveBottomRange = function (templateSpec, page) {
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

        softBottom = runtime.toNumberOrDefault(softBottom, pageBounds[2]);
        hardBottom = runtime.toNumberOrDefault(hardBottom, pageBounds[2]);
        if (hardBottom < softBottom) {
            throw new Error("content_bottom_hard 不能小于 content_bottom_soft");
        }

        return {
            softBottom: softBottom,
            hardBottom: hardBottom
        };
    };

    root.pageState = api;
}());
