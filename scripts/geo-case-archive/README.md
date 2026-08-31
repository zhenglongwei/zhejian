# geo-case-archive · 微信群归档转案例

> 融合自 WorkBuddy 讨论产出（2026-08-29），v0.2 于 2026-08-31 按《22_微信群归档转案例目标定义》重写。
> 背景：小程序冻结新功能，但案例生产不能停；多数门店用微信群记录维修过程。
> 定位：**不替代**微信群，做它的「沉淀出口」——师傅本来就在群里说话，说话即记录，商家零额外填写。

## 怎么用

分两个版本，共用同一套 service，区别只在门口。

| 版本 | 页面 | 谁用 | 门槛 |
|---|---|---|---|
| **公开试用** | `brand-web/archive.html`（官网 `/archive.html`） | 门店老板、任何访客 | 不要密钥，按 IP 限次 |
| **内部完整版** | `archiver.html`（线上 `/tools/wechat-archive.html`） | 我们自己 | 要归档密钥，不限次，带编辑与草稿箱 |

公开版是获客钩子：脱敏在用户本机先做一遍，服务端只收到脱敏后的文字、不落库；
跑完给出「这篇案例已经合格了，但它现在还只是一段文字」的转化卡，引到体检和榜单。

| 打开方式 | 地址 | 说明 |
|---|---|---|
| 线上（内部版） | `https://geo.simplewin.cn/tools/wechat-archive.html` | 后端同源托管，不用配接口地址 |
| 线上（公开版） | `https://simplewin.cn/archive.html` | 页面在官网，接口走 `geo.simplewin.cn` |
| 本地一次起两个 | `cd backend && npm run archive:local` | 8848 端口，页面和接口同源，最省事 |
| 本地文件 | 双击 `archiver.html` | 浏览器会拦相对路径请求，需在页面「⚙ 接口设置」里填接口地址 |

内部版首次使用：页面右上角「⚙ 接口设置」填一次归档密钥（`WECHAT_ARCHIVE_TOKEN`），存本机浏览器。

## 六步流程（对应文档 22 §6）

```text
① 粘贴群聊（纯文本，含 [图片]/[语音] 占位）
        ↓
② 本机脱敏：手机号 / 车牌 / 身份证 / VIN / 住址 / 昵称 → 占位符；发言人 → 发言人A/B/C
        ↓   ← 这一步可以手工改发言人和内容
③ 大模型理解整合 → 事实层 / 过程层 / 存疑项（不是规则匹配，22 D3）
        ↓
④ 人工确认：存疑项必须过人眼
        ↓
⑤ 按《07》生成案例要素：标题 / 摘要 / 正文九段 / 图说 / 本单问答 + 风控扫描
        ↓
⑥ 图片单独关联：图片不进剪贴板，须单独导出后挂到对应节点
```

## 文件

| 文件 | 用途 |
|---|---|
| `archiver.html` | 工具页面（六步流程 + 草稿箱，浏览器本地留存） |
| `backend/src/services/wechat-archive.service.js` | 解析 / 脱敏 / 事实提取 / 案例生成 / 风控扫描 |
| `backend/src/routes/internal-wechat-archive.js` | `/api/v1/internal/wechat-archive/{status,parse,extract,compose}`，要密钥 |
| `backend/src/routes/public-wechat-archive.js` | `/api/v1/public/wechat-archive/*`，不要密钥，按 IP 限次 + 全局总闸 |
| `brand-web/archive.html` + `brand-web/js/archive.js` | 官网公开试用页 |
| `backend/scripts/smoke-wechat-archive.js` | 服务层冒烟（默认不联网，大模型用桩） |
| `backend/scripts/smoke-archive-page.js` | 公开页冒烟：node 里跑一遍页面，防「一打开就报错」 |
| `backend/scripts/serve-archive-local.js` | 本地预览服务，一次起公开版 + 内部版 |
| `微信群归档操作手册.md` | 三条取图路径（截图投递 / 逐条转发 / 电脑另存）、命名规范 |
| `案例页模板.html` | 案例页示范（与 `h5/case/` 结构对照参考） |

## 硬限制（页面顶部已明示，不能只写手册）

| 内容 | 能否拿到 | 处理 |
|---|---|---|
| 文字 | ✅ | 直接解析 |
| 图片 | ❌ 只有 `[图片]` | 必须单独导出（第 6 步三条路径） |
| 语音 | ❌ 只有 `[语音]` | 手机长按 → 转文字 → 把文字补进对应消息 |
| 视频/文件 | ❌ 只有占位符 | 同图片 |
| 发言人昵称 | ✅ 含隐私 | 本机脱敏为 发言人A/B/C |

## 红线

- **先脱敏再送大模型**：未脱敏原文不出本机（页面脱一遍，接口再兜一遍）；
- **不许编造**（07 §1.3）：群里没说的一律留空，推断的必须进存疑项；
- **公域藏价**（07 §4.3）：金额可提取留档，绝不进公开文案，生成后还有一道风控扫描；
- **不做规则匹配提取**（22 D3）：群聊没有范本，17 的检查项只是喂给模型的「事实清单」；
- 禁用微信群自动化插件/机器人（封号风险）；禁用「合并转发」（折叠卡片取不出内容）；
- 案例必须真实发生，证据链完整才发布；宁缺毋滥。

## 自测

```bash
cd backend
node scripts/smoke-wechat-archive.js                       # 26 项：解析/脱敏/限额/前后端规则是否漂移
node scripts/smoke-archive-page.js                         # 11 项：公开页在 node 里真跑一遍
WECHAT_ARCHIVE_SMOKE_LLM=1 node scripts/smoke-wechat-archive.js   # 真调一次大模型
npm run archive:local                                      # 起本地预览，8848
```

**改了脱敏规则要同时改两处**：`backend/src/services/wechat-archive.service.js` 的 `MASK_RULES`
和 `brand-web/js/archive.js` 里的同名数组。`smoke-wechat-archive.js` 会逐条比对，
漂移了直接失败——浏览器那份是「原文不出本机」的唯一保障，少一条规则就是明文外泄。

## 公开试用的三道保险

| 保险 | 行为 |
|---|---|
| 每 IP 每天 20 次主配额（`WECHAT_ARCHIVE_PUBLIC_PER_IP`） | 用完返回 429，文案引导联系我们要专属入口 |
| 解析单独宽松计数（60 次/天） | 解析不调模型，不该占用主配额 |
| 全局总闸 300 次/天（`WECHAT_ARCHIVE_PUBLIC_DAILY_CAP`） | 一人公司的保险丝；总闸满了不误扣个人额度 |
| `WECHAT_ARCHIVE_PUBLIC_ENABLED=false` | 整体拉闸，接口全停（`/status` 仍可问，页面要据此显示「已关闭」） |

上游（大模型厂商）的报错原文只进服务端日志，公开接口统一回「服务暂时不可用，稍后再试」——
不能让外人知道我们用的哪家、密钥配没配对。内部版则照实说，方便排查。
