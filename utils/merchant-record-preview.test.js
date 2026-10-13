const test = require('node:test')
const assert = require('node:assert/strict')
const { readStageGate, stagePrimary, buildRecordPreview } = require('./merchant-record-preview')

test('确认后才出现生成，生成后才出现发送', () => {
  const fresh = { confirmed: false, generated: false, sent: false }
  assert.equal(stagePrimary('inspect', 'current', fresh).label, '')
  const confirmed = { confirmed: true, generated: false, sent: false, versions: [{ id: 'rv_1' }] }
  assert.equal(stagePrimary('inspect', 'current', confirmed).label, '生成检测报告')
  assert.equal(stagePrimary('quote', 'current', confirmed).label, '生成报价单')
  assert.equal(stagePrimary('intake', 'current', confirmed).label, '保存并开始检测')
  const generated = { confirmed: true, generated: true, sent: false }
  assert.equal(stagePrimary('finish', 'current', generated).label, '发送给车主')
  assert.equal(stagePrimary('inspect', 'current', { confirmed: true, generated: true, sent: true }).label, '')
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
