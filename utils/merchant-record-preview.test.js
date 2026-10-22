const test = require('node:test')
const assert = require('node:assert/strict')
const { readStageGate, stageChrome, buildRecordPreview } = require('./merchant-record-preview')

test('施工不预览，其余步骤右边的按钮各不相同', () => {
  assert.equal(stageChrome('intake', 'current').label, '发给车主')
  assert.equal(stageChrome('inspect', 'current').label, '生成检测报告')
  assert.equal(stageChrome('quote', 'current').label, '发给车主')
  assert.equal(stageChrome('work', 'current').label, '确认并继续')
  assert.equal(stageChrome('work', 'current').action, 'completeWork')
  assert.equal(stageChrome('finish', 'current').label, '请车主确认')
  assert.equal(stageChrome('intake', 'current').preview, false)
  assert.equal(stageChrome('intake', { status: 'delivered' }).preview, true)
  assert.equal(stageChrome('work', 'current').preview, false)
  assert.equal(stageChrome('intake', { status: 'delivered' }).label, '')
  assert.equal(stageChrome('intake', { status: 'delivered' }).locked, true)
  assert.equal(stageChrome('inspect', { status: 'draft' }).label, '生成检测报告')
  assert.equal(stageChrome('inspect', { status: 'delivered' }).label, '')
  assert.equal(stageChrome('inspect', { status: 'delivered' }).locked, true)
  assert.equal(stageChrome('quote', { status: 'draft' }).label, '发给车主')
  assert.equal(stageChrome('quote', { status: 'pending_confirm' }).label, '代车主确认')
  assert.equal(stageChrome('quote', { status: 'pending_confirm' }).locked, true)
  assert.equal(stageChrome('quote', { status: 'confirmed' }).label, '')
})

test('预览只用已有记录，不编健康分', () => {
  const preview = buildRecordPreview(
    { storeName: '驰援汽车服务中心' },
    {
      selectedKey: 'inspect',
      vehicle: { plate: '粤B·7K52M', line: '宝马 3系', pill: '服务中' },
      inspect: {
        headline: '发现 1 项异常',
        sub: '已记录 2 项',
        items: [{ name: '气门室盖垫', shots: ['https://example.com/a.jpg'] }],
        advice: '密封垫老化',
      },
    },
  )
  assert.equal(preview.storeName, '驰援汽车服务中心')
  assert.equal(preview.facts[1].value, '发现 1 项异常')
  assert.equal(preview.photos.length, 1)
  assert.equal(JSON.stringify(preview).includes('健康分'), false)
  const gate = readStageGate(
    [
      {
        id: 'report',
        kind: 'inspection_report',
        document: { status: 'draft', payload: { recordVersions: [{ id: 'rv_1' }], findings: [] } },
      },
    ],
    'inspect',
  )
  assert.equal(gate.confirmed, true)
  assert.equal(gate.generated, false)
  assert.equal(gate.sent, false)
})
