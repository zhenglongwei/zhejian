# Skill: 脱敏引擎车牌不打码排查

## 目标

系统化排查「后端日志显示车牌已识别 / 脱敏 SUCCESS，但脱敏图上车牌仍清晰可读」及 pre-mask 失败类问题，避免误判为权限、前端 URL 或「人脸检测干扰」。

与 `skill_desensitize_engine.md` 分工：

| Skill | 用途 |
|---|---|
| `skill_desensitize_engine.md` | 实现/改造引擎、选型、验收口径 |
| **本 skill** | 线上/冒烟故障分层诊断与修复 |

## 使用场景

- 授权预览 / 脱敏工作台：脱敏图与原图几乎相同，车牌/VIN 仍可读
- `pm2 logs` 有 `viapi plate ok`、`detections { types: ['plate'] }`，但像素未遮挡
- pre-mask `failed` / `预脱敏失败` / `脱敏需人工处理`
- 日志反复出现 `readable.on is not a function`、`ocr-api ... ENOTFOUND`、`InvalidImage.NotFoundFace`
- 同一 mediaId 跨相册复用脱敏结果、旧 stub copy 缓存

## 排查分层（按顺序，勿跳层）

```text
① 冒烟像素验收 → ② 日志语义 → ③ 坐标/打码器 → ④ 阿里云连通 → ⑤ 缓存与任务链 → ⑥ 前端 URL
```

**关键原则**：日志 `SUCCESS` ≠ 像素已打码。必须目视 `_smoke/out_*.jpg` 或浏览器打开 `desensitized` URL。

---

### ① 冒烟像素验收（最先做）

在 ECS 上对**原图绝对路径**跑：

```bash
cd /var/www/zhejian/backend
DESENSITIZE_ENGINE=aliyun node scripts/desensitize-smoke.js \
  /var/www/zhejian/backend/data/media/uploads/YYYY/MM/<hash>.jpg
```

| 结果 | 含义 | 下一步 |
|---|---|---|
| 输出图车牌有灰块/马赛克 | 引擎 OK | 查 ⑤ 缓存或 ⑥ 前端 |
| 输出图车牌仍清晰 | 引擎/坐标问题 | 查 ②③ |
| 脚本报错退出 | 连通/鉴权/依赖 | 查 ④ |

输出目录：`backend/data/media/uploads/desensitized/_smoke/out_*.jpg`

---

### ② 日志语义（勿被误导）

#### 2.1 「一直在检测人脸」

| 日志 | 含义 | 处理 |
|---|---|---|
| `InvalidImage.NotFoundFace` | 无人脸，**良性** | 默认 `DESENSITIZE_DETECT_FACE=false`（车辆接车图） |
| `drop bogus full-frame face box { ratio: 0.85 }` | 整图误检人脸已过滤 | 不必再调 facebody |
| `types: ['face','plate']` 但无人 | 误检 face 标签残留 | 以 `mask boxes` / `picked.source` 为准 |

**无人脸图不应阻塞车牌打码**；若 pre-mask 失败，优先查 plate/OCR 而非 face。

#### 2.2 「识别成功但不打码」

典型日志（**根因案例**）：

```text
viapi plate ok { plateNumbers: ['浙ED099B'], picked: [{ source: 'viapi_roi', left: 507, top: 1235, ... }] }
taskStatus: SUCCESS
```

- `plateNumbers` 正确 → OCR **已成功**
- `picked.source: viapi_roi` 且目视无遮挡 → **坐标框错位**（见 ③）
- 修复后应为 `picked.source: viapi_pos`（`Positions` 四角外接矩形）

#### 2.3 必看字段

```text
[desensitize-engine] viapi plate ok { candidates, picked }
[desensitize-engine] mask boxes { imageSize, boxes }
```

- `candidates`：同时记录 `viapi_roi` 与 `viapi_pos`，对比是否分离
- `picked`：实际打码框；`source` 应为 `viapi_pos`
- `mask boxes`：`top/height` 应落在车牌区域（竖图多在下半部）

---

### ③ 坐标与打码器

#### 3.1 VIAPI：`Roi` ≠ `Positions`（高频根因）

阿里云 `RecognizeLicensePlate` 返回：

| 字段 | 含义 | 打码 |
|---|---|---|
| `Roi` (X,Y,W,H) | 粗定位，**常偏到车标/格栅** | ❌ 勿单独使用 |
| `Positions` (4 点) | 车牌四角 | ✅ **优先** |

实现位置：`backend/src/services/desensitize-engine/detectors/viapi-plate.js`

```text
有 Positions → boxFromPoints → source: viapi_pos
无 Positions → 才 fallback Roi
```

#### 3.2 EXIF 方向

检测与打码须用**同一朝向**像素图：

- `desensitize-engine/oriented.js`：`sharp().rotate()` 写临时工作图
- 上传原图已在 `image-process.js` 去 EXIF，但冒烟直接读磁盘原图时仍需要 oriented 流水线

#### 3.3 打码器可见性

`masker.js`：

- 车牌：`type === 'plate'` 用**实心灰块**（`buildPlateFill`），不用细粒度 mosaic
- 其他敏感区：mosaic，`blend: 'over'`
- 车牌 padding：`bbox.js` 中 `plate` 约 18%

若框正确仍偏弱，检查是否误走 mosaic 或未 `blend: 'over'`。

---

### ④ 阿里云连通与鉴权

#### 4.1 DNS / Endpoint

在 ECS 验证：

```bash
nslookup ocr-api.cn-shanghai.aliyuncs.com   # 可能 NXDOMAIN
nslookup ocr.cn-shanghai.aliyuncs.com        # VIAPI 车牌，应可解析
nslookup facebody.cn-shanghai.aliyuncs.com
```

| 现象 | 原因 | 修复 |
|---|---|---|
| `ocr-api ... ENOTFOUND` | 新 OCR API 域名在部分环境不可达 | `DESENSITIZE_PLATE_PROVIDER=viapi`（默认） |
| `viapi plate ok` | VIAPI 通路正常 | 不必纠结 ocr-api |
| VIN/通用 OCR 仍失败 | 同上，仅 ocr-api | Phase 1 可接受；车牌必须 viapi |

#### 4.2 凭证

| 日志 | 原因 | 修复 |
|---|---|---|
| `readable.on is not a function` | OCR body 未用 `Readable.from(Buffer)` | `aliyun-clients.js` → `openImageReadable` |
| `ENOENT ... /.alibabacloud/credentials` | 裸 `new Credential()` 读本地配置 | 显式 `type: 'ecs_ram_role'` |
| `ALIYUN_AUTH_FAILED` | RAM 无 OCR/VIAPI 权限 | 挂 `AliyunVIAPIFullAccess`、`AliyunOCRFullAccess` |

`.env` 生产仅需：`DESENSITIZE_ENGINE=aliyun`、`ALIYUN_REGION=cn-shanghai`（ECS 角色，勿配主账号 Key）。

#### 4.3 引擎版本

修改检测/打码逻辑后递增：

- `config.desensitize.cacheVersion`（如 `aliyun-v7`）
- `desensitize-engine/index.js` → `ENGINE_VERSION`

使旧 pre-mask READY 与 media 缓存失效。`fingerprint` 变更时 `ensureOrderPreMaskTask` 应 `force: true`。

---

### ⑤ 缓存与任务链

#### 5.1 MVP stub copy

旧逻辑：`copyFile` 原图 → `desensitized/` 且 `desensitizeStatus=success`。

| 检查 | 位置 |
|---|---|
| 字节相同 | `lib/media-file-compare.js` → `isStubCopyArtifact` |
| 强制重跑 | `media.service.js` → `shouldUseCachedDesensitize` |
| pre-mask 遇 stub | `desensitize.service.js` → `preMaskTaskHasStubArtifacts` |

#### 5.2 跨相册 media 缓存

同一 `mediaId` 上传一次、多相册引用时，`desensitizedKey` 必须含 `albumId/nodeId/idx`：

- 缓存 key 与当前 `context.albumId` 不一致 → **禁止**短路，强制重打码
- complete / authorize 后仍见旧图 → 查 DB `media_assets.desensitized_key` 是否指向当前相册路径

#### 5.3 任务链

```text
merchant complete → ensureOrderPreMaskTask → authorize-preview → desensitize task
```

| 状态 | 查 |
|---|---|
| `pre-mask not ready` / 100007 | pre-mask task assets 是否 `MASK_FAILED` |
| authorize 200 但图未变 | authorize 是否复用旧 pre-mask（看 `fingerprint` / `preMaskVersion`） |

---

### ⑥ 前端 URL（引擎已验收通过后）

仅当 ① 冒烟图**已打码**但小程序仍清晰时查：

| 检查 | 位置 |
|---|---|
| `maskedUrl` 是否绑定 | `desensitize.constants.js` → `mapTaskRecord` |
| 工作台展示 | `utils/desensitize-workbench-display.js` → `buildWorkbenchItems` |
| 组件 | `components/desensitize-workbench/index.wxml`：`item.maskedUrl` vs `item.rawUrl` |
| 网络 | DevTools 打开脱敏图 URL，确认非原图 path |

**勿**在 ① 未通过时先改前端。

---

## 决策树（简版）

```text
冒烟图车牌清晰？
├─ 是 → picked.source 是 viapi_roi？
│        ├─ 是 → 改 viapi-plate 优先 Positions + 灰块打码
│        └─ 否 → 查 mask boxes 坐标是否落在车牌上 / EXIF oriented
└─ 否（冒烟 OK）→ 查 media 缓存 / pre-mask fingerprint / 前端 maskedUrl
```

---

## 相关代码索引

| 模块 | 路径 |
|---|---|
| 引擎入口 | `backend/src/services/desensitize-engine/index.js` |
| VIAPI 车牌 | `backend/src/services/desensitize-engine/detectors/viapi-plate.js` |
| 阿里云检测 | `backend/src/services/desensitize-engine/detectors/aliyun.js` |
| 打码 | `backend/src/services/desensitize-engine/masker.js` |
| EXIF 工作图 | `backend/src/services/desensitize-engine/oriented.js` |
| 框合并 | `backend/src/services/desensitize-engine/bbox.js` |
| media 缓存 | `backend/src/services/media.service.js` |
| pre-mask | `backend/src/services/desensitize.service.js` |
| 客户端 | `backend/src/lib/aliyun-clients.js` |
| 冒烟 | `backend/scripts/desensitize-smoke.js` |

---

## 输出格式（排查报告）

默认**只报告**；用户明确要求修改后再动代码。

```md
## 脱敏车牌排查报告

### 现象
- 相册/任务 ID：
- 原图 URL / 脱敏 URL：
- 冒烟结果（有/无遮挡）：

### 分层结论
| 层 | 状态 | 证据 |
| --- | --- | --- |
| ① 冒烟像素 | pass/fail | … |
| ② 日志语义 | … | picked.source / plateNumbers |
| ③ 坐标打码 | … | candidates vs mask boxes |
| ④ 阿里云 | … | endpoint / auth |
| ⑤ 缓存任务链 | … | fingerprint / stub |
| ⑥ 前端 | … | maskedUrl |

### 根因（一句话）

### 修复建议
1. …
2. …

### 验证命令
\`\`\`bash
DESENSITIZE_ENGINE=aliyun node scripts/desensitize-smoke.js <原图路径>
pm2 restart zhejian-api
\`\`\`
```

---

## 部署后验证清单

- [ ] 冒烟图车牌区域有实心灰块（或明显马赛克）
- [ ] 日志 `picked.source` 为 `viapi_pos`（有 Positions 时）
- [ ] `engineVersion` / `cacheVersion` 已递增，旧相册 complete 会重跑 pre-mask
- [ ] 新相册 authorize 预览脱敏图 URL 为 `uploads/desensitized/<albumId>/...`
- [ ] 公开 API 仍只返回 desensitized 路径（联用 `privacy-desensitization-check`）

## 约束

- 排查时**先冒烟、后改码**；一条根因修完再验证，避免同时改前端与引擎
- 不要把 `NotFoundFace` 当 blocking error
- 不要把 `ocr-api ENOTFOUND` 误判为 RAM 权限不足（先 nslookup）
- 修复坐标/打码逻辑后必须 bump `ENGINE_VERSION` + `cacheVersion`
