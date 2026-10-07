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

test('intake with odometer slot does not suggest odo photo', () => {
  const rubric = getReviewRubric('maintenance', 'intake_inspection')
  const list = buildRuleSuggestions({
    rubric,
    chiefComplaint: '到店保养，里程 86500',
    mileageKm: '86500',
    odometerUrl: 'https://cdn.example.com/odo.jpg',
    findings: [{ partName: '机油', url: 'https://cdn.example.com/oil.jpg' }],
  })
  assert.equal(list.some((row) => row.id === 'photo:odo'), false)
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

test('quote check only fills empty notes and ignores amounts', () => {
  const rubric = getReviewRubric('brake', 'inspection_report')
  const withJobLabel = buildRuleSuggestions({
    rubric,
    chiefComplaint: '刹车异响',
    quoteLines: [{ name: '前刹车片 · 需处理', note: '更换前片', amount: '380' }],
  })
  assert.equal(withJobLabel.some((row) => row.field === 'quoteLineName'), false)
  assert.ok(withJobLabel.every((row) => !/380|¥/.test(String(row.suggestedText || ''))))

  const emptyNote = buildRuleSuggestions({
    rubric,
    chiefComplaint: '刹车异响',
    quoteLines: [{ name: '更换前刹车片', note: '', amount: '380' }],
  })
  const note = emptyNote.find((row) => row.field === 'quoteLineNote')
  assert.ok(note)
  assert.equal(note.suggestedText, '写清做法和范围')
})

test('keepCompletenessSuggestions drops rewrites of filled fields', () => {
  const { keepCompletenessSuggestions } = require('./node-ai-review-rules')
  const kept = keepCompletenessSuggestions(
    [
      { type: 'text', field: 'quoteLineNote', lineIndex: 0, suggestedText: '更规范的做法' },
      { type: 'text', field: 'quoteLineNote', lineIndex: 1, suggestedText: '写清做法和范围' },
      { type: 'photo', how: '补拍近景' },
    ],
    {
      quoteLines: [
        { name: '补漆', note: '全车补漆' },
        { name: '拆检', note: '' },
      ],
    },
  )
  assert.equal(kept.length, 2)
  assert.equal(kept[0].lineIndex, 1)
  assert.equal(kept[1].type, 'photo')
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

test('model payload keeps part so advice is not applied by index alone', () => {
  const list = parseModelSuggestions({
    suggestions: [
      {
        type: 'text',
        field: 'findingAdvice',
        part: '滤芯',
        title: '滤芯',
        findingIndex: 0,
        suggestedText: '滤芯表面有油污附着，建议更换',
      },
    ],
  })
  assert.equal(list[0].part, '滤芯')
  assert.equal(list[0].findingIndex, 0)
  assert.equal(list[0].suggestedText, '滤芯表面有油污附着，建议更换')
})
