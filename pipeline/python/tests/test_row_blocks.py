"""一行多文本块（统一行模型）镜像测试。

设计文档：private/docs/features/一行多文本块设计方案.md §9。
覆盖：
- normalize_text_cols：解析产出/旧缓存归一化（无 cols → 1 格；1 格同步 content；多格保留）
- estimate_text_height 按每行字数 Z 估高（行数 = ceil(总宽 / (Z×字号))）
- _mode_b_units 行高度 = 各格按列宽/Z(N) 估高取最大值
- calculate_page_breaks(templateB) 含多格行的分页点计算
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from docx_list_to_json import normalize_text_cols  # noqa: E402
from page_break_calc import (  # noqa: E402
    _mode_b_units,
    calculate_page_breaks,
    estimate_text_height,
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

# 7_周边正文 36pt 档（用户确认）：1分 26 / 2分 13 / 3分 8
Z36 = {"1": 26, "2": 13, "3": 8}


def text_el(index, content="", **extra):
    item = {"index": index, "type": "text", "content": content}
    item.update(extra)
    return item


class TestNormalizeTextCols:
    def test_legacy_text_gets_one_col(self):
        els = [{"index": 1, "type": "text", "content": "旧缓存文本"}]
        normalize_text_cols(els)
        assert els[0]["cols"] == [{"content": "旧缓存文本"}]
        assert els[0]["content"] == "旧缓存文本"

    def test_single_col_syncs_content(self):
        els = [{"index": 1, "type": "text", "cols": [{"content": "新格式"}]}]
        normalize_text_cols(els)
        assert els[0]["content"] == "新格式"

    def test_multi_col_kept_untouched(self):
        els = [{"index": 1, "type": "text", "cols": [{"content": "a"}, {"content": "b"}]}]
        normalize_text_cols(els)
        assert len(els[0]["cols"]) == 2
        assert "content" not in els[0] or els[0].get("content") in (None, "")

    def test_image_untouched(self):
        els = [{"index": 1, "type": "image", "src": "/x.jpg"}]
        normalize_text_cols(els)
        assert "cols" not in els[0]


class TestEstimateTextHeightByChars:
    """按每行字数 Z 估高：行数 = ceil(总宽 / (Z × 字号))。"""

    def test_z_equals_width_based(self):
        # 12pt、框宽 936：26 个全角字宽 = 312pt；Z=26 → ceil(312/312)=1 行
        # 与按框宽算法一致
        content = "字" * 26
        by_width = estimate_text_height(content, {"point_size": 12, "leading": 19.2}, 312)
        by_z = estimate_text_height(content, {"point_size": 12, "leading": 19.2}, 312, 26)
        assert by_z == by_width

    def test_z_smaller_means_more_lines(self):
        # 26 个全角字，Z=13 → 2 行；Z=8 → ceil(26/8)=4 行（用户确认 3 分=8）
        style = {"point_size": 12, "leading": 19.2, "space_before": 0, "space_after": 0,
                 "inset_spacing": [0, 0, 0, 0]}
        content = "字" * 26
        h2 = estimate_text_height(content, style, 936, 13)
        h8 = estimate_text_height(content, style, 936, 8)
        lines2 = (h2 - 0.2 * 12) / 19.2
        lines8 = (h8 - 0.2 * 12) / 19.2
        assert abs(lines2 - 2.0) < 1e-6
        assert abs(lines8 - 4.0) < 1e-6

    def test_empty_content_zero(self):
        assert estimate_text_height("", {"point_size": 12}, 936, 8) == 0.0


class TestModeBUnitsWithRows:
    def test_row_height_is_max_of_columns(self):
        # 2 格行：格 A 13 字（Z2=13 → 1 行），格 B 26 字（Z2=13 → 2 行）→ 行高 = 2 行高
        elements = [
            text_el(1, "字" * 26, cols=[{"content": "字" * 13}, {"content": "字" * 26}]),
        ]
        units = _mode_b_units(elements, PROFILE, Z36)
        assert len(units) == 1
        _, img_h, text_h, card_h, _ = units[0]
        assert img_h == 0.0
        # 2 行高度 = 基线 0.2*12 + 2*19.2
        assert abs(text_h - (0.2 * 12 + 2 * 19.2)) < 1e-6

    def test_single_col_uses_z1(self):
        elements = [text_el(1, "字" * 26)]
        units = _mode_b_units(elements, PROFILE, Z36)
        _, _, text_h, _, _ = units[0]
        # Z1=26 → 1 行
        assert abs(text_h - (0.2 * 12 + 1 * 19.2)) < 1e-6

    def test_no_chars_config_falls_back_to_width(self):
        elements = [text_el(1, "字" * 26, cols=[{"content": "字" * 13}, {"content": "字" * 26}])]
        units = _mode_b_units(elements, PROFILE, None)
        _, _, text_h, _, _ = units[0]
        # 无 Z：按列宽 468 估高，13 字=156pt/468 → 1 行，26 字=312/468 → 1 行 → 1 行高
        assert abs(text_h - (0.2 * 12 + 1 * 19.2)) < 1e-6


class TestPageBreaksWithRows:
    def test_mode_b_with_row_element(self):
        # 行作为单元素参与分页，不报错且产出合法分页点
        elements = [
            text_el(1, "字" * 26),
            text_el(2, "字" * 13, cols=[{"content": "字" * 6}, {"content": "字" * 7}]),
            text_el(3, "字" * 26),
        ]
        breaks = calculate_page_breaks(elements, PROFILE, "templateB", Z36)
        assert isinstance(breaks, list)
        for b in breaks:
            assert 1 <= b <= 3

    def test_mode_d_with_row_ignored_as_text(self):
        # templateD：行 type 仍是 text，图片段末尾的 row 应获得分页点
        elements = [
            {"index": 1, "type": "image", "src": "/x/1.jpg"},
            text_el(2, "", cols=[{"content": "a"}, {"content": "b"}]),
            {"index": 3, "type": "image", "src": "/x/2.jpg"},
            text_el(4, "正文"),
        ]
        breaks = calculate_page_breaks(elements, PROFILE, "templateD")
        assert 2 in breaks
        assert 4 in breaks
