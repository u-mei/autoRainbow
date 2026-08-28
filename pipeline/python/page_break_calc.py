"""分页点计算器：根据模板样式记录（style_profile）与缓存元素计算自动分页点。

设计文档：docs/templates/模板样式记录与前端分页计算设计.md

算法对齐 JSX（core_layout_runner.jsx 的 soft/hard 换页逻辑）：
- 软阈值 soft：放置元素前 cursorY > soft → 换页
- 硬阈值 hard：文本放置后底部 > hard，或图片放置前 cursorY+高度 > hard → 换页
- 手动分页（page_break_before 已存在）保留，换页后 cursorY 重置为续页起始
- templateC（单页）不产生自动分页点；templateD 分页点 = 连续图片段末尾之后的文本
"""

import math

CJK_WIDTH_FACTOR = 1.0
LATIN_WIDTH_FACTOR = 0.55
AUTO_LEADING_FACTOR = 1.2
BASELINE_ADJUST_FACTOR = 0.2

NO_BREAK_MODES = {"templateC"}
ALIGN_SCAN_LIMIT = 3  # 图片收尾：分页点前后各扫描的元素数（用户确认 2026-08-06）


def _is_cjk_char(ch):
    cp = ord(ch)
    return (
        0x2E80 <= cp <= 0x9FFF   # 部首/汉字（含扩展A 3400-4DBF）
        or 0xAC00 <= cp <= 0xD7AF  # 谚文音节
        or 0xF900 <= cp <= 0xFAFF  # 兼容汉字
        or 0xFF00 <= cp <= 0xFF60  # 全角标点/全角 ASCII
    )


def estimate_text_width(text, point_size):
    total = 0.0
    for ch in text:
        if _is_cjk_char(ch):
            total += point_size * CJK_WIDTH_FACTOR
        else:
            total += point_size * LATIN_WIDTH_FACTOR
    return total


def _to_float(value, default):
    try:
        num = float(value)
        return num
    except (TypeError, ValueError):
        return default


def estimate_text_height(content, text_style, frame_width, chars_per_line=None):
    """估算文本块在 InDesign 中的实际占用高度。

    计入：框内空隙（insetSpacing 上下）、段前/段后距、首行基线偏移、
    行数 × 行高（leading，auto 时按字号 ×1.2）、最小自动尺寸。

    2026-08-16：chars_per_line 提供时按"每行字数"算行数（设计文档 §4.1）——
    每行宽度 = Z × 字号（全角字宽），行数 = ceil(总宽 / 每行宽)。
    未提供时按 frame_width（框宽）算，行为与旧版一致。
    """
    content = str(content or "")
    if not content:
        return 0.0
    style = text_style or {}
    point_size = _to_float(style.get("point_size"), 12)
    leading = style.get("leading")
    if leading is None or str(leading).strip().upper() in ("", "AUTO", "AUTO_LEADING"):
        leading = point_size * AUTO_LEADING_FACTOR
    else:
        leading = _to_float(leading, point_size * AUTO_LEADING_FACTOR)

    inset = style.get("inset_spacing") or []
    try:
        inset_top = _to_float(inset[0], 0)
        inset_bottom = _to_float(inset[2], 0)
    except (IndexError, TypeError):
        inset_top = 0
        inset_bottom = 0
    space_before = _to_float(style.get("space_before"), 0)
    space_after = _to_float(style.get("space_after"), 0)

    prefs = style.get("text_frame_prefs") or {}
    min_height = _to_float(prefs.get("minimum_height_for_auto_sizing"), 0)

    frame = _to_float(frame_width, 500)
    if isinstance(inset, list) and len(inset) > 1:
        inset_left = _to_float(inset[1], 0)
    else:
        inset_left = 0
    if isinstance(inset, list) and len(inset) > 3:
        inset_right = _to_float(inset[3], 0)
    else:
        inset_right = 0
    inner_width = max(frame - inset_left - inset_right, 1)

    # 每行字数模式：每行宽度 = Z × 字号（全角字宽 = 字号）
    z = _to_float(chars_per_line, 0)
    if z > 0:
        inner_width = max(z * point_size, 1)

    lines = 0
    for paragraph in content.split("\n"):
        width = estimate_text_width(paragraph, point_size)
        if width <= 0:
            lines += 1
        else:
            lines += max(1, math.ceil(width / inner_width))

    body_height = max(lines * leading, min_height)
    return (
        inset_top
        + inset_bottom
        + space_before
        + space_after
        + point_size * BASELINE_ADJUST_FACTOR
        + body_height
    )


def _text_style_for(style_profile):
    """从 style_profile.objects 提取正文文本样式（含 text_frame_prefs）。"""
    objects = style_profile.get("objects") or {}
    for label in ("proto_text", "body_text", "text_proto"):
        records = objects.get(label)
        if isinstance(records, list) and records:
            record = records[0]
            style = dict(record.get("text") or {})
            style["text_frame_prefs"] = record.get("text_frame_prefs") or {}
            return style
    return {}


def _element_heights(elements, text_style, frame_width, image_height, gap_y):
    """预计算每个元素的占用高度（含 gap_y），与 elements 下标一一对应。"""
    heights = []
    for el in elements:
        if not isinstance(el, dict):
            heights.append(0.0)
            continue
        if el.get("type") == "image":
            heights.append((image_height or 0.0) + gap_y)
        else:
            heights.append(estimate_text_height(el.get("content"), text_style, frame_width) + gap_y)
    return heights


def _align_break_to_image(elements, heights, break_idx, page_h, placed, hard, page_capacity):
    """图片收尾对齐：分页点尽量落在图片元素之后（图片作为页尾）。

    在分页点前后各扫描 ALIGN_SCAN_LIMIT 个元素找图片：
    - 候选 A（向前）：分页点前的图片 p 收尾 → 分页点移到 p+1（前页变短）
    - 候选 B（向后）：分页点后的图片 p 收尾 → 分页点移到 p+1（图片并入前页，
      需前页不超容量 page_capacity）
    候选选择：两候选都可用时选让全局两页（placed 为界）更均衡的。
    返回：新的分页元素在列表中的下标（该元素在新页），无候选时返回 break_idx。
    """
    n = len(elements)
    if n == 0:
        return break_idx
    total = sum(heights)
    acc_before = placed + page_h  # 断点前全局累计（前面页 + 当前页已装）
    next_h = total - acc_before

    def is_image(j):
        return isinstance(elements[j], dict) and elements[j].get("type") == "image"

    prev_img = None
    for j in range(break_idx - 1, max(break_idx - 1 - ALIGN_SCAN_LIMIT, -1), -1):
        if is_image(j):
            prev_img = j
            break
    next_img = None
    # 从 break_idx 开始扫描：断点元素本身若是图片，可并入前页做页尾
    # （2026-08-06：第二页开头出现图片的问题即源于漏掉断点元素）
    for j in range(break_idx, min(break_idx + ALIGN_SCAN_LIMIT, n)):
        if is_image(j):
            next_img = j
            break

    def height_diff(delta):
        prev_new = acc_before + delta
        return abs(prev_new - (total - prev_new))

    candidates = []
    if prev_img is not None:
        # 前移：元素 prev_img+1..break_idx-1 从当前页移到新页
        delta = -sum(heights[prev_img + 1:break_idx])
        candidates.append((height_diff(delta), prev_img + 1, delta))
    if next_img is not None:
        # 后移：元素 break_idx..next_img 并入当前页（图片收尾），需不超页容量
        added = sum(heights[break_idx:next_img + 1])
        if page_h + added <= page_capacity:
            candidates.append((height_diff(added), next_img + 1, added))

    if not candidates:
        return break_idx
    if prev_img is not None and next_img is not None:
        # 两候选都可用：优先更长页方向（前页更长 → A；后页更长 → B），
        # 再按全局两页高度差更小选取
        if acc_before >= next_h:
            candidates = [c for c in candidates if c[1] == prev_img + 1] or candidates
        else:
            candidates = [c for c in candidates if c[1] == next_img + 1] or candidates
    candidates.sort(key=lambda c: c[0])
    return candidates[0][1]


def _card_height_for(style_profile):
    """卡片模型（templateB）：装饰卡片高度从 proto_card 原型框读取。"""
    objects = style_profile.get("objects") or {}
    for label in ("proto_card", "card_proto", "card"):
        records = objects.get(label)
        if isinstance(records, list) and records:
            bounds = records[0].get("bounds") or {}
            top = _to_float(bounds.get("top"), 0)
            bottom = _to_float(bounds.get("bottom"), 0)
            if bottom > top:
                return bottom - top
    return 0.0


def _mode_b_units(elements, style_profile, chars_per_line=None):
    """templateB 卡片模型：把元素流解析为「文本(+图片)成对」的 unit。

    对齐 JSX buildModeBUnits（core_templateB_logic.jsx）：
    - 图片元素先收集，文本元素消费最早的待配对图片；
    - 返回 [(anchor, img_h, text_h, card_h, [unit 内元素 index])]：
      anchor 为 unit 首元素 index（1-based，有图时是图片 index，无图时是文本 index），
      分页点写在该元素上；unit 内任一元素（图或文）带 page_break_before
      都视为该 unit 分页（对齐 JSX：buildModeBUnits 把 pendingBreak 合并到 unit）。

    2026-08-16：统一"行"模型——文本元素带 cols（1~3 格）时，
    行高 = 各格按列宽（frame_width/N）或每行字数 Z(N) 估高的最大值。
    """
    lp = style_profile.get("layout_params") or {}
    frame_width = _to_float(lp.get("body_text_width"), 0)
    image_height = _to_float(lp.get("body_image_height"), 0)
    card_height = _card_height_for(style_profile)
    text_style = _text_style_for(style_profile)

    units = []
    pending = []
    for el in elements:
        if not isinstance(el, dict):
            continue
        if el.get("type") == "image":
            pending.append(el)
            continue
        start_index = el.get("index")
        unit_indexes = [int(el.get("index") or 0)]
        img_h = 0.0
        if pending:
            img = pending.pop(0)
            start_index = img.get("index")
            unit_indexes.insert(0, int(img.get("index") or 0))
            img_h = image_height
        cols = el.get("cols")
        text_h = 0.0
        if isinstance(cols, list) and len(cols) > 1:
            # 多格行：各格按列宽/Z(N) 估高取最大
            n = len(cols)
            col_width = frame_width / n if frame_width > 0 else 0
            z_n = None
            if isinstance(chars_per_line, dict):
                z_n = chars_per_line.get(str(n))
            heights = []
            for cell in cols:
                cell_content = ""
                if isinstance(cell, dict):
                    cell_content = cell.get("content") or ""
                elif cell is not None:
                    cell_content = str(cell)
                heights.append(estimate_text_height(cell_content, text_style, col_width, z_n))
            text_h = max(heights) if heights else 0.0
        else:
            content = el.get("content")
            if isinstance(cols, list) and cols and isinstance(cols[0], dict):
                content = cols[0].get("content") or ""
            z_1 = None
            if isinstance(chars_per_line, dict):
                z_1 = chars_per_line.get("1")
            text_h = estimate_text_height(content, text_style, frame_width, z_1)
        units.append((int(start_index or 0), img_h, text_h, card_height, unit_indexes))
    return units


def _calculate_mode_b_breaks(elements, style_profile, chars_per_line=None):
    """templateB 分页点：迁移 JSX 原逻辑（core_templateB_logic.jsx 改造前版本）。

    用户确认 2026-08-06：templateB 分页逻辑在前端计算，算法沿用 JSX 原
    soft/hard 判定规则。逐 unit 模拟 JSX 放置顺序与换页判定：
    - 手动分页（unit.pageBreakBefore && i>0）→ 换页
    - soft：放置 unit 前 cursorY > soft → 换页
    - image hard：有图且 cursorY+图高 > hard → 换页
    - text hard：文本底边 > hard → 换页（换页后重放，仍超则硬放，与 JSX 一致）
    - card hard：cursorY+卡片高 > hard → 换页
    分页点写在 unit 锚点元素（1-based index）上。
    """
    lp = style_profile.get("layout_params") or {}
    start_y = _to_float(lp.get("start_y"), 0)
    continue_start_y = _to_float(lp.get("continue_start_y"), start_y)
    soft = lp.get("content_bottom_soft")
    hard = lp.get("content_bottom_hard")
    if soft is None or hard is None:
        return []
    soft = _to_float(soft, 0)
    hard = _to_float(hard, 0)
    if hard < soft:
        hard = soft

    units = _mode_b_units(elements, style_profile, chars_per_line)
    n = len(units)
    if n == 0:
        return []

    def manual_mark(ui):
        for idx in units[ui][4]:
            if 1 <= idx <= len(elements) and elements[idx - 1].get("page_break_before"):
                return True
        return False

    def mark(anchor, breaks):
        if not breaks or breaks[-1] != anchor:
            breaks.append(anchor)

    breaks = []
    cursor = start_y
    for i in range(n):
        anchor, img_h, text_h, card_h, _ = units[i]

        # 手动分页：第一个 unit 的标记被忽略（JSX：unit.pageBreakBefore && i > 0）
        if i > 0 and manual_mark(i):
            cursor = continue_start_y
            mark(anchor, breaks)

        # soft：放置前 cursorY > soft
        if cursor > soft:
            cursor = continue_start_y
            mark(anchor, breaks)

        # image hard
        if img_h > 0 and cursor + img_h > hard:
            cursor = continue_start_y
            mark(anchor, breaks)
        cursor += img_h

        # text hard
        if cursor + text_h > hard:
            cursor = continue_start_y
            mark(anchor, breaks)
        cursor += text_h

        # card hard
        if cursor + card_h > hard:
            cursor = continue_start_y
            mark(anchor, breaks)
        cursor += card_h

    return breaks


def _clamp_break(aligned, first, n, allow_self):
    """防御：分页点下标必须落在合法区间，防止重复断点/空页/越界。

    2026-08-06：图片收尾对齐（_align_break_to_image）可能返回
    - 越界下标（候选 B 的 next_img+1 可能 == n）
    - 回退下标（候选 A 的 prev_img+1 可能 < 当前页起始 first，
      出现于输入缓存带旧分页标记、或极端序列时）
    正式流程（recalculate）已先清除旧分页标记，此兜底保证任何
    输入都不产生重复断点与空页。
    allow_self=True：单元素超页独占场景，断点落在该元素自身合法。
    """
    if aligned >= n:
        aligned = n - 1
    if allow_self:
        if aligned < first:
            aligned = first
    else:
        if aligned <= first:
            aligned = first + 1
    return aligned


def _calculate_mode_d_breaks(elements):
    """templateD 分页点：连续图片段末尾之后开新页。

    2026-08-09 用户确认：移除"组"概念，分页只由分页标记决定——
    - 自动分页点：文本且前驱是图片（每段连续图片——含单张——的末尾之后，
      意味着后面是文本）→ 该文本为新页起点
    - 手动分页：元素已带 page_break_before → 保留为分页点
    - 文件开头的图片归第一页（不再丢弃"无组图片"）
    与前端编辑器、JSX buildTemplateDPages 规则一致。
    """
    breaks = []
    for i, el in enumerate(elements):
        if not isinstance(el, dict):
            continue
        if el.get("type") != "text":
            continue
        prev_is_image = (
            i > 0
            and isinstance(elements[i - 1], dict)
            and elements[i - 1].get("type") == "image"
        )
        if el.get("page_break_before") or prev_is_image:
            try:
                breaks.append(int(el["index"]))
            except (TypeError, ValueError, KeyError):
                continue
    return breaks


def calculate_page_breaks(elements, style_profile, layout_mode="templateA", chars_per_line=None):
    """计算自动分页点（均匀分页策略）。

    页数 = ceil(总内容高度 / hard)，每页目标高度 = 剩余内容 / 剩余页数，
    使各页长度尽量均匀（2026-08-06 用户要求：几页之间长度均匀，避免
    最后一页内容过少）。分页点仍做图片收尾对齐。

    参数：
        elements: 缓存元素列表（dict，含 index/type/content/src/page_break_before）
        style_profile: 模板样式记录（dict）
        layout_mode: templateA/B/C/D
        chars_per_line: 可选，模板级每行字数 {"1":Z1,"2":Z2,"3":Z3}
                        （2026-08-16，设计文档 §4.1；多格行按 Z(N) 估高）
    返回：
        list[int]：需要分页的元素 index（1-based，写入 page_break_before）
    """
    if layout_mode in NO_BREAK_MODES:
        return []
    if layout_mode == "templateB":
        return _calculate_mode_b_breaks(elements, style_profile, chars_per_line)
    if layout_mode == "templateD":
        return _calculate_mode_d_breaks(elements)

    lp = style_profile.get("layout_params") or {}
    start_y = _to_float(lp.get("start_y"), 0)
    gap_y = _to_float(lp.get("gap_y"), 48)
    continue_start_y = _to_float(lp.get("continue_start_y"), start_y)
    soft = lp.get("content_bottom_soft")
    hard = lp.get("content_bottom_hard")
    if soft is None or hard is None:
        return []
    soft = _to_float(soft, 0)
    hard = _to_float(hard, 0)
    if hard < soft:
        hard = soft

    frame_width = _to_float(lp.get("body_text_width"), 0)
    image_height = _to_float(lp.get("body_image_height"), 0)
    text_style = _text_style_for(style_profile)
    heights = _element_heights(elements, text_style, frame_width, image_height, gap_y)
    n = len(elements)
    if n == 0:
        return []

    acc = []
    running = 0.0
    for h in heights:
        running += h
        acc.append(running)
    total = acc[-1]
    if total <= 0:
        return []

    # 第一页从 start_y 开始，比其他页多出 (start_y - continue_start_y) 的空间
    extra = start_y - continue_start_y
    # 总容量 = k*hard - extra（第一页容量 hard - extra，其余页 hard）
    if hard > 0:
        k = max(1, math.ceil((total + extra) / hard))
    else:
        k = 1

    breaks = []
    placed = 0.0      # 已分配到断点前的元素累计高度
    first = 0         # 当前页第一个元素下标
    manual_count = sum(1 for i in range(1, n) if elements[i].get("page_break_before"))
    k = max(k, manual_count + 1)

    while first < n:
        # 手动分页点：硬断点
        if first > 0 and elements[first].get("page_break_before"):
            idx = int(elements[first]["index"])
            # 防重复：自动断点对齐后若已落在同一元素，跳过冗余手动断点
            if not breaks or breaks[-1] != idx:
                breaks.append(idx)
            placed = acc[first - 1] if first > 0 else 0.0
            first += 1
            continue

        pages_left = k - len(breaks)
        if pages_left <= 1:
            break  # 最后一页，剩余内容全部放下

        # 页面容量：第一页从 start_y 起，续页从 continue_start_y 起
        capacity = hard - (start_y if not breaks else continue_start_y)
        # 本页目标 = 剩余内容 / 剩余页数（动态均匀），且不超过容量
        page_target = min((total - placed) / pages_left, capacity)

        if heights[first] > page_target:
            # 单元素超本页目标（通常也超容量）：该元素独占断点
            aligned = _align_break_to_image(elements, heights, first, 0.0, placed, hard, capacity)
            aligned = _clamp_break(aligned, first, n, allow_self=True)
            breaks.append(int(elements[aligned]["index"]))
            placed = acc[aligned - 1] if aligned > 0 else 0.0
            first = aligned
            continue

        i = first
        local = 0.0
        while i < n and local + heights[i] <= page_target:
            if i > first and elements[i].get("page_break_before"):
                break  # 手动分页点：强制在此断页
            local += heights[i]
            i += 1
        if i >= n:
            break

        manual_break = i > first and elements[i].get("page_break_before")
        if manual_break:
            aligned = i  # 手动分页点不可移动
        else:
            prev_h = local - (heights[i - 1] if i > first else 0.0)
            aligned = _align_break_to_image(elements, heights, i, prev_h, placed, hard, capacity)
            aligned = _clamp_break(aligned, first, n, allow_self=False)
        breaks.append(int(elements[aligned]["index"]))
        placed = acc[aligned - 1] if aligned > 0 else 0.0
        first = aligned

    return breaks


def apply_page_breaks_to_elements(elements, break_indexes):
    """把计算出的自动分页点写回元素（page_break_before=true）。

    只添加、不删除：元素上已有的 page_break_before（手动分页）一律保留，
    避免误删用户手动设置的分页。
    """
    break_set = set()
    for value in break_indexes or []:
        try:
            break_set.add(int(value))
        except (TypeError, ValueError):
            continue
    changed = False
    for el in elements:
        if not isinstance(el, dict):
            continue
        index = el.get("index")
        try:
            index = int(index)
        except (TypeError, ValueError):
            continue
        if index in break_set and not el.get("page_break_before"):
            el["page_break_before"] = True
            changed = True
    return changed
