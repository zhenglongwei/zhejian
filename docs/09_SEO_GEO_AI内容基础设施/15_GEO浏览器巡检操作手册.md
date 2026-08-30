# GEO 浏览器巡检 · 操作手册

> 对应代码：`backend/src/services/geo-browser-probe/`（driver / session / runner / platforms / questions）
>
> 状态：**搜索引擎通道完全跑通**（百度 / 360 / 必应，13 家门店实测 18/18 全绿）；
> 5 大模型通道受登录态制约，跑 `npm run geo:probe:login` 后即可开测。

## 1. 这套东西解决什么

原方案要门店手动提交 10 题 × 5 个大模型 × 截图——**门店根本不会做**。改成程序开浏览器自动跑。

### 1.1 三条通道，三个分数

| 通道 | 平台举例 | 问什么 | 测出来的是什么 | 跑得动吗 |
| --- | --- | --- | --- | --- |
| 搜索引擎网页实测 | 百度 / 360 / 必应 | **带店名**的查询 | **网页实测地基分** —— 车主搜你名字，搜出来的是什么 | ✅ 免登录 |
| 大模型网页版 | 豆包 / 通义 / 元宝 | **不带店名**的业务题 | **AI 可见性分** —— 车主不问店名时，AI 会不会主动想到你 | ⚠️ 需登录态 |
| 联网接口 | 通义 / 混元 / 豆包 API | 拿企业名查全网 | **接口联网分** —— 另一条路，不等于网页端实测 | ✅ 走 API |

**任何一个分数都不能顶替另一个。** 门店会拿着分数去 AI 那里求证，一旦对不上，榜单和公司信誉一起完蛋。

### 1.2 为什么题库要按平台类型拆开

这是踩过的最大的坑，值得单独说清楚。

最早我们给百度/360 喂的是「杭州底盘异响常见原因」这种**不带店名**的问题。结果 13 家门店清一色 17 分、0% 提及，彻底排不出名次。

原因不是数据造假，是**活儿派错了**：

- 搜索引擎的强项是「拿名字搜」，弱项是「不带名字的推荐类问题」——后者只会返回通用文章，永远不会点名一家小店；
- 大模型的强项恰恰是不带名字的开放推荐。

让搜索引擎干大模型的活，等于让鱼爬树。所以现在题库分两套，按 `platform.type` 自动派发：

| 平台类型 | 用哪套题 | 例子 |
| --- | --- | --- |
| `search`（百度/360/必应） | `namedQuestions` 带店名 | 「杭州广明汽车服务有限公司」「广明汽车服务有限公司 地址 电话 营业时间」 |
| `chat`（豆包/通义/元宝） | `questions` 不带店名 | 「杭州底盘异响常见原因有哪些」 |

拆开之后，同一批门店的分数**立刻分化**：

```
79 / 78 / 74 / 70 / 70 / 69 / 59     ← 同一个城市、同类型的汽修门店
```

题库在 `questions.js`：`DEFAULT_TEMPLATES`（不带名）和 `NAMED_TEMPLATES`（带名）两组，各按行业（汽修 / GEO / 通用）分桶。外部配置文件可以整体替换。

## 2. 第一次跑通：3 步

```bash
cd backend
npm install                                  # 装 playwright-core（已装）
npm run geo:probe:status                     # 看环境：浏览器在不在、profile 在不在
npm run geo:probe:login                      # 一次性登录：弹窗 → 扫码 → cookie 落盘
```

`geo:probe:login` 会**非无头**打开 Chrome，逐个平台（豆包/通义/元宝）轮询登录墙是否消失，每 3 秒一次，最多等 5 分钟。人扫完码就消失，脚本自动进下一家。

完成后：
- `backend/data/geo-probe-profile/` 里有了持久化 cookie/localStorage
- 之后所有巡检复用这个 profile，不重复弹登录
- 失效时（cookie 过期、平台主动下线）该平台的题会记 `login_required`，不影响别的平台

**只跑搜索引擎通道的话，登录这步可以跳过**——百度/360/必应都不需要登录。

## 3. 登录态与验证码策略

> 老板已拍板：**手动登录一次 + 持久化**（不接打码平台，不绕过风控）

| 现实限制 | 我们的处理 | 在哪里体现 |
| --- | --- | --- |
| 大模型网页版要求登录 | `needsLogin: true` 自动跳过没登录的，回执留 `login_required` | platforms.js + 路由自动筛选 |
| 登录态过期 | 探到登录墙关键词（"登录以解锁"/"扫码登录"等）→ 立刻终止该平台剩余题目 | driver.waitForAnswerSettle 每次轮询都检测 |
| 验证码 / 滑块 | 探到风控关键词 → `ProbeAbort('captcha')` → 该平台剩余题目全部 stub | 同上 + 终止平台逻辑 |
| 选择器改版 | 多候选选择器数组，全失败才报 `selector_broken` | platforms.js + driver.findFirstVisible |
| 搜索平台偶发渲染超时 | **额外容忍一次重试**，两次都失败才判死 | runner.retryStatusesFor |
| 一题卡死烧光时间 | 临时性失败（`error`/`timeout`）重试 1 次；连 2 题失败就熔断 | runner.MAX_CONSECUTIVE_FAILURES |
| 整轮无止境拖 | 总时长预算（默认 10 分钟），超了剩题记 `timeout` | runner.runDeadline + GEO_BROWSER_RUN_BUDGET_MS |
| 进程被 kill 留僵尸 | 每次开跑前回收 `running` 超过 30 分钟的批次 | runner.reclaimStaleRuns + `npm run geo:probe:rescore -- --stale 1` |
| 单 IP 频率限制 | `minIntervalMs`（查询间隔）+ `maxQuestionsPerSession`（每场题数上限）+ **门店之间冷却** | platforms.js + 批量脚本 `--cooldown` |
| 自动化特征 | `keyboard.type` 30ms/字（不 `fill`）、`userAgent` 设桌面 Chrome | session.launchOptions |

**铁律：抓不到就是抓不到。** 任何失败状态（`login_required`/`captcha`/`selector_broken`/`timeout`/`error`）**绝不**当成「没被提到」计入分母。`mentioned` 是三态（`true`/`false`/`null`），`null` 就是未知。

### 3.1 频率控制的经验值

| 平台 | minIntervalMs | 为什么 |
| --- | --- | --- |
| 百度 | **15000** | 4 秒连查时，第 5 家门店就弹安全验证，之后整轮全废。放慢就能跑完 |
| 360 | 4000 | 实测稳定 |
| 必应 | 4000 | 实测稳定（连查 18 次零失败） |

批量脚本还有一道 `--cooldown 45`（门店之间 45 秒）；一旦撞上验证码会自动翻倍到 90 秒，给风控衰减的时间。

**宁可慢一点跑完，也不要快一点全军覆没。**

### 3.2 新增或校准一个平台（照这个顺序做）

平台 UI 一改就 `selector_broken`，所以这件事会反复发生。按下面四步走，不要凭直觉猜选择器：

1. **导 DOM**：`node scripts/probe-dom-dump.js`，看真实页面里结果节点的标签、class、以及 `<a>` 上挂了哪些属性（真实地址可能在 `mu` / `data-landurl` / `data-url` 上，不一定在 `href`）。
2. **写进 `platforms.js`**：`resultSelectors` 给多个候选，`titleSelectors` / `snippetSelectors` / `sourceSelectors` 同理，按**命中概率从高到低**排。
3. **抽样验证**：`node scripts/probe-search-smoke.js`，看能拿到几条结果、几条有真实域名、几条有来源标识。理想状态是「结果条数 = 有域名条数 = 有来源条数」。
4. **压测节奏**：`node scripts/diagnose-bing.js "某店名" 3`（连查 18 次）。**这一步能区分「平台挂了」和「我们被限流了」**——单独连查全绿却在真实巡检里失败，那就是渲染抖动，不是选择器问题。

踩过的具体坑，都写在 `platforms.js` 的注释里：
- 百度：改版后 `mu` 属性没了，只剩 `/link?url=` 跳转；来源站名在 `.cosc-source-text`（爱企查/天眼查/百度百科）
- 360：`.result` 是**包住全部结果的 UL**（7 条抓成 1 条），`.res-list li` 会先命中地图卡片的子项，正确顺序是 `li.res-list` 优先
- 必应：会 302 到 `cn.bing.com`，结果节点稳定是 `li.b_algo`

## 4. 日常使用

```bash
# 单家门店体检
npm run geo:probe:browser -- --name "杭州某某汽车维修" --city 杭州 --industry 汽修

# 批量（公开抽样，进榜单）
npm run geo:probe:browser -- --file data/geo-probe-shops.sample.json \
  --platforms baidu_web,so_web,bing_web --source BATCH --cooldown 45

# 评分规则改了，重算历史（不回浏览器，只重算分数）
npm run geo:probe:rescore                          # 只补算没分的
npm run geo:probe:rescore -- --all                 # 全量重算
npm run geo:probe:rescore -- --stale 1             # 同时回收 1 分钟以上的僵尸批次

# 排查工具
node scripts/diagnose-bing.js "杭州某店" 3         # 连查 18 次，看某平台是不是真的挂了
node scripts/probe-search-smoke.js                 # 各搜索平台抓域名/来源的抽样体检
node scripts/probe-dom-dump.js                     # 导出结果节点 DOM，用于校准选择器

# 页面渲染冒烟
node scripts/diagnose-page.js rank                 # 榜单页：统计条、三分数对照、表格行数
node scripts/diagnose-page.js check                # 体检页：只验静态文案，不调接口
npm run geo-check:page-smoke                       # 体检页全流程：带桩接口，不联网不写库
```

### 4.1 改完前端用哪个脚本验

| 改动位置 | 用哪个 | 它验到哪一层 |
|---|---|---|
| `brand-web/rank.html` / `js/rank.js` | `diagnose-page.js rank` | 打真接口，看榜单渲染 |
| `brand-web/check.html` 静态文案 | `diagnose-page.js check` | 只渲染页面，不调接口 |
| `brand-web/js/check.js` **任何改动** | `geo-check:page-smoke` | **点提交 → 出接口联网分 → 点巡检 → 出双分数对照，16 条断言** |

`geo-check:page-smoke` 为什么必须存在：体检第一步要调百度、通义、混元、豆包四个外部接口，
本机通常一个密钥都没配，页面只会显示「后端还没配检索密钥」，这条渲染路径就再也没被自动验过。
脚本起一个桩接口喂结构完全真实的假数据，把 `check.js` 从头渲染到尾——不联网、不花钱、不写库。
它盯的是三类最容易翻车的错：分数渲染成 `undefined/undefined`、`未测` 被 0 顶替、
「截图 / 手动补测」这类已下线的字样死灰复燃。

参数速查：
- `--questions N` 每平台题数（默认 3，最大 6）
- `--platforms a,b,c` 限定平台，逗号分隔，**顺序即访问顺序**
- `--source SELF|BATCH` SELF=用户主动，BATCH=我们抽样
- `--cooldown N` 门店之间冷却秒数（默认 45）
- `--headless` 显式指定是否无头（带登录态建议开着看效果）

## 5. 三个分数怎么算出来的

### 5.1 AI 可见性分（100 分）

只用 `chat` 型平台的有效回执，问不带店名的业务题。

| 维度 | 权重 | 含义 |
| --- | --- | --- |
| 提及率 | 50 | 有效回执里被主动提到的比例 |
| 位次 | 30 | 首次出现的字符位置，越靠前越高 |
| 准确度 | 20 | 店名对得上、引用来源对得上的比例 |

### 5.2 网页实测地基分（100 分）

只用 `search` 型平台的有效回执，问带店名的查询。

| 维度 | 权重 | 含义 |
| --- | --- | --- |
| 命中率 | 30 | 带店名查了 N 次，几次在结果里找到了这家店 |
| 首条位次 | 30 | 首次命中位次的**中位数**（只有一次排第一不算数，次次排第八才是真没人看得见） |
| 来源质量 | 25 | 按「车主会不会真看这里」加权：地图/本地生活 1.0 > 社区内容 0.8 > 其他 0.6 > 工商黄页 0.4 |
| 来源广度 | 15 | 命中的独立来源个数，3 个及以上满分 |

### 5.3 总分怎么合

- 同一轮两块都测到了 → `0.6 × 可见性 + 0.4 × 地基`，标签写「综合分」
- 只测到一块 → **就用那一块**，标签如实写「网页实测地基分」或「AI 可见性分」

**绝不因为「反正有个数」就把单块成绩标成综合分。** 门店会拿这个数字去求证。

### 5.4 榜单排序规则

样本不足的沉底 → **分数降序** → 同分时测得越全的靠前 → 覆盖率 → 置信度。

这里也踩过坑：最早把「测过可见性」当第一排序键，结果 9 条 0 分的旧数据全部浮到榜首，78 分的新数据沉到第 10 名。**测过不等于测得好**，0 分是真实结果，但没资格压在 78 分上面。

### 5.5 测量槽：历史批次怎么取

一家门店名下可能有多批次的浏览器巡检（有的测到可见性、有的测到地基）。早期版本按「通道各取一条」，结果可见性批次（置信度 100%）会把刚跑出来的地基批次（因为必应抽风只到 67%）**整个挤掉**，门店的 79 分当场雪藏。

现在按「测到了什么」分成三个互不干扰的槽：

- 网页端 AI 可见性 ← 任何 BROWSER 批次里 `visibilityScore` 非空的最优者
- 网页实测地基 ← 任何 BROWSER 批次里 `foundationScore` 非空的最优者
- 接口联网 ← API 通道最优批次

见 `geo-ranking.service.js` 的 `pickMeasurementSlots`。

## 6. 看榜单

```bash
curl -s --noproxy '*' "http://127.0.0.1:3000/api/v1/public/geo-ranking?limit=30" | jq
```

返回结构：
- `summary` 全局统计：`avgVisibility`（平均可见性）/ `avgBrowserFoundation`（平均地基）/ `avgApiNetwork`（平均接口）/ `zeroMention`（AI 零提及家数）/ `directoryOnly`（只有工商档案的家数）
- `rows[]` 每行三个分数各自成列，没测的列显示 `null`，前端渲染成「未测」
- `scoreType` / `scoreLabel` 说明主排序分数用的是哪一个：`overall` / `browser_foundation` / `visibility` / `api_network`
- `confidence < 50%` 标 `insufficient` 沉底
- `directoryOnly: true` —— 命中的来源里六成以上是企查查/天眼查这类工商黄页。这是最值得门店看的一行：**你活在工商档案里，但你没有自己的经营资产**。

## 7. 数据出口

- `geo_check_target` 门店档案（`[name, city]` 唯一）
- `geo_check_run` 巡检批次（带 `channel: API|BROWSER`、`configJson` 冻结问题清单、平台顺序和 `platformTypes`）
- `geo_check_answer` 单条回执（`mentioned` 三态；`status` 8 种：`ok`/`error`/`login_required`/`captcha`/`selector_broken`/`timeout`/`skipped`/`dry_run`）
- `geo_check_score` 评分，含 `visibilityScore` / `foundationScore` / `measuredScope` 三列（迁移：`20260830100000_geo_score_split`）

新增店：`source: SELF` 的可见可联系（`authorized=true` 才会露联系方式）；`source: BATCH` 的只露店名 + 分数。**BATCH 门店没拿到授权前不露联系方式**。

## 8. 当前已知的限制

1. **AI 可见性分目前全是「未测」**——豆包/通义/元宝网页版要登录态，老板还没扫码。这是下一块要补的拼图，也是整个产品最有说服力的那一列。
2. **百度拿不到真实落地域名**——改版后自然结果只剩 `/link?url=` 跳转，`mu` 属性没了。好在结果块底部有 `.cosc-source-text` 显示来源站名（爱企查/天眼查/百度百科），来源归属和生态判定按站名算，比按跳转域名准。
3. **选择器要随平台改版**——平台 UI 一改就可能 `selector_broken`。有 `probe-dom-dump.js` 可导出真实 DOM 用于校准，不是大问题但要人盯。
4. **同名不同司的误匹配**——「杭州广明汽车服务有限公司」和「杭州广明汽车销售服务有限公司」是两家。搜索匹配用的是**严版变体**（只保留 ≥6 字的名称变体），实测能挡住。
5. **接口联网分目前只有 1 家有**——那是盈简自己，100 分。等它和网页实测分都有样本时，两者的落差就是白皮书的核心素材。

## 9. 下一步

- [ ] **老板跑 `npm run geo:probe:login`**（豆包/通义/元宝扫码）→ 补上 AI 可见性这一列
- [ ] 登录后重跑 13 家 → 榜单同时有地基分和可见性分，落差就是给门店看的最好教材
- [ ] 白皮书：以「接口说你被收录了 / 真机搜你名字只剩 X 分 / AI 压根不知道有你」这条落差为主线
- [ ] 案例库：归档脚本已就绪，从微信群导案例 → 上案例页

---

**配置文件位置**：`backend/config/geo-probe-platforms.json`（外置）和 `src/services/geo-browser-probe/platforms.js`（默认）。改平台、调题库、换浏览器路径，都改这里，不用动核心逻辑。
