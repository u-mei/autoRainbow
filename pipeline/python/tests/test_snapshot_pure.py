"""P1: compare_snapshot.py 纯函数测试"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from compare_snapshot import diff_json, compute_golden_dir, format_report


class TestDiffJson:
    def test_identical(self):
        a = {"a": 1, "b": [1, 2, 3], "c": {"d": "e"}}
        b = {"a": 1, "b": [1, 2, 3], "c": {"d": "e"}}
        assert diff_json(a, b) == []

    def test_value_diff(self):
        a = {"a": 1}
        b = {"a": 2}
        diffs = diff_json(a, b)
        assert len(diffs) == 1
        assert "1 != 2" in diffs[0]

    def test_key_missing(self):
        a = {"a": 1}
        b = {"a": 1, "b": 2}
        diffs = diff_json(a, b)
        assert any("缺少" in d for d in diffs)

    def test_key_extra(self):
        a = {"a": 1, "b": 2}
        b = {"a": 1}
        diffs = diff_json(a, b)
        assert any("多余" in d for d in diffs)

    def test_nested_path(self):
        a = {"x": {"y": {"z": [1, 2, 3]}}}
        b = {"x": {"y": {"z": [1, 2, 4]}}}
        diffs = diff_json(a, b)
        assert any("x.y.z[2]" in d for d in diffs)

    def test_type_diff(self):
        a = {"a": 1}
        b = {"a": "1"}
        diffs = diff_json(a, b)
        assert any("类型不同" in d for d in diffs)

    def test_list_diff(self):
        a = [1, 2, 3]
        b = [1, 3, 3]
        diffs = diff_json(a, b)
        assert any("[1]" in d for d in diffs)


class TestComputeGoldenDir:
    def test_basic(self):
        actual = Path("/x/workspace/B_outputs/1_头条/doc/_snapshots")
        expected = Path("/golden/1_头条/doc/_snapshots")
        result = compute_golden_dir(actual, "/golden")
        assert result == expected

    def test_no_workspace(self):
        actual = Path("/some/other/path/_snapshots")
        result = compute_golden_dir(actual, "/golden")
        assert result is None

    def test_nested_path(self):
        actual = Path("/x/workspace/B_outputs/a/b/c/doc/_snapshots")
        golden_root = "/golden"
        result = compute_golden_dir(actual, golden_root)
        assert result == Path("/golden/a/b/c/doc/_snapshots")


class TestFormatReport:
    def test_passed(self):
        results = {
            "actual": "/a",
            "golden": "/b",
            "passed": True,
            "structure_diffs": [],
            "image_results": [],
        }
        report = format_report(results)
        assert "通过" in report
        assert "全部通过" in report

    def test_failed(self):
        results = {
            "actual": "/a",
            "golden": "/b",
            "passed": False,
            "structure_diffs": ["pageCount: 1 != 2"],
            "image_results": [
                {"page": 1, "passed": False, "diff_ratio": 0.05, "diff_image": "/d.png"}
            ],
        }
        report = format_report(results, verbose=True)
        assert "失败" in report
        assert "存在差异" in report
        assert "5.0000%" in report
