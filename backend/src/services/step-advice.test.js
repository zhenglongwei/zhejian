const test = require('node:test')
const assert = require('node:assert/strict')
const {
  parseWorkAdvice,
  parseDeliveryAdvice,
  parseInspectionAdvice,
  inspectStepsFromRaw,
  contextOf,
} = require('./step-advice.service')

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

test('检测意见按关键字整理：同条里划痕并组、底盘另组', () => {
  const got = parseInspectionAdvice(
    {
      故障诊断: '左后门有划痕，底盘有锈。',
      检测顺序: ['先按诉求看异响', '再看左后门漆面是否露底'],
      拆分建议: [
        { 检测项目: '划痕检测', 图片: ['图1', '图2'], 描述: '两张都是左后门下沿漆面划痕，建议核对是否露底。' },
        { 检测项目: '底盘检修', 图片: ['图3'], 描述: '排气管附近有锈斑，建议再看悬挂。' },
      ],
    },
    [{ id: 'pile', name: '', note: '', photos: 3 }],
    ['https://a/1.jpg', 'https://a/2.jpg', 'https://a/3.jpg'],
    [
      { slot: 1, url: 'https://a/1.jpg', findingId: 'pile' },
      { slot: 2, url: 'https://a/2.jpg', findingId: 'pile' },
      { slot: 3, url: 'https://a/3.jpg', findingId: 'pile' },
    ],
  )
  assert.match(got.faultAnalysis, /划痕/)
  assert.equal(got.inspectOrder.length, 2)
  assert.equal(got.partHints.length, 0)
  const split = got.edits.find((row) => row.findingId === 'pile')
  assert.ok(split)
  assert.equal(split.groups.length, 2)
  assert.equal(split.groups[0].partName, '划痕检测')
  assert.equal(split.groups[0].images.length, 2)
  assert.equal(split.groups[0].imageLabel, '图1、图2')
  assert.match(split.groups[0].advice, /露底/)
  assert.equal(split.groups[1].partName, '底盘检修')
  assert.equal(split.groups[1].images[0].url, 'https://a/3.jpg')
  assert.equal(got.edits.some((row) => row.kind === 'photo'), false)
})

test('检测顺序写成整段时仍能展示，不并进拆分', () => {
  const got = parseInspectionAdvice(
    {
      故障诊断: '左后门漆面剥落。',
      检测顺序: '1. 先按异响查底盘悬挂\n2. 再查制动踏板行程',
      拆分建议: [],
    },
    [{ id: 'a', name: '', note: '', photos: 1 }],
    ['https://a/1.jpg'],
    [{ slot: 1, url: 'https://a/1.jpg', findingId: 'a' }],
  )
  assert.equal(got.inspectOrder.length, 2)
  assert.match(got.inspectOrder[0], /悬挂/)
  assert.equal(got.edits.filter((row) => row.groups && row.groups.length >= 2).length, 0)
})

test('同一项目名的图收成一组，字面不同的名称不合并', () => {
  const slots = [
    { slot: 1, url: 'https://a/1.jpg', findingId: 'pile' },
    { slot: 2, url: 'https://a/2.jpg', findingId: 'pile' },
    { slot: 3, url: 'https://a/3.jpg', findingId: 'pile' },
  ]
  const merged = parseInspectionAdvice(
    {
      故障诊断: '划痕和底盘。',
      检测顺序: ['先看漆面'],
      拆分建议: [
        { 检测项目: '划痕检测', 图片: ['图1'], 描述: '左侧划痕。' },
        { 检测项目: '划痕检测', 图片: ['图2'], 描述: '同一处另一角度。' },
        { 检测项目: '底盘检修', 图片: ['图3'], 描述: '底盘有锈。' },
      ],
    },
    [{ id: 'pile', name: '', note: '', photos: 3 }],
    [],
    slots,
  )
  const split = merged.edits.find((row) => row.findingId === 'pile')
  assert.equal(split.groups.length, 2)
  assert.equal(split.groups[0].images.length, 2)

  const distinct = parseInspectionAdvice(
    {
      故障诊断: '两处漆面。',
      检测顺序: ['先看漆面'],
      拆分建议: [
        { 检测项目: '划痕', 图片: ['图1'], 描述: '短名。' },
        { 检测项目: '划痕检测', 图片: ['图2'], 描述: '全名。' },
      ],
    },
    [{ id: 'pile', name: '', note: '', photos: 2 }],
    [],
    slots.slice(0, 2),
  )
  const names = distinct.edits.find((row) => row.findingId === 'pile').groups.map((g) => g.partName)
  assert.deepEqual(names, ['划痕', '划痕检测'])
})

test('只有一组时仍展示拆分建议，但不能应用', () => {
  const got = parseInspectionAdvice(
    {
      故障诊断: '三张都是左后门划痕。',
      检测顺序: ['先核对漆面是否露底'],
      拆分建议: [
        { 检测项目: '划痕检测', 图片: ['图1', '图2', '图3'], 描述: '同一处划痕。' },
      ],
    },
    [{ id: 'pile', name: '', note: '', photos: 3 }],
    [],
    [
      { slot: 1, url: 'https://a/1.jpg', findingId: 'pile' },
      { slot: 2, url: 'https://a/2.jpg', findingId: 'pile' },
      { slot: 3, url: 'https://a/3.jpg', findingId: 'pile' },
    ],
  )
  assert.match(got.faultAnalysis, /划痕/)
  assert.equal(got.inspectOrder.length, 1)
  assert.equal(got.edits.length, 1)
  assert.equal(got.edits[0].canApply, false)
  assert.equal(got.edits[0].groups.length, 1)
  assert.equal(got.edits[0].groups[0].partName, '划痕检测')
})

test('故障分析键可读，检测顺序为空则不保留', () => {
  const got = parseInspectionAdvice(
    {
      故障分析: '1. 漆面损伤。\n2. 底盘锈蚀。',
      检测顺序: [],
      拆分建议: [
        { 检测项目: '划痕检测', 图片: ['图1'], 描述: '漆面划痕。' },
        { 检测项目: '底盘检测', 图片: ['图2'], 描述: '底盘锈迹。' },
      ],
    },
    [{ id: 'pile', name: '', note: '', photos: 2 }],
    [],
    [
      { slot: 1, url: 'https://a/1.jpg', findingId: 'pile' },
      { slot: 2, url: 'https://a/2.jpg', findingId: 'pile' },
    ],
  )
  assert.match(got.faultAnalysis, /漆面损伤/)
  assert.match(got.faultAnalysis, /\n/)
  assert.equal(got.inspectOrder.length, 0)
  assert.equal(got.edits.length, 1)
  assert.equal(got.edits[0].canApply, true)
  assert.equal(got.edits[0].groups.length, 2)
})

test('逐张看图和逐张归类只进步骤日志，不参与拆分', () => {
  const raw = {
    故障分析: '1. 漆面受损。',
    逐张看图: [
      { 图: '图1', 内容: '车门漆面。' },
      { 图: '图2', 内容: '底盘。' },
    ],
    逐张归类: [
      { 图: '图1', 检测项目: '划痕检测' },
      { 图: '图2', 检测项目: '底盘检测' },
    ],
    拆分建议: [{ 检测项目: '划痕检测', 图片: ['图1'], 描述: '漆面划痕。' }],
    检测顺序: ['底盘这次没有对应照片'],
  }
  const got = parseInspectionAdvice(
    raw,
    [{ id: 'pile', name: '', note: '', photos: 2 }],
    [],
    [
      { slot: 1, url: 'https://a/1.jpg', findingId: 'pile' },
      { slot: 2, url: 'https://a/2.jpg', findingId: 'pile' },
    ],
  )
  assert.equal(got.edits.length, 1)
  assert.equal(got.edits[0].groups.length, 1)
  assert.equal(got.edits[0].groups[0].partName, '划痕检测')
  assert.equal(JSON.stringify(got).includes('逐张看图'), false)

  const steps = inspectStepsFromRaw(raw)
  assert.match(steps.步骤1_故障分析, /漆面受损/)
  assert.equal(steps.步骤2_逐张看图.length, 2)
  assert.equal(steps.步骤2_逐张看图[1].内容, '底盘。')
  assert.equal(steps.步骤3_逐张归类[1].检测项目, '底盘检测')
  assert.equal(steps.步骤4_拆分建议[0].检测项目, '划痕检测')
  assert.deepEqual(steps.步骤5_检测顺序, ['底盘这次没有对应照片'])
})

test('图注和空壳不能变成拆分建议', () => {
  const slots = [
    { slot: 1, url: 'https://cdn/a.jpg', findingId: 'pile' },
    { slot: 2, url: 'https://cdn/b.jpg', findingId: 'pile' },
  ]
  const fromNotes = parseInspectionAdvice(
    {
      faultAnalysis: '1.漆面 2.制动',
      inspectOrder: ['先看漆面', '再测制动'],
      edits: [],
      imageNotes: [
        { slot: 1, partName: '车身漆面', note: '漆面剥落' },
        { slot: 2, partName: '制动盘', note: '盘面磨损' },
      ],
    },
    [{ id: 'pile', name: '', note: '', photos: 2 }],
    ['https://cdn/a.jpg', 'https://cdn/b.jpg'],
    slots,
  )
  assert.equal(fromNotes.edits.length, 0)
  assert.match(fromNotes.faultAnalysis, /漆面/)

  const emptyShell = parseInspectionAdvice(
    {
      故障诊断: '漆面和制动都要看。',
      检测顺序: ['先看漆面'],
      拆分建议: [{}, {}],
      edits: [
        {
          kind: 'item',
          findingId: 'pile',
          groups: [
            { partName: '车身漆面', advice: '擦伤', imageSlots: [1] },
            { partName: '制动系统', advice: '磨损', imageSlots: [2] },
          ],
        },
      ],
    },
    [{ id: 'pile', name: '', note: '', photos: 2 }],
    [],
    slots,
  )
  assert.equal(emptyShell.edits.length, 0)
})

test('没有中文拆分键时，仍收下旧的分组字段', () => {
  const got = parseInspectionAdvice(
    {
      faultAnalysis: '两项损伤。',
      inspectOrder: ['先看漆面', '再测制动'],
      edits: [
        {
          kind: 'item',
          findingId: 'pile',
          groups: [
            { partName: '左后门下沿钣喷', advice: '漆面剥落需钣喷', imageNames: ['图1'] },
            { partName: '前制动盘磨损评估', advice: '盘面磨损需测厚', imageName: '图2' },
          ],
        },
      ],
    },
    [{ id: 'pile', name: '', note: '', photos: 2 }],
    ['https://a/1.jpg', 'https://a/2.jpg'],
    [
      { slot: 1, url: 'https://a/1.jpg', findingId: 'pile' },
      { slot: 2, url: 'https://a/2.jpg', findingId: 'pile' },
    ],
  )
  const split = got.edits.find((row) => row.findingId === 'pile')
  assert.equal(split.groups.length, 2)
  assert.equal(split.groups[0].imageLabel, '图1')
  assert.equal(split.groups[1].images[0].url, 'https://a/2.jpg')
})

test('图号按槽位对照片，不跟本次附图下标走', () => {
  const got = parseInspectionAdvice(
    {
      故障诊断: '一处划痕，两处底盘锈蚀。',
      检测顺序: ['先看漆面划痕', '再查底盘锈蚀'],
      拆分建议: [
        { 检测项目: '划痕检测', 图片: ['图1'], 描述: '漆面擦伤' },
        { 检测项目: '底盘检修', 图片: [2, 3], 描述: '排气管与悬挂有锈' },
      ],
    },
    [{ id: 'mixed', name: '', note: '', photos: 3 }],
    ['https://cdn/chassis-a.jpg', 'https://cdn/chassis-b.jpg'],
    [
      { slot: 1, url: 'https://cdn/scratch.jpg', findingId: 'mixed' },
      { slot: 2, url: 'https://cdn/chassis-a.jpg', findingId: 'mixed' },
      { slot: 3, url: 'https://cdn/chassis-b.jpg', findingId: 'mixed' },
    ],
  )
  const split = got.edits.find((row) => row.findingId === 'mixed')
  assert.equal(split.groups[0].images[0].url, 'https://cdn/scratch.jpg')
  assert.equal(split.groups[1].images.length, 2)
  assert.equal(split.groups[1].images[0].url, 'https://cdn/chassis-a.jpg')
})

test('写错的项编号不影响，照片落在哪一条就归哪一条', () => {
  const got = parseInspectionAdvice(
    {
      faultAnalysis: '漆面和制动。',
      inspectOrder: ['先看漆面'],
      edits: [
        {
          kind: 'item',
          findingId: 'pile',
          groups: [
            { partName: '车身漆面', advice: '漆面剥落', imageSlots: [1] },
            { partName: '制动系统', advice: '盘面有沟', imageSlots: [2] },
          ],
        },
      ],
    },
    [{ id: 'fid_real', name: '', note: '', photos: 2 }],
    ['https://cdn/a.jpg', 'https://cdn/b.jpg'],
    [
      { slot: 1, url: 'https://cdn/a.jpg', findingId: 'fid_real' },
      { slot: 2, url: 'https://cdn/b.jpg', findingId: 'fid_real' },
    ],
  )
  const split = got.edits.find((row) => row.findingId === 'fid_real')
  assert.ok(split)
  assert.equal(split.groups.length, 2)
  assert.equal(got.edits.some((row) => row.findingId === 'pile'), false)
})

test('故障分析写成多条时仍是分行，不拼成逗号', () => {
  const got = parseInspectionAdvice(
    {
      故障诊断: ['1. 车门下沿漆面剥落。', '2. 制动盘表面磨损。'],
      检测顺序: ['先看漆面', '再测刹车盘'],
      拆分建议: [],
    },
    [{ id: 'fid_a', name: '', note: '', photos: 2 }],
    [],
    [
      { slot: 1, url: 'https://cdn/a.jpg', findingId: 'fid_a' },
      { slot: 2, url: 'https://cdn/b.jpg', findingId: 'fid_a' },
    ],
  )
  assert.match(got.faultAnalysis, /车门下沿/)
  assert.match(got.faultAnalysis, /制动盘/)
  assert.equal(/,2\./.test(got.faultAnalysis), false)
})

test('档位词不留在描述里', () => {
  const got = parseInspectionAdvice(
    {
      故障诊断: '底盘有锈，状态良好的部位不写。',
      检测顺序: ['先看锈蚀，需处理的先查'],
      拆分建议: [
        { 检测项目: '底盘检修', 图片: ['图1'], 描述: '锈斑需处理，放着会继续扩。' },
        { 检测项目: '划痕检测', 图片: ['图2'], 描述: '漆面有划痕。' },
      ],
    },
    [{ id: 'pile', name: '', note: '', photos: 2 }],
    [],
    [
      { slot: 1, url: 'https://a/1.jpg', findingId: 'pile' },
      { slot: 2, url: 'https://a/2.jpg', findingId: 'pile' },
    ],
  )
  assert.equal(/需处理|状态良好/.test(got.faultAnalysis), false)
  assert.equal(got.inspectOrder.some((line) => /需处理/.test(line)), false)
  assert.equal(/需处理/.test(got.edits[0].groups[0].advice), false)
  assert.match(got.edits[0].groups[0].advice, /锈斑/)
})

test('跨条的图不并成一条拆分', () => {
  const got = parseInspectionAdvice(
    {
      故障诊断: '两条都有照片。',
      检测顺序: ['先看漆面'],
      拆分建议: [
        { 检测项目: '划痕检测', 图片: ['图1', '图3'], 描述: '两张划痕不在同一条里。' },
        { 检测项目: '底盘检修', 图片: ['图2'], 描述: '底盘。' },
      ],
    },
    [
      { id: 'fid_a', name: '', note: '', photos: 2 },
      { id: 'fid_b', name: '', note: '', photos: 2 },
    ],
    [],
    [
      { slot: 1, url: 'https://cdn/a1.jpg', findingId: 'fid_a' },
      { slot: 2, url: 'https://cdn/a2.jpg', findingId: 'fid_a' },
      { slot: 3, url: 'https://cdn/b1.jpg', findingId: 'fid_b' },
      { slot: 4, url: 'https://cdn/b2.jpg', findingId: 'fid_b' },
    ],
  )
  const onA = got.edits.find((row) => row.findingId === 'fid_a')
  const onB = got.edits.find((row) => row.findingId === 'fid_b')
  assert.ok(onA)
  assert.equal(onA.groups.length, 2)
  assert.equal(onA.groups[0].images.length, 1)
  assert.equal(onA.groups.some((g) => g.images.some((img) => String(img.url).includes('b1'))), false)
  assert.ok(onB)
  assert.equal(onB.canApply, false)
  assert.equal(onB.groups.length, 1)
  assert.equal(onB.groups[0].images[0].url, 'https://cdn/b1.jpg')
})

test('故障诊断按看见的问题分行，换行保留', () => {
  const got = parseInspectionAdvice(
    {
      故障诊断: '1. 左后门下沿漆面剥落露底。\n2. 底盘悬挂与排气管有锈迹。',
      检测顺序: ['先看漆面', '再看底盘'],
      拆分建议: [
        { 检测项目: '划痕检测', 图片: ['图1', '图2'], 描述: '两张都是车门下沿漆面。' },
        { 检测项目: '底盘检修', 图片: ['图3'], 描述: '底盘与悬挂。' },
        { 检测项目: '制动盘检查', 图片: ['图4'], 描述: '制动盘盘面。' },
      ],
    },
    [{ id: 'pile', name: '', note: '', photos: 4 }],
    [],
    [
      { slot: 1, url: 'https://a/1.jpg', findingId: 'pile' },
      { slot: 2, url: 'https://a/2.jpg', findingId: 'pile' },
      { slot: 3, url: 'https://a/3.jpg', findingId: 'pile' },
      { slot: 4, url: 'https://a/4.jpg', findingId: 'pile' },
    ],
  )
  assert.match(got.faultAnalysis, /漆面剥落/)
  assert.match(got.faultAnalysis, /底盘悬挂/)
  assert.match(got.faultAnalysis, /\n/)
  const split = got.edits.find((row) => row.findingId === 'pile')
  assert.equal(split.groups.length, 3)
  assert.equal(split.groups[0].images.length, 2)
  assert.equal(split.groups[2].partName, '制动盘检查')
})

test('交车出简述与车主关心的问题', () => {
  const got = parseDeliveryAdvice({
    repairBrief: '更换下摆臂胶套，并做了机油机滤保养。',
    ownerFaqs: [
      { question: '新胶套要注意什么？', answer: '近期少过剧烈颠簸，磨合几天。' },
      { question: '质保怎么算？', answer: '按单上质保期限执行。' },
    ],
    tips: [{ title: '交车照', body: '还缺整车外观。' }],
  })
  assert.match(got.repairBrief, /下摆臂胶套/)
  assert.equal(got.ownerFaqs.length, 2)
  assert.match(got.ownerFaqs[0].question, /新胶套/)
  assert.equal(got.tips.length, 1)
})

test('交车兼容旧 repair/care 字段', () => {
  const got = parseDeliveryAdvice({
    repair: { title: '这次维修', body: '换了下摆臂胶套。' },
    care: { title: '用车', body: '过坎时听一下还有没有响。' },
  })
  assert.match(got.repairBrief, /下摆臂胶套/)
})

test('AI 上下文从节点 content 读主诉、检测项和图', () => {
  const got = contextOf({
    contentPackageJson: {
      flowNodes: [
        {
          kind: 'intake',
          sortOrder: 1,
          content: { chiefComplaint: '过坎异响', pendingImages: [] },
        },
        {
          kind: 'inspection',
          sortOrder: 2,
          content: {
            findings: [
              {
                id: 'f1',
                partName: '下摆臂',
                advice: '胶套开裂',
                images: [{ url: 'https://cdn.example/inspect.jpg' }],
              },
            ],
          },
        },
      ],
    },
  })
  assert.equal(got.complaint, '过坎异响')
  assert.equal(got.inspectItems.length, 1)
  assert.equal(got.inspectItems[0].name, '下摆臂')
  assert.equal(got.inspectPhotoSlots.length, 1)
  assert.match(got.inspectPhotoSlots[0].url, /inspect\.jpg/)
})
