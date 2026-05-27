# 首页视觉资源（R10）

| 目录/文件 | 说明 |
| --- | --- |
| `entries-src/*.svg` | **设计师源稿**（定制起点，见下方规范） |
| `entries/*.png` | 小程序引用的宫格图标（@2x 透明 PNG） |
| `store-cover-demo.jpg` | 示范店门头示意（mock/seed） |
| `geo_*-thumb.jpg` | GEO 专题缩略示意 |

## 设计师定制图标

**规范文档**：[`docs/00_设计规范/03_首页服务宫格图标规范.md`](../../docs/00_设计规范/03_首页服务宫格图标规范.md)

**流程**：

1. 在 Figma/AI 中基于 `entries-src/entry_*.svg` 改稿  
2. 覆盖 `entries-src/` 中的 SVG  
3. 导出 PNG：`python scripts/export-home-entry-icons.py`（需 `pip install cairosvg`）  
4. 或从设计工具直接导出至 `entries/`，文件名保持 `entry_*.png`

**勿用** `generate-r10-assets.py` 覆盖设计师稿；该脚本仅用于占位/缩略图。
