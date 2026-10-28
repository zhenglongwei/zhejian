const test = require('node:test')
const assert = require('node:assert/strict')
const {
  parseIntakeAdvicePayload,
  sanitizeIntakeAdviceForView,
  unmatchedCheckpoints,
  missingSidesFromPayload,
} = require('./intake-advice')

test('接车意见只保留没拍到的侧面，且不再平行生成补全景', () => {
  const got = parseIntakeAdvicePayload({
    diagnosis: '漆面受损，建议看深度。',
    missing: ['车尾', '左前翼子板', '车尾'],
    risks: [{ title: '损伤程度缺失', body: '要写清掉漆还是划痕。' }],
    fixes: [{ title: '细化诉求', options: ['前保险杠'] }],
  })
  assert.equal(got.covered, false)
  assert.deepEqual(
    got.risks.map((row) => row.title),
    ['缺车尾'],
  )
  assert.match(got.risks[0].body, /再拍一张/)
  assert.equal(got.fixes.length, 0)
  assert.equal(got.diagnosis, '')
})

test('优先 coverage：coverage 为 true 的侧面即使出现在 missing 也不报缺', () => {
  const got = parseIntakeAdvicePayload({
    coverage: { front: true, rear: true, left: true, right: false },
    missing: ['车尾', '右侧'],
  })
  assert.equal(got.covered, false)
  assert.deepEqual(
    got.risks.map((row) => row.title),
    ['缺右侧'],
  )
  assert.equal(got.fixes.length, 0)
})

test('coverage 全 true 则四周已齐', () => {
  const got = parseIntakeAdvicePayload({
    coverage: { front: true, rear: true, left: true, right: true },
    missing: ['车尾'],
  })
  assert.equal(got.covered, true)
  assert.equal(got.risks.length, 0)
})

test('missingSidesFromPayload 无 coverage 时回退 missing 列表', () => {
  assert.deepEqual(missingSidesFromPayload({ missing: ['车头', '右侧'] }), ['车头', '右侧'])
})

test('四周都拍到了就不要求补描述', () => {
  const got = parseIntakeAdvicePayload({ missing: [], risks: [{ title: '影像对应关系弱' }] })
  assert.equal(got.covered, true)
  assert.equal(got.risks.length, 0)
  assert.equal(got.fixes.length, 0)
})

test('旧的诊断意见不再显示', () => {
  const view = sanitizeIntakeAdviceForView({
    status: 'ready',
    diagnosis: '外观漆面受损',
    risks: [{ title: '剐蹭位置不明', body: '要写具体部位' }],
    fixes: [{ title: '细化诉求描述', options: ['左前翼子板'] }],
  })
  assert.equal(view.covered, false)
  assert.equal(view.risks.length, 0)
  assert.equal(view.fixes.length, 0)
})

test('sanitize 覆盖态只出一块还缺清单', () => {
  const view = sanitizeIntakeAdviceForView({
    status: 'ready',
    scope: 'coverage',
    risks: [{ title: '缺车尾', body: '这一侧还没有全景。' }],
  })
  assert.equal(view.covered, false)
  assert.equal(view.risks.length, 1)
  assert.equal(view.risks[0].title, '缺车尾')
  assert.match(view.risks[0].body, /再拍一张/)
  assert.equal(view.fixes.length, 0)
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
