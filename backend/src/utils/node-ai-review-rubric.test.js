const test = require('node:test')
const assert = require('node:assert/strict')
const { getReviewRubric, resolveReviewCategory } = require('./node-ai-review-rubric')

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

test('paint album template maps to body_paint rubric', () => {
  assert.equal(resolveReviewCategory('paint', '钣喷修复'), 'body_paint')
  const rubric = getReviewRubric('paint', 'intake_inspection')
  assert.match(String(rubric.complaintExample), /划痕|钣喷|刮/)
  assert.doesNotMatch(String(rubric.complaintExample), /亏电/)
})
