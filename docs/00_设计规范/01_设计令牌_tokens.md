```
# 辙见平台 · 设计令牌 Tokens

> 源码副本：`styles/tokens.wxss`  
> 已在 `app.wxss` 全局引入。  
> 修改时请同步维护本文档与 `styles/tokens.wxss`。  
> 设计规范详见：`docs/00_设计规范/00_辙见平台设计体系.md`

---

## 1. 使用原则

所有页面、组件、业务模块样式应优先使用本文件定义的设计令牌。

### 1.1 基本要求

- 颜色必须优先使用 `--color-*` 或 `--tag-*`。
- 字号必须优先使用 `--font-*`。
- 间距必须优先使用 `--space-*`。
- 圆角必须优先使用 `--radius-*`。
- 阴影必须优先使用 `--shadow-*`。
- 固定层级必须优先使用 `--z-*`。
- 组件高度必须优先使用组件尺寸 token。
- 不允许在页面 WXSS 中散落硬编码色值。

### 1.2 允许的例外

以下值可以在局部场景中直接使用：

```css
#fff
#ffffff
transparent
currentColor
inherit

```

除此之外，如确实需要新增颜色、间距、圆角或阴影，应先补充 token，再在页面或组件中引用。

---

## **2. Token 源码**

以下内容应与 `styles/tokens.wxss` 保持一致。

```
/**
 * 辙见平台 · 设计令牌
 * 源码副本：styles/tokens.wxss
 * 已在 app.wxss 全局引入
 *
 * 修改时请同步：
 * 1. docs/00_设计规范/01_设计令牌_tokens.md
 * 2. styles/tokens.wxss
 *
 * 设计规范详见：
 * docs/00_设计规范/00_辙见平台设计体系.md
 */

page {
  /**
   * 品牌色
   * 用于主按钮、链接、选中态、关键入口。
   */
  --color-primary: #1677ff;
  --color-primary-light: #e8f3ff;
  --color-primary-dark: #0958d9;

  /**
   * 中性色
   * 用于文字、边框、背景、弱提示。
   */
  --color-text-primary: #1f2329;
  --color-text-secondary: #646a73;
  --color-text-tertiary: #8f959e;
  --color-text-disabled: #c9cdd4;
  --color-text-inverse: #ffffff;

  --color-border: #e5e6eb;
  --color-border-strong: #d1d5db;

  --color-bg-page: #f5f6f7;
  --color-bg-card: #ffffff;
  --color-bg-muted: #f7f8fa;
  --color-bg-active: #f2f3f5;

  /**
   * 工具相册域（卷七 UI-ALB · UI-ALB-G 清档案配色 2026-06-24）
   */
  --color-bg-album: #f8fafc;
  --color-bg-band: #f0f4fa;
  --color-album-active: #1677ff;
  --color-album-active-light: #e8f3ff;
  --color-album-frame: #eef2f8;
  --color-album-frame-line: #e5eaf0;
  --color-album-frame-corner: #1677ff;
  --color-album-frame-inner: #ffffff;
  --color-nav-icon-well: #f2f3f5;
  --color-album-toolbar-bg: rgba(248, 250, 252, 0.92);
  --color-album-caption-bar: rgba(255, 255, 255, 0.96);

  /**
   * 功能色
   * 全站功能主语义控制在 success / warning / danger / info 四类。
   */
  --color-success: #00b42a;
  --color-success-light: #e8ffea;

  --color-warning: #ff7d00;
  --color-warning-light: #fff7e8;

  --color-danger: #f53f3f;
  --color-danger-light: #fff1f0;

  --color-info: #14c9c9;
  --color-info-light: #e8fffb;

  /**
   * 标签业务色
   * 用于案例来源、脱敏、审核、到店检测、复杂度等业务标签。
   */
  --tag-order-fg: #0958d9;
  --tag-order-bg: #e8f3ff;

  --tag-history-fg: #646a73;
  --tag-history-bg: #f2f3f5;

  --tag-desensitized-fg: #0e7b8b;
  --tag-desensitized-bg: #e8fffb;

  --tag-audited-fg: #00b42a;
  --tag-audited-bg: #e8ffea;

  --tag-onsite-fg: #ff7d00;
  --tag-onsite-bg: #fff7e8;

  --tag-reference-fg: #ff7d00;
  --tag-reference-bg: #fff7e8;

  --tag-complex-fg: #722ed1;
  --tag-complex-bg: #f9f0ff;

  --tag-accident-fg: #722ed1;
  --tag-accident-bg: #f9f0ff;

  /**
   * 字体字号
   * 微信小程序以 rpx 为基准，设计稿宽度 750rpx。
   */
  --font-h1: 40rpx;
  --font-h1-lh: 56rpx;

  --font-h2: 34rpx;
  --font-h2-lh: 48rpx;

  --font-h3: 30rpx;
  --font-h3-lh: 42rpx;

  --font-body: 28rpx;
  --font-body-lh: 40rpx;

  --font-caption: 24rpx;
  --font-caption-lh: 34rpx;

  --font-price: 36rpx;
  --font-price-lh: 44rpx;

  --font-price-sm: 28rpx;
  --font-price-sm-lh: 36rpx;

  /**
   * 字重
   */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  /**
   * 间距
   */
  --space-xs: 8rpx;
  --space-star-gap: 2rpx;
  --space-sm: 16rpx;
  --space-md: 24rpx;
  --space-lg: 32rpx;
  --space-xl: 48rpx;

  /**
   * 页面安全边距
   */
  --page-padding-x: 32rpx;

  /**
   * 圆角
   */
  --radius-sm: 8rpx;
  --radius-md: 16rpx;
  --radius-lg: 24rpx;
  --radius-full: 999rpx;

  /**
   * 阴影
   */
  --shadow-card: 0 4rpx 24rpx rgba(0, 0, 0, 0.06);
  --shadow-card-soft: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
  --shadow-popup: 0 8rpx 40rpx rgba(0, 0, 0, 0.12);
  --shadow-album-frame: 0 8rpx 32rpx rgba(22, 45, 90, 0.1),
    0 2rpx 8rpx rgba(22, 45, 90, 0.05);
  --shadow-album-list-thumb: 0 2rpx 12rpx rgba(22, 45, 90, 0.06);
  --shadow-album-compare-handle: 0 0 8rpx rgba(0, 0, 0, 0.35);

  /**
   * 层级
   */
  --z-content: 10;
  --z-fixed: 100;
  --z-popup: 500;
  --z-toast: 1000;

  /**
   * 透明度
   */
  --opacity-disabled: 0.4;
  --opacity-muted: 0.6;

  /**
   * 遮罩
   */
  --color-mask: rgba(0, 0, 0, 0.45);

  /**
   * 组件尺寸
   */
  --button-height: 88rpx;
  --button-height-sm: 64rpx;
  --page-fixed-clearance: calc(
    var(--button-height) + var(--space-md) * 2 + env(safe-area-inset-bottom)
  );
  --fixed-bottom-bar-height: calc(
    var(--button-height) + var(--space-sm) * 2 + env(safe-area-inset-bottom)
  );

  --tag-height: 40rpx;

  --tool-band-height: 88rpx;
  --size-nav-icon-well: 64rpx;
  --size-nav-icon: 40rpx;
  --size-album-cover: 128rpx;
  --size-album-list-thumb: 176rpx;
  --size-album-list-card-min-height: 220rpx;
  --size-album-frame-border: 24rpx;
  --size-album-frame-corner: 32rpx;
  --size-album-frame-topbar: 64rpx;
  --size-album-caption-bar: 72rpx;
  --size-album-immersive-nav: 88rpx;
  --size-album-toolbar-height: 80rpx;
  --size-album-compare-stage: 960rpx;
  --size-album-page-footer-min: 120rpx;
  --font-album-display: 26rpx;
  --font-album-display-lh: 36rpx;
  --font-album-frame-page: 24rpx;
  --font-album-frame-page-lh: 34rpx;
  --radius-album-frame-inner: 8rpx;
  --radius-album-list-thumb: var(--radius-md);
  --size-rating-star: 40rpx;
  --size-service-entry-icon: 88rpx;
  --size-service-entry-well: 108rpx;
  --size-service-entry-cell-min: 220rpx;
  --size-store-card-thumb: 128rpx;
  --size-geo-card-cover: 160rpx;
  --size-geo-card-width: 520rpx;
  --size-part-verify-thumb: 120rpx;
  --size-part-verify-quote-height: 120rpx;
  --size-flow-step: var(--tag-height);

  --tabbar-height: 100rpx;

  --input-height: 88rpx;

  --cell-height: 104rpx;

  /**
   * 图片比例辅助
   * 实际比例由组件内部控制。
   */
  --image-radius: var(--radius-md);
  --thumb-height-lg: 200rpx;

  /**
   * 全局页面默认样式
   */
  background-color: var(--color-bg-page);
  color: var(--color-text-primary);
  font-size: var(--font-body);
  line-height: var(--font-body-lh);
}

```

---

## 2.1.1 工具相册扩展 Token（UI-ALB-A-07 · UI-ALB-G 清档案 2026-06-24）

> 真源：`11_工具相册UI线框.md` §2.2 / §2.5 · 设计体系 §10.1.1  
> 用途：相框翻页详情、加高列表卡、沉浸导航、节点底栏、页脚。  
> **配色定调（UI-ALB-G）**：**清档案 Fresh Folio** — 冷白底 + 淡蓝空气感 + 主色蓝角饰；**禁止**回退暖褐 sepia（`#e8e4df` / `#c4beb6` 旧值已废弃）。

| Token | 值 / 引用 | 用途 |
| --- | --- | --- |
| `--color-bg-album` | `#f8fafc` | 工具页页面底（冷白） |
| `--color-album-frame` | `#eef2f8` | 相框外 mat / folio 辅色 |
| `--color-album-frame-line` | `#e5eaf0` | 相框描边、panel 分割线 |
| `--color-album-frame-corner` | `#1677ff` | 相框 L 形角饰（主色蓝） |
| `--color-album-frame-inner` | `#ffffff` | 相框内衬 / panel 白底 |
| `--color-nav-icon-well` | `#f2f3f5` | 我的/设置菜单图标底块 |
| `--color-album-toolbar-bg` | `rgba(248,250,252,0.92)` | 节点 Tab 底栏半透明底 |
| `--color-album-caption-bar` | `rgba(255,255,255,0.96)` | 框内短文案条底 |
| `--color-album-immersive-caption-bg` | `rgba(22,20,18,0.88)` | 沉浸大图门店说明底条（高对比） |
| `--color-bg-immersive` | `#000` | 沉浸翻页全屏底 |
| `--color-album-immersive-border` | `rgba(255,255,255,0.14)` | 沉浸面板描边 |
| `--color-album-immersive-note` | `rgba(255,255,255,0.88)` | 沉浸说明正文 |
| `--color-album-progress-track` | `rgba(255,255,255,0.18)` | 沉浸顶栏细进度轨 |
| `--color-album-segment-idle` / `--filled` | `rgba(255,255,255,0.28/0.55)` | 六段进度条 |
| `--color-album-overlay-chip` | `rgba(255,255,255,0.9)` | overlay 节点 chip 底 |
| `--color-album-nav-fade-strong` / `--weak` | `rgba(0,0,0,0.42/0.08)` | 沉浸导航渐变 |
| `--color-album-nav-back` / `--back-pressed` | `rgba(0,0,0,0.28/0.42)` | 沉浸返回按钮底 |
| `--shadow-album-immersive-panel` | `0 8rpx 28rpx rgba(0,0,0,0.28)` | 沉浸说明面板阴影 |
| `--shadow-album-overlay-chip` | `0 4rpx 20rpx rgba(0,0,0,0.14)` | overlay chip 阴影 |
| `--shadow-album-segment-active` | `0 0 12rpx rgba(22,119,255,0.45)` | 当前阶段进度光晕 |
| `--shadow-album-compare-handle` | `0 0 8rpx rgba(0,0,0,0.35)` | 前后对比滑块中线/手柄阴影 |
| `--color-album-end-finish` | `#94bfff` | 尾页「本册已阅」装饰线（淡蓝，非褐灰） |
| `--shadow-album-frame` | 双层冷色阴影 `rgba(22,45,90,…)` | 详情全屏相框立体感 |
| `--shadow-album-list-thumb` | 轻冷色阴影 | 列表缩略图 / raised 卡轻相框感 |
| `--size-album-list-thumb` | `176rpx` | 列表卡左缩略图边长（160～200 取中） |
| `--size-album-list-card-min-height` | `220rpx` | 加高列表卡内容区最小高度 |
| `--size-album-frame-border` | `24rpx` | 相框 mat 边宽 |
| `--size-album-frame-corner` | `32rpx` | 角饰 L 形臂长 |
| `--size-album-frame-topbar` | `64rpx` | 框内顶栏（页码 + 信息） |
| `--size-album-caption-bar` | `72rpx` | 框内底短文案条高度 |
| `--size-album-immersive-nav` | `88rpx` | 沉浸导航内容区（不含 statusBar） |
| `--size-album-toolbar-height` | `80rpx` | 节点 Tab 底栏 |
| `--size-album-compare-stage` | `960rpx` | 前后对比滑块可视区高度 |
| `--size-album-page-footer-min` | `120rpx` | 页脚（联系门店 + 合规）最小高度 |
| `--font-album-frame-page` | `24rpx` | 框内页码字号 |
| `--radius-album-frame-inner` | `8rpx` | 框内大图圆角 |
| `--radius-album-list-thumb` | `var(--radius-md)` | 列表缩略图圆角 |

**工具类（B-01）**：`.bg-album` · `.bg-band` · `.text-album-display` · `.text-album-archival-date` · `.text-album-frame-page`（见 `tokens.wxss`）

**工具页表面（UI-SURFACE · 2026-06-24）**：同一屏最多一张主 panel；内嵌卡片用 `--color-album-frame-inner` + `--shadow-album-list-thumb`，禁止叠多层 `#fff` + `--shadow-card`。

| 工具类 | 用途 |
| --- | --- |
| `.surface-album-panel` | 工具页主内容区（我的/工作台单卡） |
| `.surface-album-catalog` | 相册列表档案目录 folio 壳（淡蓝渐变 + 目录阴影） |
| `.surface-album-folio` | 扉页淡蓝空气感渐变（白 → `--color-album-active-light` → 白） |
| `.surface-album-well` | Dock / 快捷入口冷灰蓝 icon 底 |
| `.surface-album-inset-divider` | panel 内分区线 |
| `.nav-icon-tone-album` | Dock 彩色 PNG 冷灰统一（过渡；终态为单色线稿资源） |
| `.surface-record-card` | 授权/消息/线索列表卡纸感壳 |
| `.surface-album-metric-grid` / `.surface-album-metric-cell` | 工具页 KPI 内嵌格（无彩色底） |

---

## **3. 常用工具类**

以下工具类可以放在 `styles/tokens.wxss` 中，供全局复用。

```
/**
 * 文本颜色
 */

.text-primary {
  color: var(--color-text-primary);
}

.text-secondary {
  color: var(--color-text-secondary);
}

.text-tertiary {
  color: var(--color-text-tertiary);
}

.text-disabled {
  color: var(--color-text-disabled);
}

.text-inverse {
  color: var(--color-text-inverse);
}

.text-success {
  color: var(--color-success);
}

.text-warning {
  color: var(--color-warning);
}

.text-danger {
  color: var(--color-danger);
}

.text-info {
  color: var(--color-info);
}

.text-link {
  color: var(--color-primary);
}

/**
 * 字号层级
 */

.text-h1 {
  font-size: var(--font-h1);
  line-height: var(--font-h1-lh);
  font-weight: var(--font-weight-semibold);
}

.text-h2 {
  font-size: var(--font-h2);
  line-height: var(--font-h2-lh);
  font-weight: var(--font-weight-semibold);
}

.text-h3 {
  font-size: var(--font-h3);
  line-height: var(--font-h3-lh);
  font-weight: var(--font-weight-medium);
}

.text-body {
  font-size: var(--font-body);
  line-height: var(--font-body-lh);
  font-weight: var(--font-weight-regular);
}

.text-caption {
  font-size: var(--font-caption);
  line-height: var(--font-caption-lh);
  color: var(--color-text-secondary);
}

.text-price {
  font-size: var(--font-price);
  line-height: var(--font-price-lh);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.text-price-sm {
  font-size: var(--font-price-sm);
  line-height: var(--font-price-sm-lh);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

/**
 * 数字对齐
 * 用于价格、里程、评分、订单金额等。
 */

.text-numeric {
  font-variant-numeric: tabular-nums;
}

/**
 * 页面容器
 */

.page {
  min-height: 100vh;
  background-color: var(--color-bg-page);
  color: var(--color-text-primary);
  font-size: var(--font-body);
  line-height: var(--font-body-lh);
}

.page-content {
  padding-left: var(--page-padding-x);
  padding-right: var(--page-padding-x);
}

/**
 * 卡片
 */

.card {
  background-color: var(--color-bg-card);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}

.card--bordered {
  border: 1rpx solid var(--color-border);
}

.card--shadow {
  box-shadow: var(--shadow-card);
}

/**
 * 信息条
 */

.notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  font-size: var(--font-caption);
  line-height: var(--font-caption-lh);
  color: var(--color-text-secondary);
  background-color: var(--color-bg-muted);
}

.notice--primary {
  color: var(--color-primary-dark);
  background-color: var(--color-primary-light);
}

.notice--success {
  color: var(--color-success);
  background-color: var(--color-success-light);
}

.notice--warning {
  color: var(--color-warning);
  background-color: var(--color-warning-light);
}

.notice--danger {
  color: var(--color-danger);
  background-color: var(--color-danger-light);
}

.notice--info {
  color: var(--color-info);
  background-color: var(--color-info-light);
}

/**
 * 标签基础样式
 * 业务组件 Tag 应优先复用这些 token。
 */

.tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--tag-height);
  padding: 0 var(--space-sm);
  border-radius: var(--radius-sm);
  font-size: var(--font-caption);
  line-height: var(--font-caption-lh);
  white-space: nowrap;
}

.tag--order {
  color: var(--tag-order-fg);
  background-color: var(--tag-order-bg);
}

.tag--history {
  color: var(--tag-history-fg);
  background-color: var(--tag-history-bg);
}

.tag--desensitized {
  color: var(--tag-desensitized-fg);
  background-color: var(--tag-desensitized-bg);
}

.tag--audited {
  color: var(--tag-audited-fg);
  background-color: var(--tag-audited-bg);
}

.tag--onsite {
  color: var(--tag-onsite-fg);
  background-color: var(--tag-onsite-bg);
}

.tag--reference {
  color: var(--tag-reference-fg);
  background-color: var(--tag-reference-bg);
}

.tag--complex {
  color: var(--tag-complex-fg);
  background-color: var(--tag-complex-bg);
}

.tag--accident {
  color: var(--tag-accident-fg);
  background-color: var(--tag-accident-bg);
}

.tag--success {
  color: var(--color-success);
  background-color: var(--color-success-light);
}

.tag--warning {
  color: var(--color-warning);
  background-color: var(--color-warning-light);
}

.tag--danger {
  color: var(--color-danger);
  background-color: var(--color-danger-light);
}

.tag--info {
  color: var(--color-info);
  background-color: var(--color-info-light);
}

/**
 * 按钮基础样式
 * 页面不应直接复制按钮样式，优先使用 Button 组件。
 * 这里保留基础类，供 Button 组件内部复用。
 */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--button-height);
  padding: 0 var(--space-lg);
  border-radius: var(--radius-md);
  font-size: var(--font-body);
  line-height: var(--font-body-lh);
  font-weight: var(--font-weight-medium);
  box-sizing: border-box;
}

.btn--sm {
  height: var(--button-height-sm);
  padding: 0 var(--space-md);
  font-size: var(--font-caption);
  line-height: var(--font-caption-lh);
}

.btn--primary {
  color: var(--color-text-inverse);
  background-color: var(--color-primary);
}

.btn--secondary {
  color: var(--color-primary);
  background-color: var(--color-primary-light);
}

.btn--ghost {
  color: var(--color-text-primary);
  background-color: transparent;
}

.btn--danger {
  color: var(--color-text-inverse);
  background-color: var(--color-danger);
}

.btn--disabled,
.is-disabled {
  opacity: var(--opacity-disabled);
  pointer-events: none;
}

/**
 * 表单基础样式
 */

.input {
  min-height: var(--input-height);
  padding: 0 var(--space-md);
  border-radius: var(--radius-md);
  border: 1rpx solid var(--color-border);
  background-color: var(--color-bg-card);
  color: var(--color-text-primary);
  font-size: var(--font-body);
  line-height: var(--font-body-lh);
  box-sizing: border-box;
}

.input--disabled {
  color: var(--color-text-disabled);
  background-color: var(--color-bg-muted);
}

.input-placeholder {
  color: var(--color-text-tertiary);
}

/**
 * 列表 Cell
 */

.cell {
  min-height: var(--cell-height);
  padding: 0 var(--space-md);
  background-color: var(--color-bg-card);
  border-bottom: 1rpx solid var(--color-border);
  box-sizing: border-box;
}

.cell--active {
  background-color: var(--color-bg-active);
}

/**
 * 分割线
 */

.divider {
  height: 1rpx;
  background-color: var(--color-border);
}

/**
 * 文本省略
 */

.ellipsis {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ellipsis-2 {
  display: -webkit-box;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.ellipsis-3 {
  display: -webkit-box;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

/**
 * 图片占位
 */

.image-placeholder {
  background-color: var(--color-bg-muted);
  border-radius: var(--image-radius);
}

/**
 * 通用布局
 */

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.bullet-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.bullet-list__item {
  color: var(--color-text-secondary);
  font-size: var(--font-caption);
  line-height: var(--font-caption-lh);
}

/**
 * 安全区
 */

.safe-bottom {
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}

.fixed-bottom {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-fixed);
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
  background-color: var(--color-bg-card);
}

/**
 * 骨架屏基础色
 */

.skeleton-block {
  background: linear-gradient(
    90deg,
    var(--color-bg-muted) 25%,
    #eef0f3 37%,
    var(--color-bg-muted) 63%
  );
  background-size: 400% 100%;
  border-radius: var(--radius-sm);
}

/**
 * 遮罩
 */

.mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: var(--z-popup);
  background-color: var(--color-mask);
}

/**
 * 弹层
 */

.popup {
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-popup);
  z-index: var(--z-popup);
}

/**
 * 辙见业务专用块
 */

.ai-summary-block {
  padding: var(--space-md);
  border-radius: var(--radius-md);
  border-left: 4rpx solid var(--color-info);
  background-color: var(--color-bg-muted);
  color: var(--color-text-secondary);
  font-size: var(--font-caption);
  line-height: var(--font-caption-lh);
}

.privacy-banner {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  color: var(--color-info);
  background-color: var(--color-info-light);
  font-size: var(--font-caption);
  line-height: var(--font-caption-lh);
}

.compliance-notice {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  color: var(--color-warning);
  background-color: var(--color-warning-light);
  font-size: var(--font-caption);
  line-height: var(--font-caption-lh);
}

.compliance-notice--prewrap {
  white-space: pre-wrap;
  line-height: 1.6;
  color: var(--color-text-primary);
}

.note-block {
  display: block;
  margin-top: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-muted);
  color: var(--color-text-secondary);
}

```

---

## **4. 业务语义映射**

### **4.1 价格展示**


| 价格模式      | 推荐 Token / Class                      | 说明              |
| --------- | ------------------------------------- | --------------- |
| 一口价 / 套餐价 | `text-price` / `text-price-sm`        | 可展示明确金额；无参考价类提示 |
| 到店检测后确定   | `tag--onsite`                         | 参考价选填；不填则不展示金额  |


### **4.2 案例来源标签**


| 场景        | Class                   |
| --------- | ----------------------- |
| 用户授权案例    | `tag tag--order`（类名遗留，语义为用户授权） |
| 商家历史案例    | `tag tag--history`      |
| 已脱敏       | `tag tag--desensitized` |
| 已审核       | `tag tag--audited`      |
| 价格仅供参考    | `tag tag--reference`    |
| 到店检测后确认   | `tag tag--onsite`       |
| 事故车维修     | `tag tag--accident`     |
| 复杂度 L3/L4 | `tag tag--complex`      |


### **4.3 咨询线索 / 相册状态**（V2.0；无订单/支付状态 token）


| 状态组          | 推荐颜色              |
| ------------ | ----------------- |
| 待处理          | `--color-warning` |
| 进行中          | `--color-primary` |
| 已完成          | `--color-success` |
| 异常 / 已关闭 / 驳回 | `--color-danger`  |


---

## **2.2 H5 公开内容站令牌（`h5/shared/tokens.css`）**

> 设计细则：**§10.8** · 与小程序语义对齐，单位为 **px**。修改时同步 `h5/shared/tokens.css` 与本文档。

| Token | 值 | 用途 |
| --- | --- | --- |
| `--color-bg-surface` | `#ffffff` | 输入框、搜索框表面 |
| `--color-danger` | `#f53f3f` | 表单错误 |
| `--color-danger-light` | `#fff1f0` | 错误浅底 |
| `--color-mask` | `rgba(0,0,0,0.45)` | 咨询 sheet 遮罩 |
| `--line-height-body` | `1.6` | 正文默认 |
| `--line-height-article` | `1.7` | 文章/免责/合规 |
| `--size-h5-process-img-min` | `240px` | 过程图最小高度 |
| `--size-h5-process-img` | `280px` | 过程图典型高度 |
| `--size-h5-list-thumb` | `80px` | 列表封面缩略图 |
| `--size-h5-footer-spacer` | `88px` | 固定底栏正文留白 |
| `--radius-full` | `999px` | 搜索 chip |
| `--z-h5-footer` | `100` | 固定底栏 |
| `--z-h5-sheet` | `1000` | 咨询 sheet |

**CSS 引用顺序**：`tokens.css` → `base-page.css` → 页专属 CSS。

---

## **5. Cursor / AI 使用约束**

使用 Cursor 或其他 AI 工具开发 UI 时，必须遵守以下规则：

1. 新增页面前先阅读本文件和整体设计体系。
2. 页面 WXSS 中不得随意新增硬编码颜色。
3. 卡片、按钮、标签、价格、状态等高频样式必须优先复用组件或工具类。
4. 若现有 token 不满足需求，先说明新增 token 的语义，再补充到本文件和 `styles/tokens.wxss`。
5. 不允许为了单个页面引入新的视觉体系。
6. 不允许使用促销红、大面积强刺激颜色、金币红包类视觉样式。
7. 固定底栏必须使用 safe-area 适配。
8. 首屏加载应使用 Skeleton。
9. 空状态、错误状态、隐私提示、合规提示必须使用统一语义样式。
10. H5 端使用 **`h5/shared/tokens.css`** + **`base-page.css`**（§2.2、设计体系 §10.8），不直接复制 rpx。

