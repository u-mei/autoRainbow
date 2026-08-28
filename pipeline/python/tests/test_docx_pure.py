"""P0: docx_list_to_json.py 纯函数测试（无需 tempfile / fixture）"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from docx_list_to_json import (
    parse_bool,
    sanitize_filename_component,
    infer_section_name,
    is_word_temp_file,
    is_merchandise_doc,
    is_new_costume_doc,
    normalize_newline_before_marker,
    truncate_from_keyword_for_costume,
    apply_text_rules_for_doc,
    merge_merchandise_text_blocks,
    newline_after_block_label_colon,
)


class TestParseBool:
    def test_true_values(self):
        assert parse_bool("true") is True
        assert parse_bool("True") is True
        assert parse_bool("1") is True
        assert parse_bool("yes") is True
        assert parse_bool("on") is True
        assert parse_bool(True) is True

    def test_false_values(self):
        assert parse_bool("false") is False
        assert parse_bool("False") is False
        assert parse_bool("0") is False
        assert parse_bool("no") is False
        assert parse_bool("off") is False
        assert parse_bool(False) is False

    def test_default(self):
        assert parse_bool("invalid", default=True) is True
        assert parse_bool("invalid", default=False) is False

    def test_none(self):
        assert parse_bool(None, default=True) is True
        assert parse_bool(None, default=False) is False


class TestSanitizeFilenameComponent:
    def test_clean(self):
        assert sanitize_filename_component("normal") == "normal"

    def test_slash(self):
        assert sanitize_filename_component("a/b") == "a_b"

    def test_colon(self):
        assert sanitize_filename_component("a:b") == "a_b"

    def test_all_invalid(self):
        result = sanitize_filename_component('\\/:*?"<>|')
        assert all(c == "_" for c in result)
        assert len(result) == 9

    def test_whitespace(self):
        assert sanitize_filename_component("  name  ") == "name"

    def test_empty(self):
        result = sanitize_filename_component("")
        assert result == ""


class TestInferSectionName:
    def test_with_root(self):
        result = infer_section_name(
            "/inputs/1_本周头条/doc.docx",
            input_root_dir="/inputs",
        )
        assert result == "1_本周头条"

    def test_fallback_parent(self):
        result = infer_section_name(
            "/some/path/1_本周头条/doc.docx",
        )
        assert result == "1_本周头条"

    def test_no_subdir(self):
        result = infer_section_name(
            "/inputs/doc.docx",
            input_root_dir="/inputs",
        )
        assert result == "inputs"


class TestIsWordTempFile:
    def test_true(self):
        assert is_word_temp_file("~$document.docx") is True

    def test_false(self):
        assert is_word_temp_file("document.docx") is False


class TestIsMerchandiseDoc:
    def test_true(self):
        assert is_merchandise_doc("7_周边", "7_周边") is True
        assert is_merchandise_doc("7_周边", "周边") is True

    def test_false(self):
        assert is_merchandise_doc("1_本周头条", "1_本周头条") is False


class TestIsNewCostumeDoc:
    def test_true(self):
        assert is_new_costume_doc("6_新衣披露", "6_新衣披露") is True

    def test_false(self):
        assert is_new_costume_doc("1_本周头条", "1_本周头条") is False


class TestNormalizeNewlineBeforeMarker:
    def test_basic(self):
        result = normalize_newline_before_marker("文本■标记")
        assert result == "文本\n\n■标记"

    def test_already_normalized(self):
        result = normalize_newline_before_marker("文本\n\n■标记")
        assert result == "文本\n\n■标记"

    def test_at_start(self):
        result = normalize_newline_before_marker("■标记")
        assert result == "■标记"

    def test_no_marker(self):
        result = normalize_newline_before_marker("纯文本")
        assert result == "纯文本"


class TestTruncateFromKeywordForCostume:
    def test_hit(self):
        text, hit = truncate_from_keyword_for_costume("内容相关视频其他")
        assert hit is True
        assert text == "内容"

    def test_miss(self):
        text, hit = truncate_from_keyword_for_costume("内容无关键词")
        assert hit is False
        assert text == "内容无关键词"

    def test_empty(self):
        text, hit = truncate_from_keyword_for_costume("")
        assert hit is False
        assert text == ""


class TestApplyTextRulesForDoc:
    def test_merchandise(self):
        # 2026-08-16：周边文本不再在 apply_text_rules_for_doc 里加换行
        # （旧 normalize_newline_before_marker 对"■ 在段落开头"的文档无效，已移除）
        elements = [{"index": 1, "type": "text", "content": "文本■标记"}]
        result = apply_text_rules_for_doc(elements, "7_周边", "7_周边")
        assert result[0]["content"] == "文本■标记"

    def test_costume(self):
        elements = [{"index": 1, "type": "text", "content": "介绍相关视频链接"}]
        result = apply_text_rules_for_doc(elements, "6_新衣披露", "6_新衣披露")
        assert result[0]["content"] == "介绍"

    def test_normal(self):
        elements = [{"index": 1, "type": "text", "content": "普通文本"}]
        result = apply_text_rules_for_doc(elements, "1_本周头条", "1_本周头条")
        assert result[0]["content"] == "普通文本"


class TestNewlineAfterBlockLabelColon:
    def test_label_with_content_gets_newline(self):
        # ■开头 + 中文冒号 + 冒号后有文本 → 冒号后插换行
        text = "■贩售日期：7月29日 –"
        result = newline_after_block_label_colon(text)
        assert result == "■贩售日期：\n7月29日 –"

    def test_label_no_content_after_colon_unchanged(self):
        # 冒号后无文本（如 ■商品详情：）→ 不动
        text = "■商品详情："
        assert newline_after_block_label_colon(text) == text

    def test_no_block_marker_unchanged(self):
        text = "普通文本：内容"
        assert newline_after_block_label_colon(text) == text

    def test_block_no_colon_unchanged(self):
        text = "■没有冒号的标题"
        assert newline_after_block_label_colon(text) == text

    def test_multi_line(self):
        # 多行文本逐行处理
        text = "开头\n■贩售日期：7月29日 –\n内容\n■商品详情：\n更多"
        result = newline_after_block_label_colon(text)
        assert result == "开头\n■贩售日期：\n7月29日 –\n内容\n■商品详情：\n更多"

    def test_empty(self):
        assert newline_after_block_label_colon("") == ""


class TestMergeMerchandiseTextBlocks:
    def test_basic_grouping(self):
        # 全文第一个文本块单独，其后到图片前的文本合并（保留换行）
        elements = [
            {"index": 1, "type": "text", "content": "标题A"},
            {"index": 2, "type": "text", "content": "正文1"},
            {"index": 3, "type": "text", "content": "正文2"},
            {"index": 4, "type": "image", "src": "/x/1.png"},
            {"index": 5, "type": "text", "content": "标题B"},
            {"index": 6, "type": "text", "content": "正文3"},
        ]
        result = merge_merchandise_text_blocks(elements)
        # 结构: 标题A | 正文1\n正文2 | image | 标题B | 正文3
        assert [e["type"] for e in result] == ["text", "text", "image", "text", "text"]
        assert result[0]["content"] == "标题A"
        assert result[1]["content"] == "正文1\n正文2"
        assert result[3]["content"] == "标题B"
        assert result[4]["content"] == "正文3"
        # index 重新编号连续
        assert [e["index"] for e in result] == [1, 2, 3, 4, 5]

    def test_image_at_start(self):
        # 文档以图片开头时，第一个文本块是"连续图片末尾后的第一个"→ 单独
        elements = [
            {"index": 1, "type": "image", "src": "/x/1.png"},
            {"index": 2, "type": "text", "content": "标题A"},
            {"index": 3, "type": "text", "content": "正文1"},
            {"index": 4, "type": "text", "content": "正文2"},
        ]
        result = merge_merchandise_text_blocks(elements)
        assert [e["type"] for e in result] == ["image", "text", "text"]
        assert result[1]["content"] == "标题A"
        assert result[2]["content"] == "正文1\n正文2"

    def test_trailing_text_merged(self):
        # 文末没有图片时，剩余文本合并为一个块
        elements = [
            {"index": 1, "type": "text", "content": "标题A"},
            {"index": 2, "type": "text", "content": "正文1"},
            {"index": 3, "type": "text", "content": "正文2"},
        ]
        result = merge_merchandise_text_blocks(elements)
        assert [e["type"] for e in result] == ["text", "text"]
        assert result[0]["content"] == "标题A"
        assert result[1]["content"] == "正文1\n正文2"

    def test_consecutive_image_runs(self):
        # 两张连续图片后接文本：只有图片段末尾后的第一个文本块单独
        elements = [
            {"index": 1, "type": "text", "content": "标题A"},
            {"index": 2, "type": "image", "src": "/x/1.png"},
            {"index": 3, "type": "image", "src": "/x/2.png"},
            {"index": 4, "type": "text", "content": "标题B"},
            {"index": 5, "type": "text", "content": "正文1"},
        ]
        result = merge_merchandise_text_blocks(elements)
        assert [e["type"] for e in result] == ["text", "image", "image", "text", "text"]
        assert result[3]["content"] == "标题B"
        assert result[4]["content"] == "正文1"

    def test_metadata_preserved_on_merged(self):
        # 合并后的文本块保留第一个元素的元数据（doc_name 等）
        elements = [
            {"index": 1, "type": "text", "content": "标题A", "doc_name": "d"},
            {"index": 2, "type": "text", "content": "正文1", "doc_name": "d"},
            {"index": 3, "type": "text", "content": "正文2", "doc_name": "d"},
        ]
        result = merge_merchandise_text_blocks(elements)
        assert result[1]["doc_name"] == "d"

    def test_empty(self):
        assert merge_merchandise_text_blocks([]) == []
