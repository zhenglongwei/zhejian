# 服务宫格图标 · 设计师源文件

| 文件 | 说明 |
| --- | --- |
| `entry_*.svg` | 矢量源稿（可在 Figma / AI 中打开编辑） |
| `../entries/*.png` | 小程序实际引用（@2x PNG，透明底） |

**完整规范**：[`docs/00_设计规范/03_首页服务宫格图标规范.md`](../../../docs/00_设计规范/03_首页服务宫格图标规范.md)

**导出 PNG**：

```bash
pip install cairosvg
python scripts/export-home-entry-icons.py
```

交付时请将定制后的 SVG 覆盖本目录，再运行导出脚本或从 Figma 导出至 `../entries/`。
