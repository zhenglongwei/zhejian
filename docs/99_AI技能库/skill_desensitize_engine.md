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

1. **禁止**将原图 `copyFile` 后直接标 `desensitizeStatus=SUCCESS`（除非明确标注为 dev-only flag）。
2. 公开链路只消费 `desensitizedUrl`；C 端/H5 读 API 不得返回 `rawUrl`。
3. 识别目标（Phase 1 最低）：车牌、人脸、VIN、手机号、单据敏感区。
4. 单张失败 → `NEED_MANUAL` 或 `FAILED`，可重试；**不得** `maskingConfirmed`。
5. 前端契约不变：工作台「一键脱敏」仍调现有 task/media 接口。
6. 第三方密钥仅 `backend/.env`；日志不得打印原图 signed URL 全量。

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

## 约束

- 先替换 engine，再开 OPS-MASK-01 运营 UI。
- 与 `privacy-desensitization-check` 联用：区分「URL 隔离」与「像素级打码」。
- 故障排查（日志 SUCCESS 但车牌仍清晰、VIAPI/OCR/pre-mask）：用 `skill_desensitize_plate_debug.md`（`.cursor/skills/desensitize-plate-debug/`）。
