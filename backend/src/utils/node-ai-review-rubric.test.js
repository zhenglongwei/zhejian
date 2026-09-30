const test = require('node:test')
const assert = require('node:assert/strict')
const {
  getReviewRubric,
  resolveReviewCategory,
  resolveRunReviewStep,
  planNodeReview,
} = require('./node-ai-review-rubric')

test('maintenance intake includes odo with how-to', () => {
  const rubric = getReviewRubric('maintenance', 'intake_inspection')
  assert.equal(rubric.category, 'maintenance')
  assert.equal(rubric.step, 'intake')
  const odo = rubric.photos.find((row) => row.itemKey === 'odo')
  assert.ok(odo)
  assert.ok(String(odo.how).includes('表盘'))
  assert.ok(rubric.complaintExample)
})

test('brake intake includes pad thickness', () => {
  const rubric = getReviewRubric('brake', 'intake_inspection')
  const pad = rubric.photos.find((row) => row.itemKey === 'pad_thickness')
  assert.ok(pad)
  assert.ok(String(pad.how).includes('读数'))
})

test('battery work includes spec match', () => {
  const rubric = getReviewRubric('battery', 'work')
  const spec = rubric.photos.find((row) => row.itemKey === 'spec_match')
  assert.ok(spec)
  assert.ok(String(spec.how).includes('Ah') || spec.keywords.includes('Ah'))
})

test('default template with chassis keywords maps to chassis_noise', () => {
  assert.equal(resolveReviewCategory('default', '过减速带胶套异响'), 'chassis_noise')
  assert.equal(resolveReviewCategory('', '常规检查'), 'generic')
})

test('quote check has no required photos', () => {
  const rubric = getReviewRubric('maintenance', 'inspection_report')
  assert.equal(rubric.step, 'quote_check')
  assert.equal(rubric.photos.length, 0)
})

test('run step never comes back empty when queued without one', () => {
  // 报告送达排队时不写口径，执行端必须仍能推出 quote_check，否则永远不执行
  assert.equal(resolveRunReviewStep({ kind: 'inspection_report' }), 'quote_check')
  assert.equal(resolveRunReviewStep({ kind: 'inspection_report', aiReview: {} }), 'quote_check')
  // 未知单据类型兜底，不能返回空
  assert.equal(resolveRunReviewStep({ kind: 'some_new_kind' }), 'notify_check')
  assert.equal(resolveRunReviewStep({}), 'notify_check')
})

test('run step keeps the step written when queued', () => {
  assert.equal(
    resolveRunReviewStep({ kind: 'quote_confirm', aiReview: { reviewStep: 'addon_check' } }),
    'addon_check',
  )
})

test('完成事件只认工单：它是如实记录施工过程的单据，定稿要核对', () => {
  assert.deepEqual(planNodeReview({ event: 'complete', node: { kind: 'work' } }), {
    step: 'work_sheet',
  })
  // 其余节点「完成」时不查：那是门店内部动作，内容还没到车主眼前
  assert.equal(planNodeReview({ event: 'complete', node: { kind: 'quote_confirm' } }), null)
  assert.equal(planNodeReview({ event: 'complete', node: { kind: 'repair_report' } }), null)
  assert.equal(planNodeReview({ event: 'complete', node: { kind: 'work_order' } }), null)
  assert.equal(planNodeReview({ event: 'expose', node: null }), null)
  assert.equal(planNodeReview({}), null)
})

test('expose picks the step by kind only', () => {
  const step = (node) => planNodeReview({ event: 'expose', node }).step
  assert.equal(step({ kind: 'quote_confirm' }), 'quote_check')
  assert.equal(step({ kind: 'inspection_report' }), 'quote_check')
  assert.equal(step({ kind: 'work' }), 'work')
  assert.equal(step({ kind: 'repair_report' }), 'delivery')
  // 增项两种写法都要落到 addon_check
  assert.equal(step({ kind: 'addon_quote_confirm' }), 'addon_check')
  assert.equal(step({ kind: 'quote_confirm', insertedReason: 'addon' }), 'addon_check')
  // 新增单据类型自动纳入，不再漏查
  assert.equal(step({ kind: 'brand_new_kind' }), 'notify_check')
})

test('工单核对提纲：文案可落地，照片沿用本品类施工口径', () => {
  const rubric = getReviewRubric('battery', 'work', '', 'work_sheet')
  assert.equal(rubric.step, 'work_sheet')
  // 建议必须能落到门店改得到的字段上
  assert.ok(rubric.texts.some((row) => row.field === 'findingCaption'))
  assert.ok(rubric.texts.some((row) => row.field === 'findingAdvice'))
  assert.ok(rubric.photos.some((row) => row.itemKey === 'spec_match'))
})

test('paint album template maps to body_paint rubric', () => {
  assert.equal(resolveReviewCategory('paint', '钣喷修复'), 'body_paint')
  const rubric = getReviewRubric('paint', 'intake_inspection')
  assert.match(String(rubric.complaintExample), /划痕|钣喷|刮/)
  assert.doesNotMatch(String(rubric.complaintExample), /亏电/)
})
