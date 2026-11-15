# 任务清单 · 服务相册报告冻结与流程修复

> 顺序：里程 → 报告快照 → 返工 → 交车推进 → 补充报价导航 → 移除自动 AI → 未施工匹配 → 车辆信息 → 选填颜色 → 联调部署

## 1. 里程（问题 3 / 8）
- [x] 1.1 `packageMerchant/pages/album/flow/index.js` · `buildPhotoDraftPayload()` intake 分支写入 `mileageKm`
- [x] 1.2 `packageMerchant/pages/album/flow/index.js` · 接车 `mileageKm` 取值链：`photoDraft → data → album.vehicle.mileage`
- [x] 1.3 `packageMerchant/pages/album/flow/index.js` · `deliveryMileage` 回退链只保留交车表单值
- [x] 1.4 `utils/owner-preview-doc.js` · `albumMetaLine` 支持 album 里程兜底
- [x] 1.5 `utils/service-flow-docs.js` · `buildRepairReportPayload` 输出 `mileageText` + `intakeMileageText`
- [x] 1.6 交车报告 metaLine 渲染「接车里程 · 交车里程」

## 2. 报告快照（问题 2 / 5 / 7 的基础）
- [x] 2.1 `backend/src/services/service-flow.service.js` · 新增 `renderDocOf / shouldArchiveRenderDoc / archiveRenderDocIfNeeded / buildRenderDocForNode / freezeNodeRenderDoc`
- [x] 2.2 接车完成分支调用冻结
- [x] 2.3 检测完成→报告 `delivered` / 报价 `pending_confirm` 两节点调用冻结
- [x] 2.4 补充报价保存/发送经 `updateFlowNode` 统一冻结
- [x] 2.5 交车完成→`repair_report` `pending_confirm` 时调用冻结
- [x] 2.6 重新发送时按 `shouldArchiveRenderDoc(doc)` 归档：车主已拒绝（`ownerRejectReason/rejectedAt`）或已确认（`confirmedAt`）才归档
- [x] 2.7 商家撤回（预览页「返回修改」/「返回施工」）清空 `renderDoc`，不写 `revisions[]`，`revision` 不变
- [x] 2.8 车主拒绝时写入 `ownerRejectReason + rejectedAt`，保留旧快照待下次发送归档
- [x] 2.9 `mapOwnerFlowDocCard` 优先以 `doc.renderDoc.doc` 为基座
- [x] 2.10 `mapFlowNodeForView` 透传 `renderDoc`
- [x] 2.11 `packageMerchant/pages/album/flow/index.js` · `reportPreviewFor` 优先读 `renderDoc`
- [x] 2.12 非 draft 状态下拒绝原地改 `renderDoc`（沿用 `isNodeEditFrozen`，走返回修改）

## 3. 返工闭环（问题 7）
- [x] 3.1 后端 `reopenMerchantWorkForRework` 把 `reworkRecords` 写入施工节点 content
- [x] 3.2 `owner-preview-doc.js` finish 分支透出 `reworkRecords`
- [x] 3.3 `components/service-doc-sheet/*` 渲染「返工记录」区块
- [x] 3.4 前端返工确认后改可停留弹窗并自动 `openStage('work')`
- [x] 3.5 施工节点顶部展示「待返工 N 项 + 原因」
- [x] 3.6 施工完成回写 `reworkRecords[].doneAt`

## 4. 交车推进（问题 8-卡住）
- [x] 4.1 `onConfirmPhotoStep` delivery 成功后 `await this.openStage('finish')`

## 5. 补充报价导航与标记（问题 5）
- [x] 5.1 底部栏新增「继续施工」，绑定 `onContinueWork`
- [x] 5.2 `onContinueWork`：回到施工节点继续新增项目
- [x] 5.3 原「返回施工」改名「撤销补充报价」
- [x] 5.4 新增 `resolveItemQuoteState` 并按状态渲染「已报价 / 补充报价中 / 补充报价」

## 6. 移除补充报价自动 AI（问题 4）
- [x] 6.1 删除 `insertAddonPlan` 的 `force:true` 入队
- [x] 6.2 保存节点仅在 `forceAdviceRefresh`（用户点 AI 分析）时入队
- [x] 6.3 前端进入补充报价不默认进入 AI 分析中状态

## 7. 未施工核对（问题 6）
- [x] 7.1 `collectConfirmedQuoteLines` 保留 `workFindingId`
- [x] 7.2 `computeUnstartedQuoteItems` 增加 id 双向匹配（含 `ql_work_` 旧数据还原）
- [x] 7.3 有图或有文案的 finding 记为已施工
- [x] 7.4 前端提醒保持非阻塞，仅未关联报价项触发

## 8. 车辆信息（问题 1 / 2）
- [x] 8.1 `normalizeVehicleJson` 保留 `modelName`
- [x] 8.2 `merchant-album-overview.js` 新增 `vehicleFacts`，`vehicleName` 优先 `modelName`
- [x] 8.3 相册详情页渲染完整车辆信息卡（手机号仍打码）
- [x] 8.4 `merchant-create-sheet` 回填并展示底盘 / 发动机 / 排量 / 变速箱

## 9. 选填颜色（问题 8-UI）
- [x] 9.1 WXML 改用 `merchant-flow-page__key-fill-opt`
- [x] 9.2 WXSS 新增中性色样式

## 10. 联调与部署
- [x] 10.1 `cd backend && npm run sync:shared-utils`
- [x] 10.2 本地静态验证：`node --check` + 报告构建器冒烟（接车/交车里程、返工、验收项）
- [x] 10.3 本地 git 提交
- [x] 10.4 `git push staging main`
- [x] 10.5 预发部署：`git pull` → `npm install` → `sync:shared-utils` → `db:setup:prod` → `pm2 restart zhejian-api-staging` → 健康检查
- [ ] 10.6 预发按验收清单逐条验证，通过后再申请生产发布
