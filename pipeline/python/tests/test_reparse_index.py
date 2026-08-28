"""回归测试：4_一句话 重新解析（reparse）按项目图片索引重建。

2026-08-07 用户确认模型：
- 顺序 = 项目 images 索引顺序
- 文本 = 图片文件名（手动编辑过的文本会被覆盖）
- 编辑器里删除的图/文会恢复（图元素或文件名文本任一存在即重建整组）
- 图元素和文件名文本都被删除 → 整组删除，从索引移除（removed）
- 源文件缺失时保留原配对文本（避免退化为副本编号）
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.routes import _rebuild_from_index  # noqa: E402


def _img(idx, src):
    return {"index": idx, "type": "image", "src": src, "source_path": src}


def _txt(idx, content):
    return {"index": idx, "type": "text", "content": content}


def _groups(paths):
    els = []
    idx = 1
    for p in paths:
        els.append(_img(idx, p))
        els.append(_txt(idx + 1, Path(p).stem))
        idx += 2
    return els


def _make_images(tmp_path, names):
    paths = []
    for n in names:
        f = tmp_path / n
        f.write_bytes(b"x")
        paths.append(str(f))
    return paths


def test_index_rebuild_normal_order(tmp_path):
    """按索引顺序重建：顺序=索引顺序，文本=文件名。"""
    a, b, c = _make_images(tmp_path, ["a.png", "b.png", "c.png"])
    elements = _groups([a, b, c])
    rebuilt, removed = _rebuild_from_index(elements, [b, a, c])
    assert removed == []
    assert [e.get("content") for e in rebuilt if e.get("type") == "text"] == ["b", "a", "c"]
    assert [e.get("type") for e in rebuilt] == ["image", "text", "image", "text", "image", "text"]


def test_index_rebuild_restores_deleted_image(tmp_path):
    """图元素被删但文件名文本还在：恢复整组。"""
    a, b = _make_images(tmp_path, ["a.png", "b.png"])
    elements = [_txt(1, "a"), _txt(2, "b")]
    rebuilt, removed = _rebuild_from_index(elements, [a, b])
    assert removed == []
    assert len(rebuilt) == 4
    imgs = [e for e in rebuilt if e.get("type") == "image"]
    assert [e.get("source_path") for e in imgs] == [a, b]
    assert [e.get("src") for e in imgs] == [a, b]


def test_index_rebuild_restores_deleted_text(tmp_path):
    """文本被删但图元素还在：恢复文件名文本。"""
    a = _make_images(tmp_path, ["a.png"])[0]
    elements = [_img(1, a)]
    rebuilt, removed = _rebuild_from_index(elements, [a])
    assert removed == []
    assert len(rebuilt) == 2
    txt = rebuilt[1]
    assert txt["type"] == "text"
    assert txt["content"] == "a"


def test_index_rebuild_keeps_image_props(tmp_path):
    """图元素存在时复用其属性（如 page_break_before）。"""
    a = _make_images(tmp_path, ["a.png"])[0]
    img = _img(1, a)
    img["page_break_before"] = True
    elements = [img, _txt(2, "a")]
    rebuilt, _ = _rebuild_from_index(elements, [a])
    assert rebuilt[0]["page_break_before"] is True


def test_index_rebuild_removes_fully_deleted_group(tmp_path):
    """图元素和文件名文本都被删除：整组删除，移出索引。"""
    a, b, c = _make_images(tmp_path, ["a.png", "b.png", "c.png"])
    elements = _groups([a, c])  # b 整组被删
    rebuilt, removed = _rebuild_from_index(elements, [a, b, c])
    assert removed == [b]
    assert len(rebuilt) == 4
    assert [e.get("content") for e in rebuilt if e.get("type") == "text"] == ["a", "c"]
    assert [int(e.get("index")) for e in rebuilt] == [1, 2, 3, 4]


def test_index_rebuild_edited_text_only_means_group_deleted(tmp_path):
    """图元素被删、只剩手动编辑过的文本（内容≠文件名）：不算匹配，整组删除。"""
    a = _make_images(tmp_path, ["a.png"])[0]
    elements = [_txt(1, "手动改过的文案")]
    rebuilt, removed = _rebuild_from_index(elements, [a])
    assert removed == [a]
    assert rebuilt == []


def test_index_rebuild_missing_src_keeps_original_text(tmp_path):
    """源文件缺失时保留原配对文本（避免退化为副本编号）。"""
    a = _make_images(tmp_path, ["a.png"])[0]
    Path(a).unlink()
    elements = [_img(1, a), _txt(2, "a")]
    rebuilt, removed = _rebuild_from_index(elements, [a])
    assert removed == []
    assert rebuilt[1]["content"] == "a"


def test_empty_index_falls_back_to_cache_images(tmp_path):
    """空索引（旧数据行无 images 字段）：从缓存 image 元素兜底，不清空缓存。"""
    a, b = _make_images(tmp_path, ["a.png", "b.png"])
    elements = _groups([a, b])
    rebuilt, removed = _rebuild_from_index(elements, [])
    assert removed == []
    assert [e.get("source_path") for e in rebuilt if e.get("type") == "image"] == [a, b]
    assert [e.get("content") for e in rebuilt if e.get("type") == "text"] == ["a", "b"]
