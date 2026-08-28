(function () {
    var root = $.global.__AUTORAINBOW_CORE__ || ($.global.__AUTORAINBOW_CORE__ = {});
    if (root.templateBLogic) {
        return;
    }

    var api = {};

    api.createPageStateTemplateB = function (doc, templateSpec) {
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
    };

    api.buildModeBUnits = function (items) {
        // 2026-08-08：按缓存元素的【原始顺序】生成单元，不再"图片收集-文本配对"重组。
        // 用户确认自由移动模型后，交换数据（缓存 JSON）的顺序就是最终排版顺序——
        // 例如末尾 img img txt txt 必须按此顺序放置；旧逻辑会把连续图片重组成
        // img txt img txt（与工作区显示不一致）。
        var units = [];
        var pendingBreak = false;
        var i;
        for (i = 0; i < items.length; i += 1) {
            var item = items[i];
            if (item.page_break_before) {
                pendingBreak = true;
            }
            if (item.type === "image") {
                units.push({
                    kind: "image",
                    index: item.index,
                    src: item.src || "",
                    pageBreakBefore: pendingBreak
                });
                pendingBreak = false;
                continue;
            }
            if (item.type === "text") {
                // 2026-08-16：统一"行"模型——多格行展开为 N 个列单元（colCount/colIndex）
                var cols = (item.cols && item.cols.length > 0) ? item.cols : [{ content: item.content || "" }];
                if (cols.length > 1) {
                    var ci;
                    for (ci = 0; ci < cols.length; ci += 1) {
                        units.push({
                            kind: "text",
                            index: item.index,
                            text: (cols[ci] && cols[ci].content) || "",
                            pageBreakBefore: ci === 0 ? pendingBreak : false,
                            colCount: cols.length,
                            colIndex: ci
                        });
                    }
                } else {
                    units.push({
                        kind: "text",
                        index: item.index,
                        text: (cols[0] && cols[0].content) || (item.content || ""),
                        pageBreakBefore: pendingBreak
                    });
                }
                pendingBreak = false;
            }
        }
        return units;
    };

    api.placeModeBImageItem = function (state, imagePath, logs) {
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
    };

    // 页尾均匀裁剪（2026-08-07）：除最后一页外，每页从最下方减少 trim 高度。
    // 内容保持原位，底部多出的部分自然落入出血区（用户确认：不影响）。
    api.trimPageBottoms = function (pages, trimPx, logs) {
        var trim = toNumberOrDefault(trimPx, 0);
        if (trim <= 0 || !pages || pages.length < 2) {
            return;
        }
        var i;
        for (i = 0; i < pages.length - 1; i += 1) {
            var page = pages[i];
            try {
                if (!page || !page.isValid) {
                    continue;
                }
                var pb = page.bounds;
                var width = pb[3] - pb[1];
                var height = pb[2] - pb[0] - trim;
                if (height <= 1) {
                    continue;
                }
                page.resize(
                    CoordinateSpaces.INNER_COORDINATES,
                    AnchorPoint.TOP_LEFT_ANCHOR,
                    ResizeMethods.REPLACING_CURRENT_DIMENSIONS_WITH,
                    [width, height]
                );
                pushLog(logs, "页尾均匀裁剪: 页索引=" + page.documentOffset + "，高度 -" + trim);
            } catch (eTrim) {
                pushLog(logs, "页尾裁剪失败: 页索引=" + page.documentOffset + "，错误=" + eTrim);
            }
        }
    };

    api.processGroupTemplateB = function (doc, group, templateSpec, logs, pageBreakReport) {
        var result = {
            createdPageCount: 0,
            placedTextCount: 0,
            placedImageCount: 0,
            firstPage: null
        };

        var baseState = api.createPageStateTemplateB(doc, templateSpec);
        var state = baseState;
        var units = api.buildModeBUnits(group.items);
        var createdPages = [baseState.page];

        result.createdPageCount += 1;
        result.firstPage = state.page;

        var i;
        for (i = 0; i < units.length; i += 1) {
            var unit = units[i];

            // 2026-08-06：移除 soft/image hard/text hard/card hard 自动分页——
            // 分页点由前端按 style_profile 计算（算法迁移自 JSX 原 soft/hard 判定，
            // 见 page_break_calc.py _calculate_mode_b_breaks），JSX 只尊重分页点。

            if (unit.pageBreakBefore && i > 0) {
                fitPageBottomToLastItem(state, logs, "templateB 手动分页前");
                state = nextPageStateFromBase(doc, baseState, logs, group.doc_name);
                result.createdPageCount += 1;
                createdPages.push(state.page);
            }

            if (unit.kind === "image") {
                var imgFrame = api.placeModeBImageItem(state, unit.src, logs);
                var imgBottom = imgFrame.geometricBounds[2];
                state.cursorY = imgBottom + state.gapY;
                state.lastPlacedBottom = imgBottom;
                result.placedImageCount += 1;
                continue;
            }

            if (unit.colCount > 1) {
                // 2026-08-16：一行多文本块——N 列并排（顶对齐，纯均分无空隙），
                // 行高 = max(各列底边)；装饰卡片跟随整行放置一次
                var rowSpec = state.bodyTextSpec;
                var rowWidth = rowSpec.x2 - rowSpec.x1;
                var colWidth = rowWidth / unit.colCount;
                var rowTop = state.cursorY;
                var maxBottom = rowTop;
                var k;
                for (k = 0; k < unit.colCount; k += 1) {
                    var colUnit = units[i + k];
                    var colX1 = rowSpec.x1 + k * colWidth;
                    var colX2 = colX1 + colWidth;
                    var colFrame = placeTextItemInColumn(state, colUnit.text, colX1, colX2);
                    var colBottom = colFrame.geometricBounds[2];
                    if (colBottom > maxBottom) {
                        maxBottom = colBottom;
                    }
                }
                i += unit.colCount - 1;
                state.cursorY = maxBottom + state.gapY;
                state.lastPlacedBottom = maxBottom;
                result.placedTextCount += unit.colCount;

                var rowCard = placeFixedItemFromSpec(state, state.cardProtoRef, state.cardSpec);
                var rowCardBottom = rowCard.geometricBounds[2];
                state.cursorY = rowCardBottom + state.gapY;
                state.lastPlacedBottom = rowCardBottom;
                continue;
            }

            var textFrame = placeTextItem(state, unit.text);
            var textBottom = textFrame.geometricBounds[2];
            state.cursorY = textBottom + state.gapY;
            state.lastPlacedBottom = textBottom;
            result.placedTextCount += 1;

            // 装饰卡片跟随文本单元（图片单独出现时不放置卡片）
            var cardFrame = placeFixedItemFromSpec(state, state.cardProtoRef, state.cardSpec);
            var cardBottom = cardFrame.geometricBounds[2];
            state.cursorY = cardBottom + state.gapY;
            state.lastPlacedBottom = cardBottom;
        }

        fitPageBottomToLastItem(state, logs, "templateB 文档组结束");
        api.trimPageBottoms(createdPages, templateSpec.page_bottom_trim_px, logs);
        cleanupOnePrototype(baseState.bodyTextProto, logs, "清理 templateB 文本原型失败");
        cleanupOnePrototype(baseState.bodyImageProto, logs, "清理 templateB 图片原型失败");
        cleanupOnePrototype(baseState.cardProto, logs, "清理 templateB 装饰原型失败");
        return result;
    };

    root.templateBLogic = api;
}());
