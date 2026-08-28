"""
快照对比工具

用法:
    # 对比单个文档
    python compare_snapshot.py --actual /path/to/B_outputs/section/doc/_snapshots \\
                               --golden /path/to/B_outputs/section/doc/_golden

    # 对比 workspace 下所有文档（遍历 B_outputs 下所有 _snapshots）
    python compare_snapshot.py --workspace /path/to/workspace/B_outputs \\
                               --golden-root /path/to/golden_root

    # 生成金标（将 _snapshots 复制为 _golden）
    python compare_snapshot.py --promote --workspace /path/to/workspace/B_outputs

参数:
    --actual        生成的快照目录（含 page_*.jpg 和 structure.json）
    --golden        金标目录（含 page_*.jpg 和 structure.json）
    --workspace     工作区 B_outputs 路径（自动发现所有 _snapshots）
    --golden-root   金标根目录（与 workspace 对应）
    --promote       将 _snapshots 提升为 _golden（确认为正确基线）
    --output        差异图片输出路径（默认为 actual/_diffs）
    --tolerance     像素差异容忍度（默认 0.01，即 1% 差异像素以内视为通过）
    --threshold     单像素差异阈值（默认 10，0-255 范围）
    --quiet         安静模式，只输出汇总
"""

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image, ImageChops, ImageDraw
except ImportError:
    print("需要 Pillow 库: pip install Pillow")
    sys.exit(1)


def resolve_dir(path_str):
    return Path(path_str).resolve()


def discover_snapshot_dirs(workspace_root):
    """在 B_outputs 下递归发现所有 _snapshots 目录"""
    workspace = resolve_dir(workspace_root)
    snapshots = []
    for entry in sorted(workspace.rglob("_snapshots")):
        if entry.is_dir():
            snapshots.append(entry)
    return snapshots


def compute_golden_dir(actual_dir, golden_root):
    """根据快照目录计算金标目录。

    2026-08-16 新结构：快照/金标位于 outputs/work/snapshots/{板块}_{名}/，
    _golden 与 _snapshots 同级。金标目录 = 快照目录的父目录 + "/_golden"，
    不依赖 workspace 层级探测（旧 B_outputs 结构同样适用，_golden 也在同级）。
    """
    if not golden_root:
        return None
    if actual_dir.name == "_snapshots":
        return actual_dir.parent / "_golden"
    return None


def load_json(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def diff_json(actual, golden, path=""):
    """递归对比两个 JSON 结构，返回差异列表"""
    diffs = []

    if type(actual) != type(golden):
        diffs.append(f"{path}: 类型不同 ({type(actual).__name__} vs {type(golden).__name__})")
        return diffs

    if isinstance(actual, dict):
        all_keys = set(actual.keys()) | set(golden.keys())
        for key in sorted(all_keys):
            new_path = f"{path}.{key}" if path else key
            if key not in actual:
                diffs.append(f"{new_path}: 缺少 (实际)")
                continue
            if key not in golden:
                diffs.append(f"{new_path}: 多余 (实际)")
                continue
            diffs.extend(diff_json(actual[key], golden[key], new_path))
    elif isinstance(actual, list):
        max_len = max(len(actual), len(golden))
        for i in range(max_len):
            new_path = f"{path}[{i}]"
            if i >= len(actual):
                diffs.append(f"{new_path}: 缺少 (实际)")
                continue
            if i >= len(golden):
                diffs.append(f"{new_path}: 多余 (实际)")
                continue
            diffs.extend(diff_json(actual[i], golden[i], new_path))
    else:
        if actual != golden:
            actual_repr = repr(actual)[:100]
            golden_repr = repr(golden)[:100]
            diffs.append(f"{path}: {actual_repr} != {golden_repr}")

    return diffs


def compare_page_image(actual_path, golden_path, diff_output_path, threshold=10):
    """对比两页图片，返回差异信息"""
    if not actual_path.exists():
        return {"error": f"实际图片不存在: {actual_path}"}
    if not golden_path.exists():
        return {"error": f"金标图片不存在: {golden_path}"}

    try:
        actual_img = Image.open(actual_path).convert("RGB")
        golden_img = Image.open(golden_path).convert("RGB")
    except Exception as e:
        return {"error": f"图片打开失败: {e}"}

    if actual_img.size != golden_img.size:
        return {
            "size_mismatch": True,
            "actual_size": actual_img.size,
            "golden_size": golden_img.size
        }

    # 逐像素对比
    w, h = actual_img.size
    total_pixels = w * h

    actual_pixels = actual_img.load()
    golden_pixels = golden_img.load()

    diff_pixels = 0
    diff_img = Image.new("RGB", (w, h), (255, 255, 255))
    diff_draw = ImageDraw.Draw(diff_img)

    for y in range(h):
        for x in range(w):
            ap = actual_pixels[x, y]
            gp = golden_pixels[x, y]
            dr = abs(int(ap[0]) - int(gp[0]))
            dg = abs(int(ap[1]) - int(gp[1]))
            db = abs(int(ap[2]) - int(gp[2]))
            max_diff = max(dr, dg, db)
            if max_diff > threshold:
                diff_pixels += 1
                diff_draw.point((x, y), (255, 0, 0))

    diff_ratio = diff_pixels / total_pixels if total_pixels > 0 else 0

    diff_img.save(diff_output_path)

    return {
        "size": actual_img.size,
        "total_pixels": total_pixels,
        "diff_pixels": diff_pixels,
        "diff_ratio": round(diff_ratio, 6),
        "diff_image": str(diff_output_path)
    }


def promote_snapshots_to_golden(workspace_root):
    """将 workspace 下所有 _snapshots 复制为 _golden"""
    snapshots = discover_snapshot_dirs(workspace_root)
    if not snapshots:
        print("未发现任何 _snapshots 目录")
        return

    promoted = []
    for snap_dir in snapshots:
        golden_dir = snap_dir.parent / "_golden"
        if golden_dir.exists():
            shutil.rmtree(golden_dir)
        shutil.copytree(str(snap_dir), str(golden_dir))
        promoted.append(str(golden_dir))
        print(f"已提升: {snap_dir} -> {golden_dir}")

    print(f"\n共提升 {len(promoted)} 个金标目录")
    return promoted


def compare_single(actual_dir, golden_dir, diff_dir, tolerance, threshold):
    """对比单个 actual/golden 目录对"""
    actual = resolve_dir(actual_dir)
    golden = resolve_dir(golden_dir)
    diff_output = resolve_dir(diff_dir) if diff_dir else actual / "_diffs"

    results = {
        "actual": str(actual),
        "golden": str(golden),
        "image_results": [],
        "structure_diffs": [],
        "passed": True
    }

    if not actual.exists():
        results["error"] = f"实际目录不存在: {actual}"
        results["passed"] = False
        return results
    if not golden.exists():
        results["error"] = f"金标目录不存在: {golden}"
        results["passed"] = False
        return results

    # 1. 对比结构 JSON
    actual_struct_path = actual / "structure.json"
    golden_struct_path = golden / "structure.json"

    if actual_struct_path.exists() and golden_struct_path.exists():
        try:
            actual_struct = load_json(actual_struct_path)
            golden_struct = load_json(golden_struct_path)
            diffs = diff_json(actual_struct, golden_struct)
            results["structure_diffs"] = diffs
            if diffs:
                results["passed"] = False
        except Exception as e:
            results["structure_diffs"] = [f"JSON 解析错误: {e}"]
            results["passed"] = False
    elif not actual_struct_path.exists():
        results["structure_diffs"] = ["structure.json 缺失（实际）"]
        results["passed"] = False
    elif not golden_struct_path.exists():
        results["structure_diffs"] = ["structure.json 缺失（金标）"]
        results["passed"] = False

    # 2. 对比页面图片
    diff_output.mkdir(parents=True, exist_ok=True)

    # 收集所有 page_N.jpg/png
    actual_images = {}
    for f in actual.iterdir():
        name = f.name
        if name.startswith("page_") and (name.endswith(".jpg") or name.endswith(".png")):
            page_num = name.split("_")[1].split(".")[0]
            try:
                actual_images[int(page_num)] = f
            except ValueError:
                pass

    golden_images = {}
    for f in golden.iterdir():
        name = f.name
        if name.startswith("page_") and (name.endswith(".jpg") or name.endswith(".png")):
            page_num = name.split("_")[1].split(".")[0]
            try:
                golden_images[int(page_num)] = f
            except ValueError:
                pass

    all_page_nums = sorted(set(actual_images.keys()) | set(golden_images.keys()))

    for pn in all_page_nums:
        actual_p = actual_images.get(pn)
        golden_p = golden_images.get(pn)

        if not actual_p:
            results["image_results"].append({
                "page": pn,
                "error": "实际图片缺失",
                "passed": False
            })
            results["passed"] = False
            continue

        if not golden_p:
            results["image_results"].append({
                "page": pn,
                "error": "金标图片缺失",
                "passed": False
            })
            results["passed"] = False
            continue

        diff_out = diff_output / f"diff_page_{pn}.png"
        img_result = compare_page_image(
            actual_p, golden_p, diff_out, threshold=threshold
        )
        img_result["page"] = pn

        page_pass = "error" not in img_result and not img_result.get("size_mismatch") and img_result.get("diff_ratio", 1) <= tolerance
        img_result["passed"] = page_pass
        if not page_pass:
            results["passed"] = False

        results["image_results"].append(img_result)

    return results


def format_report(results, verbose=False):
    """格式化对比报告"""
    lines = []
    lines.append("=" * 60)
    lines.append(f"实际: {results.get('actual', '?')}")
    lines.append(f"金标: {results.get('golden', '?')}")
    lines.append(f"总体: {'通过' if results['passed'] else '失败'}")
    lines.append("")

    # 结构对比
    struct_diffs = results.get("structure_diffs", [])
    lines.append(f"[结构 JSON] 差异: {len(struct_diffs)}")
    if struct_diffs and verbose:
        for d in struct_diffs:
            lines.append(f"  - {d}")
    lines.append("")

    # 图片对比
    img_results = results.get("image_results", [])
    lines.append(f"[页面图片] 共 {len(img_results)} 页")
    for r in img_results:
        page = r.get("page", "?")
        if "error" in r:
            lines.append(f"  第 {page} 页: 错误 - {r['error']}")
        elif r.get("size_mismatch"):
            lines.append(f"  第 {page} 页: 尺寸不匹配 (实际{r['actual_size']} vs 金标{r['golden_size']})")
        else:
            ratio = r.get("diff_ratio", 0) * 100
            mark = "OK" if r["passed"] else "差异"
            lines.append(f"  第 {page} 页: {mark} ({ratio:.4f}% 像素差异)")
            if not r["passed"] and verbose:
                lines.append(f"         差异图: {r.get('diff_image', '')}")
    lines.append("")
    lines.append(f"结论: {'全部通过' if results['passed'] else '存在差异，请审查'}")
    lines.append("=" * 60)
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="快照对比工具")
    parser.add_argument("--actual", help="实际快照目录")
    parser.add_argument("--golden", help="金标目录")
    parser.add_argument("--workspace", help="B_outputs 工作区目录（自动发现）")
    parser.add_argument("--golden-root", help="金标根目录（与 workspace 对应）")
    parser.add_argument("--promote", action="store_true", help="将 _snapshots 提升为 _golden")
    parser.add_argument("--output", help="差异图片输出目录")
    parser.add_argument("--tolerance", type=float, default=0.01, help="像素差异容忍度 (默认 0.01 = 1%%)")
    parser.add_argument("--threshold", type=int, default=10, help="单像素差异阈值 (默认 10)")
    parser.add_argument("--quiet", action="store_true", help="安静模式")
    parser.add_argument("--verbose", action="store_true", help="详细输出")
    args = parser.parse_args()

    tolerance = max(0.0, min(1.0, args.tolerance))
    threshold = max(0, min(255, args.threshold))

    if args.promote:
        if not args.workspace:
            print("--promote 需要 --workspace")
            sys.exit(1)
        promote_snapshots_to_golden(args.workspace)
        return

    if args.actual and args.golden:
        results = compare_single(args.actual, args.golden, args.output, tolerance, threshold)
        report = format_report(results, verbose=args.verbose)
        print(report)
        sys.exit(0 if results["passed"] else 1)

    if args.workspace:
        snapshot_dirs = discover_snapshot_dirs(args.workspace)
        if not snapshot_dirs:
            print("未发现任何 _snapshots 目录")
            sys.exit(1)

        all_passed = True
        total = len(snapshot_dirs)
        passed_count = 0
        failed_count = 0

        for snap_dir in snapshot_dirs:
            golden_dir = compute_golden_dir(snap_dir, args.golden_root) if args.golden_root else snap_dir.parent / "_golden"
            if not golden_dir.exists():
                msg = f"[跳过] {snap_dir.parent.name}: 无对应 _golden"
                if not args.quiet:
                    print(msg)
                continue

            results = compare_single(snap_dir, golden_dir, args.output, tolerance, threshold)

            if not args.quiet:
                print(format_report(results, verbose=args.verbose))

            if results["passed"]:
                passed_count += 1
            else:
                failed_count += 1
                all_passed = False

        print(f"\n汇总: {total} 发现, {passed_count} 通过, {failed_count} 失败")
        sys.exit(0 if all_passed else 1)

    parser.print_help()


if __name__ == "__main__":
    main()
