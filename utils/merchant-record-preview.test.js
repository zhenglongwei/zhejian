const test = require('node:test')
const assert = require('node:assert/strict')
const { readStageGate, stageChrome, buildRecordPreview } = require('./merchant-record-preview')

test('接车、检测、报价、完工能预览，施工不能', () => {
  assert.equal(stageChrome('intake', 'current').preview, true)
  assert.equal(stageChrome('intake', 'current').label, '保存并开始检测')
  assert.equal(stageChrome('intake', 'done').preview, true)
  assert.equal(stageChrome('intake', 'done').label, '')
  assert.equal(stageChrome('work', 'current').preview, false)
  assert.equal(stageChrome('work', 'current').label, '添加施工记录')
  assert.equal(stageChrome('inspect', 'current').preview, true)
  assert.equal(stageChrome('inspect', 'current').label, '')
  assert.equal(stageChrome('quote', 'done').preview, true)
  assert.equal(stageChrome('finish', 'current').preview, true)
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
