# Skill: Desensitize Engine（真实自动脱敏）

## 目标

指导 **B-MASK-03/04/06** 的实现与验收：用真实 OCR/视觉打码替换 MVP「复制原图」stub，并与卷一脱敏任务链兼容。

## 使用场景

- 实现或改造 `backend/src/services/media.service.js` 脱敏逻辑
- 接入第三方 OCR/车牌/人脸 API，或自建打码 pipeline
- 联调 `service_pre_mask` / `POST /media/:mediaId/desensitize`
- B-MASK-04 风险等级与 OCR 结果落库
- B-MASK-06 失败态与重试

## 必读文档

- `docs/00_开发计划.md` §7.1.1（验收口径）
- `docs/04_维修过程相册/06_自动脱敏规则.md` §7–§9
- `docs/04_维修过程相册/08_图片脱敏工具PRD.md` §3.1、§8.1
- `docs/10_技术架构与接口/05_图片视频上传API.md` §9.6、§12
- 现有代码：`media.service.js`、`desensitize.service.js`

## 实现约束

0. **状态机真源**：`skill_node_mask_state_machine.md`。打码结论写回**节点图对象**；MediaAsset 仅文件登记，不得当展示/是否再跑的真源。
1. **禁止**将原图 `copyFile` 后直接标成功（`desensitizeStatus=SUCCESS` / `ok_masked`）（除非明确标注为 dev-only flag）。
2. 公开读侧：有 `maskedUrl` 用打码图；`ok_no_privacy` 或托管重试仍失败 → **允许原图**（责任在商家）。运营审核 API 仍不返回 `rawUrl` 给审核员。
3. **看图**不单独调用车牌、人脸、VIN、通用文字识别，也不挡归组。车架号、人脸、手机号、姓名、证件由同一次分析给出区域，认到了就打。分析确认没有敏感区 → `ok_no_privacy` 可用原图。没打上遮挡的原图**不得**标成 `ok_masked`。上传提醒不能代替人脸打码。
4. 单张失败 → 节点记 `llm_failed` / `mask_failed` / `not_analyzed`；托管按状态机重试；重试后仍失败可上网原图；**不得**冒充 `maskingConfirmed` / `ok_masked`。
5. 前端契约不变：工作台「一键脱敏」仍调现有 task/media 接口，但成功必须写回节点。
6. 第三方密钥仅 `backend/.env`；日志不得打印原图 signed URL 全量。
7. **已成功标识（节点 `ok_masked` / `ok_no_privacy`）的图不得重打**（含引擎版本升级、案例预览、授权预览、后一节点归组）。`not_analyzed` 与 `llm_failed` 须重跑大模型；仅贴码失败才只重贴。
8. **商家归组不得等整本预打码就绪**、不得为扫整本假打码挡住识图。整本名单后台补。进度页闸门见 `skill_merchant_flow_photo_pipeline.md`。
9. 同一张图若已在打码，其它调用合并等待，禁止并行打第二遍。
10. **看图用原图，不再先打码。** 禁止为了把图送给模型，先去调车牌、人脸、车架号或通用文字识别。

## 输出格式（实现前）

```md
## 脱敏引擎实现计划

### 任务 ID
B-MASK-03 / 04 / 06

### 方案选型
- 引擎：第三方 API / 自建 / 混合
- 存储：沿用 uploads/desensitized/

### 文件变更
- backend/src/services/...
- prisma schema（若有 OCR 结果表）

### 数据模型
- desensitizeStatus 枚举
- ocrResult / riskLevel 字段

### 联调路径
pre-mask → desensitize → authorize preview → public case

### 测试样图
- 含车牌 / 含人脸 / 含 VIN 文字 / 干净图

### 风险与回滚
```

## 验收检查（实现后）

| # | 项 | 通过标准 |
| ---: | --- | --- |
| 1 | 真实打码 | 样图敏感区可见遮挡，非原图复制 |
| 2 | 失败诚实 | 识别失败不标 SUCCESS |
| 3 | 任务链 | pre-mask 产物 URL 可加载且为打码图 |
| 4 | 公开 API | 案例/首页 cover 仍为 desensitized 路径 |
| 5 | 落库 | B-MASK-04 OCR/风险可供运营台读取（或 stub 字段就绪） |
| 6 | 不重打 | 已 SUCCESS 的图在工单/预览/引擎升级后仍复用 |
| 7 | 不挡归组 | 整理只查本批成功标识，不调用整本就绪闸 |

## 约束

- 先替换 engine，再开 OPS-MASK-01 运营 UI。
- 与 `privacy-desensitization-check` 联用：区分「URL 隔离」与「像素级打码」。
- 故障排查（日志 SUCCESS 但车牌仍清晰、VIAPI/OCR/pre-mask）：用 `skill_desensitize_plate_debug.md`（`.cursor/skills/desensitize-plate-debug/`）。
