const test = require('node:test')
const assert = require('node:assert/strict')
const { FINDING_RESULT } = require('../constants/service-flow-nodes')
const { buildQuoteDraft, buildQuoteLinesFromFindings } = require('./service-flow-quote-draft')

test('no album context does not invent quote lines', () => {
  const lines = buildQuoteLinesFromFindings([
    { partName: '右前门', result: FINDING_RESULT.ACTION, advice: '划痕' },
  ])
  assert.equal(lines.length, 0)
})

test('maintenance package keeps oil service and only action extras', () => {
  const { lines, mode } = buildQuoteDraft({
    templateId: 'maintenance',
    findings: [
      { partName: '机油', result: FINDING_RESULT.ACTION, advice: '发黑' },
      { partName: '空气滤芯', result: FINDING_RESULT.ACTION, advice: '积灰' },
      { partName: '灯光', result: FINDING_RESULT.OK, advice: '无需处理' },
      { partName: '底盘目视', result: FINDING_RESULT.RECORD },
      { partName: '雨刮器', result: FINDING_RESULT.WATCH, advice: '轻微硬化' },
      { partName: '右前门', result: FINDING_RESULT.ACTION, advice: '划痕' },
    ],
  })
  assert.equal(mode, 'package')
  assert.deepEqual(
    lines.map((row) => row.name),
    ['更换机油机滤', '更换空气滤芯'],
  )
  assert.equal(lines[0].amount, '')
})

test('brake merges both front pads into one line', () => {
  const { lines } = buildQuoteDraft({
    templateId: 'brake',
    findings: [
      { partName: '左前刹车片', result: FINDING_RESULT.ACTION, advice: '约 3mm' },
      { partName: '右前刹车片', result: FINDING_RESULT.ACTION, advice: '约 3mm' },
      { partName: '前刹车盘', result: FINDING_RESULT.OK, advice: '可继续用' },
    ],
  })
  assert.deepEqual(
    lines.map((row) => row.name),
    ['更换前刹车片'],
  )
})

test('accident first stage is teardown plus visible action parts', () => {
  const { lines, mode, merchantHint, confirmCopy } = buildQuoteDraft({
    templateId: 'accident',
    findings: [
      { partName: '右前保险杠', result: FINDING_RESULT.ACTION, advice: '破损需更换' },
      { partName: '灯光', result: FINDING_RESULT.OK, advice: '无需处理' },
    ],
  })
  assert.equal(mode, 'teardown')
  assert.match(merchantHint, /拆开后/)
  assert.match(confirmCopy, /拆检后/)
  assert.equal(lines[0].name, '拆检')
  assert.equal(lines[1].name, '更换右前保险杠')
  assert.equal(lines[1].note, '')
  assert.doesNotMatch(lines[0].note, /滤芯/)
  assert.equal(lines.every((row) => row.amount === ''), true)
})

test('accident draft does not paste inspection findings into quote notes', () => {
  const { lines } = buildQuoteDraft({
    templateId: 'accident',
    findings: [
      {
        partName: '车身侧裙/底大边',
        result: FINDING_RESULT.ACTION,
        advice: '白色漆面下方有大面积不规则黑色修补痕迹',
      },
      {
        partName: '机油滤芯',
        result: FINDING_RESULT.ACTION,
        advice: '左手持有的滤芯整体呈深黑色',
      },
    ],
  })
  assert.equal(lines[0].name, '拆检')
  assert.match(lines[0].note, /侧裙/)
  assert.doesNotMatch(lines[0].note, /机油滤芯/)
  assert.equal(lines.some((row) => row.name === '更换机油滤芯'), true)
  assert.equal(
    lines.some((row) => /侧裙/.test(row.name) && /补漆|钣金|喷漆/.test(row.name)),
    true,
  )
  assert.equal(
    lines.every((row) => !/深黑|修补痕迹/.test(row.note)),
    true,
  )
})
