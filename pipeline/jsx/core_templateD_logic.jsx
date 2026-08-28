(function () {
    var root = $.global.__AUTORAINBOW_CORE__ || ($.global.__AUTORAINBOW_CORE__ = {});
    if (root.templateDLogic) {
        return;
    }

    var api = {};

    api.dbgFile = null;
    api.dbgLog = function (msg) {
        try {
            if (!api.dbgFile) {
                api.dbgFile = getDebugLogFile("templateD_debug.log");
            }
            if (!api.dbgFile.open("a")) { return; }
            api.dbgFile.encoding = "UTF-8";
            api.dbgFile.write("[" + String(new Date()) + "] " + msg + "\n");
            api.dbgFile.close();
        } catch (eD) {
        }
    };

    // 2026-08-18：调试日志统一写 workspace/.runtime/logs/（不再写 ~），
    // 定位方式：watcher 注入常量 → 全局变量 → 脚本位置反推。
    function getDebugLogFile(name) {
        var rootFolder = "";
        if (typeof __AUTO_INJECTED_PROJECT_ROOT__ === "string" && __AUTO_INJECTED_PROJECT_ROOT__) {
            rootFolder = __AUTO_INJECTED_PROJECT_ROOT__;
        }
        if (typeof $.global.__AUTO_RAINBOW_PROJECT_ROOT__ === "string" && $.global.__AUTO_RAINBOW_PROJECT_ROOT__) {
            rootFolder = $.global.__AUTO_RAINBOW_PROJECT_ROOT__;
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

    api.splitTitleAndBodyText = function (textValue) {
        var raw = String(textValue || "");
        raw = raw.replace(/\r\n/g, "\n");
        raw = raw.replace(/\r/g, "\n");
        var lines = raw.split("\n");
        var titleText = lines.length > 0 ? lines[0] : "";
        var bodyText = lines.length > 1 ? lines.slice(1).join("\n") : "";
        return {
            titleText: titleText,
            bodyText: bodyText
        };
    };

    api.buildTemplateDPages = function (items) {
        // 2026-08-09：移除"组"概念——分页只由编辑器给到的分页标记（page_break_before）决定。
        // 每一页 = 一段连续文本块（合并）+ 其后一组连续图片；页边界 = 分页标记所在元素。
        // 规则与前端 / page_break_calc.py 一致：文本带 page_break_before → 新页起点。
        // 文件开头的图片归第一页（不再丢弃"无组图片"）。
        var pages = [];
        var current = null;
        var i;
        for (i = 0; i < items.length; i += 1) {
            var item = items[i];
            if (!item) {
                continue;
            }
            if (item.type === "text") {
                if (!current || item.page_break_before) {
                    current = {
                        startIndex: item.index,
                        textParts: [],
                        imageItems: []
                    };
                    pages.push(current);
                }
                current.textParts.push(item);
            } else if (item.type === "image") {
                if (!current) {
                    current = {
                        startIndex: item.index,
                        textParts: [],
                        imageItems: []
                    };
                    pages.push(current);
                }
                current.imageItems.push(item);
            }
        }

        var normalized = [];
        for (i = 0; i < pages.length; i += 1) {
            var p = pages[i];
            var mergedText = "";
            // 2026-08-16：统一"行"模型——每段文本保留自己的 cols（多格行不被合并压平）
            var textBlocks = [];
            if (p.textParts && p.textParts.length > 0) {
                var parts = [];
                var bi;
                for (bi = 0; bi < p.textParts.length; bi += 1) {
                    var part = p.textParts[bi];
                    var cols = (part.cols && part.cols.length > 0) ? part.cols : [{ content: part.content || "" }];
                    textBlocks.push({ cols: cols });
                    parts.push(cols[0] ? (cols[0].content || "") : "");
                }
                mergedText = parts.join("\n");
            }
            normalized.push({
                startIndex: p.startIndex,
                textItem: {
                    content: mergedText
                },
                textBlocks: textBlocks,
                imageItems: p.imageItems || []
            });
        }
        return normalized;
    };

    api.cleanupBrokenLinkGraphics = function (page, logs) {
        // 2026-08-15：删除页面上带坏链接的图形对象（文件缺失/无效链接）。
        // 遍历页面所有 PageItem，检查其 links：
        // - 有链接且 status 非 NORMAL（缺失/过期/无法读取）→ 移除该图形内容
        // - 框架本身保留（避免误删模板结构），只清空其中的坏图
        if (!page || !page.isValid) {
            return;
        }
        var items = [];
        try {
            items = page.allPageItems || [];
        } catch (eAll) {
            return;
        }
        var i;
        for (i = 0; i < items.length; i += 1) {
            var item = items[i];
            if (!item || !item.isValid) {
                continue;
            }
            var hasBrokenLink = false;
            try {
                if (item.links && item.links.length > 0) {
                    var li;
                    for (li = 0; li < item.links.length; li += 1) {
                        var linkObj = item.links[li];
                        if (!linkObj || !linkObj.isValid) {
                            hasBrokenLink = true;
                            break;
                        }
                        var st = "";
                        try {
                            st = String(linkObj.status);
                        } catch (eSt) {
                            st = "";
                        }
                        if (st !== "" && st.indexOf("NORMAL") < 0) {
                            hasBrokenLink = true;
                            break;
                        }
                    }
                }
            } catch (eLinks) {
                // 无法读取链接信息时保守处理：若该对象是图形框架且无内容引用则跳过
            }
            if (!hasBrokenLink) {
                continue;
            }
            try {
                // 只清空坏图内容，保留框架对象（模板结构不破坏）
                item.contents = "";
                while (item.allGraphics && item.allGraphics.length > 0) {
                    try {
                        item.allGraphics[0].remove();
                    } catch (eRm) {
                        break;
                    }
                }
                if (logs) {
                    pushLog(logs, "templateD 已清理坏链接图形: label=" + (item.label || "(无label)"));
                }
            } catch (eClean) {
                if (logs) {
                    pushLog(logs, "templateD 清理坏链接图形失败: " + eClean);
                }
            }
        }
    };

    api.buildPhotoRowPriorityOrder = function (rowCount) {
        var order = [];
        if (rowCount <= 0) {
            return order;
        }
        if (rowCount === 1) {
            return [0];
        }
        if (rowCount === 2) {
            return [0, 1];
        }

        var step;
        if (rowCount % 2 === 1) {
            var mid = Math.floor(rowCount / 2);
            order.push(mid);
            step = 1;
            while (order.length < rowCount) {
                var top = mid - step;
                var bottom = mid + step;
                if (top >= 0) {
                    order.push(top);
                }
                if (bottom < rowCount) {
                    order.push(bottom);
                }
                step += 1;
            }
            return order;
        }

        var midLeft = rowCount / 2 - 1;
        var midRight = rowCount / 2;
        order.push(midLeft);
        order.push(midRight);
        step = 1;
        while (order.length < rowCount) {
            var topIdx = midLeft - step;
            var bottomIdx = midRight + step;
            if (topIdx >= 0) {
                order.push(topIdx);
            }
            if (bottomIdx < rowCount) {
                order.push(bottomIdx);
            }
            step += 1;
        }
        return order;
    };

    api.buildPhotoRowCounts = function (totalCount) {
        var n = Number(totalCount);
        if (isNaN(n) || n <= 0) {
            return [];
        }
        if (n <= 4) {
            return [n];
        }

        // 2026-08-16：一行最多 4 个。先按每行 4 填满（容量 = 4 * rowCount），
        // 再按"缺口 = 容量 - n"从优先级高的行逐行减 1：
        //   ① 首行（最优先少） ② 末行 ③ 中间行从前向后（保证"中后多"）
        // 例：13 → [3,3,4,3]；15 → [3,4,4,4]
        var rowCount = Math.ceil(n / 4);
        var counts = [];
        var i;
        for (i = 0; i < rowCount; i += 1) {
            counts.push(4);
        }

        var deficit = rowCount * 4 - n;
        var reductionOrder = [0];
        if (rowCount > 1) {
            reductionOrder.push(rowCount - 1);
        }
        for (i = 1; i < rowCount - 1; i += 1) {
            reductionOrder.push(i);
        }
        var ri = 0;
        while (deficit > 0) {
            var idx = reductionOrder[ri];
            if (counts[idx] > 0) {
                counts[idx] -= 1;
                deficit -= 1;
            }
            ri += 1;
            if (ri >= reductionOrder.length) {
                ri = 0;
            }
        }
        return counts;
    };

    api.buildRowXBoundsLeftAligned = function (imageCount, leftX, imageWidth) {
        var w = Number(imageWidth);
        if (isNaN(w) || w <= 0) {
            throw new Error("图片宽度无效: " + imageWidth);
        }

        if (imageCount <= 1) {
            return [[leftX, leftX + w]];
        }
        if (imageCount === 2) {
            return [
                [leftX, leftX + w],
                [leftX + w, leftX + 2 * w]
            ];
        }
        if (imageCount === 3) {
            return [
                [leftX, leftX + w],
                [leftX + w, leftX + 2 * w],
                [leftX + 2 * w, leftX + 3 * w]
            ];
        }
        // 2026-08-16：一行最多 4 个
        return [
            [leftX, leftX + w],
            [leftX + w, leftX + 2 * w],
            [leftX + 2 * w, leftX + 3 * w],
            [leftX + 3 * w, leftX + 4 * w]
        ];
    };

    api.keepFrameTopGap = function (frame, targetTop) {
        if (!frame || !frame.isValid) {
            return;
        }
        var gb = frame.geometricBounds;
        var h = gb[2] - gb[0];
        frame.geometricBounds = [targetTop, gb[1], targetTop + h, gb[3]];
    };

    api.fitImageTemplateDSecondPageAdaptive = function (frameObj) {
        try {
            if (!frameObj || !frameObj.isValid || !frameObj.allGraphics || frameObj.allGraphics.length === 0) {
                return;
            }
            var graphic = frameObj.allGraphics[0];
            if (!graphic || !graphic.isValid) {
                return;
            }

            var frameBounds = frameObj.geometricBounds;
            var frameTop = frameBounds[0];
            var frameLeft = frameBounds[1];
            var frameRight = frameBounds[3];
            var frameWidth = frameRight - frameLeft;
            if (frameWidth <= 0) {
                return;
            }

            var gb = graphic.geometricBounds;
            var gWidth = gb[3] - gb[1];
            var gHeight = gb[2] - gb[0];
            if (gWidth <= 0 || gHeight <= 0) {
                return;
            }

            var ratio = gWidth / gHeight;
            if (ratio < (2 / 3)) {
                fitImageHeightMatched(frameObj);
                return;
            }

            var scaleByWidth = frameWidth / gWidth;
            if (Math.abs(scaleByWidth - 1) > 0.0001) {
                var hScale = 100;
                var vScale = 100;
                try { hScale = Number(graphic.horizontalScale); } catch (e1) {}
                try { vScale = Number(graphic.verticalScale); } catch (e2) {}
                if (isNaN(hScale) || hScale <= 0) {
                    hScale = 100;
                }
                if (isNaN(vScale) || vScale <= 0) {
                    vScale = 100;
                }
                graphic.horizontalScale = hScale * scaleByWidth;
                graphic.verticalScale = vScale * scaleByWidth;
            }

            gb = graphic.geometricBounds;
            gHeight = gb[2] - gb[0];
            if (gHeight <= 0) {
                return;
            }

            graphic.geometricBounds = [frameTop, frameLeft, frameTop + gHeight, frameRight];
            frameObj.geometricBounds = [frameTop, frameLeft, frameTop + gHeight, frameRight];
        } catch (e3) {
        }
    };

    api.processGroupTemplateD = function (doc, group, templateSpec, logs, pageBreakReport) {
        var result = {
            createdPageCount: 0,
            placedTextCount: 0,
            placedImageCount: 0,
            firstPage: null
        };

        var contentPages = api.buildTemplateDPages(group.items);
        if (contentPages.length === 0) {
            pushLog(logs, "templateD 未找到可用内容: " + group.doc_name);
            return result;
        }
        api.dbgLog("processGroupTemplateD: 页数=" + contentPages.length + " items=" + (group.items ? group.items.length : 0));

        var g;
        for (g = 0; g < contentPages.length; g += 1) {
            var cg = contentPages[g];
            var isFirstPage = g === 0;
            var splitText = api.splitTitleAndBodyText(cg.textItem.content || "");
            // 2026-08-16：统一"行"模型——每页文本块列表（1 格块全宽、多格块分列）
            var textBlocks = (cg.textBlocks && cg.textBlocks.length > 0) ? cg.textBlocks : [{ cols: [{ content: cg.textItem.content || "" }] }];
            var hasRowBlock = false;
            var tb;
            for (tb = 0; tb < textBlocks.length; tb += 1) {
                if (textBlocks[tb].cols.length > 1) {
                    hasRowBlock = true;
                    break;
                }
            }
            var pageIndex = isFirstPage ? templateSpec.first_group_source_page_index : templateSpec.other_group_source_page_index;
            api.dbgLog("页" + (g + 1) + ": 准备复制页面 pageIndex=" + pageIndex + " doc页数=" + doc.pages.length);
            var sourcePage = doc.pages[Number(pageIndex) - 1];
            var sourceLabels = collectPageLabels(sourcePage, 80).join(", ");
            var page = null;
            try {
                page = duplicateTemplatePageByIndex(doc, pageIndex);
            } catch (eDup) {
                api.dbgLog("页" + (g + 1) + ": 复制页面失败! " + eDup + " (doc页数=" + doc.pages.length + ")");
                throw eDup;
            }
            result.createdPageCount += 1;
            api.dbgLog("页" + (g + 1) + ": 复制页面完成 pageIndex=" + pageIndex + " 复制后doc页数=" + doc.pages.length);
            if (!result.firstPage) {
                result.firstPage = page;
            }

            var dividerLabel = isFirstPage ? templateSpec.first_divider_label : templateSpec.other_divider_label;
            var imageLabel = isFirstPage ? templateSpec.first_image_proto_label : templateSpec.other_image_proto_label;
            var textLabel = isFirstPage ? templateSpec.first_text_proto_label : templateSpec.other_text_proto_label;

            var dividerItem = findPageItemByLabels(page, buildDividerLabelCandidates(dividerLabel));
            var imageProto = findPageItemByLabel(page, imageLabel);
            var textProto = findPageItemByLabel(page, textLabel);
            if (!dividerItem) {
                throw new Error(
                    "templateD 缺少分隔线对象: " + dividerLabel +
                    "；页序号=" + (g + 1) +
                    "；源页索引=" + pageIndex +
                    "；源页label=" + sourceLabels +
                    "；复制页label=" + collectPageLabels(page, 80).join(", ")
                );
            }
            if (!imageProto) {
                throw new Error("templateD 缺少图片原型框: " + imageLabel);
            }
            if (!textProto) {
                throw new Error("templateD 缺少文本原型框: " + textLabel);
            }

            if (!isFirstPage) {
                var headingItem = findPageItemByLabel(page, templateSpec.other_heading_label);
                if (!headingItem) {
                    throw new Error("templateD 缺少标题对象: " + templateSpec.other_heading_label + "；本页可见label=" + collectPageLabels(page, 80).join(", "));
                }
                if (headingItem.isValid && headingItem.contents !== undefined) {
                    clearFrameContents(headingItem);
                    var headingText = splitText.titleText || "";
                    if (hasRowBlock && textBlocks.length > 0 && textBlocks[0].cols.length > 0) {
                        // 行场景：标题取第一块第一格首行
                        headingText = String(textBlocks[0].cols[0].content || "").split("\n")[0] || "";
                    }
                    headingItem.contents = headingText;
                }
                var headingBottom = headingItem.geometricBounds[2];
                var dividerBounds = dividerItem.geometricBounds;
                var dividerHeight = dividerBounds[2] - dividerBounds[0];
                var dividerTop = headingBottom + templateSpec.divider_offset_from_heading;
                dividerItem.geometricBounds = [dividerTop, dividerBounds[1], dividerTop + dividerHeight, dividerBounds[3]];
            }

            var validImageFiles = [];
            var ii;
            for (ii = 0; ii < cg.imageItems.length; ii += 1) {
                var imagePath = cg.imageItems[ii].src || "";
                var imageFile = File(imagePath);
                if (imageFile.exists) {
                    validImageFiles.push(imageFile.fsName);
                } else {
                    pushLog(logs, "templateD 图片不存在，已跳过，路径=" + imagePath);
                }
            }
            pushLog(logs, "templateD 页" + (g + 1) + " 处理中: 图片=" + validImageFiles.length + " 文本=" + splitText.titleText.slice(0, 30));
            api.dbgLog("页" + (g + 1) + ": 有效图片=" + validImageFiles.length + " 首图=" + (validImageFiles[0] || ""));

            var dividerBottom = dividerItem.geometricBounds[2];
            var imageSpec = buildImageSpecFromProto(imageProto);
            var bodyText = splitText.bodyText;
            var textStartY = dividerBottom + templateSpec.text_top_gap;

            if (isFirstPage) {
                var imageWidth = imageSpec.x2 - imageSpec.x1;
                // 生日页图片区起点 = 生日图原型框顶边（模板参考：文本框底=原型框顶，divider 仅是装饰）
                var photoStartY = imageProto.geometricBounds[0];
                var photoBottom = dividerBottom;

                if (validImageFiles.length > 0) {
                    var rowCounts = api.buildPhotoRowCounts(validImageFiles.length);
                    // 2026-08-16：每行图片相对页面内容区水平居中（而非靠左）。
                    var pageBounds = page.bounds;
                    var contentLeft = pageBounds[1] + getPageMarginValue(page, "left", 0);
                    var contentRight = pageBounds[3] - getPageMarginValue(page, "right", 0);
                    var imageIndex = 0;
                    var rowIdx;
                    for (rowIdx = 0; rowIdx < rowCounts.length; rowIdx += 1) {
                        var rowCount = rowCounts[rowIdx];
                        var rowTop = photoStartY + rowIdx * (imageSpec.height + templateSpec.photo_row_gap);
                        var rowWidth = rowCount * imageWidth;
                        var rowStartX = contentLeft + (contentRight - contentLeft - rowWidth) / 2;
                        var xBoundsList = api.buildRowXBoundsLeftAligned(rowCount, rowStartX, imageWidth);
                        var cellIdx;
                        for (cellIdx = 0; cellIdx < rowCount; cellIdx += 1) {
                            var frame = duplicatePrototypeToPage(imageProto, page);
                            if (!frame || !frame.isValid) {
                                throw new Error("templateD 复制图片原型失败");
                            }
                            var xBounds = xBoundsList[cellIdx];
                            frame.geometricBounds = [rowTop, xBounds[0], rowTop + imageSpec.height, xBounds[1]];
                            clearFrameContents(frame);
                            try {
                                api.dbgLog("页" + (g + 1) + ": 开始 place 生日图" + (imageIndex + 1) + "/" + validImageFiles.length);
                                frame.place(File(validImageFiles[imageIndex]));
                            } catch (ePlace) {
                                pushLog(logs, "templateD 生日页 place 失败: index=" + (imageIndex + 1) + " 文件=" + validImageFiles[imageIndex] + " 错误=" + ePlace);
                                api.dbgLog("页" + (g + 1) + ": place 生日图失败! " + ePlace);
                                throw ePlace;
                            }
                            api.dbgLog("页" + (g + 1) + ": place 生日图" + (imageIndex + 1) + " 完成");
                            fitImageLeftAlignedContent(frame);
                            imageIndex += 1;
                            result.placedImageCount += 1;
                        }
                        photoBottom = rowTop + imageSpec.height;
                    }
                }

                textStartY = (validImageFiles.length > 0 ? photoBottom : dividerBottom) + templateSpec.text_top_gap;
            } else {
                var normalGap = 48;
                var cursorY = dividerBottom + normalGap;
                var imgIdx;
                for (imgIdx = 0; imgIdx < validImageFiles.length; imgIdx += 1) {
                    var lineFrame = duplicatePrototypeToPage(imageProto, page);
                    if (!lineFrame || !lineFrame.isValid) {
                        throw new Error("templateD 复制图片原型失败");
                    }
                    lineFrame.geometricBounds = [cursorY, imageSpec.x1, cursorY + imageSpec.height, imageSpec.x2];
                    clearFrameContents(lineFrame);
                    try {
                        api.dbgLog("页" + (g + 1) + ": 开始 place 图" + (imgIdx + 1) + "/" + validImageFiles.length + " = " + validImageFiles[imgIdx]);
                        lineFrame.place(File(validImageFiles[imgIdx]));
                        api.dbgLog("页" + (g + 1) + ": place 图" + (imgIdx + 1) + " 完成");
                    } catch (ePlace) {
                        pushLog(logs, "templateD 普通页 place 失败: index=" + (imgIdx + 1) + " 文件=" + validImageFiles[imgIdx] + " 错误=" + ePlace);
                        api.dbgLog("页" + (g + 1) + ": place 图" + (imgIdx + 1) + " 失败! " + ePlace);
                        throw ePlace;
                    }
                    api.fitImageTemplateDSecondPageAdaptive(lineFrame);
                    cursorY = lineFrame.geometricBounds[2] + normalGap;
                    result.placedImageCount += 1;
                }
                textStartY = cursorY;
            }

            var textState = {
                page: page,
                cursorY: textStartY,
                bodyTextProtoRef: textProto,
                bodyTextSpec: buildTextSpecFromProto(textProto)
            };
            api.dbgLog("页" + (g + 1) + ": 开始放文本");
            var textBottom;
            if (hasRowBlock) {
                // 2026-08-16：行场景——逐块放置（1 格块全宽、多格块分列并排）
                var blockGap = 48;
                var blkCursor = textStartY;
                var bk;
                for (bk = 0; bk < textBlocks.length; bk += 1) {
                    var blkCols = textBlocks[bk].cols;
                    var blkState = {
                        page: page,
                        cursorY: blkCursor,
                        bodyTextProtoRef: textProto,
                        bodyTextSpec: textState.bodyTextSpec
                    };
                    if (blkCols.length > 1) {
                        var rowW = textState.bodyTextSpec.x2 - textState.bodyTextSpec.x1;
                        var colW = rowW / blkCols.length;
                        var maxB = blkCursor;
                        var ck;
                        for (ck = 0; ck < blkCols.length; ck += 1) {
                            var cX1 = textState.bodyTextSpec.x1 + ck * colW;
                            var colFrame = placeTextItemInColumn(blkState, blkCols[ck].content || "", cX1, cX1 + colW);
                            var colBottom = colFrame.geometricBounds[2];
                            if (colBottom > maxB) {
                                maxB = colBottom;
                            }
                        }
                        blkCursor = maxB + blockGap;
                        result.placedTextCount += blkCols.length;
                    } else {
                        var blkFrame = placeTextItem(blkState, blkCols[0].content || "");
                        api.keepFrameTopGap(blkFrame, blkCursor);
                        blkCursor = blkFrame.geometricBounds[2] + blockGap;
                        result.placedTextCount += 1;
                    }
                }
                textBottom = blkCursor - blockGap;
            } else {
                var textFrame = placeTextItem(textState, bodyText);
                api.keepFrameTopGap(textFrame, textStartY);
                textBottom = textFrame.geometricBounds[2];
                result.placedTextCount += 1;
            }
            api.dbgLog("页" + (g + 1) + ": 文本放置完成");

            api.dbgLog("页" + (g + 1) + ": fitPageBottom");
            fitPageBottomToLastItem({
                page: page,
                lastPlacedBottom: textBottom
            }, logs, "templateD 页内容结束");

            api.dbgLog("页" + (g + 1) + ": cleanup 原型");
            cleanupOnePrototype(imageProto, logs, "清理 templateD 图片原型失败");
            cleanupOnePrototype(textProto, logs, "清理 templateD 文本原型失败");
            api.dbgLog("页" + (g + 1) + ": 页处理完成");
        }

        return result;
    };

    root.templateDLogic = api;
}());
