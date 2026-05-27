#!/usr/bin/env python3
"""Generate R10 home entry icons, tab icons, and demo thumbnails."""
from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PRIMARY = (22, 119, 255)
PRIMARY_LIGHT = (230, 244, 255)
MUTED = (100, 106, 115)
WHITE = (255, 255, 255)


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def draw_round_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def save_icon(path: Path, size: int, draw_fn, fg=PRIMARY):
    """透明底图标，底色由页面 icon-ring 渐变承担。"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_fn(draw, size, fg)
    img.save(path, format="PNG")


def icon_brake(draw, size, fg):
    cx, cy = size // 2, size // 2
    r = int(size * 0.22)
    w = max(3, size // 18)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=fg, width=w)
    draw.arc((cx - int(r * 1.85), cy - int(r * 1.85), cx + int(r * 1.85), cy + int(r * 1.85)), 200, 340, fill=fg, width=w)


def icon_tire(draw, size, fg):
    cx, cy = size // 2, size // 2
    r = int(size * 0.22)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=fg, width=max(3, size // 20))
    draw.ellipse((cx - r // 2, cy - r // 2, cx + r // 2, cy + r // 2), fill=fg)


def icon_battery(draw, size, fg):
    w = int(size * 0.34)
    h = int(size * 0.2)
    x0 = (size - w) // 2
    y0 = (size - h) // 2
    draw.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=4, outline=fg, width=max(2, size // 24))
    draw.rectangle((x0 + w, y0 + h // 3, x0 + w + int(size * 0.05), y0 + h * 2 // 3), fill=fg)
    draw.rectangle((x0 + int(size * 0.08), y0 + int(size * 0.05), x0 + int(size * 0.22), y0 + h - int(size * 0.05)), fill=fg)


def icon_body(draw, size, fg):
    pts = [
        (size * 0.32, size * 0.58),
        (size * 0.68, size * 0.58),
        (size * 0.72, size * 0.42),
        (size * 0.28, size * 0.42),
    ]
    draw.polygon(pts, outline=fg, width=max(2, size // 24))
    draw.line((size * 0.5, size * 0.42, size * 0.5, size * 0.34), fill=fg, width=max(2, size // 24))


def icon_accident(draw, size, fg):
    cx, cy = size // 2, int(size * 0.52)
    draw.polygon(
        [
            (cx, cy - int(size * 0.18)),
            (cx + int(size * 0.2), cy + int(size * 0.12)),
            (cx - int(size * 0.2), cy + int(size * 0.12)),
        ],
        outline=fg,
        width=max(2, size // 24),
    )
    draw.text((cx - int(size * 0.06), cy - int(size * 0.1)), "!", fill=fg)


def icon_maintain(draw, size, fg):
    cx, cy = size // 2, size // 2
    r = int(size * 0.18)
    for i in range(8):
        ang = i * math.pi / 4
        x1 = cx + int(math.cos(ang) * r)
        y1 = cy + int(math.sin(ang) * r)
        x2 = cx + int(math.cos(ang) * (r + int(size * 0.08)))
        y2 = cy + int(math.sin(ang) * (r + int(size * 0.08)))
        draw.line((x1, y1, x2, y2), fill=fg, width=max(2, size // 28))
    draw.ellipse((cx - r // 2, cy - r // 2, cx + r // 2, cy + r // 2), outline=fg, width=max(2, size // 24))


ENTRY_ICONS = {
    "entry_brake": icon_brake,
    "entry_tire": icon_tire,
    "entry_battery": icon_battery,
    "entry_body": icon_body,
    "entry_accident": icon_accident,
    "entry_maintenance": icon_maintain,
}


def draw_tab_icon(draw, size: int, kind: str, color):
    pad = int(size * 0.18)
    box = (pad, pad, size - pad, size - pad)
    if kind == "home":
        draw.polygon(
            [(size // 2, pad), (size - pad, size - pad), (pad, size - pad)],
            outline=color,
            width=max(2, size // 18),
        )
    elif kind == "service":
        draw.rounded_rectangle(box, radius=8, outline=color, width=max(2, size // 18))
        draw.line((pad + 8, size // 2, size - pad - 8, size // 2), fill=color, width=max(2, size // 22))
    elif kind == "case":
        draw.rounded_rectangle(box, radius=8, outline=color, width=max(2, size // 18))
        draw.ellipse((size // 2 - 10, size // 2 - 6, size // 2 + 10, size // 2 + 10), outline=color, width=2)
    elif kind == "store":
        draw.rectangle((pad + 6, pad + 14, size - pad - 6, size - pad), outline=color, width=max(2, size // 18))
        draw.polygon(
            [(size // 2, pad), (size - pad - 6, pad + 14), (pad + 6, pad + 14)],
            outline=color,
            width=max(2, size // 18),
        )
    elif kind == "mine":
        draw.ellipse((size // 2 - 12, pad + 4, size // 2 + 12, pad + 28), outline=color, width=max(2, size // 18))
        draw.arc((pad + 4, pad + 22, size - pad - 4, size - pad), 20, 160, fill=color, width=max(2, size // 18))


def save_tab(path: Path, kind: str, active: bool):
    size = 81
    color = PRIMARY if active else MUTED
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_tab_icon(draw, size, kind, color)
    img.save(path, format="PNG")


def save_store_cover(path: Path):
    w, h = 640, 400
    img = Image.new("RGB", (w, h), (245, 246, 247))
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, h * 0.55, w, h), fill=(220, 228, 240))
    draw.rectangle((80, 80, 360, 280), fill=(200, 210, 225), outline=(160, 170, 190), width=3)
    draw.rectangle((120, 140, 320, 220), fill=(180, 200, 230))
    draw.text((90, 300), "辙见示范店（示意门头）", fill=(80, 90, 110))
    img.save(path, format="JPEG", quality=88)


def save_geo_thumb(path: Path, hue: int):
    w, h = 520, 280
    img = Image.new("RGB", (w, h), (hue, hue + 20, 255))
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, w, h), fill=(230, 244, 255))
    draw.ellipse((40, 60, 200, 200), fill=(22, 119, 255, 30))
    draw.text((24, 220), "本地专题参考", fill=(22, 119, 255))
    img.save(path, format="JPEG", quality=85)


def main():
    entries_dir = ROOT / "assets" / "home" / "entries"
    home_dir = ROOT / "assets" / "home"
    tab_dir = ROOT / "assets" / "tab"
    ensure_dir(entries_dir)

    for name, fn in ENTRY_ICONS.items():
        save_icon(entries_dir / f"{name}.png", 128, fn)

    save_store_cover(home_dir / "store-cover-demo.jpg")

    thumbs = {
        "geo_brake_hz": 200,
        "geo_spray_hz": 220,
        "geo_accident_hz": 180,
    }
    for gid, hue in thumbs.items():
        save_geo_thumb(home_dir / f"{gid}-thumb.jpg", hue)

    # Tab 图标由设计/品牌维护，脚本不覆盖 assets/tab/*.png

    print("[generate-r10-assets] done (tab icons skipped)")


if __name__ == "__main__":
    main()
