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
        elements = [{"index": 1, "type": "text", "content": "文本■标记"}]
        result = apply_text_rules_for_doc(elements, "7_周边", "7_周边")
        assert result[0]["content"] == "文本\n\n■标记"

    def test_costume(self):
        elements = [{"index": 1, "type": "text", "content": "介绍相关视频链接"}]
        result = apply_text_rules_for_doc(elements, "6_新衣披露", "6_新衣披露")
        assert result[0]["content"] == "介绍"

    def test_normal(self):
        elements = [{"index": 1, "type": "text", "content": "普通文本"}]
        result = apply_text_rules_for_doc(elements, "1_本周头条", "1_本周头条")
        assert result[0]["content"] == "普通文本"
