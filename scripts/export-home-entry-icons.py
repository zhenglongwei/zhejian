#!/usr/bin/env python3
"""
将 assets/home/entries-src/*.svg 导出为 entries/*.png（@2x，透明底）。

优先 cairosvg（macOS/Linux）；Windows 无 Cairo 时自动改用 Node + @resvg/resvg-js。
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = Path(__file__).resolve().parent
SRC_DIR = ROOT / "assets" / "home" / "entries-src"
OUT_DIR = ROOT / "assets" / "home" / "entries"
SCALE = 2
NODE_SCRIPT = SCRIPT_DIR / "export-home-entry-icons.mjs"


def export_with_cairosvg(svg_path: Path, png_path: Path) -> None:
    import cairosvg

    cairosvg.svg2png(
        url=str(svg_path),
        write_to=str(png_path),
        output_width=96 * SCALE,
        output_height=96 * SCALE,
    )


def export_with_node() -> int:
    if not NODE_SCRIPT.is_file():
        print(f"缺少 {NODE_SCRIPT}", file=sys.stderr)
        return 1
    node_modules = SCRIPT_DIR / "node_modules" / "@resvg" / "resvg-js"
    if not node_modules.is_dir():
        print("正在安装 Node 依赖（仅首次）…", file=sys.stderr)
        npm = "npm.cmd" if sys.platform == "win32" else "npm"
        install = subprocess.run(
            [npm, "install", "--prefix", str(SCRIPT_DIR)],
            cwd=str(SCRIPT_DIR),
            check=False,
        )
        if install.returncode != 0:
            print(
                "npm install 失败。请确认已安装 Node.js，或在 scripts 目录手动执行：\n"
                "  cd scripts\n"
                "  npm install\n"
                "  node export-home-entry-icons.mjs",
                file=sys.stderr,
            )
            return 1
    node = "node.exe" if sys.platform == "win32" else "node"
    run = subprocess.run([node, str(NODE_SCRIPT)], cwd=str(SCRIPT_DIR), check=False)
    return run.returncode


def export_with_cairo_backend() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    svgs = sorted(SRC_DIR.glob("entry_*.svg"))
    if not svgs:
        print(f"未找到 SVG：{SRC_DIR}", file=sys.stderr)
        return 1

    for svg in svgs:
        out = OUT_DIR / f"{svg.stem}.png"
        try:
            export_with_cairosvg(svg, out)
        except OSError:
            raise
        print(f"[ok] {out.name}")

    print(f"[export-home-entry-icons] {len(svgs)} icons -> {OUT_DIR}")
    return 0


def main() -> int:
    if not SRC_DIR.is_dir():
        print(f"目录不存在：{SRC_DIR}", file=sys.stderr)
        return 1

    try:
        import cairosvg  # noqa: F401
    except ImportError:
        print("未安装 cairosvg，改用 Node 导出…", file=sys.stderr)
        return export_with_node()
    except OSError as e:
        print(f"Cairo 不可用（Windows 常见）：{e}", file=sys.stderr)
        print("改用 Node + @resvg/resvg-js 导出…", file=sys.stderr)
        return export_with_node()

    try:
        return export_with_cairo_backend()
    except OSError as e:
        print(f"Cairo 导出失败：{e}", file=sys.stderr)
        print("改用 Node + @resvg/resvg-js 导出…", file=sys.stderr)
        return export_with_node()


if __name__ == "__main__":
    raise SystemExit(main())
