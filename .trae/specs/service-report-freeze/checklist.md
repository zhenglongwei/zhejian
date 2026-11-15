# 验收清单 · 服务相册报告冻结与流程修复

> 状态：A/C 已静态核对与部署验证通过；B 需真机在预发走完整流程，由用户验收。

## A. 代码实现（已逐条静态核对）

- [x] 发送即冻结：接车/检测报告/报价/补充报价/交车报告在 `pending_confirm` 或 `delivered` 时写入 `document.renderDoc`
- [x] `renderDoc` 为 `document` 顶层字段（与 `payload` 并列），不会被 `envelopeOnlyDocument` 清空
- [x] 商家预览与车主端同读 `renderDoc`：`mapOwnerFlowDocCard` 以快照为基座，`mapFlowNodeForView` 透传
- [x] 版本归档只发生在车主拒绝（`ownerRejectReason/rejectedAt`）或已确认（`confirmedAt`）后重发
- [x] 商家从预览页「返回修改 / 返回施工」撤回：清空 `renderDoc`，`revisions[]` 不新增，`revision` 不变
- [x] `revisions[]` 最多保留 10 条，归档时 `revision + 1`
- [x] `repairBrief` 未进入交车报告（finish 分支不含该字段）
- [x] 接车表单里程写入节点 content，接车报告显示里程
- [x] 交车报告 metaLine 同时含「接车里程」与「交车里程」，且只认交车表单里程
- [x] 返工记录写入施工节点 content，施工页展示待返工横幅，施工完成回写 `doneAt`
- [x] 交车报告含「返工记录」章节（`service-doc-sheet`）
- [x] 交车照片完成后自动进入交车报告只读态，不会卡在交车节点
- [x] 补充报价确认后出现「继续施工」并跳回施工节点；原按钮改名「撤销补充报价」
- [x] 施工项标记区分「已报价 / 补充报价中 / 补充报价」
- [x] `insertAddonPlan` 不再强制入队 AI 分析
- [x] `computeUnstartedQuoteItems` 按 `findingId` 双向匹配，有图或有文案不提示未施工
- [x] 相册详情展示车牌/VIN/完整车型/底盘/发动机/排量/变速箱/接车里程，手机号仍打码
- [x] VIN 解析回填并展示底盘/发动机/排量/变速箱
- [x] 「（选填）」使用中性色 `var(--color-text-tertiary)`
- [x] 根目录 `utils/` 与 `backend/vendor/shared/` 共享文件内容一致（sync 后无差异）

## B. 预发功能验收（需真机，待用户执行）

- [ ] 1. 新建相册 → VIN 解析回填车辆完整信息，详情页完整展示，手机号打码
- [ ] 2. 接车完成 → 车主端接车报告有接车里程，商家预览与车主端逐字一致
- [ ] 3. 检测报告 / 报价发送 → 商家预览与车主端一致
- [ ] 4. 补充报价进入不自动跑 AI；确认后有「继续施工」，施工项变「已报价」
- [ ] 5. 有图有文案的施工项完成时不再弹未施工原因
- [ ] 6. 交车报告显示双里程；选返工弹窗停留并跳施工节点，报告含返工章节
- [ ] 7. 点「完成交车」自动进入交车报告只读态，可预览、可请车主确认
- [ ] 8. 「（选填）」为中性色
- [ ] 9. 版本规则：撤回重发不新增 `revisions[]`；车主拒绝后修改重发新增一条且 `revision + 1`

## C. 部署

- [x] 本地静态检查通过（`npm run check:js-syntax` 全部通过、报告构建器冒烟）
- [x] 预发部署完成，`/api/v1/health` 返回 `ok: true` 且 `db: up`
- [x] 服务器工作区干净（`git status --short` 无输出）
