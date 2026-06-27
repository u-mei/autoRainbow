import os
import sys
import json
import re
import shutil
import zipfile
import time
from copy import deepcopy
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn


def short_timestamp():
    """Unix 分钟数转 Base36，约 5 位字符"""
    minutes = int(time.time() // 60)
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    result = ""
    while minutes:
        result = chars[minutes % 36] + result
        minutes //= 36
    return result or "0"

WORD_EXTENSIONS = {".docx"}
IMAGE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"
}
SECTION_IMAGE_MODE = "4_一句话"


def parse_bool(value, default=False):
    """
    解析布尔配置值
    """
    if value is None:
        return bool(default)
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    return bool(default)


def load_export_config(config_path):
    """
    读取导出阶段配置
    """
    config_path = os.path.abspath(config_path)
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"未找到配置文件: {config_path}")

    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    if not isinstance(config, dict):
        raise ValueError("配置文件内容必须是 JSON 对象")

    return config


def discover_template_config_map(templates_root_dir, known_ids=None):
    """
    扫描模板目录，返回:
        {template_id: /abs/path/to/A_templates/<template_id>/config.json}
    如果 known_ids 提供（来自合并配置的 templates 字段），优先使用这些 ID，
    否则扫描文件系统。
    """
    templates_root = Path(templates_root_dir).resolve()
    template_map = {}

    if known_ids:
        for tid in known_ids:
            template_dir = templates_root / tid
            if template_dir.exists() and template_dir.is_dir():
                template_map[tid] = str(template_dir)
        if template_map:
            return template_map

    if not templates_root.exists():
        raise FileNotFoundError(f"模板根目录不存在: {templates_root}")

    for child in templates_root.iterdir():
        if not child.is_dir():
            continue
        cfg_file = child / "config.json"
        if cfg_file.exists() and cfg_file.is_file():
            template_map[child.name] = str(cfg_file.resolve())

    if not template_map:
        # 不抛异常，允许没有单独 config.json（配置已合并）
        pass

    return template_map


def infer_section_name(docx_path, input_root_dir=None):
    """
    推断文档所属板块名
    优先按 input_root_dir 下第一层子目录推断，失败时退化为父目录名
    """
    docx_path = Path(docx_path).resolve()

    if input_root_dir:
        root = Path(input_root_dir).resolve()
        try:
            rel_path = docx_path.relative_to(root)
            if len(rel_path.parts) >= 2:
                return rel_path.parts[0]
        except Exception:
            pass

    return docx_path.parent.name


def sanitize_filename_component(name):
    """
    清洗文件名片段，避免非法字符
    """
    text = str(name)
    for ch in ["/", "\\", ":", "*", "?", "\"", "<", ">", "|"]:
        text = text.replace(ch, "_")
    return text.strip()


def build_doc_output_dir(base_output_dir, section_name, doc_name):
    """
    构建文档输出目录:
    <base_output_dir>/<section_name>/<doc_stem>
    """
    section_part = sanitize_filename_component(section_name) or "unknown_section"
    doc_stem = sanitize_filename_component(Path(doc_name).stem) or "unknown_doc"
    return os.path.abspath(os.path.join(base_output_dir, section_part, doc_stem))


def build_cache_output_path(doc_workspace_root_dir, section_name, doc_name):
    """
    构建缓存输出路径:
    <doc_workspace_root_dir>/_cache/<section>_<doc_stem>_<base36>.json
    """
    section_part = sanitize_filename_component(section_name) or "unknown_section"
    doc_stem = sanitize_filename_component(Path(doc_name).stem) or "unknown_doc"
    base36 = short_timestamp()
    filename = f"{section_part}_{doc_stem}_{base36}.json"
    cache_dir = os.path.join(doc_workspace_root_dir, "_cache")
    return resolve_unique_path(cache_dir, filename), base36


def resolve_unique_path(output_dir, filename):
    """
    根据文件名生成不冲突的目标路径
    """
    save_path = os.path.abspath(os.path.join(output_dir, filename))
    base, ext = os.path.splitext(filename)
    counter = 1
    while os.path.exists(save_path):
        save_path = os.path.abspath(os.path.join(output_dir, f"{base}_{counter}{ext}"))
        counter += 1
    return save_path


def is_word_temp_file(path):
    """
    判断是否为 Word 临时文件
    """
    return Path(path).name.startswith("~$")


def is_supported_image_file(path):
    """
    判断是否为支持的图片格式
    """
    p = Path(path)
    if not p.is_file():
        return False
    if p.name.startswith("."):
        return False
    return p.suffix.lower() in IMAGE_EXTENSIONS


def discover_input_sources(input_root_dir, section_image_mode=SECTION_IMAGE_MODE):
    """
    发现可处理输入源：
    1) 所有 .docx
    2) 指定板块（默认 4_一句话）下所有图片（递归子目录）
    """
    input_root = Path(input_root_dir).resolve()
    if not input_root.exists():
        raise FileNotFoundError(f"输入目录不存在: {input_root}")

    sources = []

    # 读取 Word 文档（递归，跳过 _inbox）
    for p in sorted(input_root.rglob("*")):
        if not p.is_file():
            continue
        if is_word_temp_file(p):
            continue
        if p.suffix.lower() not in WORD_EXTENSIONS:
            continue
        if "_inbox" in p.parts:
            continue
        sources.append({
            "kind": "word",
            "path": str(p.resolve()),
            "section_name": infer_section_name(str(p), str(input_root))
        })

    # 一句话板块：递归读取全部图片，按“每张图=一组(image+text)”处理
    section_dir = input_root / section_image_mode
    if section_dir.exists() and section_dir.is_dir():
        image_paths = [
            str(p.resolve())
            for p in sorted(section_dir.rglob("*"))
            if is_supported_image_file(p)
        ]
        if image_paths:
            sources.append({
                "kind": "image_sentence",
                "section_name": section_image_mode,
                "doc_name": f"{section_image_mode}_图片组",
                "image_paths": image_paths
            })

    # 稳定排序，保证同样输入得到同样输出顺序
    def source_sort_key(item):
        kind_order = 0 if item.get("kind") == "word" else 1
        section = str(item.get("section_name") or "")
        path_or_name = str(item.get("path") or item.get("doc_name") or "")
        return (section, kind_order, path_or_name)

    return sorted(sources, key=source_sort_key)


def export_docx_images(docx_path, output_dir, name_prefix=None):
    """
    导出 docx 中的图片到 output_dir。
    返回:
        media_relpath_to_abspath: dict
        例如 {"word/media/image1.png": "/abs/path/to/image1.png"}
    """
    os.makedirs(output_dir, exist_ok=True)
    media_relpath_to_abspath = {}

    with zipfile.ZipFile(docx_path, "r") as z:
        # 只导出媒体文件，跳过目录项（如 word/media/）
        media_files = [
            name for name in z.namelist()
            if name.startswith("word/media/")
            and not name.endswith("/")
            and os.path.basename(name)
        ]

        for idx, media_file in enumerate(media_files, start=1):
            filename = os.path.basename(media_file)
            _, ext = os.path.splitext(filename)

            if name_prefix:
                prefix = sanitize_filename_component(name_prefix)
                filename = f"{prefix}_{idx:03d}{ext}"

            save_path = resolve_unique_path(output_dir, filename)

            with z.open(media_file) as src, open(save_path, "wb") as dst:
                dst.write(src.read())

            media_relpath_to_abspath[media_file] = save_path

    return media_relpath_to_abspath


def iter_block_items(document):
    """
    按 body 顺序遍历顶层 block（段落、表格）
    """
    body = document.element.body
    for child in body.iterchildren():
        yield child


def get_paragraph_by_element(document, element):
    """
    通过底层 xml element 找到对应 paragraph
    """
    for para in document.paragraphs:
        if para._element == element:
            return para
    return None


def build_rel_id_to_media_path(doc, exported_media_map):
    """
    把 rel_id 映射到已导出的图片绝对路径
    """
    rel_id_to_path = {}

    for rel_id, rel in doc.part.rels.items():
        target_ref = getattr(rel, "target_ref", None)
        if target_ref:
            normalized = "word/" + target_ref.lstrip("/")
            if normalized in exported_media_map:
                rel_id_to_path[rel_id] = exported_media_map[normalized]

    return rel_id_to_path


def flush_text_buffer(text_buffer, result, index_counter):
    text = "".join(text_buffer).strip()
    if text:
        result.append({
            "index": index_counter,
            "type": "text",
            "content": text
        })
        index_counter += 1
    text_buffer.clear()
    return index_counter


def extract_images_from_run_element(run_element, rel_id_to_media_path):
    """
    从 run 的底层 xml 中提取按顺序出现的图片
    返回图片绝对路径列表
    """
    image_paths = []

    drawings = run_element.xpath('.//*[local-name()="drawing"]')
    picts = run_element.xpath('.//*[local-name()="pict"]')

    containers = drawings + picts

    for container in containers:
        blips = container.xpath('.//*[local-name()="blip"]')
        imagedata = container.xpath('.//*[local-name()="imagedata"]')

        rel_ids = []

        for blip in blips:
            rid = blip.get(qn("r:embed"))
            if rid:
                rel_ids.append(rid)

        for img in imagedata:
            rid = img.get(qn("r:id"))
            if rid:
                rel_ids.append(rid)

        for rid in rel_ids:
            if rid in rel_id_to_media_path:
                image_paths.append(rel_id_to_media_path[rid])

    return image_paths


def paragraph_to_elements(paragraph, rel_id_to_media_path, split_soft_breaks, index_counter):
    """
    把一个段落转成若干 text/image 元素
    """
    result = []
    text_buffer = []

    for run in paragraph.runs:
        # run 内部按子节点顺序处理，尽量保留文本/换行/图片顺序
        for child in run._element.iterchildren():
            tag = child.tag

            # 文本
            if tag.endswith("}t"):
                if child.text:
                    text_buffer.append(child.text)

            # tab
            elif tag.endswith("}tab"):
                text_buffer.append("\t")

            # 软换行 / 手动换行
            elif tag.endswith("}br") or tag.endswith("}cr"):
                if split_soft_breaks:
                    index_counter = flush_text_buffer(text_buffer, result, index_counter)
                else:
                    text_buffer.append("\n")

            # 图片 drawing / pict
            elif tag.endswith("}drawing") or tag.endswith("}pict"):
                index_counter = flush_text_buffer(text_buffer, result, index_counter)

                # 这里 child 是单个 drawing/pict，但为了复用逻辑，构造一个临时 run element
                temp_run = deepcopy(run._element)
                for c in list(temp_run):
                    temp_run.remove(c)
                temp_run.append(deepcopy(child))

                image_paths = extract_images_from_run_element(temp_run, rel_id_to_media_path)
                for image_path in image_paths:
                    result.append({
                        "index": index_counter,
                        "type": "image",
                        "src": os.path.abspath(image_path)
                    })
                    index_counter += 1

    # 段落结束，输出剩余文本
    index_counter = flush_text_buffer(text_buffer, result, index_counter)
    return result, index_counter


def append_common_metadata(
    elements,
    doc_name,
    section_name,
    template_id,
    doc_output_dir=None,
    doc_output_json_path=None,
    image_output_dir=None,
    base36_id=None
):
    """
    给元素补充统一元数据
    """
    for item in elements:
        item["doc_name"] = doc_name
        item["section_name"] = section_name
        item["template_id"] = template_id
        if doc_output_dir and doc_output_json_path:
            item["doc_output_dir"] = os.path.abspath(doc_output_dir)
            item["doc_output_json"] = os.path.abspath(doc_output_json_path)
        if image_output_dir:
            item["doc_images_dir"] = os.path.abspath(image_output_dir)
        if base36_id:
            item["base36_id"] = base36_id


def build_image_sentence_elements(image_paths, image_output_dir, image_name_prefix, index_counter):
    """
    把图片目录转成一句话板块元素：
    每张图 => image + text(文件名去后缀)
    """
    os.makedirs(image_output_dir, exist_ok=True)

    elements = []
    prefix = sanitize_filename_component(image_name_prefix) or "image"
    for seq, image_path in enumerate(image_paths, start=1):
        src_path = Path(image_path).resolve()
        if not src_path.exists() or not src_path.is_file():
            continue
        ext = src_path.suffix
        if image_name_prefix:
            filename = f"{prefix}_{seq:03d}{ext}"
        else:
            # 一句话模式按纯数字序号命名，便于人工排序
            filename = f"{seq:03d}{ext}"
        dst_path = resolve_unique_path(image_output_dir, filename)
        shutil.copy2(str(src_path), dst_path)

        elements.append({
            "index": index_counter,
            "type": "image",
            "src": os.path.abspath(dst_path)
        })
        index_counter += 1

        elements.append({
            "index": index_counter,
            "type": "text",
            "content": src_path.stem
        })
        index_counter += 1

    return elements, index_counter


def is_merchandise_doc(template_id, section_name):
    """
    判断是否为周边类文档
    """
    combined = f"{template_id}|{section_name}"
    return "周边" in combined


def is_new_costume_doc(template_id, section_name):
    """
    判断是否为新衣披露类文档
    """
    combined = f"{template_id}|{section_name}"
    return "新衣披露" in combined


def normalize_newline_before_marker(text, marker="■"):
    """
    规范 marker 前的换行：
    1) 若前面已有正文，则 marker 前强制为双换行（空一行）
    2) 若 marker 在文本开头，不额外补前导空行
    """
    if not text or marker not in text:
        return text

    escaped_marker = re.escape(marker)

    # 先规范“前面有正文，后接空白/换行再到 marker”的情况
    text = re.sub(r"([^\r\n])[ \t]*[\r\n]+[ \t]*" + escaped_marker, r"\1\n\n" + marker, text)
    # 再规范“前面有正文且直接接 marker”的情况
    text = re.sub(r"([^\r\n])" + escaped_marker, r"\1\n\n" + marker, text)
    # 最后规范“前面有正文但只有空格/制表符再到 marker”的情况
    text = re.sub(r"([^\r\n])[ \t]+" + escaped_marker, r"\1\n\n" + marker, text)
    return text


def truncate_from_keyword_for_costume(text, keyword="相关视频"):
    """
    新衣披露规则：
    遇到关键词后，关键词前连续空白也一起截断，关键词及其后文本全部丢弃
    """
    if not text:
        return text, False
    pos = text.find(keyword)
    if pos < 0:
        return text, False

    kept = text[:pos].rstrip(" \t\r\n")
    return kept, True


def apply_text_rules_for_doc(elements, template_id, section_name, rule_state=None):
    """
    按文档类型应用文本规则
    """
    if not elements:
        return []

    apply_merchandise_rule = is_merchandise_doc(template_id, section_name)
    apply_costume_rule = is_new_costume_doc(template_id, section_name)

    if rule_state is None:
        rule_state = {}
    stop_following_text = bool(rule_state.get("stop_following_text", False))
    normalized = []

    for item in elements:
        if item.get("type") != "text":
            normalized.append(item)
            continue

        if apply_costume_rule and stop_following_text:
            continue

        content = str(item.get("content") or "")

        if apply_merchandise_rule:
            content = normalize_newline_before_marker(content, marker="■")

        if apply_costume_rule:
            content, hit_keyword = truncate_from_keyword_for_costume(content, keyword="相关视频")
            if hit_keyword:
                stop_following_text = True

        if not content:
            continue

        new_item = dict(item)
        new_item["content"] = content
        normalized.append(new_item)

    rule_state["stop_following_text"] = stop_following_text
    return normalized


def docx_list_to_json(
    source_items,
    template_config_map,
    doc_template_map=None,
    section_template_map=None,
    input_root_dir=None,
    doc_workspace_root_dir=None,
    image_root_dir="exported_images",
    split_soft_breaks=True,
    clean_image_root=False
):
    """
    合并多个输入源（Word/图片模式）并输出 JSON 元素列表

    参数:
        source_items: list[str|dict]
            - str: 默认按 Word 路径处理
            - dict:
                {kind: "word", path: "..."}
                {kind: "image_sentence", section_name: "...", doc_name: "...", image_paths: [...]}
        template_config_map: 模板ID到模板配置文件路径映射（用于校验模板 ID）
        doc_template_map: 文档名到模板 ID 的映射（可选，兼容旧配置）
        section_template_map: 板块名到模板 ID 的映射（可选）
        input_root_dir: 输入根目录（用于推断板块名）
        doc_workspace_root_dir: 文档输出根目录（每篇文档会在该目录下生成独立子目录）
        image_root_dir: 图片导出根目录
        split_soft_breaks: 是否按软换行拆分 text 元素
        clean_image_root: 是否在导出前清空图片目录
    """
    all_elements = []
    index_counter = 1

    if doc_workspace_root_dir:
        doc_workspace_root_dir = os.path.abspath(doc_workspace_root_dir)
        os.makedirs(doc_workspace_root_dir, exist_ok=True)

    image_root_dir = os.path.abspath(image_root_dir)
    if not doc_workspace_root_dir:
        # 按需清理旧导出结果，避免残留旧目录/旧文件
        if clean_image_root and os.path.exists(image_root_dir):
            shutil.rmtree(image_root_dir)
        os.makedirs(image_root_dir, exist_ok=True)

    for source in source_items:
        if isinstance(source, str):
            source = {"kind": "word", "path": source}

        kind = str(source.get("kind") or "word")
        source_path = source.get("path")

        if kind == "word":
            if not source_path:
                continue
            source_path = os.path.abspath(str(source_path))
            doc_name = str(source.get("doc_name") or Path(source_path).name)
            doc_name = re.sub(r"^\d{10,11}_", "", doc_name)
            section_name = str(source.get("section_name") or infer_section_name(source_path, input_root_dir))
        elif kind == "image_sentence":
            section_name = str(source.get("section_name") or "")
            doc_name = str(source.get("doc_name") or f"{section_name}_图片组")
        else:
            continue

        template_id = None
        if isinstance(doc_template_map, dict):
            template_id = doc_template_map.get(doc_name)

        if not template_id and isinstance(section_template_map, dict):
            template_id = section_template_map.get(section_name)

        if not template_id:
            # 默认自动映射：板块名即模板 ID
            template_id = section_name

        if template_id not in template_config_map:
            raise ValueError(
                f"未找到模板配置: doc_name={doc_name}, section_name={section_name}, template_id={template_id}"
            )

        doc_stem = Path(doc_name).stem
        image_name_prefix = f"{section_name}_{doc_stem}"

        doc_output_dir = None
        doc_output_json_path = None
        doc_base36_id = None
        if doc_workspace_root_dir:
            doc_output_json_path, doc_base36_id = build_cache_output_path(
                doc_workspace_root_dir=doc_workspace_root_dir,
                section_name=section_name,
                doc_name=doc_name
            )
            os.makedirs(os.path.dirname(doc_output_json_path), exist_ok=True)
            doc_stem_clean = sanitize_filename_component(doc_stem) or "unknown"
            image_output_dir = os.path.join(doc_workspace_root_dir, "_shared_images", f"{section_name}_{doc_stem_clean}")
            os.makedirs(image_output_dir, exist_ok=True)
        else:
            image_output_dir = image_root_dir

        doc_elements = []

        if kind == "word":
            try:
                exported_media_map = export_docx_images(
                    docx_path=source_path,
                    output_dir=image_output_dir,
                    name_prefix=image_name_prefix
                )

                doc = Document(source_path)
                rel_id_to_media_path = build_rel_id_to_media_path(doc, exported_media_map)
                rule_state = {"stop_following_text": False}

                for block in iter_block_items(doc):
                    # 段落
                    if block.tag.endswith("}p"):
                        paragraph = get_paragraph_by_element(doc, block)
                        if paragraph is None:
                            continue

                        elements, index_counter = paragraph_to_elements(
                            paragraph=paragraph,
                            rel_id_to_media_path=rel_id_to_media_path,
                            split_soft_breaks=split_soft_breaks,
                            index_counter=index_counter
                        )
                        elements = apply_text_rules_for_doc(
                            elements=elements,
                            template_id=template_id,
                            section_name=section_name,
                            rule_state=rule_state
                        )
                        append_common_metadata(
                            elements=elements,
                            doc_name=doc_name,
                            section_name=section_name,
                            template_id=template_id,
                            doc_output_dir=doc_output_dir,
                            doc_output_json_path=doc_output_json_path,
                            image_output_dir=image_output_dir,
                            base36_id=doc_base36_id
                        )
                        all_elements.extend(elements)
                        doc_elements.extend(elements)

                    # 表格暂时跳过；如果你需要，我可以再补表格处理
                    elif block.tag.endswith("}tbl"):
                        continue
            except Exception as exc:
                print(f"跳过文档：{source_path}；原因：{exc}")

        elif kind == "image_sentence":
            image_paths = source.get("image_paths") or []
            if not image_paths:
                continue
            elements, index_counter = build_image_sentence_elements(
                image_paths=image_paths,
                image_output_dir=image_output_dir,
                image_name_prefix=None,
                index_counter=index_counter
            )
            append_common_metadata(
                elements=elements,
                doc_name=doc_name,
                section_name=section_name,
                template_id=template_id,
                doc_output_dir=doc_output_dir,
                doc_output_json_path=doc_output_json_path,
                image_output_dir=image_output_dir,
                base36_id=doc_base36_id
            )
            all_elements.extend(elements)
            doc_elements.extend(elements)

        # 每篇文档输出缓存 JSON（任务系统用，已含 base36 防重名）
        if doc_output_json_path:
            with open(doc_output_json_path, "w", encoding="utf-8") as f:
                json.dump(doc_elements, f, ensure_ascii=False, indent=2)
            print(os.path.abspath(doc_output_json_path))

    return all_elements


if __name__ == "__main__":
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent.parent
    config_candidates = [
        Path.home() / "autorainbow_config.json",
        Path.home() / ".autorainbow" / "config.json",
        project_root / "workspace" / "A_templates" / "config.json",
        project_root / "workspace" / "config.json",
        script_dir / "D" / "A_templates" / "config.json",
        script_dir / "D" / "config.json",
        script_dir / "A_templates" / "config.json",
        script_dir / "config.json"
    ]

    config_path = None
    for candidate in config_candidates:
        if candidate.exists():
            config_path = candidate
            break

    if config_path is None:
        raise FileNotFoundError(
            f"未找到配置文件，已尝试: {[str(p) for p in config_candidates]}"
        )

    export_config = load_export_config(str(config_path))
    config_parent = config_path.parent

    # 合并配置有 project_root 字段，优先使用
    project_root_dir = Path(export_config.get("project_root", "")) if export_config.get("project_root") else None
    if not project_root_dir or not project_root_dir.exists():
        if config_parent.name == "A_templates":
            project_root_dir = config_parent.parent
        else:
            project_root_dir = config_parent

    doc_workspace_cfg = export_config.get("doc_workspace_dir")
    doc_workspace_dir = None
    if doc_workspace_cfg:
        doc_workspace_dir = Path(doc_workspace_cfg)
        if not doc_workspace_dir.is_absolute():
            doc_workspace_dir = (project_root_dir / doc_workspace_dir).resolve()

    templates_root_cfg = export_config.get("templates_root_dir", "A_templates")
    templates_root_dir = Path(templates_root_cfg)
    if not templates_root_dir.is_absolute():
        templates_root_dir = (project_root_dir / templates_root_dir).resolve()
    known_template_ids = list((export_config.get("templates") or {}).keys())
    template_config_map = discover_template_config_map(str(templates_root_dir), known_ids=known_template_ids)

    section_image_mode = export_config.get("section_image_mode", SECTION_IMAGE_MODE)

    input_root_dir = None
    image_root_dir = None

    input_mapping = None
    if len(sys.argv) > 1:
        map_path = sys.argv[1]
        if os.path.exists(map_path):
            with open(map_path, "r", encoding="utf-8") as f:
                input_mapping = json.load(f)

    if input_mapping:
        source_items = []
        image_paths_for_mode = {}
        for item in input_mapping:
            p = item["path"]
            tid = item["template_id"]
            ext = Path(p).suffix.lower().lstrip(".")
            if ext in ("docx",):
                source_items.append({"kind": "word", "path": p, "section_name": tid})
            elif ext in ("png", "jpg", "jpeg") and tid == "4_一句话":
                image_paths_for_mode.setdefault(tid, []).append(p)
        for tid, paths in image_paths_for_mode.items():
            source_items.append({
                "kind": "image_sentence",
                "section_name": tid,
                "doc_name": f"{tid}_图片组",
                "image_paths": paths
            })
    else:
        input_root_cfg = export_config.get("inputs_dir", ".")
        input_root_dir = Path(input_root_cfg)
        if not input_root_dir.is_absolute():
            input_root_dir = (project_root_dir / input_root_dir).resolve()
        image_root_cfg = export_config.get("images_dir", "exported_images")
        image_root_dir = Path(image_root_cfg)
        if not image_root_dir.is_absolute():
            image_root_dir = (project_root_dir / image_root_dir).resolve()

        source_items = discover_input_sources(str(input_root_dir), section_image_mode=section_image_mode)
        if not source_items:
            print(f"输入目录没有可处理文件（.docx/{section_image_mode}图片模式）：{input_root_dir}")

    if not source_items:
        data = []
    else:
        data = docx_list_to_json(
            source_items=source_items,
            template_config_map=template_config_map,
            doc_template_map=export_config.get("doc_template_map"),
            section_template_map=export_config.get("section_template_map"),
            input_root_dir=str(input_root_dir) if input_root_dir else "",
            doc_workspace_root_dir=str(doc_workspace_dir) if doc_workspace_dir else None,
            image_root_dir=str(image_root_dir) if image_root_dir else "",
            split_soft_breaks=parse_bool(export_config.get("split_soft_breaks"), default=False),
            clean_image_root=True
        )

    if not input_mapping:
        output_json_cfg = export_config.get("output_json")
        output_json_path = None
        if output_json_cfg:
            output_json_path = Path(output_json_cfg)
            if not output_json_path.is_absolute():
                output_json_path = (project_root_dir / output_json_path).resolve()
        if output_json_path:
            output_json = os.path.abspath(str(output_json_path))
            with open(output_json, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"已生成汇总 JSON: {output_json}")
        else:
            print("已完成导出：未生成汇总 JSON（output_json 未配置）")
