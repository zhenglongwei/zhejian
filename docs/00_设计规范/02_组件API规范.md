# 组件 API 规范

> 与 `00_辙见平台设计体系.md`、`01_设计令牌_tokens.md` 配套使用。  
> 实现组件前请配合 `docs/99_AI技能库/skill_component_api_implementation.md`。

---

## 1. 通用约定

| 项 | 规范 |
|---|---|
| 目录 | `components/<kebab-case>/` |
| 文件 | `index.json` `index.wxml` `index.wxss` `index.ts`（或 `.js`） |
| 样式 | 仅用 `styles/tokens.wxss` 变量与工具类 |
| 类名 | BEM：`block__element--modifier` |
| 状态 | 需考虑 `loading` `disabled` `empty` `error`（按组件适用） |

### 1.1 事件命名

- 用户操作：`bind:tap` → 组件 `triggerEvent('tap')` 或语义名 `change` `submit` `retry`
- 使用小写驼峰：`bind:change` → `onChange`

### 1.2 属性命名

- 小程序 properties 使用 camelCase
- 枚举用 `String`，在文档中列出可选值

---

## 2. 基础组件

### 2.1 Button（`components/button`）

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| type | String | primary | primary / secondary / ghost / danger |
| size | String | default | default / sm |
| disabled | Boolean | false | |
| loading | Boolean | false | |

| 事件 | 说明 |
|---|---|
| tap | 点击（disabled/loading 时不触发） |

样式类：`.btn` `.btn--primary` 等（见 tokens）。

---

### 2.1.1 ToolPageShell（`components/tool-page-shell` · 卷七 UI-ALB）

用户端 **工具域** 页面壳：页顶 band + 内容区 + 合规页脚位。用于 `pages/mine`、`pages/album/list`、`pages/mine/settings`、`pages/mine/help` 等。**相册详情**使用 `ToolImmersiveNav`，**不用**本壳。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| title | String | `服务相册` | band 主标题 |
| subtitle | String | `门店维修记录` | band 副标题（可选） |
| showBand | Boolean | true | 是否展示页顶 band |
| showCompliance | Boolean | true | 是否展示页脚 ComplianceNotice |
| complianceText | String | — | 覆盖默认 `HOME_PLATFORM_IDENTITY` |

| Slot | 说明 |
|---|---|
| default | 主内容（`page-content` 内） |
| bandExtra | band 右侧弱操作（可选） |

页面 `page` 背景使用 `--color-bg-album`；band 使用 `--color-bg-band` + `--tool-band-height`。

---

### 2.2 Tag（`components/tag`）

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| variant | String | default | order / history / desensitized / audited / onsite / reference / complex / accident / success / warning / danger / info |
| text | String | — | 展示文案，须符合设计体系标准标签表 |

---

### 2.3 Card / Empty / Skeleton

- **Card**：默认 slot；修饰 `bordered` `shadow`
- **Empty**：`image` `title` `description`；事件 `action`（主按钮）
- **Skeleton**：`rows` `avatar` `title`；无业务文案

### 2.4 Cell（`components/cell`）

列表行：标题、副标题、图标、角标/红点、右箭头；用于我的页菜单、设置页等。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| title | String | `''` | 主标题 |
| desc | String | `''` | 副标题 |
| icon | String | `''` | 左侧线型图标路径（`assets/nav/`） |
| iconBg | String | `primary-light` | 图标底块背景语义：`primary-light` / `success-light` 等 → `--color-*-light` |
| badge | String | `''` | 数字角标（如待办计数），空则不展示 |
| dot | Boolean | false | 红点（与 badge 互斥展示，优先 dot） |
| arrow | Boolean | true | 是否展示右箭头 |
| border | Boolean | true | 是否展示底部分割线 |
| disabled | Boolean | false | 禁用态 |

| 事件 | 说明 |
|---|---|
| tap | 点击行（disabled 时不触发） |

| Slot | 说明 |
|---|---|
| extra | 右侧自定义内容（在角标/箭头之后） |

### 2.5 Tabs（`components/tabs`）

| 属性 | 类型 | 说明 |
|---|---|---|
| tabs | Array | `{ key, label }[]`，`key` 勿用空字符串，可用 `all` 表示全部 |
| activeKey | String | 当前选中项 `key` |
| scrollable | Boolean | false；true 时单行横排并配合外层横向滚动（标签较多，如订单列表 7 Tab） |

| 事件 | 说明 |
|---|---|
| change | `{ key }` 切换 Tab |

### 2.6 DesensitizeWorkbench（`components/desensitize-workbench`）

> 规格见 `docs/04_维修过程相册/08_图片脱敏工具PRD.md`。商家端与用户端 **同一组件**，仅 `bizType` / 责任文案不同。

| 属性 | 类型 | 说明 |
|---|---|---|
| items | Array | 对比项 `{ id, nodeTitle, rawUrl, maskedUrl, statusLabel, tagVariant, showRetry }[]` |
| processedCount / totalCount / failedCount | Number | 进度 |
| liabilityText | String | 场景责任全文 |
| liabilityAccepted | Boolean | 是否已勾选 |

| 事件 | 说明 |
|---|---|
| liabilitychange | `{ accepted }` |
| preview | `{ id, url, type: 'raw' \| 'masked' }` |
| retry | `{ assetId }` |

页面层负责 `confirm` / 一键脱敏 API；组件仅展示与触发上述事件。

---

## 3. 业务组件

### 3.1 PriceDisplay（`components/price-display`）

| 属性 | 类型 | 说明 |
|---|---|---|
| mode | String | **fixed** 一口价/套餐 · **range** 参考区间 · **consult** 到店检测 · **accident** 事故车 |
| amount | Number | fixed 时展示金额（分或元，项目内统一） |
| minAmount | Number | range 下限 |
| maxAmount | Number | range 上限 |
| currency | String | 默认 ¥ |
| showDisclaimer | Boolean | range/consult/accident 默认 true |

**合规约束**

| mode | 是否展示确定金额 | 必须文案 |
|---|---|---|
| fixed | 是 | 可展示「起」 |
| range | 否（仅区间） | 实际费用以门店检测结果为准 |
| consult | 否 | 到店检测后报价 |
| accident | 否 | 不线上报价；预约到店检测 |

---

### 3.2 ComplianceNotice（`components/compliance-notice`）

| 属性 | 类型 | 说明 |
|---|---|---|
| type | String | 见下表；完整标准文案见设计体系 **§9.4.1** |
| text | String | 可选，覆盖内置文案（**须符合 §2.4**，PR 需说明理由） |

| type | 说明 |
|---|---|
| **displayDisclaimer** | 用户端详情页内容免责（商家编辑页勿用） |
| price / **casePrice** / **authorizedCaseFixed** / accident / history | 价格与案例价说明 |
| authorize / **reviewUpload** / **desensitize** / **desensitizeGuide** / **desensitizePreMaskReview** | 授权与脱敏 |
| **partRisk** / reward | 配件风险、活动奖励 |
| consult / consultRecord / consultPrivacy / consultImage | 用户咨询 |
| consultMerchant / consultImageMerchant | 商家线索 |

`platformDisplay` 已废弃，请用 `displayDisclaimer`。

内置文案模板，禁止营销化与中介平台表述（§9.1、§9.4.4）。

### 3.2.1 ReportTypePicker（`components/report-type-picker`）

| 属性 | 类型 | 说明 |
|---|---|---|
| options | Array | `{ value, label }[]`，见 `constants/report.js` |
| value | String | 当前选中举报类型 |

| 事件 | 说明 |
|---|---|
| change | `{ value }` |

### 3.3 PrivacyBanner（`components/privacy-banner`）

| 属性 | 类型 | 说明 |
|---|---|---|
| scene | String | 见设计体系 **§9.4.2** |

| scene | 说明 |
|---|---|
| album / albumMerchant | 服务相册隐私 |
| share / ownerShare / ownerShareOriginal / publicCaseShare | 分享场景 |
| authorize / **desensitize** / coldStartPublic | 授权与脱敏 |

默认文案见 §9.4.2；禁止在页面内联改写。

### 3.4 CaseCard / StoreCard / ServiceCard / OrderCard

列表卡片，字段见设计体系 §6.5–6.6；**CaseCard** 使用 `authorizationTier` 生成授权 Tag。  
**CaseCard**：可选 `tags` 覆盖默认标签行（商家相册列表按 `buildAlbumListTags`）。

#### StoreCard（`components/store-card`）

门店列表/详情卡片（设计体系 §6.6）。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| storeId | String | `''` | 门店 ID |
| coverImage | String | `''` | 门头/环境缩略图（已审核，可选） |
| name | String | `''` | 门店名称 |
| address | String | `''` | 地址 |
| businessHours | String | `''` | 营业时间（可选） |
| score | Number | — | 评分（可选） |
| caseCount | Number | — | 公开案例数（可选） |
| cardTags | Array | `[]` | `{ variant, text }[]`，≤3 |
| showLink | Boolean | false | 是否展示底部链接文案 |
| linkText | String | `'查看门店详情 ›'` | 链接文案 |
| subtitle | String | `''` | 副标题（如城市，案例详情关联门店） |
| mode | String | `'default'` | `default` 常规 · `anonymous` 匿名授权案例联系说明 |
| anonymousHint | String | 见组件 | 匿名模式主文案 |
| contactHint | String | `''` | 匿名模式联系说明（默认含 subtitle 城市） |

| 事件 | 说明 |
|---|---|
| tap | `{ storeId }`（`anonymous` 模式不触发） |

#### ServiceCard（`components/service-card`）

服务列表/详情卡片；价格区复用 `PriceDisplay`。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| serviceId | String | `''` | 服务 ID |
| name | String | `''` | 服务名称 |
| categoryName | String | `''` | 分类名 |
| summary | String | `''` | 摘要 |
| priceMode / amount / minAmount / maxAmount | — | — | 同 PriceDisplay |
| storeName | String | `''` | 门店名（列表场景） |
| showStoreName | Boolean | true | 是否展示门店名 |
| showTags | Boolean | true | 是否展示 Tag 行；false 时 categoryName 作副标题 |
| readonly | Boolean | false | 只读嵌入（如留言页服务信息） |
| embedded | Boolean | false | 嵌入父 Card，无独立背景/内边距 |
| showSuffix | Boolean | — | 覆盖 PriceDisplay 后缀；不传则用组件默认 |
| disclaimerText | String | `''` | 覆盖 PriceDisplay 免责文案 |
| statusLabel / statusVariant | String | — | 商家列表工作流状态 Tag |

| 事件 | 说明 |
|---|---|
| tap | `{ serviceId }`（`readonly` 时不触发） |

#### OrderCard（`components/order-card`）

用户端与商家端 **共用** 订单列表卡片；数据由 `enrichListItem` / `enrichMerchantListItem` 预处理后传入。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| item | Object | — | 列表项 ViewModel（含 `id`、`status`、`serviceName`、`primaryAction` 等） |
| audience | String | `user` | `user` 用户端 · `merchant` 商家端 |

| 事件 | 说明 |
|---|---|
| tap | `{ id }` 点击卡片（非按钮区） |
| action | `{ id, action }` 主操作按钮 |

**展示差异**

| audience | 差异字段 |
|---|---|
| user | `storeName`、相册 hint（`hasAlbum`） |
| merchant | `merchantStatusLabel` 覆盖 Badge；`orderTypeLabel` + `albumStatusLabel` Tag 行；用户 `contactName` |

价格区复用 `PriceDisplay`；须保留 `listPriceHint` 辅助说明（区间/事故车列表场景）。

---

### 3.5 AlbumNode / Timeline / OrderStatusBadge

#### Timeline（`components/timeline`）

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| steps | Array | `[]` | `{ title, status: pending\|active\|done, time?, desc?, linkText? }[]` |
| compact | Boolean | false | 紧凑间距 |

| 事件 | 说明 |
|---|---|
| linktap | `{ index, step }` 点击节点次级链接 |

#### OrderStatusBadge（`components/order-status-badge`）

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| status | String | — | `ORDER_STATUS`（`constants/order-status.js`） |
| size | String | `sm` | `sm` / `lg` |
| label | String | `''` | 可选覆盖展示文案 |

色组与 `ORDER_STATUS_TONE` 一致（warning / primary / success / danger）。

#### AlbumNode（`components/album-node`）

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| mode | String | `view` | `view` 只读展示 · `edit` 可编辑（说明 + 上传） |
| compact | Boolean | false | `edit` 时简化布局（仅标题 + 上传，用于历史案例创建） |
| title | String | — | 节点标题 |
| images | Array | `[]` | 图片 URL 列表 |
| note | String | `''` | 节点说明 |
| time | String | `''` | 上传/更新时间（`view` 可选） |
| emptyText | String | `商家暂未上传` | 无图占位（中性，非警告态） |
| description | String | `''` | 节点描述（`edit`） |
| photoTips | String | `''` | 拍摄建议（`edit`） |
| requiredLevelLabel | String | `''` | 必拍级别 Tag 文案（`edit`） |
| requiredLevelVariant | String | `default` | Tag 语义色 |
| notePlaceholder | String | `补充本节点说明（可选）` | 说明输入占位 |
| maxCount | Number | `9` | 最多上传张数（`edit`） |
| uploadHint | String | `''` | 上传按钮旁操作提示（`edit`，如隐私说明） |

| 事件 | 说明 |
|---|---|
| notechange | `{ value }` 说明变更（`edit`） |
| imageschange | `{ images }` 图片变更（`edit`） |

`view` 模式：纵向时间线 + 3 列图网格（§6.4）。**用户端详情主阅读**已改用 **§3.6g `AlbumFrameViewer`**（全屏相框翻页）；`view` 仍用于商家端编辑、H5/深链摘要等。`edit` 模式：标题行 + 可选 Tag/描述/建议 + textarea + `ImageUploader`。

#### AlbumFlipBook（`components/album-flip-book`）— **废弃 · UI-ALB-B-05**

> **2026-06-10 定稿**：试验方向不符合产品目标；**新代码禁止引用**。由 **§3.6g `AlbumFrameViewer` + `AlbumPhotoFrame`** 替代；实现完成后 **删除或并入** viewer（UI-ALB-C-07）。

#### AlbumCard（`components/album-card` · 卷七 UI-ALB 升级）

用户端与商家端 **共用** 服务相册列表卡片；数据经 `enrichServiceAlbumListItem` 预处理。  
**卷七 A-06b/c**：**加高横向卡** — 左 `--size-album-list-thumb` 缩略图 + 右档案信息；用户端右上 **分享 + 授权/公示**；可选六段迷你进度条；缩略图轻相框 `--shadow-album-list-thumb`。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| item | Object | — | 列表项 ViewModel（含 `albumId`、`coverUrl`、`stageProgress`、`publicCaseStatus`、`canOwnerShare` 等） |
| audience | String | `user` | `user` 用户端 · `merchant` 商家端 |
| showProgress | Boolean | true | 是否展示六段进度（user 默认 true） |
| framed | Boolean | true | 缩略图是否展示轻相框角饰（user 列表建议 true） |
| showHeaderActions | Boolean | true | 用户端是否展示右上分享/授权（merchant 忽略） |

| 事件 | 说明 |
|---|---|
| tap | `{ id: albumId }` 点击卡片主体（非右上按钮区） |
| share | `{ id: albumId }` 用户端分享 |
| authorize | `{ id: albumId, publicCaseStatus }` 用户端授权/公示 |

**用户端卡片信息块（合并摘要，非四行表）**

| 字段 | 来源 |
|---|---|
| 服务名 | `serviceName` / `displayServiceName` |
| 门店 | `storeName` |
| 车辆·张数 | 车型脱敏 + 过程图张数 |
| 状态 Tag | `statusLabel`、`publicLabel`、`authPendingBadge` 等 |
| 更新时间 | `updatedAtDisplay` |

**授权/公示按钮（右上，与 `publicCaseStatus` 合并）**

| 状态 | 按钮文案 | 行为 |
|---|---|---|
| 可授权 | 授权公示 | `authorize` |
| pending_review | 审核中 | 弱态说明 |
| public_approved | 已公开 | 可选查看公示 |
| 未完工/无图 | 不展示 | — |

**展示差异**

| audience | 布局 | 附加 |
|---|---|---|
| user | 左图右文 + 右上操作 | 分享 + 授权/公示 |
| merchant | 左图右文（可选无图） | 无授权；保留分享（若业务需要） |

`stageProgress`：`{ completed: number, total: 6 }` 用于迷你进度条。卡片最小高度 `--size-album-list-card-min-height`。

列表 enrich：`enrichServiceAlbumListItem(item)` 或 `enrichServiceAlbumListItem(item, { audience: 'merchant' })`。

#### ToolImmersiveNav（`components/tool-immersive-nav` · 卷七 UI-ALB）

相册详情等 **沉浸页** 自定义导航（配合 `navigationStyle: custom`）。高度参考 `--size-album-immersive-nav`；背景 `--color-bg-album` 或透明。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| title | String | `服务相册` | 居中标题 |
| showBack | Boolean | true | 是否展示返回 |
| backDelta | Number | 1 | `navigateBack` delta |
| statusBarPlaceholder | Boolean | true | 是否预留 statusBar + 导航栏占位 |
| transparent | Boolean | false | 透明底（无 border） |
| autoBack | Boolean | true | 点击返回时自动 `navigateBack`；无栈时 `reLaunch` 至「我的」 |

| Slot | 说明 |
|---|---|
| right | 右侧操作（详情页通常为空） |

| 事件 | 说明 |
|---|---|
| back | 点击返回 |
| ready | `{ statusBarHeight, navBarHeight, navTotalHeight, sidePadding }` 布局就绪 |

#### AlbumPhotoFrame（`components/album-photo-frame` · 卷七 UI-ALB）

全屏相框 **壳层**：四边 mat + L 形角饰 + `--shadow-album-frame`。纯 CSS + token，无业务逻辑。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| variant | String | `detail` | `detail` 详情大图 · `thumb` 列表缩略图（角饰缩小） |
| showCorners | Boolean | true | 是否展示四角 L 饰 |

| Slot | 说明 |
|---|---|
| default | 框内内容（顶栏 / 大图 / 文案条等） |

Token：`--color-album-frame` / `--color-album-frame-line` / `--color-album-frame-corner` / `--size-album-frame-border` / `--size-album-frame-corner`。

#### AlbumFrameViewer（`components/album-frame-viewer` · 卷七 UI-ALB）

详情 **主阅读**：横向 swiper 翻页 + 相框内布局 + **虚拟尾页槽**。数据来自 `buildAlbumFlipPages`（`utils/album-flip-pages.js`）。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| pages | Array | `[]` | 扁平页 `{ type: 'photo'|'end', imageUrl?, caption?, nodeId?, nodeTitle?, time? }` |
| chapters | Array | `[]` | 节点章节 `{ nodeId, title, startIndex }` |
| current | Number | 0 | 当前页（0-based）；**含尾页** |
| loading | Boolean | false | Skeleton 态 |
| emptyText | String | `该相册暂无过程图片` | 无图空态 |

| Slot | 说明 |
|---|---|
| endPage | 尾页内容（默认用 `AlbumEndPage`） |

| 事件 | 说明 |
|---|---|
| pagechange | `{ index, page, total }` 翻页；`total` = 图片数 + 1（尾页） |
| info | 点击框内「信息」→ 由页面打开 `AlbumInfoSheet` |

**框内结构（图片页）**

- 顶栏：页码 `{index}/{total}` + 「信息」按钮；**无分享**
- 中部：大图 `aspectFill`；**禁止** `previewImage`
- 底栏：`--size-album-caption-bar` 一行短文案（节点名 · 时间 · 摘要省略）

尾页不展示底文案条；页码为最后一页。

#### AlbumEndPage（`components/album-end-page` · 卷七 UI-ALB）

虚拟 **尾页**：暖底 `--color-album-frame-inner` + 授权/分享/反馈三按钮（按状态显隐）。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| showAuth | Boolean | false | 是否展示授权公示 |
| authLabel | String | `授权公示` | 主按钮文案 |
| authDisabled | Boolean | false | 审核中等弱态 |
| authHint | String | `''` | 审核中等弱态说明（`authDisabled` 时展示） |
| showShare | Boolean | false | 是否展示分享 |
| showFeedback | Boolean | true | 是否展示反馈 |

| 事件 | 说明 |
|---|---|
| auth | 授权公示 |
| share | 分享 |
| feedback | `{ albumId? }` 跳转反馈页 |

#### AlbumInfoSheet（`components/album-info-sheet` · 卷七 UI-ALB）

详情 **极简抽屉**：**仅** PrivacyBanner + 门店说明列表；半屏约 55–65% 屏高。基于 `BottomSheet` 或等价实现。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| visible | Boolean | false | 是否展示 |
| scene | String | `album` | 传给 `PrivacyBanner` |
| storeNote | String | `''` | 门店总说明（置顶） |
| nodeNotes | Array | `[]` | `{ nodeId, nodeTitle, thumbUrl, note }[]` 有说明的节点 |

| 事件 | 说明 |
|---|---|
| close | 关闭抽屉 |

**不在抽屉内**：摘要表、Tag、授权、分享、ComplianceNotice。

#### AlbumBottomToolbar（`components/album-bottom-toolbar` · 卷七 UI-ALB）

详情 **节点 Tab 底栏**：仅横滑节点 Tab；**无**授权、**无**联系门店。背景 `--color-album-toolbar-bg`；高度 `--size-album-toolbar-height`。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| chapters | Array | `[]` | `{ nodeId, title, startIndex }` |
| activeNodeId | String | `''` | 当前高亮节点 |
| disabled | Boolean | false | 加载/空态时禁用 |

| 事件 | 说明 |
|---|---|
| chaptertap | `{ nodeId, startIndex }` 跳到该节点首张 |

#### AlbumPageFooter（`components/album-page-footer` · 卷七 UI-ALB）

详情 **页底留白栏**（节点 Tab 下方）：联系门店 + **ComplianceNotice 唯一位**。最小高度 `--size-album-page-footer-min`。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| storePhone | String | `''` | 门店电话；空则隐藏拨号 |
| contactLabel | String | `联系门店` | 主按钮文案 |
| complianceType | String | `homePlatform` | 合规类型；`homePlatform` 用 `HOME_PLATFORM_IDENTITY` |
| complianceText | String | `''` | 覆盖默认文案 |
| showCompliance | Boolean | true | 是否展示合规条 |

| 事件 | 说明 |
|---|---|
| contact | 点击联系门店（拨号前可校验） |

#### LeadCard（`components/lead-card`）

用户端与商家端 **共用** 咨询线索列表卡片；数据经 `enrichLeadListItem` / `enrichMerchantLeadListItem` 预处理。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| item | Object | — | 列表项 ViewModel（含 `id`、`status`、`statusLabel`、`displayServiceName`、`primaryAction` 等） |
| audience | String | `user` | `user` 用户端 · `merchant` 商家端 |

| 事件 | 说明 |
|---|---|
| tap | `{ id }` 点击卡片（非按钮区） |
| action | `{ id, action }` 主操作按钮（商家端「联系用户」等） |

**展示差异**

| audience | meta 行 |
|---|---|
| user | `storeName`、问题摘要、期望到店 |
| merchant | 联系人·脱敏手机、问题摘要、车型、期望到店 |

列表 enrich：`enrichLeadListItem(item)` · `enrichMerchantLeadListItem(item)`（`utils/lead-display.js`）。

#### LeadStatusBadge（`components/lead-status-badge`）

咨询线索状态 Badge；色组对齐设计体系 §6.2（`constants/lead-status.js` · `LEAD_STATUS_TONE`）。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| status | String | `''` | `SUBMITTED` / `VIEWED` / `CONTACTED` / `CANCELLED` / `CLOSED` |
| label | String | `''` | 覆盖展示文案；不传则用 `LEAD_STATUS_LABEL[status]` |
| size | String | `sm` | `sm` · `lg` |

#### LeadDetailBody（`components/lead-detail-body`）

用户端 `consult/detail` 与商家端 `lead/detail` **共用** 咨询详情主体（信息表 + 描述 + 图片 + 页脚说明）。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| title | String | `''` | 服务名或「门店留言」 |
| status / statusLabel | String | — | 传给 `LeadStatusBadge` |
| detailRows | Array | `[]` | `KeyInfoTable` 行 |
| description | String | `''` | 问题描述 |
| images | Array | `[]` | 用户上传图（私密） |
| imageComplianceType | String | `consultImage` | 图片区 `ComplianceNotice` |
| footerComplianceType | String | `consultRecord` | 页脚 `ComplianceNotice` |
| showFooter | Boolean | true | 是否展示页脚说明 |

共用布局见 `styles/record-detail.wxss`。

#### AuthorizationCard（`components/authorization-card`）

用户端公开授权列表卡片。

| 属性 | 类型 | 说明 |
|---|---|---|
| item | Object | 经 `enrichAuthorizationItem` 预处理，含 `displayTags` |

| 事件 | 说明 |
|---|---|
| view | `{ id: albumId }` |
| withdraw | `{ id: albumId }` |

#### AlbumAuthorizeSection（`components/album-authorize-section`）

相册详情「授权公开为案例」区块（用户端 V2.0）。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| checked | Boolean | false | 勾选状态 |
| submitting | Boolean | false | 提交中 |
| title | String | 授权公示 | 标题 |
| showPolicyLink | Boolean | true | 是否展示政策链接 |
| confirmText | String | 确认授权公示 | 主按钮文案 |
| rejectText | String | 拒绝公示 | 次按钮文案 |

| 事件 | 说明 |
|---|---|
| toggle | 勾选切换 |
| submit | 确认公开 |
| reject | 拒绝公开 |
| policy | 点击《利益共享政策》 |

#### PendingConfirmList（`components/pending-confirm-list`）— **Phase 2 · 新页勿引**

> **Phase 1（辙见 · 服务相册）**：用户端 **不启用** 配件/方案待确认主路径；R4 详情页已移除置顶入口。  
> **Phase 2**：服务相册详情待确认配件/方案置顶列表（见 `10_配件告知确认规则.md`）。  
> **遗留代码**：组件保留供 Phase 2 与旧 mock 联调，**新页面禁止引用**。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| items | Array | `[]` | `{ id, label, cellTitle? }[]` |
| actionText | String | 立即处理 | 底部按钮 |

| 事件 | 说明 |
|---|---|
| itemtap | `{ id }` |
| action | 点击「立即处理」 |

列表卡片共用布局见 `styles/record-card.wxss`（`AlbumCard` / `LeadCard` / `AuthorizationCard`）。

---

### 3.6 FixedBottomBar（`components/fixed-bottom-bar`）

| 属性 | 类型 | 说明 |
|---|---|---|
| safeArea | Boolean | true，使用 safe-bottom |
| leftActions | Array | `{ key, type?, text, disabled? }[]` 左侧按钮组；有值时替代 `left` slot |

| 事件 | 说明 |
|---|---|
| leftaction | `{ key }` 点击 leftActions 项 |

双按钮 slot：`left` `right`；或单主按钮 + `leftActions`。

---

### 3.6a ListPageShell（`components/list-page-shell`）

Tabs + loading / unauthenticated / error / empty / 列表 **五态壳**；用于咨询列表、商家线索、服务相册列表等。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| tabs | Array | `[]` | `{ key, label }[]` |
| activeKey | String | `''` | 当前 Tab |
| status | String | `loading` | `loading` · `unauthenticated` · `error` · `empty` · `normal` |
| errorMessage | String | `''` | 错误描述 |
| emptyTitle / emptyDescription / emptyActionText | String | — | 空状态文案 |
| unauthTitle / unauthDescription / unauthActionText | String | — | 未登录态（用户端咨询列表） |
| tabsCard | Boolean | false | Tab 区白底（用户咨询列表） |
| bodyClearance | Boolean | false | 列表区预留 fixed 底栏间距 |
| skeletonCount / skeletonRows | Number | 3 / 4 | loading 骨架数量 |

| 事件 | 说明 |
|---|---|
| tabchange | `{ key }` |
| retry | 错误重试 |
| emptyaction | 空状态主操作 |
| unauthaction | 未登录主操作 |

默认 slot：normal 态列表内容；`intro` slot：Tabs 上方（搜索栏 + 页头说明）；`empty` slot：空状态自定义区（默认内置 `Empty`）；`footer` slot：底部 FAB 等。

`tabs` 为空数组时不渲染 Tab 栏。

---

### 3.6b BottomSheet（`components/bottom-sheet`）

底部弹层（mask + panel + safe-area）；用于关闭说明、轻量表单等。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| visible | Boolean | false | 是否展示 |
| title / hint | String | — | 标题与辅助说明 |
| showTextarea | Boolean | false | 是否展示输入框 |
| textareaValue / textareaPlaceholder | String | — | 受控输入 |
| maxlength | Number | 200 | 输入上限 |
| confirmText / cancelText | String | 确认 / 取消 | 按钮文案 |
| confirmDisabled / loading | Boolean | false | 确认按钮态 |
| showActions | Boolean | true | 是否展示底部确认/取消栏 |
| scrollable | Boolean | false | panel 是否限高可滚动（如 ShareSheet） |

| 事件 | 说明 |
|---|---|
| close | 点击遮罩 |
| cancel | 点击取消 |
| confirm | 点击确认 |
| input | `{ value }` 输入变更 |

默认 slot：标题与 textarea 之间的自定义内容。

---

### 3.6d ShareSheet（`components/share-sheet`）· **Phase 1 新增**

相册详情 / 案例详情 **半屏分享** 业务组件；组合 **bottom-sheet**（`showActions=false` `scrollable=true`），**不含** 默认 confirm/cancel 双按钮栏。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| visible | Boolean | false | 是否展示 |
| showOwnerShare | Boolean | false | 是否展示底部原图分享区（私人分享） |
| shareIntent | String | owner | `owner` 私人 · `publicCase` 平台公示 |
| shareUseOriginal | Boolean | false | 原图分享（**仅 showOwnerShare**） |
| ownerSharePreparing | Boolean | false | token 准备中 |
| actionsDisabled | Boolean | false | 禁用三渠道入口 |

| 事件 | 说明 |
|---|---|
| close | 关闭面板 |
| toggleoriginal | 切换原图（页面侧风险 Modal） |
| copyownerlink | 复制私人分享文案+公网链接 |
| copypublicweblink | 复制公示案例文案+公网链接 |
| sharetimeline | 朋友圈引导（页面侧 Modal + 右上角 ···） |

**内置结构**：

- 三列渠道：朋友圈 / 转发给朋友（`open-type="share"`）/ 转发到社交媒体（复制链接）
- 底部隐私说明 + `CheckboxRow`（原图分享，仅 `showOwnerShare`）

**约束**：

- 禁止奖励诱导文案；渠道说明使用 `text-caption`
- z-index 继承 bottom-sheet（`--z-popup`）
- 不得与 `LoginSheet` 同时打开

---

### 3.6e ServiceAlbumSummaryCard（`components/service-album-summary-card`）

服务相册摘要卡：状态 Tag、关键信息表、可选参考报价（PriceDisplay + ComplianceNotice）、可选分享入口。

| 属性 | 类型 | 说明 |
|---|---|---|
| statusVariant / statusLabel | String | 状态 Tag |
| title | String | 可选标题（分享落地页） |
| rows | Array | KeyInfoTable 行（不含参考报价） |
| showShare | Boolean | 右上角「分享」 |
| priceMode / amount / planAmount | — | 有 planAmount 时展示价格区 |

| 事件 | 说明 |
|---|---|
| share | 点击分享 |

---

### 3.6f ServiceAlbumProcessSection（`components/service-album-process-section`）

服务相册过程记录区块：`AlbumNode` 列表 + 门店说明 + 可选底部 PrivacyBanner。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| title | String | 过程记录 | 区块标题 |
| nodes | Array | [] | 节点列表 |
| storeNote | String | — | 门店说明 |
| footerBannerText | String | — | 底部提示（如分享落地页合规句） |

---

### 3.6c SearchBar（`components/search-bar`）

搜索输入 / 只读入口（首页、Tab 顶栏、搜索页）。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| value | String | `''` | 受控关键词（可输入模式） |
| placeholder | String | — | 占位文案 |
| readonly | Boolean | false | 只读时点击跳转 |
| focus | Boolean | false | 自动聚焦 |
| showCancel | Boolean | false | 显示取消按钮 |

| 事件 | 说明 |
|---|---|
| input | `{ value }` |
| confirm | `{ value }` 键盘搜索 |
| clear | 清空 |
| cancel | 取消 |
| navigate | 只读模式点击 |

---

### 3.6d GeoTopicCard（`components/geo-topic-card`）

本地 GEO 专题卡片（首页横滑、搜索结果）。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| topicId | String | `''` | 专题 ID |
| title / summary | String | — | 标题与摘要 |
| coverImage | String | `''` | 专题缩略图（可选，首页横滑） |
| tagText | String | `本地专题` | Tag 文案 |
| updatedAt | String | `''` | 可选，展示更新时间 |
| showMeta | Boolean | false | true：底部 tag+时间；false：顶部 tag（首页） |
| bordered / shadow | Boolean | true / false | 透传 `Card` |

| 事件 | 说明 |
|---|---|
| tap | `{ topicId }` |

---

### 3.7 其他业务组件

#### TagRow（`components/tag-row`）

横向 Tag 组；案例详情与 `CaseCard` 共用 `buildCaseTags`。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| tags | Array | `[]` | `{ variant, text }[]`；有值时优先 |
| authorizationTier | String | `''` | 无 tags 时按档位生成案例 Tag |

#### FaqList（`components/faq-list`）

FAQ 问答列表（案例/服务详情、H5 结构对齐）。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| items | Array | `[]` | `{ q, a }[]` |
| showQPrefix | Boolean | false | 是否在问题前加 `Q：` |
| variant | String | `'default'` | `default` 分割线 · `card` 卡片块（服务详情） |

> **V2.0 说明**：`RatingDimensions`、`ReviewCard`、`ReviewListSection`、`RewardSummaryBlock`、`RewardRecordCard` 等为 V1.0 交易评价/奖励组件，**MVP 不实现、新页面勿引用**。门店/案例详情改用透明度指标与案例摘要。

#### RatingDimensions（`components/rating-dimensions`）— V1.0 遗留

六维评价星级（设计体系 §8.3）。默认展示前 3 维，其余可展开。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| values | Object | `{}` | 维度 key → 1–5 星分值 |
| disabled | Boolean | false | 只读 |
| collapseFrom | Number | `3` | 从第 N 项起折叠 |

| 事件 | 说明 |
|---|---|
| change | `{ values }` 评分变更 |

维度 key 见 `constants/review-dimensions.js`（`scoreService` 等）。

#### ReviewCard（`components/review-card`）

用户评价展示卡片（门店/服务/案例/订单详情、我的评价列表）。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| reviewId | String | `''` | 评价 ID |
| orderId | String | `''` | 关联订单 ID（列表跳转用） |
| displayName | String | `''` | 脱敏昵称 |
| overallScore | Number | `0` | 综合分（六维均值） |
| content | String | `''` | 评价正文 |
| tags | Array | `[]` | 评价标签文案 |
| serviceName | String | `''` | 关联服务名 |
| createdAtText | String | `''` | 展示用日期 |
| showStatus | Boolean | `false` | 是否展示审核状态 Tag |
| statusLabel | String | `''` | 状态文案 |
| statusVariant | String | `'default'` | Tag variant |
| compact | Boolean | `false` | 紧凑内边距 |
| plain | Boolean | `false` | 无外框/背景（嵌于 Card 内） |
| images | Array | `[]` | 评价图片 URL |
| imagesApproved | Boolean | `false` | **须审核通过**才展示图片 |

| 事件 | 说明 |
|---|---|
| tap | `{ reviewId, orderId }` |

展示图片时须 `imagesApproved=true`，并内置 `ComplianceNotice type="reviewUpload"`。

#### ReviewTagChip（`components/review-tag-chip`）

评价提交页可选标签 Chip。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| text | String | `''` | 标签文案 |
| selected | Boolean | false | 是否选中 |

| 事件 | 说明 |
|---|---|
| tap | `{ text }` |

样式：未选 `--color-bg-muted`；已选 `--color-primary-light` + 主色边框。

#### ReviewListSection（`components/review-list-section`）

门店/服务/案例详情用户评价区块。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| sectionTitle | String | `'用户评价'` | 区块标题 |
| titleSize | String | `'h2'` | `h2` / `h3` |
| hint | String | `''` | 标题下说明 |
| topTagsLabel | String | `'用户常提到'` | 高频标签标题 |
| topTags | Array | `[]` | 高频标签文案 |
| reviews | Array | `[]` | ReviewCard ViewModel 列表 |
| status | String | `'normal'` | `normal` / `empty` / `error` |
| emptyTitle / emptyDescription | String | — | 空态 |
| errorTitle / errorDescription | String | — | 错误态 |
| compact | Boolean | true | ReviewCard 紧凑模式 |

| 事件 | 说明 |
|---|---|
| retry | 评价加载失败重试 |
| reviewtap | `{ reviewId, orderId }` |

#### RewardSummaryBlock（`components/reward-summary-block`）

评价奖励说明块（提交页/结果页）。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| variant | String | `'submit'` | `submit` · `result` |
| amount | Number | `0` | 奖励金额 |
| leadText | String | `''` | submit 模式说明 |
| metaText | String | `''` | result 模式副文案 |
| showCompliance | Boolean | true | reward 合规条 |
| showRulesLink | Boolean | true | 规则链接 |

| 事件 | 说明 |
|---|---|
| rules | 查看评价奖励规则 |

#### RewardRecordCard（`components/reward-record-card`）

奖励记录列表行（包在 Card 内使用）。

| 属性 | 类型 | 说明 |
|---|---|---|
| rewardId / orderId | String | 记录与订单 ID |
| sourceLabel | String | 来源文案 |
| createdAtText | String | 时间 |
| amount | Number | 金额 |
| statusLabel / statusVariant | String | 状态 Tag |

| 事件 | 说明 |
|---|---|
| tap | `{ rewardId, orderId }` |

#### KeyInfoTable / AiSummaryBlock / ImageUploader

见各组件目录；案例详情、服务相册页已广泛使用。

---

### 3.8 MineUserHeader（`components/mine-user-header`）

我的页用户信息区：头像、昵称、脱敏手机号、登录/绑手机引导。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| isLoggedIn | Boolean | false | 是否已登录 |
| user | Object | null | `{ nickname, avatarUrl, phoneDisplay, isPhoneBound }` |

| 事件 | 说明 |
|---|---|
| usertap | 点击用户区（已登录未绑手机时引导绑手机） |
| logintap | 点击「微信一键登录」 |
| bindphonetap | 点击「绑定手机号」 |

---

### 3.9 LoginSheet（`components/login-sheet`）

底部弹层：微信登录 + 微信手机号绑定；供「我的」、咨询预约前置等场景复用。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| visible | Boolean | false | 是否展示 |
| mode | String | `'login'` | `'login'` / `'bindPhone'` / `'auto'`（按登录态自动选步） |
| title | String | `''` | 覆盖标题 |
| description | String | `''` | 覆盖说明 |
| showAgreement | Boolean | true | 登录步展示协议勾选 |
| maskClosable | Boolean | true | 点遮罩关闭 |
| bindContext | String | `'general'` | 绑手机/登录文案场景：`'general'` / `'order'` / `'consult'` |

| 事件 | 说明 |
|---|---|
| close / cancel | 用户关闭 |
| success | `{ user, step: 'login' \| 'bindPhone' }` |
| fail | `{ step, message }` |

登录前须勾选《用户协议》《隐私政策》；文案见 PRD `12_我的页面与账户体系.md` §16。

---

### 3.9 CheckboxRow（`components/checkbox-row`）

协议勾选、事故车知晓确认等场景复用。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| checked | Boolean | false | 是否选中 |
| disabled | Boolean | false | 禁用 |

| 事件 | 说明 |
|---|---|
| toggle / change | 点击整行切换；`change` 携带 `{ checked }` |

默认 slot 为说明文案（可含链接，链接需 `catchtap` 防冒泡）。

---

## 4. 组件与工具类关系

页面可临时使用 `tokens.wxss` 中 `.tag` `.btn` `.card` `.text-link` 等工具类，**业务页面应逐步替换为正式组件**，避免样式分叉。

| 工具类 | 用途 |
|---|---|
| `.text-link` | 页内文字链（政策、门店详情等），色值 `--color-primary` |
| `.note-block` | 中性说明块（门店备注、状态提示等），背景 `--color-bg-muted` |

---

## 5. 版本

| 版本 | 说明 |
|---|---|
| V1.0 | 初版，与 MVP 组件清单对齐 |
| V1.1 | 新增 `OrderCard`；`AlbumNode` 扩展 `mode=edit` / `compact` |
| V2.0 | 新增 `AlbumCard`、`AuthorizationCard`、`AlbumAuthorizeSection`；`ComplianceNotice` 增 `partRisk`；`.note-block` 工具类；`PendingConfirmList`（**Phase 2**，Phase 1 新页勿引）；R6 增 `LeadCard`/`LeadStatusBadge`/`LeadDetailBody`/`ListPageShell`/`BottomSheet` 文档与实现 |
| V2.1 | **UI-ALB-A-08**：`AlbumCard` 加高横向卡 + 分享/授权；新增 `ToolImmersiveNav`/`AlbumPhotoFrame`/`AlbumFrameViewer`/`AlbumEndPage`/`AlbumInfoSheet`/`AlbumBottomToolbar`/`AlbumPageFooter`；`AlbumFlipBook` 标废弃 |
