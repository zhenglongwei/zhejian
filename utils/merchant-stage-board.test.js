const test = require('node:test')
const assert = require('node:assert/strict')
const { FINDING_RESULT } = require('../constants/service-flow-nodes')
const { buildMerchantStageBoard } = require('./merchant-stage-board')

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
})
