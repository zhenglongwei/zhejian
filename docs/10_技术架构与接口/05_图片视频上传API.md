## **1. 文档信息**


| 项目   | 内容                            |
| ---- | ----------------------------- |
| 文档名称 | 图片视频上传API                     |
| 当前版本 | V1.0                          |
| 适用范围 | 用户端、商家端、运营后台                  |
| 核心目标 | 支持图片/视频安全上传、压缩、缩略图、脱敏、审核和业务绑定 |


---

## **2. 需要支持的能力**

需要支持：

1. 获取上传凭证；
2. 分片上传，后期支持；
3. 上传回调；
4. 图片压缩；
5. 缩略图生成；
6. 脱敏任务创建；
7. 审核状态查询。

---

## **3. 上传方式**

推荐采用：

```
前端直传对象存储

```

即：

```
前端 → 后端获取上传凭证
前端 → 对象存储上传文件
对象存储 → 后端上传回调
后端 → 创建媒体记录和处理任务

```

优点：

1. 减少后端带宽压力；
2. 上传速度更快；
3. 更适合图片和视频；
4. 便于接入 CDN；
5. 便于异步处理。

---

## **4. 上传业务场景**


| 场景     | 上传端    | 说明        |
| ------ | ------ | --------- |
| 用户头像   | 用户端    | 用户头像      |
| 用户报修图片 | 用户端    | 下单时上传故障图片 |
| 门店封面   | 商家端/后台 | 门店展示图     |
| 门店资质   | 商家端/后台 | 营业执照、资质证明 |
| 维修前图片  | 商家端    | 订单履约      |
| 拆检图片   | 商家端    | 订单履约      |
| 配件图片   | 商家端    | 订单履约      |
| 维修后图片  | 商家端    | 订单履约      |
| 案例图片   | 后台/系统  | 公开案例      |
| 评价图片   | 用户端    | 用户评价      |
| 视频记录   | 商家端    | 维修过程视频，后期 |


---

## **5. 文件类型限制**

## **5.1 图片**

允许：

```
jpg
jpeg
png
webp

```

建议限制：

```
单张图片不超过 10MB

```

---

## **5.2 视频**

允许：

```
mp4
mov

```

建议限制：

```
单个视频不超过 200MB

```

MVP 阶段可先只支持图片，视频后期开放。

---

## **6. 媒体状态**

```
INIT              初始化
UPLOADING         上传中
UPLOADED          已上传
PROCESSING        处理中
COMPRESSED        已压缩
THUMBNAILED       已生成缩略图
DESENSITIZING     脱敏中
WAIT_AUDIT        待审核
APPROVED          审核通过
REJECTED          审核驳回
FAILED            处理失败
DELETED           已删除

```

---

## **7. 媒体用途枚举**

```
USER_AVATAR
USER_REPORT
STORE_COVER
STORE_LICENSE
ORDER_BEFORE
ORDER_INSPECTION
ORDER_PARTS
ORDER_AFTER
CASE_IMAGE
REVIEW_IMAGE
VIDEO_RECORD
OTHER

```

---

## **8. API 通用响应格式**

```
{
  "code": 0,
  "message": "success",
  "data": {},
  "requestId": "req_xxx"
}

```

---

# **9. API 列表**

## **9.1 获取上传凭证（阿里云 OSS PostObject）**

### **接口**

```
POST /api/v1/media/upload-token

```

### **说明**

小程序上传前向后端申请 **PostObject** 表单字段；文件直传私有 Bucket `zhejianoss`（地域 `cn-hangzhou`），不经 ECS 中转。
须登录（用户 / 商家）。`OSS_ENABLED=true` 时可用；未开启时返回业务错误，可降级走 `POST /media/upload`。

对象路径约定（与现网一致）：

```
uploads/YYYY/MM/{32位hex}.{jpg|jpeg|png|webp}
```

---

### **请求参数**

```
{
  "fileName": "brake-before.jpg",
  "fileType": "image/jpeg",
  "fileSize": 2048000
}

```

---

### **字段说明**


| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| fileName | string | 是 | 原始文件名（用于推断扩展名） |
| fileType | string | 否 | MIME；与扩展名二选一校验 |
| fileSize | number | 否 | 字节；超过 10MB 拒绝 |


---

### **响应示例**

```
{
  "code": 0,
  "message": "success",
  "data": {
    "host": "https://zhejianoss.oss-cn-hangzhou.aliyuncs.com",
    "objectKey": "uploads/2026/07/a1b2c3d4e5f6789012345678abcdef01.jpg",
    "key": "uploads/2026/07/a1b2c3d4e5f6789012345678abcdef01.jpg",
    "policy": "<base64-policy>",
    "signature": "<base64-hmac-sha1>",
    "OSSAccessKeyId": "<ak>",
    "success_action_status": "200",
    "securityToken": "",
    "expireAt": "2026-07-31T12:15:00.000Z",
    "maxSize": 10485760
  }
}

```

`securityToken`：ECS RAM 角色临时凭证时非空，须一并放入 `wx.uploadFile` 的 `formData`（字段名 `x-oss-security-token`）。

---

### **处理逻辑**

```
校验登录态
→ 校验扩展名 / MIME / 大小
→ 生成 objectKey
→ 用服务端凭证签 PostObject policy（短 TTL，默认 15 分钟）
→ 返回 host + 表单字段（不落 media_assets，完成后再建）

```

---

## **9.2 前端通知上传完成**

### **接口**

```
POST /api/v1/media/upload-complete

```

### **说明**

小程序 PostObject 成功后调用。后端 Head/Get 对象 → sharp 去 EXIF + 缩略图 → 回写 OSS → 创建 `media_assets` → 返回与旧 `POST /media/upload` 一致的 `url` / `thumbUrl` / `mediaId`。
库内 URL 仍为规范路径：`{PUBLIC_BASE_URL}/api/v1/media/files/{objectKey}`（读侧再签发 OSS 签名 URL）。

---

### **请求参数**

```
{
  "objectKey": "uploads/2026/07/a1b2c3d4e5f6789012345678abcdef01.jpg"
}

```

---

### **响应示例**

```
{
  "code": 0,
  "message": "success",
  "data": {
    "mediaId": "media_xxx",
    "url": "https://geo.simplewin.cn/api/v1/media/files/uploads/2026/07/….jpg",
    "mediaUrl": "https://geo.simplewin.cn/api/v1/media/files/uploads/2026/07/….jpg",
    "thumbUrl": "https://geo.simplewin.cn/api/v1/media/files/uploads/2026/07/…_thumb.jpg",
    "width": 1920,
    "height": 1080,
    "objectKey": "uploads/2026/07/….jpg"
  }
}

```

---

### **幂等要求**

同一 `objectKey` 多次 complete：复用已有 `media_assets`，可再次跑缩略图处理（不重复插库）。

---

## **9.3 对象存储上传回调（本期不做）**

本期以 **upload-complete** 为准，不依赖 OSS 服务端回调。预留接口：

```
POST /api/v1/callbacks/storage/upload

```

### **说明（预留）**

对象存储回调后端（未实现）。

---

### **请求参数（预留）**

```
{
  "bucket": "zhejianoss",
  "objectKey": "uploads/2026/07/….jpg",
  "fileSize": 2048000,
  "etag": "abc123",
  "contentType": "image/jpeg",
  "eventTime": "2025-01-01T12:00:00+08:00"
}

```

---

### **响应示例（预留）**

```
{
  "code": 0,
  "message": "success",
  "data": {
    "received": true
  },
  "requestId": "req_xxx"
}

```

---

### **安全要求**

1. 必须校验对象存储回调签名；
2. 可配置 IP 白名单；
3. objectKey 必须存在于系统预创建记录；
4. 回调必须幂等；
5. 不允许回调创建未知业务文件。

---

### **处理逻辑**

```
验签
→ 根据 objectKey 查询 media_asset
→ 更新状态为 UPLOADED
→ 创建压缩任务
→ 创建缩略图任务
→ 如需脱敏，创建脱敏任务
→ 如需审核，创建审核任务

```

---

## **9.4 查询媒体详情**

### **接口**

```
GET /api/media/{mediaId}

```

---

### **响应示例**

```
{
  "code": 0,
  "message": "success",
  "data": {
    "mediaId": "media_10001",
    "bizType": "ORDER_BEFORE",
    "bizId": "order_123456",
    "fileType": "image/jpeg",
    "originUrl": "https://cdn.example.com/media/origin.jpg",
    "compressedUrl": "https://cdn.example.com/media/compressed.jpg",
    "thumbnailUrl": "https://cdn.example.com/media/thumb.jpg",
    "desensitizedUrl": "https://cdn.example.com/media/desensitized.jpg",
    "status": "APPROVED",
    "auditStatus": "APPROVED",
    "createdAt": "2025-01-01T12:00:00+08:00"
  },
  "requestId": "req_xxx"
}

```

---

## **9.5 批量查询媒体**

### **接口**

```
POST /api/media/batch-query

```

### **请求参数**

```
{
  "mediaIds": ["media_10001", "media_10002"]
}

```

---

## **9.6 创建脱敏任务**

### **接口**

```
POST /api/media/{mediaId}/desensitize

```

### **说明**

用于对图片进行车牌、人脸、手机号、VIN 等敏感信息脱敏。

---

### **请求参数**

```
{
  "desensitizeTypes": ["LICENSE_PLATE", "FACE", "PHONE", "VIN"],
  "force": false
}

```

---

### **响应示例**

```
{
  "code": 0,
  "message": "success",
  "data": {
    "taskId": "task_20001",
    "mediaId": "media_10001",
    "taskStatus": "PENDING"
  },
  "requestId": "req_xxx"
}

```

---

## **9.7 查询媒体处理任务**

### **接口**

```
GET /api/media/tasks/{taskId}

```

---

### **响应示例**

```
{
  "code": 0,
  "message": "success",
  "data": {
    "taskId": "task_20001",
    "mediaId": "media_10001",
    "taskType": "DESENSITIZE",
    "taskStatus": "SUCCESS",
    "resultUrl": "https://cdn.example.com/media/desensitized.jpg",
    "errorMessage": null
  },
  "requestId": "req_xxx"
}

```

---

## **9.8 查询审核状态**

### **接口**

```
GET /api/media/{mediaId}/audit-status

```

---

### **响应示例**

```
{
  "code": 0,
  "message": "success",
  "data": {
    "mediaId": "media_10001",
    "auditStatus": "APPROVED",
    "rejectReason": null
  },
  "requestId": "req_xxx"
}

```

---

## **9.9 删除媒体**

### **接口**

```
DELETE /api/media/{mediaId}

```

### **说明**

逻辑删除媒体，已被订单、案例、评价使用的媒体不允许直接删除，应先解除绑定。

---

## **10. 分片上传，后期**

视频或大文件后期支持分片上传。

### **10.1 初始化分片上传**

```
POST /api/media/multipart/init

```

### **10.2 获取分片上传 URL**

```
POST /api/media/multipart/part-url

```

### **10.3 完成分片上传**

```
POST /api/media/multipart/complete

```

### **10.4 取消分片上传**

```
POST /api/media/multipart/abort

```

---

## **11. 媒体处理任务类型**

```
COMPRESS_IMAGE       图片压缩
GENERATE_THUMBNAIL   缩略图生成
VIDEO_TRANSCODE      视频转码
DESENSITIZE          隐私脱敏
CONTENT_AUDIT        内容审核

```

---

## **12. 脱敏规则**

需要识别并处理：

1. 车牌号；
2. 人脸；
3. 手机号；
4. VIN；
5. 微信号；
6. 地址；
7. 支付凭证；
8. 聊天记录；
9. 身份证件信息。

处理方式：

```
识别 → 标记 → 模糊/遮挡 → 生成脱敏图 → 人工复核

```

---

## **13. 审核规则**

审核维度：

1. 涉黄涉政涉暴；
2. 用户隐私；
3. 车牌；
4. 人脸；
5. 违规广告；
6. 诱导联系方式；
7. 不适合公开展示的内容。

审核结果：

```
PENDING
APPROVED
REJECTED
MANUAL_REVIEW

```

---

## **14. 数据表建议**

## **14.1 media_asset**


| 字段               | 说明       |
| ---------------- | -------- |
| id               | 媒体 ID    |
| biz_type         | 业务类型     |
| biz_id           | 业务 ID    |
| file_name        | 原始文件名    |
| file_type        | 文件类型     |
| file_size        | 文件大小     |
| object_key       | 对象存储 key |
| origin_url       | 原图 URL   |
| compressed_url   | 压缩图 URL  |
| thumbnail_url    | 缩略图 URL  |
| desensitized_url | 脱敏图 URL  |
| status           | 媒体状态     |
| audit_status     | 审核状态     |
| uploader_id      | 上传人      |
| uploader_type    | 上传人类型    |
| created_at       | 创建时间     |
| updated_at       | 更新时间     |


---

## **14.2 media_task**


| 字段            | 说明    |
| ------------- | ----- |
| id            | 任务 ID |
| media_id      | 媒体 ID |
| task_type     | 任务类型  |
| task_status   | 任务状态  |
| input_url     | 输入地址  |
| output_url    | 输出地址  |
| error_message | 错误信息  |
| retry_count   | 重试次数  |
| created_at    | 创建时间  |
| updated_at    | 更新时间  |


---

## **15. P0 验收标准**

P0 必须满足：

1. 支持图片上传凭证获取；
2. 支持前端直传对象存储；
3. 支持上传成功回调；
4. 支持上传完成通知；
5. 支持图片压缩；
6. 支持缩略图生成；
7. 支持脱敏任务；
8. 支持审核状态查询；
9. 支持媒体与订单绑定；
10. 支持媒体与案例绑定；
11. 支持后台查看媒体；
12. 支持逻辑删除；
13. 上传和回调具备幂等性；
14. 不允许未授权文件公开访问。

