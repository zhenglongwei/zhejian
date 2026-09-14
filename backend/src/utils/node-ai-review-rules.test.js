const test = require('node:test')
const assert = require('node:assert/strict')
const { getReviewRubric } = require('./node-ai-review-rubric')
const { buildRuleSuggestions, parseModelSuggestions } = require('./node-ai-review-rules')

test('empty maintenance intake suggests odo photo and complaint sentence', () => {
  const rubric = getReviewRubric('maintenance', 'intake_inspection')
  const list = buildRuleSuggestions({
    rubric,
    chiefComplaint: '保养',
    mileageKm: '86500',
    findings: [],
  })
  const ids = list.map((row) => row.id)
  assert.ok(ids.includes('photo:odo'))
  const complaint = list.find((row) => row.id === 'text:chiefComplaint')
  assert.ok(complaint)
  assert.ok(String(complaint.suggestedText).includes('86500'))
  assert.equal(complaint.field, 'chiefComplaint')
})

test('brake intake without thickness photo suggests pad_thickness', () => {
  const rubric = getReviewRubric('brake', 'intake_inspection')
  const list = buildRuleSuggestions({
    rubric,
    chiefComplaint: '刹车异响',
    findings: [{ partName: '外观', caption: '环车未见磕碰', result: 'ok' }],
  })
  assert.ok(list.some((row) => row.itemKey === 'pad_thickness'))
  assert.ok(list.every((row) => row.type === 'photo' || row.type === 'text'))
})

test('battery work without spec photo suggests spec_match', () => {
  const rubric = getReviewRubric('battery', 'work')
  const list = buildRuleSuggestions({
    rubric,
    findings: [{ partName: '电瓶', caption: '已拆旧瓶' }],
  })
  assert.ok(list.some((row) => row.itemKey === 'spec_match'))
})

test('quote check flags job label in line name and ignores amounts', () => {
  const rubric = getReviewRubric('brake', 'inspection_report')
  const list = buildRuleSuggestions({
    rubric,
    chiefComplaint: '刹车异响',
    quoteLines: [{ name: '前刹车片 · 需处理', amount: '380' }],
  })
  const renamed = list.find((row) => row.field === 'quoteLineName')
  assert.ok(renamed)
  assert.equal(renamed.suggestedText, '前刹车片')
  assert.ok(list.every((row) => !/380|¥/.test(String(row.suggestedText || ''))))
})

test('model payload drops amount fields', () => {
  const list = parseModelSuggestions({
    suggestions: [
      { type: 'text', field: 'amount', suggestedText: '100' },
      { type: 'text', field: 'chiefComplaint', suggestedText: '电瓶亏电打不着' },
    ],
  })
  assert.equal(list.length, 1)
  assert.equal(list[0].field, 'chiefComplaint')
})

test('model payload infers chiefComplaint from 主诉 title', () => {
  const list = parseModelSuggestions({
    suggestions: [
      {
        type: 'text',
        title: '优化主诉描述',
        suggestedText: '右前门表面划痕',
      },
    ],
  })
  assert.equal(list[0].field, 'chiefComplaint')
  assert.equal(list[0].title, '改主诉')
})
