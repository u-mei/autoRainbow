"""分页计算器回归测试。

对齐 JSX soft/hard 换页语义（core_layout_runner.jsx）：
- cursor > soft → 元素前换页
- 文本底部 > hard 或 图片放置前 cursor+高 > hard → 换页
- 手动分页（page_break_before）保留并重置 cursor
- templateC/D 不产生自动分页点

文本高度估算用手算数值验证（12pt / leading 19.2 / 框宽 936）：
100 个汉字宽 = 100×12 = 1200pt → ceil(1200/936) = 2 行
高度 = 基线修正 0.2×12 + 2×19.2 = 2.4 + 38.4 = 40.8
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from page_break_calc import (  # noqa: E402
    _clamp_break,
    calculate_page_breaks,
    apply_page_breaks_to_elements,
    estimate_text_height,
    estimate_text_width,
)

PROFILE = {
    "layout_params": {
        "start_y": 368.0,
        "gap_y": 48.0,
        "continue_start_y": 12.0,
        "content_bottom_soft": 3500.0,
        "content_bottom_hard": 6000.0,
        "body_text_width": 936.0,
        "body_image_height": 515.7,
    },
    "objects": {
        "proto_text": [{
            "bounds": {"top": 368, "left": 50, "bottom": 420, "right": 986},
            "text": {"point_size": 12, "leading": 19.2, "space_before": 0, "space_after": 0},
            "text_frame_prefs": {},
        }],
    },
}


def el(index, etype="text", content="", **extra):
    item = {"index": index, "type": etype}
    if etype == "text":
        item["content"] = content
    else:
        item["src"] = "/x/img.png"
    item.update(extra)
    return item


class TestEstimateTextWidth:
    def test_cjk_char_width(self):
        assert estimate_text_width("汉字", 12) == pytest.approx(24.0)

    def test_latin_char_width(self):
        assert estimate_text_width("abc", 12) == pytest.approx(12 * 0.55 * 3)

    def test_mixed(self):
        assert estimate_text_width("A汉B", 12) == pytest.approx(12 * 0.55 * 2 + 12)


class TestEstimateTextHeight:
    def test_hand_computed_cjk(self):
        # 100 汉字 / 12pt / leading 19.2 / 框宽 936 → 2 行 → 40.8
        content = "汉" * 100
        h = estimate_text_height(content, {"point_size": 12, "leading": 19.2}, 936)
        assert h == pytest.approx(40.8)

    def test_empty_content(self):
        assert estimate_text_height("", {"point_size": 12}, 936) == 0

    def test_inset_and_spacing_included(self):
        # 用户确认：外圈空隙与段前段后距都要计入
        style = {
            "point_size": 12,
            "leading": 19.2,
            "space_before": 10,
            "space_after": 20,
            "inset_spacing": [5, 5, 7, 5],  # [top, left, bottom, right]
        }
        h = estimate_text_height("汉", style, 936)
        # inset 5+7 + space 10+20 + 基线 2.4 + 1 行 19.2 = 63.6
        assert h == pytest.approx(63.6)

    def test_minimum_height_applied(self):
        style = {
            "point_size": 12,
            "leading": 19.2,
            "text_frame_prefs": {"minimum_height_for_auto_sizing": 100},
        }
        h = estimate_text_height("汉", style, 936)
        assert h == pytest.approx(2.4 + 100)

    def test_leading_auto_fallback(self):
        style = {"point_size": 12, "leading": "auto"}
        h = estimate_text_height("汉", style, 936)
        assert h == pytest.approx(2.4 + 12 * 1.2)


class TestCalculatePageBreaks:
    def test_empty_elements(self):
        assert calculate_page_breaks([], PROFILE, "templateA") == []

    def test_templateC_no_breaks_single_text_no_image(self):
        # templateC 永不产生分页点；templateD 单文本无图片 → 无图片段末尾，也无分页点
        elements = [el(1, content="超长" * 5000)]
        assert calculate_page_breaks(elements, PROFILE, "templateC") == []
        assert calculate_page_breaks(elements, PROFILE, "templateD") == []

    def test_missing_layout_params_returns_empty(self):
        assert calculate_page_breaks([el(1)], {}, "templateA") == []
        assert calculate_page_breaks([el(1)], {"layout_params": {}}, "templateA") == []

    def test_short_content_no_break(self):
        elements = [el(1, content="短"), el(2, content="内容")]
        assert calculate_page_breaks(elements, PROFILE, "templateA") == []

    def test_long_text_triggers_hard_break(self):
        # hard=6000，start_y=368。每行约 78 汉字（936/12），行高 19.2，
        # 需要约 293 行 ≈ 23000 汉字才能顶到 hard。用 30000 汉字触发。
        long_text = "汉" * 30000
        elements = [el(1, content=long_text)]
        breaks = calculate_page_breaks(elements, PROFILE, "templateA")
        assert 1 in breaks, "长文本应触发分页"

    def test_two_long_paragraphs_second_breaks(self):
        # 两段各占一半容量：第一段放下，第二段触发分页
        long_text = "汉" * 15000  # 约 148 行 ≈ 2840pt，两段共 5680pt < 5632 容量边缘
        elements = [el(1, content=long_text), el(2, content=long_text)]
        breaks = calculate_page_breaks(elements, PROFILE, "templateA")
        assert 2 in breaks, "第二段累计放不下应触发分页"

    def test_image_bottom_triggers_break(self):
        # start_y=368, 图片高 515.7 + gap 48；多张图累计到 hard=6000
        elements = [el(i, "image") for i in range(1, 20)]
        breaks = calculate_page_breaks(elements, PROFILE, "templateA")
        assert breaks, "图片累计应触发分页"
        assert breaks[0] > 1, "前几张图应在第一页放下"

    def test_soft_threshold_cumulative(self):
        # soft=3500: 大量短文本累计越过 soft → 软分页
        elements = [el(i, content="汉" * 30) for i in range(1, 100)]
        breaks = calculate_page_breaks(elements, PROFILE, "templateA")
        assert breaks, "累计越过 soft 应触发软分页"

    def test_manual_break_resets_cursor(self):
        # 手动分页点：硬断点保留在结果中，不受均匀调整影响
        elements = [
            el(1, content="汉" * 100),
            el(2, content="汉" * 100, page_break_before=True),
            el(3, content="汉" * 100),
        ]
        breaks = calculate_page_breaks(elements, PROFILE, "templateA")
        assert 2 in breaks, "手动分页点必须作为硬断点保留"

    def test_breaks_respect_manual_after_reset(self):
        elements = [el(1, content="汉" * 100), el(2, content="汉" * 100)]
        breaks = calculate_page_breaks(elements, PROFILE, "templateA")
        # 验证能算出分页点（用于回归"手动分页优先"语义不被破坏）
        assert isinstance(breaks, list)


class TestImageAlignBreaks:
    """均匀分页 + 图片收尾对齐。

    均匀策略（2026-08-06）：页数 = ceil(总内容/hard)，每页目标 = 剩余/剩余页数，
    分页点落在目标处并做图片收尾对齐（±3 元素窗口）。
    文本高度基准：12pt/leading 19.2/框宽 936，"汉"*3000 ≈ 799pt（含 gap），
    图片 515.7+48 ≈ 564pt。
    """

    # soft 仅作参数存在（JSX 已移除 soft 分页，前端均匀策略不使用 soft）
    ALIGN_PROFILE = {
        "layout_params": {
            "start_y": 368.0,
            "gap_y": 48.0,
            "continue_start_y": 12.0,
            "content_bottom_soft": 5999.0,
            "content_bottom_hard": 6000.0,
            "body_text_width": 936.0,
            "body_image_height": 515.7,
        },
        "objects": {
            "proto_text": [{
                "bounds": {"top": 368, "left": 50, "bottom": 420, "right": 986},
                "text": {"point_size": 12, "leading": 19.2},
                "text_frame_prefs": {},
            }],
        },
    }

    LONG = "汉" * 3000   # ≈799pt/段
    SHORT = "汉" * 300   # ≈127pt/段

    def _seq(self, kinds):
        """kinds: 元素类型序列（"t"=长文本 "s"=短文本 "i"=图片），返回元素列表。"""
        elements = []
        for k in kinds:
            if k == "i":
                elements.append(el(len(elements) + 1, "image"))
            else:
                elements.append(el(len(elements) + 1, "text", content=self.LONG if k == "t" else self.SHORT))
        return elements

    def _page_heights(self, elements, breaks):
        """按断点计算各页内容高度，返回列表。"""
        hs = []
        start = 0
        for b in breaks + [None]:
            if b is None:
                hs.append(sum(self._heights(elements[start:])))
            else:
                idx = b - 1
                hs.append(sum(self._heights(elements[start:idx])))
                start = idx
        return hs

    def _heights(self, elements):
        hs = []
        for e in elements:
            if e["type"] == "image":
                hs.append(515.7 + 48)
            else:
                hs.append(estimate_text_height(e.get("content") or "", {"point_size": 12, "leading": 19.2}, 936.0) + 48)
        return hs

    def test_pages_balanced_even_split(self):
        # [8t] 总高 ≈6392 → 2 页,均匀断点于第 4 个文本后(index 5)
        elements = self._seq(["t"] * 8)
        breaks = calculate_page_breaks(elements, self.ALIGN_PROFILE, "templateA")
        assert breaks == [5], f"均匀 2 页断点应在 index 5，实际 {breaks}"
        pages = self._page_heights(elements, breaks)
        assert abs(pages[0] - pages[1]) <= 2 * 799 + 1, f"两页应接近均匀: {pages}"

    def test_three_pages_balanced(self):
        # [12t] 总高 ≈9588 → 2 页?ceil((9588+356)/6000)=2 → 每页 4794(6t/6t)
        elements = self._seq(["t"] * 12)
        breaks = calculate_page_breaks(elements, self.ALIGN_PROFILE, "templateA")
        assert breaks == [7], f"12t 应均匀 2 页(6/6)，实际 {breaks}"
        pages = self._page_heights(elements, breaks)
        assert len(pages) == 2

    def test_three_pages_balanced_and_even(self):
        # [18t] 总高 ≈14382 → 3 页,每页 6 个文本(4794pt),完全均匀
        elements = self._seq(["t"] * 18)
        breaks = calculate_page_breaks(elements, self.ALIGN_PROFILE, "templateA")
        assert breaks == [7, 13], f"18t 应均匀 3 页(6/6/6)，实际 {breaks}"
        pages = self._page_heights(elements, breaks)
        assert len(pages) == 3
        avg = sum(pages) / len(pages)
        for h in pages:
            assert h >= avg * 0.7, f"页面高度应接近均匀: {pages}"

    def test_break_element_image_joins_previous_page(self):
        """断点元素本身是图片时,并入前页做页尾（2026-08-06 真实问题：
        第二页开头出现图片）。[4t,i,4t] 断点落在图(index5)前 → 图并入前页,分页点后移。"""
        elements = self._seq(["t", "t", "t", "t", "i", "t", "t", "t", "t"])
        breaks = calculate_page_breaks(elements, self.ALIGN_PROFILE, "templateA")
        assert breaks == [6], f"断点元素是图片时应并入前页收尾(index 6)，实际 {breaks}"

    def test_image_align_keeps_existing(self):
        # [5t, i, t, t] 断点已在图片 6 后(index 7)则保持
        elements = self._seq(["t", "t", "t", "t", "t", "i", "t", "t"])
        breaks = calculate_page_breaks(elements, self.ALIGN_PROFILE, "templateA")
        assert breaks == [7], f"断点已在图片后应保持(index 7)，实际 {breaks}"

    def test_consecutive_images_break_after_last(self):
        # [4t, i, i, t, t] 均匀断点于 index4(t); 向后对齐到第 2 张图(index6)后
        # → 分页点 index6(两张图在页尾)
        elements = self._seq(["t", "t", "t", "t", "i", "i", "t", "t"])
        breaks = calculate_page_breaks(elements, self.ALIGN_PROFILE, "templateA")
        assert breaks == [6], f"连续图片后分页点应为 6(两张图收尾)，实际 {breaks}"

    def test_oversized_element_alone(self):
        # 单元素超一页(30000 字 ≈7394pt > hard 6000):独占断点,后续不级联
        elements = [el(1, "text", content="汉" * 30000), el(2, "text", content="短")]
        breaks = calculate_page_breaks(elements, self.ALIGN_PROFILE, "templateA")
        assert breaks == [1], f"超高元素应独占第一断点，实际 {breaks}"

    def test_no_break_when_single_page_fits(self):
        # 内容一页放得下 → 无分页
        elements = self._seq(["t", "t", "t", "s"])
        breaks = calculate_page_breaks(elements, self.ALIGN_PROFILE, "templateA")
        assert breaks == []

    def test_manual_break_is_hard_boundary(self):
        # 手动分页点保留为硬断点,不参与均匀调整
        elements = [
            el(1, "text", content="汉" * 3000),
            el(2, "text", content="汉" * 3000, page_break_before=True),
            el(3, "text", content="汉" * 3000),
            el(4, "text", content="汉" * 3000),
        ]
        breaks = calculate_page_breaks(elements, self.ALIGN_PROFILE, "templateA")
        assert 2 in breaks, "手动分页点必须保留"


class TestModeBUnits:
    """templateB 卡片模型（2026-08-06）。

    用户确认：分页逻辑在前端计算，算法迁移 JSX 原 soft/hard 判定
    （core_templateB_logic.jsx 改造前版本）：逐 unit 模拟放置顺序，
    手动/soft/image hard/text hard/card hard 五处换页判定，
    分页点写在 unit 锚点元素上。
    unit = 图(517.68) + 文本(40pt/AUTO 48/宽936:23字/行,行高48,基线8) + 卡片(144.08)，
    gapY=0。
    """

    MODE_B_PROFILE = {
        "layout_params": {
            "start_y": 267.4,
            "gap_y": 0.0,
            "continue_start_y": 12.0,
            "content_bottom_soft": 3000.0,
            "content_bottom_hard": 5000.0,
            "body_text_width": 936.0,
            "body_image_height": 517.68,
        },
        "objects": {
            "proto_text": [{
                "bounds": {"top": 785, "left": 72, "bottom": 917, "right": 1008},
                "text": {"point_size": 40, "leading": "AUTO", "space_before": 0, "space_after": 0},
                "text_frame_prefs": {},
            }],
            "proto_card": [{
                "kind": "group",
                "bounds": {"top": 917.68, "left": 72, "bottom": 1061.76, "right": 1008},
            }],
        },
    }

    def _seq(self, kinds):
        """kinds: "i"=图片 "t"=文本(23字≈56pt) "L"=文本(115字≈248pt) "B"=文本(2415字≈5056pt 超页)"""
        elements = []
        for k in kinds:
            if k == "i":
                elements.append(el(len(elements) + 1, "image"))
            else:
                n = 23 if k == "t" else (115 if k == "L" else 2415)
                elements.append(el(len(elements) + 1, "text", content=("汉" * n)))
        return elements

    def test_units_pair_image_text(self):
        from page_break_calc import _mode_b_units

        elements = self._seq(["i", "t", "i", "t", "t"])
        units = _mode_b_units(elements, self.MODE_B_PROFILE)
        assert [u[0] for u in units] == [1, 3, 5], "unit 锚点=图片 index；无图文本=自身 index"
        assert units[0][1:4] == pytest.approx([517.68, 56, 144.08]), "图/文/卡分段高度"

    def test_units_consecutive_images_consume_first(self):
        from page_break_calc import _mode_b_units

        elements = self._seq(["i", "i", "t"])
        units = _mode_b_units(elements, self.MODE_B_PROFILE)
        assert [u[0] for u in units] == [1], "连续图只取第一个配对，多余图片随 unit 丢弃"

    def test_soft_break_legacy(self):
        # 15 个无图 unit(56+144.08=200.08/unit)：cursor 从 267.4 递增，
        # u15 放置前 cursor=3068.8>soft 3000 → soft 换页
        elements = self._seq(["t"] * 15)
        breaks = calculate_page_breaks(elements, self.MODE_B_PROFILE, "templateB")
        assert breaks == [15], f"soft 换页断点在 u15 锚点，实际 {breaks}"

    def test_text_hard_break_legacy(self):
        # u2 文本 5056pt：u1 后 cursor=467.5，+5056>5000 → text hard 换页；
        # 换页后 cursor=12，再放卡片仍触发 card hard（同 unit，断点去重）
        elements = self._seq(["t", "B", "t"])
        breaks = calculate_page_breaks(elements, self.MODE_B_PROFILE, "templateB")
        assert breaks == [2], f"text hard 断点在 u2 锚点，实际 {breaks}"

    def test_manual_break_preserved(self):
        elements = self._seq(["i", "L", "i", "L", "i", "L", "i", "L"])
        elements[3]["page_break_before"] = True  # unit2 文本上的标记 → unit2 分页
        breaks = calculate_page_breaks(elements, self.MODE_B_PROFILE, "templateB")
        assert 3 in breaks, "手动分页点必须保留（断点落在 unit 首元素）"
        assert len(breaks) == len(set(breaks)), "不得重复"

    def test_first_unit_manual_mark_ignored(self):
        # 对齐 JSX：第一个 unit 的分页标记不换页（i>0 才生效）
        elements = self._seq(["i", "L", "i", "L"])
        elements[1]["page_break_before"] = True
        breaks = calculate_page_breaks(elements, self.MODE_B_PROFILE, "templateB")
        assert breaks == []

    def test_single_page_no_break(self):
        elements = self._seq(["i", "t"])
        breaks = calculate_page_breaks(elements, self.MODE_B_PROFILE, "templateB")
        assert breaks == []

    def test_no_card_proto_ok(self):
        profile = dict(self.MODE_B_PROFILE)
        profile["objects"] = {"proto_text": self.MODE_B_PROFILE["objects"]["proto_text"]}
        elements = self._seq(["i", "t"])
        breaks = calculate_page_breaks(elements, profile, "templateB")
        assert breaks == []


class TestTemplateDBreaks:
    """templateD 分页点：连续图片段末尾之后开新页。

    2026-08-09 用户确认：移除"组"概念，分页只由分页标记决定——
    - 自动分页点：文本且前驱是图片（每段连续图片——含单张——的末尾之后）
    - 手动分页：元素已带 page_break_before → 保留
    - 文件开头的图片归第一页（不丢弃）
    与前端编辑器、JSX buildTemplateDPages 规则一致。
    """

    def _seq(self, pattern, start_index=1):
        """pattern: 字符串序列 't'=文本 'i'=图;返回带 index 的元素列表。"""
        out = []
        idx = start_index
        for ch in pattern:
            if ch == "t":
                out.append({"index": idx, "type": "text", "content": "文本"})
            else:
                out.append({"index": idx, "type": "image", "src": "x.jpg"})
            idx += 1
        return out

    def test_basic_image_run_boundaries(self):
        # 18 文本 + 10 图(页1) | 12 文本 + 1 图(页2) | 11 文本 + 2 图(页3)
        elements = (
            self._seq("t" * 18 + "i" * 10)
            + self._seq("t" * 12 + "i", start_index=29)
            + self._seq("t" * 11 + "i" * 2, start_index=42)
        )
        breaks = calculate_page_breaks(elements, {}, "templateD")
        assert breaks == [29, 42], f"连续图片段末尾后的文本应为分页点，实际 {breaks}"

    def test_single_page_no_breaks(self):
        elements = self._seq("t" * 5 + "i" * 4)
        breaks = calculate_page_breaks(elements, {}, "templateD")
        assert breaks == []

    def test_manual_break_preserved(self):
        elements = self._seq("t" * 3 + "i")
        elements[2]["page_break_before"] = True  # 元素3 手动分页（文本前驱非图）
        elements += self._seq("t" + "i", start_index=5)  # 元素5 前驱是图 → 自动
        breaks = calculate_page_breaks(elements, {}, "templateD")
        assert breaks == [3, 5], f"手动分页保留 + 自动分页并存，实际 {breaks}"

    def test_image_at_start_belongs_first_page(self):
        # 开头图片归第一页（不丢弃）；其后的文本（前驱是图）为页 2 起点
        elements = self._seq("i") + self._seq("t" * 2 + "i" * 2, start_index=2) + self._seq("t" + "i", start_index=5)
        breaks = calculate_page_breaks(elements, {}, "templateD")
        assert breaks == [2, 5], f"开头图不产生分页，后续图片段末尾文本分页，实际 {breaks}"

    def test_empty_elements(self):
        assert calculate_page_breaks([], {}, "templateD") == []

    def test_apply_writes_breaks_to_elements(self):
        elements = (
            self._seq("t" * 3 + "i")  # 页1: 1-4
            + self._seq("t" + "i", start_index=5)  # 页2: 5-6
            + self._seq("t" + "i", start_index=7)  # 页3: 7-8
        )
        breaks = calculate_page_breaks(elements, {}, "templateD")
        assert breaks == [5, 7], f"图片段末尾文本为分页点，实际 {breaks}"
        changed = apply_page_breaks_to_elements(elements, breaks)
        assert changed
        assert elements[4]["page_break_before"] is True
        assert elements[6]["page_break_before"] is True


class TestRecalculateForCache:
    def _make_cache(self, tmp_path, elements):
        cache_root = tmp_path / "outputs" / "work" / "caches"
        cache_root.mkdir(parents=True)
        cache_file = cache_root / "sec_doc_abc12.json"
        cache_file.write_text(json.dumps(elements, ensure_ascii=False), encoding="utf-8")
        return cache_file

    def test_skips_without_style_profile(self, tmp_path, monkeypatch):
        import json

        from agent import routes

        cache_file = self._make_cache(tmp_path, [el(1, content="a")])
        cfg = {"project_root": str(tmp_path)}
        monkeypatch.setattr(routes, "read_config", lambda: {"templates": {}})
        result = routes.recalculate_page_breaks_for_cache(cfg, str(cache_file), "1_本周头条")
        assert result["breaks"] == []
        assert "尚未提取样式记录" in result["note"]
        data = json.loads(cache_file.read_text(encoding="utf-8"))
        assert "page_break_before" not in data[0], "无 style_profile 时不应改动缓存"

    def test_writes_breaks_to_cache(self, tmp_path, monkeypatch):
        import json

        from agent import routes

        # 两段 15000 字（各约 3748pt）总高 7622 → 2 页均匀,断点于第二段(index 2)
        cache_file = self._make_cache(tmp_path, [
            el(1, content="汉" * 15000),
            el(2, content="汉" * 15000),
            el(3, content="短"),
        ])
        cfg = {"project_root": str(tmp_path)}
        cfg_with_profile = {"templates": {"1_本周头条": {"layout_mode": "templateA", "style_profile": PROFILE}}}
        monkeypatch.setattr(routes, "read_config", lambda: cfg_with_profile)
        result = routes.recalculate_page_breaks_for_cache(cfg, str(cache_file), "1_本周头条")
        assert result["breaks"] == [2], f"均匀 2 页断点应于第二段，实际 {result['breaks']}"
        data = json.loads(cache_file.read_text(encoding="utf-8"))
        assert data[0].get("page_break_before") is None
        assert data[1].get("page_break_before") is True
        assert data[2].get("page_break_before") is None

    def test_oversized_element_alone_no_cascade(self, tmp_path, monkeypatch):
        # 超高元素(30000 字 7394pt > hard 6000)独占第一页,剩余内容最后一页全部放下
        # （均匀策略下不再级联分页）
        import json

        from agent import routes

        cache_file = self._make_cache(tmp_path, [
            el(1, content="汉" * 30000),
            el(2, content="短"),
        ])
        cfg = {"project_root": str(tmp_path)}
        cfg_with_profile = {"templates": {"1_本周头条": {"layout_mode": "templateA", "style_profile": PROFILE}}}
        monkeypatch.setattr(routes, "read_config", lambda: cfg_with_profile)
        result = routes.recalculate_page_breaks_for_cache(cfg, str(cache_file), "1_本周头条")
        assert result["breaks"] == [1], f"超高元素独占断点，实际 {result['breaks']}"

    def test_recalculate_clears_old_breaks_first(self, tmp_path, monkeypatch):
        """重置语义：缓存已有旧分页点时，先清掉再按当前样式重算。"""
        import json

        from agent import routes

        cache_file = self._make_cache(tmp_path, [
            el(1, content="汉" * 15000, page_break_before=True),  # 旧分页点(会被清掉重算)
            el(2, content="汉" * 15000),
            el(3, content="短"),
        ])
        profile = dict(PROFILE)
        profile["layout_params"] = dict(PROFILE["layout_params"])
        profile["layout_params"]["content_bottom_soft"] = 5000.0
        cfg = {"project_root": str(tmp_path)}
        cfg_with_profile = {"templates": {"1_本周头条": {"layout_mode": "templateA", "style_profile": profile}}}
        monkeypatch.setattr(routes, "read_config", lambda: cfg_with_profile)
        result = routes.recalculate_page_breaks_for_cache(cfg, str(cache_file), "1_本周头条")
        assert result["breaks"] == [2], f"旧分页点应被清掉并重算为 [2]，实际 {result['breaks']}"
        data = json.loads(cache_file.read_text(encoding="utf-8"))
        assert data[0].get("page_break_before") is None, "旧分页点应被清除"
        assert data[1].get("page_break_before") is True

    def test_nonexistent_cache_returns_empty(self, tmp_path):
        from agent import routes

        result = routes.recalculate_page_breaks_for_cache({"project_root": str(tmp_path)}, str(tmp_path / "nope.json"), "1_本周头条")
        assert result["breaks"] == []
    def test_writes_and_preserves_manual(self):
        elements = [el(1, content="a"), el(2, content="b", page_break_before=True), el(3, content="c")]
        changed = apply_page_breaks_to_elements(elements, [3])
        assert changed is True
        assert elements[0].get("page_break_before") is None
        assert elements[1].get("page_break_before") is True, "手动分页必须保留"
        assert elements[2].get("page_break_before") is True

    def test_no_change_when_identical(self):
        elements = [el(1, content="a")]
        changed = apply_page_breaks_to_elements(elements, [])
        assert changed is False


class TestBreakClampDefense:
    """断点防回退/防越界兜底（2026-08-06 直播精选验证时发现）。

    图片收尾对齐可能返回越界（候选 B next_img+1 == n）或回退（候选 A
    的 prev_img+1 < 当前页起始）下标；正式流程先清旧标记，此兜底保证
    任意输入不产生重复断点与空页。
    """

    from page_break_calc import _clamp_break as clamp

    def test_normal_unchanged(self):
        assert _clamp_break(5, 2, 10, allow_self=False) == 5

    def test_overshoot_clamped_to_last(self):
        assert _clamp_break(10, 2, 10, allow_self=False) == 9

    def test_regression_allow_self_keeps_own(self):
        # 单元素超页独占：断点落在该元素自身合法，不得上移
        assert _clamp_break(2, 2, 10, allow_self=True) == 2

    def test_regression_allow_self_blocks_backtrack(self):
        assert _clamp_break(1, 2, 10, allow_self=True) == 2

    def test_no_allow_self_blocks_backtrack_to_first(self):
        # 普通断点回退到当前页起始 → 至少留一个元素在前页
        assert _clamp_break(2, 2, 10, allow_self=False) == 3

    def test_no_duplicate_breaks_with_stale_marks(self):
        """输入缓存带旧分页标记时（模拟重算未清场景），不得产生重复断点/空页。

        2026-08-06 真实复现：[9,12] 旧标记 + hard=6000 重算曾输出 [9,9]。"""
        elements = [
            el(1, "text", content="汉" * 3000),
            el(2, "text", content="汉" * 3000),
            el(3, "text", content="汉" * 3000),
            el(4, "image"),
            el(5, "text", content="汉" * 3000),
            el(6, "text", content="汉" * 3000),
            el(7, "text", content="汉" * 3000),
            el(8, "image"),
            el(9, "text", content="汉" * 3000, page_break_before=True),
            el(10, "text", content="汉" * 3000),
            el(11, "image"),
            el(12, "text", content="汉" * 3000, page_break_before=True),
            el(13, "image"),
            el(14, "text", content="汉" * 3000),
            el(15, "image"),
            el(16, "text", content="汉" * 3000),
            el(17, "image"),
        ]
        breaks = calculate_page_breaks(elements, TestImageAlignBreaks.ALIGN_PROFILE, "templateA")
        assert len(breaks) == len(set(breaks)), f"断点不得重复: {breaks}"
        assert breaks == sorted(breaks), f"断点必须递增: {breaks}"
        seg = [0] + [b - 1 for b in breaks] + [len(elements)]
        for a, b in zip(seg[:-1], seg[1:]):
            assert b > a, f"不得出现空页: 元素{a + 1}-{b}"
        for b in breaks:
            assert 1 <= b <= len(elements), f"断点越界: {b}"

    def test_break_on_last_element_no_crash(self):
        """断点候选落在最后一个元素（越界候选）时不得抛异常。"""
        elements = TestImageAlignBreaks()._seq(["t", "t", "t", "t", "t", "t", "t", "i"])
        breaks = calculate_page_breaks(elements, TestImageAlignBreaks.ALIGN_PROFILE, "templateA")
        for b in breaks:
            assert 1 <= b <= len(elements), f"断点越界: {b}"
