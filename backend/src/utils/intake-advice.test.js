const test = require('node:test')
const assert = require('node:assert/strict')
const { parseIntakeAdvicePayload, unmatchedCheckpoints } = require('./intake-advice')

test('parse intake advice keeps checkpoints with stable ids', () => {
  const got = parseIntakeAdvicePayload({
    diagnosis: '异响更像转向球头松旷。',
    photoTips: [{ title: '仪表', body: '表盘入镜，不要导航。' }],
    askOwner: ['过坎时响还是转向时响？'],
    checkpoints: [{ partName: '转向拉杆球头', why: '主诉异响常见点' }, { partName: '平衡杆吊耳' }],
  })
  assert.match(got.diagnosis, /球头/)
  assert.equal(got.checkpoints.length, 2)
  assert.equal(got.checkpoints[0].id.slice(0, 3), 'ck_')
  assert.equal(got.askOwner[0].body.includes('过坎') || got.askOwner[0].title.includes('过坎'), true)
})

test('parse ask owner options and sort checkpoints by priority', () => {
  const got = parseIntakeAdvicePayload({
    diagnosis: '更像衬套间隙。',
    askOwner: [{ title: '异响工况', options: ['冷车启动', '过减速带', '冷车启动'] }],
    checkpoints: [
      { partName: '半轴防尘套', why: '漏油会响', priority: 3 },
      { partName: '下摆臂球头', why: '松旷常见', priority: 1 },
    ],
  })
  assert.deepEqual(
    got.askOwner[0].options.map((row) => row.label),
    ['冷车启动', '过减速带'],
  )
  assert.equal(got.checkpoints[0].partName, '下摆臂球头')
  assert.equal(got.checkpoints[1].partName, '半轴防尘套')
})

test('unmatched checkpoints skip findings that already cover the part', () => {
  const miss = unmatchedCheckpoints(
    [
      { id: 'a', partName: '转向拉杆球头', why: '查间隙' },
      { id: 'b', partName: '平衡杆吊耳', why: '查胶套' },
    ],
    [{ partName: '左转向拉杆球头' }],
  )
  assert.equal(miss.length, 1)
  assert.equal(miss[0].partName, '平衡杆吊耳')
})
