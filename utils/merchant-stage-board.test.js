const test = require('node:test')
const assert = require('node:assert/strict')
const { FINDING_RESULT } = require('../constants/service-flow-nodes')
const { buildMerchantStageBoard, stageReviewForm, stageEditorNode } = require('./merchant-stage-board')

function album() {
  return {
    vehicle: { plate: '粤B7K52M', brand: '宝马', series: '3系', mileage: 68420 },
    createdAt: '2026-05-28T01:18:00.000Z',
  }
}

function nodes() {
  return [
    {
      id: 'in',
      kind: 'intake',
      sortOrder: 1,
      status: 'done',
      photoDraft: {
        chiefComplaint: '地面有油迹',
        odometerUrl: 'https://img/odo.jpg',
        fuelReading: '约 45%',
        intakeResults: [{ category: 'belongings', reading: '钥匙 1 把' }],
      },
      previewImages: [
        { url: 'https://img/odo.jpg' },
        { url: 'https://img/front.jpg', caption: '左前', observation: '左前杠有一道划痕' },
        { url: 'https://img/tire.jpg', caption: '轮胎' },
      ],
      intakeAdvice: { diagnosis: '重点检查悬挂衬套老化、球头间隙' },
    },
    {
      id: 'ins',
      kind: 'inspection',
      sortOrder: 2,
      status: 'done',
      photoDraft: { findings: [] },
    },
    {
      id: 'rep',
      kind: 'inspection_report',
      sortOrder: 3,
      status: 'done',
      document: {
        status: 'confirmed',
        payload: {
          findings: [
            { partName: '气门室盖', result: FINDING_RESULT.ACTION, advice: '渗油' },
            { partName: '制动片', result: FINDING_RESULT.WATCH, advice: '偏薄' },
            { partName: '轮胎', result: FINDING_RESULT.OK, advice: '正常' },
          ],
        },
      },
    },
    {
      id: 'q',
      kind: 'quote_confirm',
      sortOrder: 4,
      status: 'done',
      document: {
        status: 'confirmed',
        payload: {
          lines: [
            { name: '气门室盖垫', brand: '原厂', amount: 1680 },
            { name: '工时', amount: 600 },
          ],
        },
      },
    },
    {
      id: 'w',
      kind: 'work',
      sortOrder: 5,
      status: 'active',
      photoDraft: { findings: [{ partName: '拆饰板', result: FINDING_RESULT.OK, advice: '' }] },
      previewImages: [{ url: 'https://img/work.jpg' }],
    },
    {
      id: 'rr',
      kind: 'repair_report',
      sortOrder: 6,
      status: 'locked',
      document: { status: '', payload: {} },
    },
  ]
}

test('接车只展示已有照片、诉求和识别结论', () => {
  const board = buildMerchantStageBoard(album(), nodes(), 'intake')
  assert.equal(board.title, '接车建档')
  assert.equal(board.intake.complaint, '地面有油迹')
  assert.equal(board.intake.advice, '左前杠有一道划痕')
  assert.equal(board.intake.advice.includes('衬套'), false)
  assert.equal(board.intake.photos.length, 3)
  assert.equal(board.intake.photos[2].url, 'https://img/tire.jpg')
  assert.ok(board.intake.cells.some((cell) => cell.label === '油量' && cell.value === '约 45%'))
  assert.equal(board.inspect, null)
  assert.equal(board.tabs[0].mark, 'on')
  assert.equal(board.tabs[1].mark, 'after')
})

test('检测还在填写时，标题按本步已标需处理的项来数', () => {
  const list = nodes()
  list[1] = {
    ...list[1],
    status: 'in_progress',
    photoDraft: {
      findings: [
        { partName: '下摆臂', result: FINDING_RESULT.ACTION, advice: '胶套裂' },
        { partName: '轮胎', result: FINDING_RESULT.OK, advice: '正常' },
      ],
    },
  }
  list[2] = {
    ...list[2],
    status: 'pending',
    document: { status: 'draft', payload: {} },
  }
  const board = buildMerchantStageBoard(album(), list, 'inspect')
  assert.equal(board.inspect.headline, '发现 1 项异常')
  assert.equal(board.inspect.items[0].name, '下摆臂')
  assert.equal(board.inspect.items[0].tag, '需处理')
})

test('检测不编健康分，状态良好不进异常', () => {
  const board = buildMerchantStageBoard(album(), nodes(), 'inspect')
  assert.equal(board.inspect.headline, '发现 2 项异常')
  assert.equal(board.inspect.items.length, 2)
  assert.equal(board.inspect.items[0].tag, '需处理')
  assert.equal(board.inspect.items[1].tag, '建议观察')
  assert.equal(board.tabs[0].mark, 'before')
  assert.equal(board.tabs[1].mark, 'on')
  assert.equal(JSON.stringify(board.inspect).includes('82'), false)
})

test('报价合计来自明细，交车不写评价', () => {
  const quote = buildMerchantStageBoard(album(), nodes(), 'quote')
  assert.equal(quote.quote.amount, '2280')
  assert.equal(quote.quote.lines.length, 2)
  assert.ok(quote.quote.owner)
  const finish = buildMerchantStageBoard(album(), nodes(), 'finish')
  assert.equal(finish.finish.steps[2].title, '邀请公开案例')
  assert.equal(JSON.stringify(finish.finish).includes('评价'), false)
  assert.equal(finish.tabs[4].mark, 'on')
  assert.equal(finish.tabs[3].mark, 'before')
  assert.equal(finish.tabs.map((tab) => tab.short).join(','), '接车,检测,报价,施工,交车')
})

test('空的补充报价不占导航，正在看这张单时才出现', () => {
  const list = nodes()
  list.splice(5, 0, {
    id: 'addon-blank',
    kind: 'quote_confirm',
    sortOrder: 5.5,
    insertedReason: 'addon',
    status: 'in_progress',
    document: { status: 'draft', payload: { lines: [{ name: '' }], discovery: { images: [], note: '' } } },
  })
  const finish = buildMerchantStageBoard(album(), list, 'finish')
  assert.equal(finish.tabs.map((tab) => tab.short).join(','), '接车,检测,报价,施工,交车')
  const editing = buildMerchantStageBoard(album(), list, 'quote:1')
  assert.equal(editing.tabs.map((tab) => tab.short).join(','), '接车,检测,报价,施工,补充报价,交车')
  assert.equal(editing.tabs.find((tab) => tab.short === '补充报价').mark, 'on')
})

test('补充报价单独占一格，施工图留在原来的施工', () => {
  const list = nodes()
  list.splice(
    5,
    0,
    {
      id: 'addon',
      kind: 'quote_confirm',
      sortOrder: 5.5,
      insertedReason: 'addon',
      status: 'in_progress',
      document: {
        status: 'draft',
        payload: {
          lines: [{ name: '下摆臂胶套', amount: 0 }],
          discovery: { note: '胶套开裂', images: ['https://img/new.jpg'] },
        },
      },
    },
    {
      id: 'w2',
      kind: 'work',
      sortOrder: 5.6,
      status: 'locked',
      insertedReason: 'addon',
      photoDraft: { findings: [] },
    },
  )
  const quote = buildMerchantStageBoard(album(), list, 'quote:1')
  assert.equal(quote.title, '施工中新发现')
  assert.equal(quote.tabs.map((tab) => tab.short).join(','), '接车,检测,报价,施工,补充报价,施工,交车')
  assert.equal(quote.quote.lines[0].name, '下摆臂胶套')
  assert.equal(quote.quote.discoveryNote, '胶套开裂')
  const firstWork = buildMerchantStageBoard(album(), list, 'work:0')
  assert.equal(firstWork.work.tasks[0].name, '拆饰板')
  const firstQuote = buildMerchantStageBoard(album(), list, 'quote')
  assert.equal(firstQuote.quote.lines[0].name, '气门室盖垫')
  const openAlbum = { ...album(), templateId: 'accident', serviceName: '事故维修' }
  const openAddon = buildMerchantStageBoard(openAlbum, list, 'quote:1')
  assert.equal(openAddon.title, '补充报价')
  assert.equal(openAddon.quoteHeroLabel, '补充报价')
  assert.equal(openAddon.addonEntry, '范围有变')
  const openFirst = buildMerchantStageBoard(openAlbum, list, 'quote')
  assert.equal(openFirst.quoteHeroLabel, '先确认这些')
  assert.equal(openFirst.quoteHeroSub, '已写项目合计')
})

test('发出后的检测和报价仍打开原来的表', () => {
  const sent = [
    { id: 'ins', kind: 'inspection', sortOrder: 1, photoDraft: { findings: [{ partName: '下摆臂' }] } },
    { id: 'rep', kind: 'inspection_report', sortOrder: 2, document: { status: 'delivered' } },
    { id: 'q', kind: 'quote_confirm', sortOrder: 3, document: { status: 'pending_confirm' } },
  ]
  assert.equal(stageReviewForm({ family: 'inspect' }, null, sent), true)
  assert.equal(stageEditorNode({ family: 'inspect' }, sent[1], sent).id, 'ins')
  assert.equal(stageReviewForm({ family: 'quote' }, sent[2], sent), true)
  assert.equal(stageReviewForm({ family: 'quote' }, { document: { status: 'draft' } }, sent), false)
})
