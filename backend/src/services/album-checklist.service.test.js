const assert = require('assert')
const {
  resolveWorkFlags,
  inferOutcomeFromCaptions,
  isIntakeArchiveItem,
} = require('./album-checklist.service')

assert.strictEqual(isIntakeArchiveItem({ group: '接车建档' }), true)
assert.strictEqual(isIntakeArchiveItem({ groupName: '接车建档' }), true)
assert.strictEqual(isIntakeArchiveItem({ group: '电气' }), false)

// 图注「正常」覆盖落库「建议更换」→ 退出施工
{
  const flags = resolveWorkFlags(
    {
      group: '接车建档',
      outcome: 'recommend_replace',
      note: '',
      work: {},
    },
    [{ caption: '正常;' }],
  )
  assert.strictEqual(flags.outcome, 'normal')
  assert.strictEqual(flags.inWorkQueue, false)
}

// 普通检测项同样：图注覆盖旧 outcome
{
  const flags = resolveWorkFlags(
    {
      group: '电气',
      outcome: 'recommend_replace',
      note: '',
      work: {},
      images: [{ url: 'x' }],
    },
    [{ caption: '正常;' }],
  )
  assert.strictEqual(flags.outcome, 'normal')
  assert.strictEqual(flags.inWorkQueue, false)
}

// 建档自由说明不进队
{
  const flags = resolveWorkFlags(
    {
      group: '接车建档',
      outcome: null,
      note: '',
      work: {},
    },
    [{ caption: '到店里程 85234km' }],
  )
  assert.strictEqual(flags.inferredOutcome, null)
  assert.strictEqual(flags.inWorkQueue, false)
}

// 建档明确「建议更换」进队
{
  const flags = resolveWorkFlags(
    {
      group: '接车建档',
      outcome: 'normal',
      note: '',
      work: {},
    },
    [{ caption: '建议更换;' }],
  )
  assert.strictEqual(flags.outcome, 'recommend_replace')
  assert.strictEqual(flags.inWorkQueue, true)
}

// 空图注时保留落库异常，避免上传瞬间掉队
{
  const flags = resolveWorkFlags(
    {
      group: '电气',
      outcome: 'recommend_replace',
      note: '',
      work: {},
      images: [{ url: 'x' }],
    },
    [{ caption: '' }],
  )
  assert.strictEqual(flags.outcome, 'recommend_replace')
  assert.strictEqual(flags.inWorkQueue, true)
}

assert.strictEqual(
  inferOutcomeFromCaptions(['到店里程 1km'], { archiveItem: true }),
  null,
)
assert.strictEqual(
  inferOutcomeFromCaptions(['到店里程 1km'], { archiveItem: false }),
  'repaired_other',
)

console.log('album-checklist.service.test.js OK')
