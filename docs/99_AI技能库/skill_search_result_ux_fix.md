# Skill: Search Result UX Fix

## 目标

排查并修复辙见小程序 **搜索页 / 搜索结果页** 的 UX 与空态逻辑问题，避免「上方无结果、下方有结果」、Tab 自动跳回、综合搜索缺入口等复发。

## 使用场景

- 用户反馈：搜索结果页上方显示「暂无相关结果」，下方却有列表
- 切换「案例/门店」Tab 后自动跳回「服务」
- 联想列表找不到目标时，无法进入「全文搜索」
- 搜「事故车」等关键词，怀疑是「精确匹配」导致漏搜
- 修改 `pages/search/`、`components/list-page-shell/`、`services/search.js` 或后端 `searchContent` 后做回归

## 必读

- `docs/02_用户端小程序/11_搜索与筛选.md` §6–§8
- `pages/search/index/`、`pages/search/result/`
- `components/list-page-shell/`
- `utils/search-match.js`、`utils/search-query.js`（后端镜像：`backend/src/utils/`）

---

## 1. 症状 → 根因速查

| 症状 | 优先怀疑 | 关键文件 |
| --- | --- | --- |
| 上方整页空态 + 下方仍有 GEO/服务/门店卡片 | **`slot="empty"` 泄漏到默认插槽**（未启用或未生效 `multipleSlots`） | `list-page-shell/index.json` + `index.js`；`pages/search/result/index.wxml` |
| 上方整页空态 + 下方有结果，但 `status` 应为 `normal` | **`isPageEmpty` 仅看 `counts`、未看实际数组** | `pages/search/result/index.js` |
| 切到「案例」后跳回「服务」并 toast | **`pickSearchResultTab` / `result.tab` 覆盖用户选择** | `pages/search/result/index.js`；`content.service.js`；`services/search.js` |
| 联想有结果，无法看全部 | 缺搜索按钮 / 键盘确认 / 「查看全部结果」入口 | `components/search-bar/`；`pages/search/index/` |
| 搜「事故车」以为要搜「事故车检测」全称 | **误解**：当前为 **子串匹配** `includes`，非精确匹配 | `utils/search-match.js` |

---

## 2. 诊断流程

按序执行，先定位再改码：

```
1. 确认关键词在 mock/DB 中是否有命中（Node 或接口）
2. 看 activeTab、status、counts、各 list 长度是否一致
3. 看 WXML：空态与列表是否在同一插槽 / 是否同时渲染
4. 看 API：tab=all 时是否返回三类结果；counts 是否与数组一致
5. 改完后用 2–3 个关键词自测（如 小保养、事故车、刹车）
```

### 2.1 本地快速验证（mock）

将 `services/config.js` 临时改为 `mock` 或在 Node 中直接 require `utils/search-match`：

```javascript
const { matchSearchService } = require('./utils/search-match')
const { SEED_SERVICES } = require('./mock/services')
console.log(SEED_SERVICES.filter((s) => matchSearchService(s, '事故车')))
```

### 2.2 页面态检查

在 `runSearch` 成功回调中应满足：

- **整页空态** `status === 'empty'`：仅当 GEO + 服务 + 门店 + 案例 **全无**
- **有结果** `status === 'normal'`：不得渲染整页空态 UI
- **单 Tab 空态** `showTabEmpty`：其他 Tab 有结果、当前 Tab 无结果时使用，文案引导切换

`isPageEmpty` 必须同时检查 **实际数组长度** 与 `counts`：

```javascript
function isPageEmpty(geoPages, services, merchants, cases, counts) {
  if ((geoPages || []).length) return false
  if ((services || []).length) return false
  if ((merchants || []).length) return false
  if ((cases || []).length) return false
  const c = counts || {}
  return !(c.service || 0) && !(c.merchant || 0) && !(c.case || 0) && !(c.geo || 0)
}
```

---

## 3. 标准修复模式

### 3.1 `list-page-shell` 多插槽（必做）

组件 **json 与 js 双声明**：

```json
// components/list-page-shell/index.json
{ "component": true, "multipleSlots": true, ... }
```

```javascript
// components/list-page-shell/index.js
Component({ options: { multipleSlots: true }, ... })
```

### 3.2 搜索结果页：禁止自定义 `slot="empty"` 与列表混用

**反模式**（会导致空态与结果同屏）：

```xml
<ui-list-page-shell status="{{status}}">
  <view slot="empty">...</view>   <!-- 易泄漏 -->
  <view>结果列表</view>
</ui-list-page-shell>
```

**推荐模式**（本项目现行）：

```xml
<ui-list-page-shell
  status="{{status}}"
  emptyTitle="{{emptyTitle}}"
  emptyDescription="{{emptyDescription}}"
  emptyActionText="{{emptyActionText}}"
  bind:emptyaction="onEmptyAction"
>
  <!-- 仅 empty 时：热门词放 footer -->
  <view wx:if="{{status === 'empty' && hotwords.length}}" slot="footer">...</view>

  <!-- 仅 normal 时：结果列表 -->
  <block wx:if="{{status === 'normal'}}">
    ...
  </block>
</ui-list-page-shell>
```

要点：

- 整页空态用 shell **属性 + 内置 empty**，不要自定义 `slot="empty"` 包一层 `ui-empty`
- 默认插槽内容外包 `wx:if="{{status === 'normal'}}"` 双保险
- 空态下的「热门搜索」用 `slot="footer"`，且 `wx:if="{{status === 'empty'}}"`

### 3.3 「全部」Tab 为默认

- `constants/search.js`：`SEARCH_TABS` 首项 `{ key: 'all', label: '全部' }`，`SEARCH_DEFAULT_TAB = 'all'`
- 进入结果页 **不带** `tab=` 或显式 `tab=all`；**不要**用 `inferDefaultTab` 自动跳 Tab
- `tab=all` 时 API 返回三类结果各一段；`packSearchResults` 见 `utils/search-query.js`
- 「全部」Tab 隐藏排序/筛选；分区展示：GEO → 服务 → 门店 → 案例

### 3.4 Tab 切换：尊重用户，禁止自动改 Tab

- 删除 `runSearch` 内对 `result.tab` 的覆盖与「已切换到 xx」toast
- `onTabChange` 只更新 `activeTab` 并重新请求，**不要** `pickSearchResultTab`
- 后端 `searchContent` 返回的 `tab` 应与请求一致，不做智能改写

### 3.5 综合搜索入口

- `ui-search-bar`：`showSearch` + `confirm-type="search"` + `bind:confirm` / `bind:search`
- 搜索首页：联想列表底部「查看「xxx」的全部搜索结果」；无联想时主按钮「搜索「xxx」」

### 3.6 关键词匹配（非精确匹配）

- 匹配函数：`field.toLowerCase().includes(keyword.toLowerCase())`
- 同义词组见 `SEARCH_SYNONYM_GROUPS`（如 事故车 ↔ 事故车检测）
- `inferDefaultTab` 仅用于文档/历史说明；**默认 Tab 应为「全部」**，服务类词（含「事故车」）不应因「事故」子串默认进案例 Tab

---

## 4. 涉及文件清单

| 层级 | 路径 |
| --- | --- |
| 搜索常量 | `constants/search.js` |
| 筛选排序 | `constants/search-filters.js` |
| 匹配 | `utils/search-match.js`、`backend/src/utils/search-match.js` |
| 查询打包 | `utils/search-query.js`、`backend/src/utils/search-query.js` |
| 前端 API | `services/search.js` |
| 后端 API | `backend/src/services/content.service.js` → `searchContent` |
| 搜索页 | `pages/search/index/*` |
| 结果页 | `pages/search/result/*` |
| 列表壳 | `components/list-page-shell/*` |
| 搜索框 | `components/search-bar/*` |

---

## 5. 自测清单

- [ ] 搜「事故车」：「全部」Tab 下同时见 GEO + 服务 + 门店，**无**上方整页空态
- [ ] 搜「小保养」：有服务结果时不再出现空态与列表矛盾
- [ ] 手动切「案例」Tab 后停留，不跳回「服务」
- [ ] 搜索首页：键盘搜索键 / 「搜索」按钮 / 「查看全部结果」均可进结果页
- [ ] 真无结果：仅整页空态 + 热门搜索（footer），无列表残留
- [ ] 单 Tab 无结果、其他 Tab 有：显示「该分类暂无结果」+ 切换提示，非整页空态
- [ ] prod 环境：后端已部署 `tab=all` 与 `packSearchResults` 逻辑

---

## 6. 输出格式（排查任务）

```markdown
# 搜索结果 UX 排查报告

## 现象
（用户描述 / 截图要点）

## 根因
（插槽 / 空态判断 / Tab 覆盖 / API counts 不一致 / 匹配误解）

## 修改项
| 文件 | 变更 |
| --- | --- |

## 自测结果
- [ ] ...

## 风险与后续
（如需部署后端、是否影响其他使用 list-page-shell 的页面）
```

## 7. 约束

- 修复时 **最小 diff**，不顺手改无关搜索逻辑
- 其他使用 `ui-list-page-shell` 的页面若自定义 `slot="empty"`，同步按 §3.2 审查
- 检查类任务默认只出报告；用户明确要求「修复」再改代码
- 空态/合规文案遵循 PRD，勿自造「平台订单案例」等禁用表述
