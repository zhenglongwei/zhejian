# Skill: 小程序图片不显示排查

## 目标

系统化排查「列表/卡片里图片空白、灰色占位，但接口或首页同资源能显示」类问题，避免误判为 API/脱敏/数据问题。

## 使用场景

- 案例 Tab / 门店 / 相册等 `<image>` 空白，Network 里 API 已返回合法 URL
- 开发者工具 WXML 里 `<image src="https://...">` 已绑定，页面仍只见 `image-placeholder` 灰块
- 同一组件在首页正常、在其他 Tab/页面异常（或反之）
- 控制台出现 `http://127.0.0.1/__tmp__/...` 或 `/media/desensitized/` 占位路径

## 排查分层（按顺序，勿跳层）

```text
① API 响应 → ② 页面 map/enrich → ③ 组件 properties → ④ WXML src → ⑤ CSS 布局 → ⑥ 图片请求
```

上一层未通过，不要先改下一层的「猜测性修复」。

### ① API 响应

1. Network 看列表/详情接口：`coverImage`、`coverImageDesensitized`、`nodes[].images`
2. 确认是否为**持久化 URL**（`https://` 或 `/api/v1/media/files/uploads/`）
3. 拦截 temp：`wxfile://`、`/__tmp__/`、`127.0.0.1`（非 media API）

**本项目工具**：`utils/desensitize-url.js` → `resolveImageSrc`、`pickCaseDisplayCover`、`isLocalTempImageUrl`

**后端**：`backend/src/lib/media-url.js` → `resolveDisplayMediaUrl`；读 API 封面回退见 `content.service.js` → `pickCaseCover` / `pickCoverFromAlbum`

### ② 页面数据处理

对比**能显示的页面**与**不能显示的页面**是否对同一字段做了不同处理。

| 检查项 | 说明 |
|---|---|
| 封面字段顺序 | 首页 hero：`coverImageDesensitized \|\| coverImage`；错误写法：`coverImage \|\| coverImageDesensitized` 且只试一次 |
| 失败是否清空 | 避免 `enrichXxx` 找不到封面时把 `coverImage` 置 `''`，应保留原值或逐个候选尝试 |
| 切 Tab 重载 | `loadList` 每次 `status: 'loading'` 会销毁 slot 内子组件；筛选切换可用 `{ silent: true }` |
| 统一工具 | 列表页应使用 `pickCaseDisplayCover(item)`，与首页一致 |

### ③ 组件 properties

1. 开发者工具 → 选中卡片组件（如 `ui-case-card` / `case-card`）
2. 看 `coverImage`、`displayCover`（或 `safeCoverImage`）是否有值
3. 无值 → 回到 ②；有值 → 进 ④

**本项目案例卡片**：`components/case-card/`（注册名 `ui-case-card`）

### ④ WXML 中 src 是否绑定

在 WXML 面板确认：

```xml
<image src="https://geo.simplewin.cn/api/v1/media/files/uploads/..." />
```

- **有 src 仍空白** → 问题在 ⑤ 或 ⑥，**不是 API**
- **无 image 节点** → 检查 `wx:if="{{displayCover}}"` 与 `ready()` 生命周期（`attached` 时 properties 可能仍为空）

**反模式**：`safeCoverImage` + `onCoverError` 清空 — 网络偶发失败会把合法 URL 抹掉；`store-card` 直接绑 `coverImage` 更简单。

### ⑤ CSS / 布局（高频根因）

**典型现象**：灰色 `image-placeholder` 有高度，`<image>` 在 DOM 里存在且 src 正确，但看不见图。

| 原因 | 说明 |
|---|---|
| `aspect-ratio` + 子元素 `height: 100%` | 在微信**自定义组件**内常失效，子 `<image>` 实际高度为 0 |
| 父容器无明确高度 | 百分比高度无法计算 |

**推荐写法（16:9 封面）**：

```css
.case-card__cover {
  position: relative;
  width: 100%;
  height: 0;
  padding-bottom: 56.25%;
  overflow: hidden;
}
.case-card__cover-img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
}
```

**对比参考**：`store-card` 用小图固定 `width/height: var(--size-store-card-thumb)`；首页 hero 同思路。

**勿用**：仅 `aspect-ratio: 16/9` + `image { height: 100% }` 作为全宽封面唯一方案。

### ⑥ 图片网络请求

Network 筛选该 `.jpg` / `.png`：

| Status | 处理 |
|---|---|
| 200 | 若仍不显示，几乎一定是 ⑤ CSS |
| 403 / 404 | 查 ECS/Nginx、文件是否存在 |
| 域名拦截 | 小程序后台配置 **downloadFile 合法域名**（如 `geo.simplewin.cn`）；开发者工具可临时「不校验合法域名」验证 |

## 首页 vs 案例 Tab 对照清单

同一案例、同一 URL 时，优先 diff 以下项：

```text
[ ] 是否同一组件（ui-case-card）
[ ] 页面是否都调用 pickCaseDisplayCover
[ ] 传给 case-card 的 props 是否一致（案例 Tab 勿多传无效 coverImageDesensitized）
[ ] case-card 是否在 list-page-shell slot 内（注意 loading 销毁重建）
[ ] 首页 hero 是否用小图固定尺寸而列表用大图 aspect-ratio（表现可不同）
[ ] case-card 是否在 ready() 同步 displayCover
```

## 本项目已落地修复（2026-05-28 案例封面）

| 文件 | 改动要点 |
|---|---|
| `utils/desensitize-url.js` | `pickCaseDisplayCover` 统一封面候选顺序 |
| `components/case-card/index.js` | `ready()` 同步；去掉 `onCoverError` 清空 |
| `components/case-card/index.wxss` | `padding-bottom` 比例盒替代 `aspect-ratio` |
| `pages/case/index.js` | `mapCaseListItem`；Tab 切换 `loadList({ silent: true })` |
| `pages/home/index.js` | 精选案例预解析封面 |
| `backend/.../content.service.js` | 读 API 从 album 回退封面 |
| `backend/.../public-case.service.js` | 发布时 `asset.idx`、可展示 URL 优先 |

## 输出格式（排查报告）

```markdown
# 图片不显示排查报告

## 现象
- 页面：
- 组件：
- 首页是否同资源可显示：

## 分层结论
| 层级 | 状态 | 证据 |
|---|---|---|
| ① API | ✅/❌ | coverImage=... |
| ② 页面 map | ✅/❌ | |
| ③ 组件 props | ✅/❌ | |
| ④ WXML src | ✅/❌ | |
| ⑤ CSS | ✅/❌ | |
| ⑥ 图片请求 | ✅/❌ | status= |

## 根因（一句话）

## 建议修改
- 文件 + 改法

## 回归验证
- [ ] 案例 Tab 列表封面
- [ ] 首页精选/hero
- [ ] 真机 + 合法域名
```

## 相关技能

- `privacy-desensitization-check` — 公开场景是否误用原图/temp
- `api-integration` — 列表 loading 与 silent 刷新
- `component-api-implementation` — 业务组件 image 属性约定
- `design-system-check` — `image-placeholder` 工具类使用
