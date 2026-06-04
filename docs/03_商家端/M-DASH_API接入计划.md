# M-DASH API 接入计划

> 迭代 A：数据概览页 + 工作台简版卡片 · 后端 B-STATS-02 已就绪

## 页面

| 页面 | 路径 |
| --- | --- |
| 数据概览 | `packageMerchant/pages/dashboard/index` |
| 工作台入口 | `packageMerchant/pages/workbench/index` |

## 接口列表

| 接口 | 用途 | 时机 |
| --- | --- | --- |
| `GET /merchant/stats` | 区间汇总、日序列、透明度 | 进入看板 / 切换周期 / 下拉刷新 |
| `GET /merchant/leads/stats` | **实时**待处理线索数 | 看板顶部待办 + 工作台简版 |
| `GET /merchant/service-albums/stats` | 待公开授权等相册待办 | 看板相册区块（可选，与区间相册数并列） |

### `fetchMerchantStats` 参数

| 参数 | 说明 |
| --- | --- |
| `storeId` | 员工本店；主账号可省略（汇总授权门店） |
| `period` | `7d`（默认）/ `30d` / `yesterday` |

### 字段映射（summary）

| UI | 字段 |
| --- | --- |
| 站外总浏览 | `storeView + serviceView + caseView` |
| 案例浏览 | `caseViewCount` |
| 电话点击 | `phoneClickCount` |
| 线索提交/已联系/已关闭 | `leadSubmitCount` 等 |
| 案例留资 | `caseConsultCount` |
| 线索率/联系率 | `summary.rates.*`，null →「暂无数据」 |
| 透明度 | `transparency.score` + `breakdown` |
| 案例排行 | `rankings.cases[]`：`title`、`viewCount`、`leadCount`、`leadRate` |
| 服务排行 | `rankings.services[]`：`name`、`viewCount`、`leadCount`、`leadRate` |
| 优化建议 | `suggestions[]`（规则引擎，含超时线索/待授权/高浏览低咨询等） |

排行与建议按所选 `period` 区间从 `event_tracking_log` + `consult_leads` 实时聚合；日汇总指标仍为 T+1。

## 状态设计

| 状态 | 变量 | 展示 |
| --- | --- | --- |
| loading | `status: 'loading'` | `ui-skeleton` |
| normal | `status: 'normal'` | 指标卡片 + 透明度 |
| empty | `status: 'empty'` | 区间无日聚合数据 |
| error | `status: 'error'` | `ui-empty` + 重试 |

## 错误处理

- 401：沿用 `services/request.js` → 提示登录
- 非 0 code：展示 `message`，保留重试
- `dataLag: T+1`：固定说明文案，避免商家误以为「今天没人看」

## 文件变更

- `packageMerchant/pages/dashboard/*`（新建）
- `packageMerchant/pages/workbench/index.*`（入口 + 简版数据）
- `utils/merchant-dashboard.js`（格式化）
- `app.json`（注册页面）
