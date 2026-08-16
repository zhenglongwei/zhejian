const assert = require('assert')
const {
  resolveWorkFlags,
  inferOutcomeFromCaptions,
  isIntakeArchiveItem,
  groupOwnerImagesByStage,
  buildOwnerProjectClusters,
  scrubOwnerCaption,
  sortWorkQueueByFamily,
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

{
  const groups = groupOwnerImagesByStage([
    { url: 'a', caption: '正常;', nodeId: 'stage_1', nodeTitle: '接车' },
    { url: 'b', caption: '已处理;', nodeId: 'stage_5', nodeTitle: '施工' },
    { url: 'c', caption: '正常;', nodeId: 'stage_1', nodeTitle: '接车' },
  ])
  assert.strictEqual(groups.length, 2)
  assert.strictEqual(groups[0].stageTitle, '接车')
  assert.strictEqual(groups[0].images.length, 2)
  assert.strictEqual(groups[1].stageTitle, '施工')
  assert.ok(!groups[0].images[0].nodeTitle)
  // 纯结果图注展示侧清空
  assert.strictEqual(groups[0].images[0].caption, '')
  assert.strictEqual(groups[1].images[0].caption, '')
}

// 刹车：多检查项共用施工项 → 同一服务项目族
{
  const clusters = buildOwnerProjectClusters([
    {
      itemKey: 'pad_thickness',
      label: '刹车片厚度',
      group: '制动检测',
      workFollowUpKeys: ['new_parts', 'old_new_compare'],
    },
    {
      itemKey: 'rotor_thickness',
      label: '刹车盘厚度',
      group: '制动检测',
      workFollowUpKeys: ['new_parts', 'old_new_compare'],
    },
    { itemKey: 'new_parts', label: '新配件展示', group: '制动施工', workOnly: true, workFollowUpKeys: [] },
    { itemKey: 'lights', label: '灯光', group: '电气', workFollowUpKeys: [] },
  ])
  const brake = clusters.find((c) =>
    c.members.some((m) => m.itemKey === 'pad_thickness'),
  )
  assert.ok(brake)
  const keys = brake.members.map((m) => m.itemKey).sort()
  assert.deepStrictEqual(keys, ['new_parts', 'pad_thickness', 'rotor_thickness'].sort())
  const lights = clusters.find((c) => c.members.some((m) => m.itemKey === 'lights'))
  assert.strictEqual(lights.members.length, 1)
}

assert.strictEqual(scrubOwnerCaption('正常;'), '')
assert.strictEqual(scrubOwnerCaption('建议更换；'), '')
assert.strictEqual(scrubOwnerCaption('机油发黑偏稀'), '机油发黑偏稀')

{
  const sorted = sortWorkQueueByFamily(
    [
      { itemKey: 'oil_filter', label: '机滤' },
      { itemKey: 'engine_oil', label: '新机油' },
      { itemKey: 'oil_level', label: '液位' },
      { itemKey: 'other', label: '其他' },
    ],
    [
      {
        itemKey: 'old_oil',
        workFollowUpKeys: ['engine_oil', 'oil_filter', 'oil_level'],
      },
      { itemKey: 'other', workFollowUpKeys: [] },
    ],
  )
  assert.deepStrictEqual(
    sorted.map((i) => i.itemKey),
    ['engine_oil', 'oil_filter', 'oil_level', 'other'],
  )
}

console.log('album-checklist.service.test.js OK')
