# 组件 API 规范

> 与 `00_透明维修平台设计体系.md`、`01_设计令牌_tokens.md` 配套使用。  
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

### 2.4 Tabs（`components/tabs`）

| 属性 | 类型 | 说明 |
|---|---|---|
| tabs | Array | `{ key, label }[]`，`key` 勿用空字符串，可用 `all` 表示全部 |
| activeKey | String | 当前选中项 `key` |
| scrollable | Boolean | false；true 时单行横排并配合外层横向滚动（标签较多，如订单列表 7 Tab） |

| 事件 | 说明 |
|---|---|
| change | `{ key }` 切换 Tab |

### 2.5 DesensitizeWorkbench（`components/desensitize-workbench`）

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
| type | String | price / **casePrice** / accident / history / authorize / reward / **reviewUpload** / **desensitize** / **desensitizeGuide** |

内置文案模板，禁止营销化表述。

---

### 3.3 PrivacyBanner（`components/privacy-banner`）

| 属性 | 类型 | 说明 |
|---|---|---|
| scene | String | album / share / authorize / **desensitize** |

| scene | 说明 |
|---|---|
| album | 订单相册仅本人可见 |
| share | 分享内容已脱敏 |
| authorize | 公开前可先查看脱敏效果 |
| desensitize | 脱敏工作台：原图仅本页预览，确认后再授权公开 |

默认文案：订单相册仅本人可见；分享使用脱敏版本。

---

### 3.4 CaseCard / StoreCard / ServiceCard / OrderCard

列表卡片，字段见设计体系 §6.5–6.6；必须支持来源标签 slot 或 `caseSource` 属性。  
**CaseCard**：可选 `tags` 覆盖默认标签行（商家相册列表按 `buildAlbumListTags`）。  
**ServiceCard**：可选 `statusLabel` / `statusVariant`（商家服务列表工作流状态）。

#### StoreCard（`components/store-card`）

门店列表/详情卡片（设计体系 §6.6）。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| storeId | String | `''` | 门店 ID |
| name | String | `''` | 门店名称 |
| address | String | `''` | 地址 |
| businessHours | String | `''` | 营业时间（可选） |
| score | Number | — | 评分（可选） |
| caseCount | Number | — | 公开案例数（可选） |
| cardTags | Array | `[]` | `{ variant, text }[]`，≤3 |
| showLink | Boolean | false | 是否展示底部链接文案 |
| linkText | String | `'查看门店详情 ›'` | 链接文案 |

| 事件 | 说明 |
|---|---|
| tap | `{ storeId }` |

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

`view` 模式：纵向时间线 + 3 列图网格（§6.4）。`edit` 模式：标题行 + 可选 Tag/描述/建议 + textarea + `ImageUploader`。

---

### 3.6 FixedBottomBar（`components/fixed-bottom-bar`）

| 属性 | 类型 | 说明 |
|---|---|---|
| safeArea | Boolean | true，使用 safe-bottom |

双按钮 slot：`left` `right`；或单主按钮。

---

### 3.7 其他业务组件

#### RatingDimensions（`components/rating-dimensions`）

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

见各组件目录；案例/订单详情已广泛使用。

---

### 3.8 LoginSheet（`components/login-sheet`）

底部弹层：微信登录 + 微信手机号绑定；供「我的」、下单前置等场景复用。

| 属性 | 类型 | 默认 | 说明 |
|---|---|---|---|
| visible | Boolean | false | 是否展示 |
| mode | String | `'login'` | `'login'` / `'bindPhone'` / `'auto'`（按登录态自动选步） |
| title | String | `''` | 覆盖标题 |
| description | String | `''` | 覆盖说明 |
| showAgreement | Boolean | true | 登录步展示协议勾选 |
| maskClosable | Boolean | true | 点遮罩关闭 |
| bindContext | String | `'general'` | 绑手机文案场景：`'general'` / `'order'` |

| 事件 | 说明 |
|---|---|
| close / cancel | 用户关闭 |
| success | `{ user, step: 'login' \| 'bindPhone' }` |
| fail | `{ step, message }` |

登录前须勾选《用户协议》《隐私政策》；文案见 PRD `12_我的页面与账户体系.md` §22。

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

---

## 5. 版本

| 版本 | 说明 |
|---|---|
| V1.0 | 初版，与 MVP 组件清单对齐 |
| V1.1 | 新增 `OrderCard`；`AlbumNode` 扩展 `mode=edit` / `compact` |
