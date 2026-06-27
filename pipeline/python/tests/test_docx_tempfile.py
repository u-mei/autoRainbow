"""P1: docx_list_to_json.py 需要 tempfile 的测试"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from docx_list_to_json import (
    resolve_unique_path,
    build_doc_output_dir,
    discover_template_config_map,
    discover_input_sources,
)


class TestResolveUniquePath:
    def test_no_conflict(self, tmp_path):
        result = resolve_unique_path(str(tmp_path), "file.txt")
        assert result == os.path.join(str(tmp_path), "file.txt")

    def test_with_conflict(self, tmp_path):
        Path(tmp_path / "file.txt").write_text("")
        result = resolve_unique_path(str(tmp_path), "file.txt")
        assert result == os.path.join(str(tmp_path), "file_1.txt")

    def test_multiple_conflicts(self, tmp_path):
        Path(tmp_path / "file.txt").write_text("")
        Path(tmp_path / "file_1.txt").write_text("")
        result = resolve_unique_path(str(tmp_path), "file.txt")
        assert result == os.path.join(str(tmp_path), "file_2.txt")


class TestBuildDocOutputDir:
    def test_basic(self):
        result = build_doc_output_dir("/workspace/B_outputs", "1_本周头条", "test.docx")
        assert result == "/workspace/B_outputs/1_本周头条/test"

    def test_sanitize_section(self):
        result = build_doc_output_dir("/out", "bad:name", "doc.docx")
        assert "bad_name" in result


class TestDiscoverTemplateConfigMap:
    def test_basic(self, tmp_path):
        t1 = tmp_path / "1_本周头条"
        t1.mkdir()
        (t1 / "config.json").write_text('{"layout_mode": "templateA"}')

        t2 = tmp_path / "2_直播精选"
        t2.mkdir()
        (t2 / "config.json").write_text('{"layout_mode": "templateB"}')

        result = discover_template_config_map(str(tmp_path))
        assert "1_本周头条" in result
        assert "2_直播精选" in result
        assert result["1_本周头条"].endswith("1_本周头条/config.json")

    def test_empty(self, tmp_path):
        result = discover_template_config_map(str(tmp_path))
        assert result == {}


class TestDiscoverInputSources:
    def test_word_only(self, tmp_path):
        section = tmp_path / "1_本周头条"
        section.mkdir()
        (section / "doc1.docx").write_text("")
        (section / "doc2.docx").write_text("")

        result = discover_input_sources(str(tmp_path))
        assert len(result) == 2
        assert all(s["kind"] == "word" for s in result)

    def test_skip_temp(self, tmp_path):
        section = tmp_path / "1_本周头条"
        section.mkdir()
        (section / "doc.docx").write_text("")
        (section / "~$doc.docx").write_text("")

        result = discover_input_sources(str(tmp_path))
        assert len(result) == 1

    def test_image_mode(self, tmp_path):
        section = tmp_path / "4_一句话"
        section.mkdir()
        (section / "img1.png").write_text("")
        (section / "img2.jpg").write_text("")

        result = discover_input_sources(str(tmp_path))
        image_sources = [s for s in result if s["kind"] == "image_sentence"]
        assert len(image_sources) == 1
        assert len(image_sources[0]["image_paths"]) == 2

    def test_empty(self, tmp_path):
        result = discover_input_sources(str(tmp_path))
        assert result == []
