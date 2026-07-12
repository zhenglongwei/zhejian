## **1. 文档信息**


| 项目   | 内容                                            |
| ---- | --------------------------------------------- |
| 文档名称 | 结构化数据 Schema 规范                               |
| 当前版本 | V2.1                                          |
| 所属模块 | SEO/GEO/AI内容基础设施                              |
| 适用范围 | 首页、门店页、服务项目页、案例页、知识问答页、车型页、城市页                |
| 核心目标 | 通过 Schema.org JSON-LD 提升搜索引擎和 AI 系统对页面内容的理解能力 |
| 推荐格式 | JSON-LD                                       |
| 关联文档 | 《公开页面信息架构》《AI可引用摘要规范》《FAQ生成规范》《GEO信息增量与RAG专线开发计划》                |


---

## **2. 推荐支持的 Schema 类型**

推荐支持：

1. `LocalBusiness`
2. `AutoRepair`
3. `Service`
4. `Product`
5. `Review`
6. `AggregateRating`
7. `FAQPage`
8. `Article`
9. `HowTo`
10. `BreadcrumbList`
11. `ImageObject`
12. `Organization`
13. `WebSite`
14. `CollectionPage`
15. `Dataset`（V2.1 · 服务页案例聚合统计）

说明：

- `AutoRepair` 是 `LocalBusiness` 的更具体类型，门店页优先使用；
- 案例页可使用 `Article` + `Service` + `ImageObject` + `FAQPage`；
- 服务页在含案例聚合统计时，额外输出 `Dataset`（与 `Service` 等同 `@graph`）；
- 全站推荐使用 `@graph` + 稳定 `@id` 建立实体互链（见 §15）；
- FAQ 内容必须与页面可见内容一致；
- Review 必须来自真实评价。

---

## **3. 页面与 Schema 对应关系**


| 页面      | 推荐 Schema                                              |
| ------- | ------------------------------------------------------ |
| 首页      | WebSite, Organization, BreadcrumbList                  |
| 城市页     | CollectionPage, BreadcrumbList                         |
| 城市服务项目页 | Service, CollectionPage, FAQPage, BreadcrumbList       |
| 城市门店页   | CollectionPage, LocalBusiness 列表摘要, BreadcrumbList     |
| 服务项目页   | Service, FAQPage, Dataset（有聚合时）, BreadcrumbList                       |
| 项目案例页   | CollectionPage, Article 列表摘要, BreadcrumbList           |
| 车型页     | CollectionPage, FAQPage, BreadcrumbList                |
| 车型案例页   | CollectionPage, Article 列表摘要, BreadcrumbList           |
| 门店页     | AutoRepair, AggregateRating, Review, BreadcrumbList    |
| 门店案例页   | CollectionPage, Article 列表摘要, BreadcrumbList           |
| 案例详情页   | Article, Service, ImageObject, FAQPage, BreadcrumbList |
| 知识问答页   | FAQPage, Article, BreadcrumbList                       |


---

## **4. 通用要求**

1. Schema 使用 JSON-LD；
2. 每个公开页面至少包含 `BreadcrumbList`；
3. FAQ 页面必须包含 `FAQPage`；
4. 门店页优先使用 `AutoRepair`；
5. 案例详情页必须包含 `Article`；
6. 图片应使用可公开访问的图片 URL；
7. 所有结构化数据内容必须与页面可见内容一致；
8. 不允许在 Schema 中写页面没有展示的虚假内容；
9. 不允许写入隐私信息；
10. 不允许伪造评分和评价。

---

## **5. BreadcrumbList 规范**

适用页面：

1. 城市页；
2. 服务项目页；
3. 车型页；
4. 门店页；
5. 案例页；
6. 知识问答页。

示例：

```
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "首页",
      "item": "https://example.com/"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "上海汽车维修",
      "item": "https://example.com/city/shanghai"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "丰田凯美瑞刹车异响维修案例",
      "item": "https://example.com/case/456"
    }
  ]
}

```

---

## **6. 门店页 Schema**

门店页优先使用 `AutoRepair`。

### **6.1 必填字段**


| 字段           | 说明                       |
| ------------ | ------------------------ |
| @context     | 固定为 `https://schema.org` |
| @type        | `AutoRepair`             |
| name         | 门店名称                     |
| image        | 门店图片                     |
| address      | 门店地址                     |
| telephone    | 联系电话，建议平台统一电话            |
| openingHours | 营业时间                     |
| url          | 门店页 URL                  |


### **6.2 推荐字段**


| 字段              | 说明        |
| --------------- | --------- |
| aggregateRating | 可选；MVP 不使用交易 Review Schema |
| geo             | 经纬度       |
| priceRange      | 价格区间，谨慎使用 |
| areaServed      | 服务城市      |
| makesOffer      | 服务项目      |
| sameAs          | 外部主页，可选   |


### **6.3 示例**

```
{
  "@context": "https://schema.org",
  "@type": "AutoRepair",
  "name": "XX汽车维修中心",
  "image": "https://example.com/images/store/123-cover.jpg",
  "url": "https://example.com/store/123",
  "telephone": "400-000-0000",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "上海市",
    "streetAddress": "浦东新区XX路XX号"
  },
  "openingHours": "Mo-Su 09:00-20:00",
  "areaServed": {
    "@type": "City",
    "name": "上海"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "128"
  }
}

```

---

## **7. 服务项目页 Schema**

服务项目页使用 `Service`。

### **7.1 必填字段**


| 字段          | 说明      |
| ----------- | ------- |
| @type       | Service |
| name        | 服务项目名称  |
| description | 服务说明    |
| provider    | 平台或门店   |
| areaServed  | 服务区域    |
| url         | 页面 URL  |


### **7.2 示例**

```
{
  "@context": "https://schema.org",
  "@type": "Service",
  "name": "刹车片更换",
  "description": "刹车片更换服务包括刹车片检查、拆装、更换、制动系统检查和试车确认。",
  "provider": {
    "@type": "Organization",
    "name": "平台名称"
  },
  "areaServed": {
    "@type": "Country",
    "name": "中国"
  },
  "url": "https://example.com/service/brake-pad-replacement"
}

```

---

## **8. 案例详情页 Schema**

案例详情页建议组合使用：

```
Article + Service + ImageObject + FAQPage + BreadcrumbList

```

---

## **8.1 Article 字段**


| 字段               | 说明        |
| ---------------- | --------- |
| headline         | 案例标题      |
| description      | AI 可引用摘要  |
| image            | 案例图片      |
| datePublished    | 发布时间      |
| dateModified     | 更新时间      |
| author           | 平台或门店     |
| publisher        | 平台        |
| mainEntityOfPage | 当前案例页 URL |


### **示例**

```
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "上海丰田凯美瑞刹车异响维修案例",
  "description": "该案例为上海丰田凯美瑞在8.6万公里时进行刹车异响检查与刹车片更换的维修记录。检查发现前轮刹车片磨损接近极限，门店采用更换刹车片并检查刹车盘的方案完成处理。",
  "image": [
    "https://example.com/images/case/456-1.jpg",
    "https://example.com/images/case/456-2.jpg"
  ],
  "datePublished": "2025-01-10",
  "dateModified": "2025-01-12",
  "author": {
    "@type": "Organization",
    "name": "平台名称"
  },
  "publisher": {
    "@type": "Organization",
    "name": "平台名称",
    "logo": {
      "@type": "ImageObject",
      "url": "https://example.com/logo.png"
    }
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://example.com/case/456"
  }
}

```

---

## **8.2 ImageObject 规范**

适用：

1. 维修前图片；
2. 拆检图片；
3. 配件图片；
4. 维修后图片；
5. 门店图片。

示例：

```
{
  "@context": "https://schema.org",
  "@type": "ImageObject",
  "contentUrl": "https://example.com/images/case/456-before.jpg",
  "caption": "维修前刹车片检查图片，已进行隐私脱敏",
  "license": "https://example.com/terms"
}

```

---

## **9. FAQPage 规范**

FAQPage 用于案例页、服务项目页、车型页、知识问答页。

### **9.1 要求**

1. FAQ 必须在页面可见；
2. 每个页面建议 3-8 个 FAQ；
3. 答案不应编造价格；
4. 答案不应做绝对承诺；
5. 答案不应泄露隐私；
6. FAQ 内容应与页面主题相关。

### **9.2 示例**

```
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "刹车异响是否必须维修？",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "刹车异响不一定都需要立即更换配件，但建议尽快检查。如果异响持续存在，或伴随刹车距离变长、方向盘抖动、金属摩擦声，就需要检查刹车片、刹车盘和卡钳状态。"
      }
    },
    {
      "@type": "Question",
      "name": "继续使用有什么风险？",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "如果刹车片已经接近磨损极限，继续使用可能导致制动力下降、刹车盘拉伤或制动距离变长。具体风险需要结合实际检查结果判断。"
      }
    }
  ]
}

```

---

## **10. Review 与 AggregateRating 规范**

## **10.1 使用条件**

只有满足以下条件的评价才可进入 Schema：

1. 真实订单评价；
2. 评价已通过审核；
3. 用户未撤回；
4. 未命中风控；
5. 页面上实际展示；
6. 评分统计与页面一致。

---

## **10.2 禁止事项**

不得：

1. 伪造评价；
2. 只选择好评进入 Schema；
3. MVP 不使用 Review / AggregateRating 结构化数据（无交易评价）；
4. 将未审核评价计入；
5. 将隐藏评价计入；
6. 使用与页面展示不一致的评分。

---

## **11. Product Schema 使用边界**

`Product` 可用于具体服务商品或配件商品，但 MVP 阶段谨慎使用。

适用场景：

1. 标准服务商品；
2. 可明确购买的保养套餐；
3. 明确销售的配件商品。

不适用：

1. 单纯维修案例；
2. 未标价项目；
3. 不可直接购买服务；
4. 非标准化报价项目。

---

## **12. HowTo Schema 使用边界**

`HowTo` 可用于知识内容，但汽修领域存在安全风险，MVP 谨慎使用。

适用：

1. 简单检查说明；
2. 保养注意事项；
3. 非危险操作流程。

不适用：

1. 制动系统拆装指导；
2. 高压电系统维修；
3. 发动机深度维修；
4. 安全风险较高操作；
5. 可能诱导用户自行危险维修的内容。

---

## **13. 隐私与合规限制**

Schema 中禁止包含：

1. 用户真实姓名；
2. 手机号；
3. 微信号；
4. 车牌号；
5. VIN；
6. 精确个人地址；
7. 未授权人脸；
8. 支付信息；
9. 聊天记录；
10. 纠纷详情；
11. 未授权图片；
12. 未公开订单号。

---

## **14. 生成与校验流程**

```
页面发布
→ 检查页面类型
→ 读取页面数据
→ 生成 JSON-LD
→ 隐私字段过滤
→ Schema 字段校验
→ 页面渲染
→ 搜索引擎结构化数据测试
→ 上线

```

---

## **15. 实体图谱 @id 规范（V2.1）**

> 任务真源：[`09_GEO信息增量与RAG专线开发计划.md`](./09_GEO信息增量与RAG专线开发计划.md) 阶段 C

### **15.1 目标**

让 AI 爬虫无需猜测实体关系：辙见平台、门店、服务、案例之间通过 **稳定 `@id`** 互链。

### **15.2 @id 约定**

| 实体 | @id 格式 |
| --- | --- |
| 平台 Organization | `{canonicalBase}/#organization` |
| 门店 AutoRepair | `{canonicalBase}/store/{storeId}#autorepair` |
| 服务 Service | `{canonicalBase}/service/{slug}#service` |
| 案例 Article | `{canonicalBase}/case/{slug}#article` |
| 聚合 Dataset | `{canonicalBase}/service/{slug}#dataset` |

### **15.3 @graph 最小示例（服务页）**

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://geo.example.com/#organization",
      "name": "辙见"
    },
    {
      "@type": "Service",
      "@id": "https://geo.example.com/service/brake-pad#service",
      "name": "刹车片更换",
      "provider": { "@id": "https://geo.example.com/#organization" }
    },
    {
      "@type": "Dataset",
      "@id": "https://geo.example.com/service/brake-pad#dataset",
      "name": "刹车片更换脱敏案例聚合统计",
      "description": "近12个月公开脱敏案例统计，样本N=23",
      "isPartOf": { "@id": "https://geo.example.com/service/brake-pad#service" }
    }
  ]
}
```

### **15.4 案例页互链**

- `Article.publisher` → Organization `@id`
- `Article.about` → Service `@id`（若有）
- `Article.provider` → AutoRepair `@id`（门店页）

---

## **16. Dataset Schema（服务页聚合统计）**

当服务页展示案例聚合统计（见《AI可引用摘要规范》§15）时，输出 `Dataset`：

| 字段 | 说明 |
| --- | --- |
| name | `{服务名}脱敏案例聚合统计` |
| description | 与页面可见统计句一致 |
| temporalCoverage | 统计窗口，如 `P12M` |
| variableMeasured | 样本量、价格区间、主因分布等（文本或 QuantitativeValue） |
| isPartOf | 指向同页 `Service` `@id` |

**禁止**：Dataset 中写入页面未展示的数字或隐私字段。

---

## **17. P0 验收标准**

P0 必须满足：

1. 案例页支持 Article；
2. 案例页支持 FAQPage；
3. 案例页支持 BreadcrumbList；
4. 门店页支持 AutoRepair；
5. 服务项目页支持 Service；
6. FAQ 内容与页面可见内容一致；
7. Schema 不包含隐私信息；
8. Review 不允许伪造；
9. 页面可通过结构化数据基础校验；
10. 后台可查看 Schema 生成状态。

---

## **18. 案例 trustMeta Schema（V2.2 · 2026-07-13）**

> 任务真源：[`10_案例信任元数据开发计划.md`](./10_案例信任元数据开发计划.md)

### **18.1 目标**

案例页除 Article 事实摘要外，输出 **授权/审核/脱敏/版本** 等信任信号，弥补公开图减少后的 EEAT 缺口。

### **18.2 实现方式**

在案例页 `@graph` 的 `Article` 节点增加 `additionalProperty`（`PropertyValue` 数组）：

| name | 示例 value | 来源 |
| --- | --- | --- |
| `authorizationTier` | `user_authorized` | trustMeta |
| `authorizationTierLabel` | 用户授权案例 | trustMeta |
| `snapshotVersion` | `2` | trustMeta |
| `reviewedAt` | `2026-03-16` | trustMeta |
| `evidenceLevel` | `partial_images` | trustMeta |
| `desensitized` | `true` | trustMeta |

### **18.3 约束**

1. 字段与 H5 可见区、JSON Feed `trustMeta` **一致**；
2. 禁止写入运营员姓名、用户隐私、完整审核对话；
3. 不得与 Article `description`（快照摘要）矛盾。

### **18.4 案例页 @graph 扩展**

- `Article` → `additionalProperty` 含 trustMeta
- `Article` → `about` → Service `@id`（若有）
- `Article` → `provider` → AutoRepair `@id`（门店）

---

## **19. Dataset Schema 高阶扩展（V2.2 · 2026-07-13）**

> 任务真源：[`11_GEO高阶聚合开发计划.md`](./11_GEO高阶聚合开发计划.md)

当服务页展示 `aggregateStats.advanced` 时，扩展 `Dataset.variableMeasured`：

| 变量名 | 说明 |
| --- | --- |
| `causePriceCross` | 主因×价区交叉（文本描述） |
| `mileageBandDistribution` | 里程段分布 |
| `processMetrics` | 过程完整度（如拆检图占比） |
| `inspectToPlan` | 检查结论→方案转化 |

**禁止**：Dataset 写入页面未展示的 advanced 字段；N < 门槛时不出百分比。

