const test = require('node:test')
const assert = require('node:assert/strict')
const { parseWorkAdvice, parseDeliveryAdvice, parseInspectionAdvice } = require('./step-advice.service')

test('施工对不上时优先用模型写的实质意见', () => {
  const got = parseWorkAdvice({
    gaps: [
      { kind: 'missing', title: '下摆臂', body: '报价有这项，施工还没有照片。补上这一项的施工图。' },
      { kind: 'extra', title: '平衡杆', body: '施工做了，报价没有。若要向车主另收，先走补充报价。' },
      { kind: 'photo', title: '轮胎', body: '报价有这项，施工没有说明。补一句做成了什么。' },
      { kind: 'nope', title: '丢掉', body: '丢掉。' },
    ],
    items: [],
  }, [])
  assert.equal(got.scope, 'process')
  assert.equal(got.gaps.length, 2)
  assert.equal(got.gaps[0].kind, 'missing')
  assert.equal(got.gaps[0].body, '报价有这项，施工还没有照片。补上这一项的施工图。')
  assert.equal(got.gaps[1].kind, 'extra')
  assert.match(got.gaps[1].body, /补充报价|没有/)
})

test('分组建议只保留已经有的另一项', () => {
  const slots = [
    { slot: 1, url: 'https://cdn.example/a.jpg', partName: '钣喷' },
    { slot: 2, url: 'https://cdn.example/b.jpg', partName: '钣喷' },
  ]
  const got = parseWorkAdvice({
    gaps: [],
    items: [],
    groups: [
      { slot: 1, partName: '维修发动机' },
      { slot: 2, partName: '钣喷' },
      { slot: 1, partName: '维修发动机' },
      { slot: 3, partName: '轮胎' },
      { slot: 2, partName: '不存在的项' },
    ],
  }, [
    { id: 'a', name: '钣喷', note: '', photos: 2 },
    { id: 'b', name: '维修发动机', note: '', photos: 0 },
  ], slots)
  assert.equal(got.groups.length, 1)
  assert.equal(got.groups[0].url, 'https://cdn.example/a.jpg')
  assert.equal(got.groups[0].partName, '维修发动机')
  assert.equal(got.groups[0].body, '这张更像是维修发动机。')
})

test('空说明才给车主向的描述，看图复述和已写说明都不出', () => {
  const got = parseWorkAdvice({
    gaps: [],
    items: [
      { id: 'a', body: '语句已经改顺了。', supplement: '照片里旧胶套已经拆下。' },
      { id: 'b', body: '更换了已经开裂的下摆臂胶套。', supplement: '不要这句' },
      { id: 'c', body: '施工第1张可见技师整理套筒扳手。', supplement: '' },
      { id: 'd', body: '编一段没拍到的。', supplement: '' },
    ],
  }, [
    { id: 'a', name: '下摆臂', note: '胶套开裂已换', photos: 1 },
    { id: 'b', name: '下摆臂胶套', note: '', photos: 2 },
    { id: 'c', name: '底盘', note: '', photos: 4 },
    { id: 'd', name: '平衡杆', note: '', photos: 0 },
  ])
  assert.equal(got.items.length, 1)
  assert.equal(got.items[0].partName, '下摆臂胶套')
  assert.equal(got.items[0].body, '更换了已经开裂的下摆臂胶套。')
  assert.equal(got.items[0].display, '下摆臂胶套建议描述为：更换了已经开裂的下摆臂胶套。')
  assert.equal(got.gaps.length, 0)
})

test('报价里没有的施工项，提醒之外仍保留施工描述', () => {
  const got = parseWorkAdvice({
    gaps: [{ kind: 'extra', title: '平衡杆', body: '施工做了平衡杆，报价表里没有这一行。' }],
    items: [
      { id: 'a', body: '更换了已经松动的平衡杆。' },
      { id: 'b', body: '更换了开裂的下摆臂胶套。' },
    ],
  }, [
    { id: 'a', name: '平衡杆', note: '', photos: 2 },
    { id: 'b', name: '下摆臂胶套', note: '', photos: 1 },
  ])
  assert.equal(got.gaps.length, 1)
  assert.match(got.gaps[0].body, /报价/)
  assert.equal(got.items.length, 2)
  assert.equal(got.items[0].partName, '平衡杆')
  assert.equal(got.items[0].display, '平衡杆建议描述为：更换了已经松动的平衡杆。')
  assert.equal(got.items[1].display, '下摆臂胶套建议描述为：更换了开裂的下摆臂胶套。')
})

test('检测四块意见：过滤留证套话，文案空栏可应用', () => {
  const got = parseInspectionAdvice(
    {
      faultAnalysis: '左侧有剐蹭，先查叶子板与车门。',
      inspectOrder: ['先看左前叶子板', '再对右前门'],
      partHints: [{ title: '左前叶子板', body: '看变形和漆面' }],
      edits: [
        { kind: 'text', findingId: 'b', partName: '轮胎', advice: '胎侧有细纹，可先观察', body: '补写轮胎细纹' },
        { kind: 'photo', body: '车身四周都拍到了' },
        { kind: 'photo', body: '建议补拍清晰特写' },
      ],
      items: [
        { id: 'a', body: '接头已经老化。再拖可能接触不良。' },
      ],
    },
    [
      { id: 'a', name: '插头', result: '需处理', note: '接头老化' },
      { id: 'b', name: '', result: '', note: '' },
    ],
  )
  assert.equal(got.scope, 'inspect_v2')
  assert.match(got.faultAnalysis, /剐蹭/)
  assert.equal(got.inspectOrder.length, 2)
  assert.equal(got.partHints.length, 1)
  assert.equal(got.shop.length, 0)
  assert.equal(got.items.length, 0)
  const textEdit = got.edits.find((row) => row.kind === 'text' && row.findingId === 'b')
  assert.ok(textEdit)
  assert.equal(textEdit.canApply, true)
  assert.equal(textEdit.partName, '轮胎')
  assert.match(textEdit.advice, /细纹/)
  assert.equal(got.edits.some((row) => /四周/.test(row.body || '')), false)
  assert.equal(got.edits.some((row) => row.kind === 'photo' && /补拍/.test(row.body)), true)
})

test('交车分成维修、质保、用车', () => {
  const got = parseDeliveryAdvice({
    repair: { title: '这次维修', body: '换了下摆臂胶套。' },
    warranty: { title: '质保', body: '已写 1 年。' },
    care: { title: '用车', body: '过坎时听一下还有没有响。' },
  })
  assert.equal(got.repair.body, '换了下摆臂胶套。')
  assert.equal(got.warranty.body, '已写 1 年。')
  assert.match(got.care.body, /过坎/)
})
