# 服务宫格图标 · 设计师源文件

| 文件 | 说明 |
| --- | --- |
| `entry_*.svg` | 矢量源稿（可在 Figma / AI 中打开编辑） |
| `../entries/*.png` | 小程序实际引用（@2x PNG，透明底） |

**完整规范**：[`docs/00_设计规范/03_首页服务宫格图标规范.md`](../../../docs/00_设计规范/03_首页服务宫格图标规范.md)

---

## 方式 A · 命令行导出（项目根目录）

```powershell
cd C:\Users\longwei\WeChatProjects\zhejian
python scripts/export-home-entry-icons.py
```

- **macOS / Linux**：若已 `pip install cairosvg` 且系统有 Cairo，走 Python 导出。
- **Windows**：若报 `Cairo 不可用` / `libcairo-2.dll`，脚本会**自动**改用 Node（需已安装 [Node.js](https://nodejs.org/) LTS）。首次会在 `scripts/` 下执行 `npm install`。

也可手动（与自动逻辑相同）：

```powershell
cd C:\Users\longwei\WeChatProjects\zhejian\scripts
npm install
node export-home-entry-icons.mjs
```

成功输出目录：`assets/home/entries/`（6 个 `entry_*.png`）。

> 不建议在 Windows 上单独 `pip install cairosvg` 除非你还安装了 GTK/Cairo 运行库；用上面 Python 一键脚本或 Node 即可。

---

## 方式 B · Figma 手动导出

1. Import 本目录 `entry_*.svg`
2. 画板 96×96，Export PNG **@2x**（192×192）
3. 保存到 `assets/home/entries/`，文件名不变

---

## 交付检查

- [ ] `assets/home/entries/` 下 6 个 PNG，透明底
- [ ] 微信开发者工具重新编译，预览首页「核心服务」
