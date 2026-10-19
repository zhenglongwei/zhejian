const test = require('node:test')
const assert = require('node:assert/strict')
const { parseIntakeAdvicePayload, unmatchedCheckpoints } = require('./intake-advice')

test('接车意见只留留证风险和现在补', () => {
  const got = parseIntakeAdvicePayload({
    diagnosis: '异响更像转向球头松旷。',
    checkpoints: [{ partName: '转向拉杆球头', why: '主诉异响常见点' }],
    askOwner: [{ title: '异响工况', options: ['冷车启动'] }],
    risks: [{ title: '剐蹭没写部位', body: '交车时分不清是进店前就有的。' }],
    fixes: [{ title: '写进诉求', body: '补上是哪一块。', options: ['前保险杠', '车门', '前保险杠'] }],
  })
  assert.equal(got.diagnosis, '')
  assert.equal(got.checkpoints.length, 0)
  assert.equal(got.askOwner.length, 0)
  assert.equal(got.risks.length, 1)
  assert.equal(got.risks[0].title, '剐蹭没写部位')
  assert.deepEqual(
    got.fixes[0].options.map((row) => row.label),
    ['前保险杠', '车门'],
  )
})

test('没有留证风险时不把检测顺序当成意见', () => {
  const got = parseIntakeAdvicePayload({
    diagnosis: '更像衬套间隙。',
    checkpoints: [{ partName: '下摆臂球头', why: '松旷常见', priority: 1 }],
  })
  assert.equal(got.risks.length, 0)
  assert.equal(got.fixes.length, 0)
  assert.equal(got.checkpoints.length, 0)
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
