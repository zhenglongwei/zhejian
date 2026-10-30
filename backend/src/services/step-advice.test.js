const test = require('node:test')
const assert = require('node:assert/strict')
const {
  parseWorkAdvice,
  parseDeliveryAdvice,
  parseInspectionAdvice,
  needsInspectGroupsRepair,
  mergeInspectAdvicePreferringGroups,
  faultAnalysisLooksMultiTopic,
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

test('检测按项一条：拆图与文案合并，过滤留证套话', () => {
  const got = parseInspectionAdvice(
    {
      faultAnalysis: '左侧有剐蹭，先查叶子板与车门。',
      inspectOrder: ['先看左前叶子板', '再对右前门'],
      partHints: [{ title: '左前叶子板', body: '看变形和漆面' }],
      edits: [
        {
          kind: 'item',
          findingId: 'pile',
          body: '拆成叶子板与车门并写上发现',
          groups: [
            { partName: '左前叶子板', advice: '漆面擦伤', imageSlots: [1] },
            { partName: '左前门', advice: '边缘有刮痕', imageSlots: [2] },
          ],
        },
        { kind: 'text', findingId: 'b', partName: '轮胎', advice: '胎侧有细纹，可先观察', body: '补写轮胎细纹' },
        { kind: 'photo', body: '车身四周都拍到了' },
        { kind: 'photo', body: '建议补拍清晰特写' },
      ],
    },
    [
      { id: 'pile', name: '', note: '', photos: 2 },
      { id: 'b', name: '', note: '', photos: 1 },
    ],
    ['https://a/1.jpg', 'https://a/2.jpg'],
    [
      { slot: 1, url: 'https://a/1.jpg', findingId: 'pile' },
      { slot: 2, url: 'https://a/2.jpg', findingId: 'pile' },
    ],
  )
  assert.equal(got.scope, 'inspect_v2')
  assert.match(got.faultAnalysis, /剐蹭/)
  assert.equal(got.inspectOrder.length, 2)
  assert.equal(got.partHints.length, 1)
  const split = got.edits.find((row) => row.kind === 'item' && row.findingId === 'pile')
  assert.ok(split)
  assert.equal(split.groups.length, 2)
  assert.equal(split.groups[0].partName, '左前叶子板')
  assert.match(split.groups[0].advice, /擦伤/)
  const fill = got.edits.find((row) => row.kind === 'item' && row.findingId === 'b')
  assert.ok(fill)
  assert.equal(fill.partName, '轮胎')
  assert.match(fill.advice, /细纹/)
  assert.equal(got.edits.filter((row) => row.kind === 'item' && row.findingId === 'b').length, 1)
  assert.equal(got.edits.some((row) => /四周/.test(row.body || '')), false)
  assert.equal(got.edits.some((row) => row.kind === 'photo' && /补拍/.test(row.body)), true)
})

test('故障分析分点写清时判定为多主题', () => {
  assert.equal(
    faultAnalysisLooksMultiTopic(
      '1.车门下沿漆面剥落。2.前刹车盘有磨损纹路。3.后悬挂与排气管有锈斑。',
    ),
    true,
  )
  assert.equal(faultAnalysisLooksMultiTopic('底盘整体未见明显变形。'), false)
})

test('多图项已有分点分析但无 groups 时需要补跑', () => {
  const ctx = {
    inspectPhotoSlots: [
      { slot: 1, url: 'https://a/1.jpg', findingId: 'pile' },
      { slot: 2, url: 'https://a/2.jpg', findingId: 'pile' },
      { slot: 3, url: 'https://a/3.jpg', findingId: 'pile' },
    ],
  }
  const parsed = {
    faultAnalysis: '1.漆面剥落。2.刹车盘磨损。3.底盘锈斑。',
    partHints: [],
    edits: [],
  }
  assert.equal(needsInspectGroupsRepair(parsed, ctx), true)
  const withGroups = {
    ...parsed,
    edits: [
      {
        kind: 'item',
        findingId: 'pile',
        body: '拆开',
        groups: [
          { partName: '车身', advice: 'a', images: [{ url: 'https://a/1.jpg' }] },
          { partName: '制动', advice: 'b', images: [{ url: 'https://a/2.jpg' }] },
        ],
      },
    ],
  }
  assert.equal(needsInspectGroupsRepair(withGroups, ctx), false)
})

test('补跑结果把 groups 合并进原意见', () => {
  const base = {
    faultAnalysis: '1.漆 2.刹',
    edits: [{ kind: 'item', findingId: 'pile', body: '建议补写', groups: [], canApply: true }],
  }
  const repair = {
    edits: [
      {
        kind: 'item',
        findingId: 'pile',
        body: '拆成漆面与制动',
        groups: [
          { partName: '车身漆面', advice: '剥落', images: [{ url: 'https://a/1.jpg' }] },
          { partName: '制动系统', advice: '磨损', images: [{ url: 'https://a/2.jpg' }] },
        ],
      },
    ],
  }
  const got = mergeInspectAdvicePreferringGroups(base, repair)
  assert.equal(got.edits[0].groups.length, 2)
  assert.match(got.edits[0].body, /拆成/)
})

test('模型未给 groups 时不根据 imageNotes 拼拆分条', () => {
  const got = parseInspectionAdvice(
    {
      faultAnalysis: '1.车身漆损 2.刹车盘磨损 3.底盘锈蚀',
      inspectOrder: ['先看漆面', '再测刹车盘'],
      partHints: [{ title: '车身修复提示', body: '除锈补漆' }],
      edits: [],
      imageNotes: [
        { slot: 1, partName: '车身漆面', note: '侧围打磨露铁有锈' },
        { slot: 2, partName: '制动系统', note: '刹车盘有沟槽' },
        { slot: 3, partName: '底盘悬挂', note: '排气与摆臂有浮灰锈' },
      ],
    },
    [{ id: 'pile', name: '', note: '', photos: 3 }],
    ['https://cdn/a.jpg', 'https://cdn/b.jpg', 'https://cdn/c.jpg'],
    [
      { slot: 1, url: 'https://cdn/a.jpg', findingId: 'pile' },
      { slot: 2, url: 'https://cdn/b.jpg', findingId: 'pile' },
      { slot: 3, url: 'https://cdn/c.jpg', findingId: 'pile' },
    ],
  )
  assert.equal(
    got.edits.some((row) => row.kind === 'item' && Array.isArray(row.groups) && row.groups.length >= 2),
    false,
  )
})

test('检测拆分按 photoSlots 槽位解析，不跟本次附图下标错位', () => {
  const got = parseInspectionAdvice(
    {
      faultAnalysis: '一处划痕，两处底盘锈蚀。',
      inspectOrder: ['先看漆面划痕', '再查底盘锈蚀'],
      partHints: [],
      edits: [
        {
          kind: 'item',
          findingId: 'mixed',
          body: '拆成划痕与底盘',
          groups: [
            { partName: '车身划痕', advice: '漆面擦伤', imageSlots: [1] },
            { partName: '底盘锈蚀', advice: '排气管与悬挂有锈', imageSlots: [2, 3] },
          ],
        },
      ],
    },
    [{ id: 'mixed', name: '', note: '', photos: 3 }],
    // 若只送了槽位 2、3（已识过槽位 1），下标与槽位号不一致
    ['https://cdn/chassis-a.jpg', 'https://cdn/chassis-b.jpg'],
    [
      { slot: 1, url: 'https://cdn/scratch.jpg', findingId: 'mixed' },
      { slot: 2, url: 'https://cdn/chassis-a.jpg', findingId: 'mixed' },
      { slot: 3, url: 'https://cdn/chassis-b.jpg', findingId: 'mixed' },
    ],
  )
  const split = got.edits.find((row) => row.findingId === 'mixed')
  assert.ok(split)
  assert.equal(split.groups.length, 2)
  assert.equal(split.groups[0].images[0].url, 'https://cdn/scratch.jpg')
  assert.equal(split.groups[1].images.length, 2)
  assert.equal(split.groups[1].images[0].url, 'https://cdn/chassis-a.jpg')
})

test('唯一多图项时，错误 findingId 重挂到真实 id', () => {
  const got = parseInspectionAdvice(
    {
      faultAnalysis: '1.车身漆面剥落。2.制动盘有沟。',
      inspectOrder: ['先看漆面', '再测制动'],
      partHints: [],
      edits: [
        {
          kind: 'item',
          findingId: 'pile',
          body: '拆成车身漆面与制动系统',
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
  const split = got.edits.find((row) => row.kind === 'item' && row.findingId === 'fid_real')
  assert.ok(split)
  assert.equal(split.groups.length, 2)
  assert.equal(split.groups[0].partName, '车身漆面')
  assert.equal(got.edits.some((row) => row.findingId === 'pile'), false)
})

test('imageSlots 写成图N 也能解析出 groups', () => {
  const got = parseInspectionAdvice(
    {
      faultAnalysis: '1.漆面 2.制动',
      inspectOrder: [],
      partHints: [],
      edits: [
        {
          kind: 'item',
          findingId: 'fid_mix',
          body: '拆开',
          groups: [
            { partName: '车身漆面', advice: '擦伤', imageSlots: ['图1'] },
            { partName: '制动系统', advice: '磨损', imageSlots: ['图 2'] },
          ],
        },
      ],
    },
    [{ id: 'fid_mix', name: '', note: '', photos: 2 }],
    ['https://cdn/a.jpg', 'https://cdn/b.jpg'],
    [
      { slot: 1, url: 'https://cdn/a.jpg', findingId: 'fid_mix' },
      { slot: 2, url: 'https://cdn/b.jpg', findingId: 'fid_mix' },
    ],
  )
  const split = got.edits.find((row) => row.findingId === 'fid_mix')
  assert.ok(split)
  assert.equal(split.groups.length, 2)
  assert.equal(split.groups[0].images[0].url, 'https://cdn/a.jpg')
  assert.equal(split.groups[1].images[0].url, 'https://cdn/b.jpg')
})

test('两个多图项时错误 findingId 不误挂', () => {
  const got = parseInspectionAdvice(
    {
      faultAnalysis: '1.漆面 2.制动 3.底盘',
      inspectOrder: [],
      partHints: [],
      edits: [
        {
          kind: 'item',
          findingId: 'pile',
          body: '拆开',
          groups: [
            { partName: '车身漆面', advice: '擦伤', imageSlots: [1] },
            { partName: '制动系统', advice: '磨损', imageSlots: [2] },
          ],
        },
      ],
    },
    [
      { id: 'fid_a', name: '', note: '', photos: 2 },
      { id: 'fid_b', name: '', note: '', photos: 2 },
    ],
    ['https://cdn/a1.jpg', 'https://cdn/a2.jpg', 'https://cdn/b1.jpg', 'https://cdn/b2.jpg'],
    [
      { slot: 1, url: 'https://cdn/a1.jpg', findingId: 'fid_a' },
      { slot: 2, url: 'https://cdn/a2.jpg', findingId: 'fid_a' },
      { slot: 3, url: 'https://cdn/b1.jpg', findingId: 'fid_b' },
      { slot: 4, url: 'https://cdn/b2.jpg', findingId: 'fid_b' },
    ],
  )
  assert.equal(
    got.edits.some((row) => row.kind === 'item' && Array.isArray(row.groups) && row.groups.length >= 2),
    false,
  )
  assert.equal(got.edits.some((row) => row.findingId === 'pile'), false)
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
