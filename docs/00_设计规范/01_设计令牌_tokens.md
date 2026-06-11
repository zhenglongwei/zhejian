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
   * 工具相册域（卷七 UI-ALB）
   */
  --color-bg-album: #f7f5f2;
  --color-bg-band: #f0f4fa;
  --color-album-active: #1677ff;
  --color-album-active-light: #e8f3ff;
  --color-album-frame: #e8e4df;
  --color-album-frame-line: #d9d4cd;
  --color-album-frame-corner: #c4beb6;
  --color-album-frame-inner: #faf9f7;
  --color-nav-icon-well: #f2f3f5;
  --color-album-toolbar-bg: rgba(247, 245, 242, 0.92);
  --color-album-caption-bar: rgba(250, 249, 247, 0.96);

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
  --shadow-album-frame: 0 8rpx 32rpx rgba(60, 50, 40, 0.12),
    0 2rpx 8rpx rgba(60, 50, 40, 0.06);
  --shadow-album-list-thumb: 0 2rpx 12rpx rgba(60, 50, 40, 0.08);

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

## 2.1.1 工具相册扩展 Token（UI-ALB-A-07）

> 真源：`11_工具相册UI线框.md` §2.2 / §3 · 设计体系 §10.1.1  
> 用途：相框翻页详情、加高列表卡、沉浸导航、节点底栏、页脚。

| Token | 值 / 引用 | 用途 |
| --- | --- | --- |
| `--color-album-frame-corner` | `#c4beb6` | 相框 L 形角饰 |
| `--color-album-frame-inner` | `#faf9f7` | 相框内衬 / 尾页暖底 |
| `--color-nav-icon-well` | `#f2f3f5` | 我的/设置菜单图标底块 |
| `--color-album-toolbar-bg` | `rgba(247,245,242,0.92)` | 节点 Tab 底栏半透明底 |
| `--color-album-caption-bar` | `rgba(250,249,247,0.96)` | 框内短文案条底 |
| `--shadow-album-frame` | 双层暖色阴影 | 详情全屏相框立体感 |
| `--shadow-album-list-thumb` | 轻阴影 | 列表缩略图轻相框感 |
| `--size-album-list-thumb` | `176rpx` | 列表卡左缩略图边长（160～200 取中） |
| `--size-album-list-card-min-height` | `220rpx` | 加高列表卡内容区最小高度 |
| `--size-album-frame-border` | `24rpx` | 相框 mat 边宽 |
| `--size-album-frame-corner` | `32rpx` | 角饰 L 形臂长 |
| `--size-album-frame-topbar` | `64rpx` | 框内顶栏（页码 + 信息） |
| `--size-album-caption-bar` | `72rpx` | 框内底短文案条高度 |
| `--size-album-immersive-nav` | `88rpx` | 沉浸导航内容区（不含 statusBar） |
| `--size-album-toolbar-height` | `80rpx` | 节点 Tab 底栏 |
| `--size-album-page-footer-min` | `120rpx` | 页脚（联系门店 + 合规）最小高度 |
| `--font-album-frame-page` | `24rpx` | 框内页码字号 |
| `--radius-album-frame-inner` | `8rpx` | 框内大图圆角 |
| `--radius-album-list-thumb` | `var(--radius-md)` | 列表缩略图圆角 |

**工具类（B-01）**：`.bg-album` · `.bg-band` · `.text-album-display` · `.text-album-frame-page`（见 `tokens.wxss`）

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
| 一口价 / 套餐价 | `text-price` / `text-price-sm`        | 可展示明确金额         |
| 参考区间      | `tag--reference` / `notice--warning`  | 必须提示实际费用以门店检测为准 |
| 到店检测      | `tag--onsite` / `notice--warning`     | 不展示确定金额         |
| 事故车维修     | `tag--accident` / `compliance-notice` | 禁止线上报价暗示        |


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
10. H5 端如需复用本设计体系，应建立对应 px/rem 版本，不直接复制 rpx 文件。

