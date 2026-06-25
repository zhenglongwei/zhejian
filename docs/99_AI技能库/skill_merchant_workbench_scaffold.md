# Skill: Merchant Workbench Scaffold（商家工作台页面骨架）

## 目标

按项目规范生成 **`packageMerchant/`** 商家工作台页面与 **商家侧 API** 骨架，支撑卷二 **M-*** / **B-SVC-*** / **B-MERCH-03** 等任务，保证与卷一（用户端、服务相册）和卷三（运营审核）契约一致。

## 使用场景

- 新建或扩展商家工作台页：入驻、服务方案、咨询线索、门店预览、员工、数据看板
- 将 **localStorage mock** 替换为 prod API（如 `services/service.js` 商家分支）
- 新增 `backend` 商家路由：`/merchant/service-plans*`、`/merchant/onboarding` 扩展字段等
- **平台定调（2026-06-02）**：内容发布 + AI 可信信源，非交易撮合；服务 **自助上架**，**无**发布前审核；违规 → 举报 + **OPS-SVC** 事后监管

## 与相关 skill 的分工

| Skill | 端 | 目录 / 范围 |
| --- | --- | --- |
| **`merchant-workbench-scaffold`** | **商家工作台** | `packageMerchant/pages/`（**不含** `album/`、`desensitize/`，归卷一 `A-*`） |
| `page-scaffold` | 通用小程序页 | 商家页也可复用 loading/empty/error 壳层；**业务规则以本 skill 为准** |
| `ops-admin-scaffold` | 运营 Web | `admin-web/`；服务 **事后监管 OPS-SVC-***、商家入驻 **B-MERCH-04**、案例 **OPS-MASK-01** |
| `api-integration` | 接 API 细节 | 本 skill 定页面结构后，接接口时必叠加 |
| `desensitize-engine` | 脱敏引擎 | 仅当改相册/公开链时；卷二默认不涉及 |

**相册 / 脱敏 / 冷启动公开** 仍按卷一 `A-*` + 卷三 `OPS-MASK-01`；卷二任务表 **不重复** 登记相册项。

## 必读文档

- `docs/00_开发计划.md` **§7.2**（卷二任务 ID 与进度）
- `docs/03_商家端/00_商家工作台PRD V2.0.md`（总纲、权限、待办）
- **子 PRD（按页面选读）**：
  - 入驻 → `01_商家入驻PRD.md`
  - 服务上架 → `02_服务商品上架.md`
  - 咨询线索 → `03_咨询线索管理.md`
  - 数据看板 → `06_商家数据看板.md`
  - ~~历史案例~~ → `05_历史案例上传.md`（**Phase 1 归档，不新开发**）
- 状态机：`docs/11_数据结构与状态机/05_咨询线索状态机.md`
- 接口：`docs/10_技术架构与接口/04_接口规范.md`（merchant JWT、`requireAuth(['merchant'])`）
- 复杂度 / 价格：`docs/02_用户端小程序/10_复杂度分级详细标准.md`

**UI 规范**：

- 商家端与用户端共用设计体系
- **工作台首页**：必读 `docs/00_设计规范/12_商家工作台UI线框.md`（对标用户端 `11_工具相册UI线框.md` §1）
- Hero 必须用 **`ui-album-card` `audience=merchant`**（×1～2），禁止无封面摘要行作主 Hero
- Dock **四格**：新建相册 / 咨询线索 / 服务方案 / 数据概览
- 表单页参考 `packageMerchant/pages/onboarding/`、`lead/` 现有样式

## 实现目录速查

| 模块 | 前端 | 服务层 | 后端 |
| --- | --- | --- | --- |
| 工作台 | `packageMerchant/pages/workbench/` | `services/merchant.js` | `merchant-onboarding` + stats |
| 入驻 | `packageMerchant/pages/onboarding/` | `services/merchant.js` | `routes/merchant-onboarding.js` |
| 服务方案 | `packageMerchant/pages/service/` | `services/service.js` | 待建 `merchant/service-plans` |
| 咨询线索 | `packageMerchant/pages/lead/` | `services/merchant-lead.js` | `routes/merchant-leads.js` ✅ |
| 相册 | `packageMerchant/pages/album/` | `services/merchant-service-album.js` | **卷一，勿在卷二重复改** |

## 页面类型模板

### A. 工作台 / 列表壳（M-WB / M-LEAD / M-SVC）

- 进入前 **`ensureMerchant()`**：未入驻 / 非 `APPROVED` → 引导 `onboarding`
- 状态：`loading` | `empty` | `error` | `normal`
- Tab 筛选与 URL 参数（`?tab=`）一致；下拉刷新
- 角标 / stats 来自真实 API，非写死 0

### B. 表单页（入驻 / 服务方案创建）

- 草稿 vs 提交分离；提交防重复
- 提交前校验与 PRD 字段一致；**事故车禁止一口价**（前后端双拦）
- 图片字段走 `utils/media-upload.js` 持久 URL，拒绝 wxfile/tmp
- 合规勾选文案符合 V2.0（禁「每一单维修」「免佣」等交易导向）
- 服务方案：**保存并上架** 即 `published`；**禁止**实现「待平台审核」上架闸门（**OPS-SVC** 仅事后抽查/下架）

### C. 咨询线索详情（M-LEAD）

- 进入 `SUBMITTED` 自动 `mark viewed`
- 底栏：拨号 + 标记已联系 / 关闭（含原因）
- 页脚固定平台说明（非平台订单）
- **禁止**出现接单、改价、收款、订单态按钮

### D. 门店预览（M-STORE）

- 跳转或嵌入用户端 `pages/store/detail`（只读预览）
- 分享内容须为公开信息；不暴露未审核资料

## 生成原则

1. **merchant 角色闸门**：`fetchMerchantProfile` + `MERCHANT_STATUS.APPROVED`；审核中/需修改态可进 onboarding，不可进业务列表。
2. **替换 mock 须彻底**：`services/service.js` 商家列表/保存不得静默 fallback localStorage；`ENV.mode === 'mock'` 与 prod 分支行为一致可测。
3. **状态机对齐**：线索状态与用户端 `06_咨询记录` 一致；关闭原因枚举共用 `constants/lead-close-reason.js`。
4. **价格合规**：服务方案使用 `PriceDisplay` 四型；事故车、区间价文案见 `price-compliance-check`。
5. **无 V1 订单**：不新增 `packageMerchant/pages/order/*` 入口；清理见 **M-WB-10**。
6. **运营衔接**：入驻扩展字段须在 **admin-web 商家审核详情** 可展示（与 **B-MERCH-03**、**ops-admin-scaffold** 同步）。
7. **mock 标注**：未接 API 时文件头注释 `// MOCK: 任务 ID` + `00_开发计划` 项。

## 卷二首批任务与 skill 映射

| 任务 ID | 类型 | 优先 skill |
| --- | --- | --- |
| M-LEAD-07 | 线索 prod 验收 | `api-integration` + 本 skill §C |
| B-SVC-01/03 + M-SVC-12 | 服务 DB 化 | 本 skill §B + `api-integration` + `price-compliance-check` |
| OPS-SVC-01/02 | 运营服务 **事后监管** | `ops-admin-scaffold` |
| B-MERCH-03 + M-ONB-06～11 | 完整入驻 | 本 skill §B + `ops-admin-scaffold`（审核详情） |
| M-STORE-01 / M-WB-07 | 门店预览 | 本 skill §D + `page-scaffold` |
| M-WB-10 | 清理订单页 | 本 skill 原则 5 |

## 输出格式

```md
# 商家工作台页面 / API 生成计划

## 任务 ID
M-SVC-12 / B-SVC-01 / ...

## 页面或 API 路径
packageMerchant/pages/... 或 backend/src/routes/...

## 页面目标

## 与卷一 / 卷三边界
- 是否涉及相册 A-* / 运营 OPS-*：（否/是，若是则另开 skill）

## 权限与入口
| 条件 | 行为 |
|---|---|

## 布局模块
| 模块 | 说明 |
|---|---|

## API 清单
| 方法 | 路径 | 用途 | 状态 mock/prod |
|---|---|---|---|

## 状态设计
| 状态 | 展示 |
|---|---|

## 合规
- 价格模式 / 事故车 / 线索说明 / 无订单按钮

## 文件变更计划
| 文件 | 操作 |
|---|---|
```

**确认后再生成代码。**

## 实现后自查

1. 未入驻用户无法绕过闸门访问列表/详情。
2. 线索操作后用户端咨询记录状态同步（dev 联调一条完整链路）。
3. 服务方案上架后用户端可见；**无**「待平台审核」才展示的逻辑。
4. 无 V1 订单/评价/奖励文案与入口。
5. 涉及价格处已通过 `price-compliance-check` 要点自查。
6. `docs/00_开发计划.md` §7.2 对应项可勾选或备注阻塞。

## 关联 skill

| 时机 | Skill |
| --- | --- |
| 商家页/API 计划 | **本 skill** |
| 接 API | `api-integration` |
| 通用页面壳 | `page-scaffold` |
| 运营服务/入驻审核 | `ops-admin-scaffold` |
| 服务/案例价格 | `price-compliance-check` |
| 相册/公开链改动 | `privacy-desensitization-check` |
| UI 完成后 | `design-system-check`、`component-usage-review` |
| 发版前 | `release-checklist` |

## 约束

- **不要**在卷二任务中大规模改 `packageMerchant/pages/album/`（除非 `00_开发计划` 卷一 A-* 明确项）。
- **不要**新增服务方案「发布前审核」队列（与 2026-06-02 定调冲突）。
- **不要**在线索页增加订单/支付/履约能力。
- **不要**复制用户端 pages 到 packageMerchant；复用 `components/` 与 `utils/`。
