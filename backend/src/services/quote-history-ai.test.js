const test = require('node:test')
const assert = require('node:assert/strict')
const { buildAssistFingerprint } = require('./quote-assist.service')
const { buildReviewContext } = require('./node-ai-review.service')

function makeFlowNodes() {
  return [
    {
      id: 'q0',
      kind: 'quote_confirm',
      sortOrder: 1,
      content: { lines: [{ name: '首次报价项目', note: '首报内容', amount: '100' }] },
      document: { status: 'confirmed', payload: {} },
    },
    {
      id: 'w1',
      kind: 'work',
      sortOrder: 2,
      content: { findings: [] },
      document: { status: 'draft', payload: {} },
    },
    {
      id: 'q1',
      kind: 'quote_confirm',
      insertedReason: 'addon',
      sortOrder: 3,
      content: { lines: [{ name: '第一次补充项目', note: '第一次补充', amount: '200' }] },
      document: { status: 'confirmed', payload: {} },
    },
    {
      id: 'q2',
      kind: 'quote_confirm',
      insertedReason: 'addon',
      sortOrder: 4,
      content: {
        lines: [{ name: '第二次补充项目', note: '当前单', amount: '300' }],
        discovery: { note: '新故障', images: [] },
      },
      document: {
        status: 'draft',
        payload: {
          lines: [{ name: '第二次补充项目', note: '当前单', amount: '300' }],
          discovery: { note: '新故障', images: [] },
        },
      },
    },
    {
      id: 'qx',
      kind: 'quote_confirm',
      insertedReason: 'addon',
      sortOrder: 5,
      content: { lines: [{ name: '已撤销项目', amount: '400' }] },
      document: { status: 'cancelled', payload: {} },
    },
    {
      id: 'd1',
      kind: 'delivery_photos',
      sortOrder: 6,
      content: {},
      document: { status: 'draft', payload: {} },
    },
  ]
}

function makeAlbum(flowNodes = makeFlowNodes()) {
  return {
    id: 'alb_quote_history',
    templateId: 'maintenance',
    serviceName: '常规保养',
    contentPackageJson: { flowNodes },
  }
}

function names(rows) {
  return rows.map((row) => row.name)
}

test('施工、工单和交车 AI 都读取历次未撤销报价汇总', () => {
  const album = makeAlbum()
  const nodes = album.contentPackageJson.flowNodes
  const work = nodes.find((row) => row.id === 'w1')
  const delivery = nodes.find((row) => row.id === 'd1')
  const expected = ['首次报价项目', '第一次补充项目', '第二次补充项目']

  const workCtx = buildReviewContext(album, work)
  assert.deepEqual(names(workCtx.reference.quoteLines), expected)

  const workSheetCtx = buildReviewContext(album, work, { step: 'work_sheet' })
  assert.deepEqual(names(workSheetCtx.quoteLines), expected)
  assert.deepEqual(names(workSheetCtx.reference.quoteLines), expected)

  const deliveryCtx = buildReviewContext(album, delivery)
  assert.deepEqual(names(deliveryCtx.reference.quoteLines), expected)
  assert.equal(deliveryCtx.reference.quoteLines.some((row) => row.name === '已撤销项目'), false)
})

test('补充报价核对把当前单与历次报价参考分开', () => {
  const album = makeAlbum()
  const current = album.contentPackageJson.flowNodes.find((row) => row.id === 'q2')
  const ctx = buildReviewContext(album, current, { step: 'addon_check' })

  assert.deepEqual(names(ctx.quoteLines), ['第二次补充项目'])
  assert.deepEqual(names(ctx.reference.quoteLines), ['首次报价项目', '第一次补充项目'])
})

test('以往补充报价变化会使后续补充报价 AI 指纹失效', () => {
  const album = makeAlbum()
  const target = album.contentPackageJson.flowNodes.find((row) => row.id === 'q2')
  const before = buildAssistFingerprint(album, target)

  const changedNodes = JSON.parse(JSON.stringify(album.contentPackageJson.flowNodes))
  changedNodes.find((row) => row.id === 'q1').content.lines[0].note = '第一次补充内容已修改'
  const after = buildAssistFingerprint(makeAlbum(changedNodes), target)

  assert.notEqual(after, before)
})

test('报价 AI 指纹随登记车辆变化，车牌与 VIN 变化不影响', () => {
  const nodes = makeAlbum().contentPackageJson.flowNodes
  const first = nodes.find((row) => row.id === 'q0')
  const addon = nodes.find((row) => row.id === 'q2')
  const withCar = { vehicleJson: { brand: '宝马', series: '3系', gearbox: '8AT', plate: '粤B7K52M' } }
  const changedCar = { vehicleJson: { brand: '宝马', series: '3系', gearbox: 'CVT', plate: '粤B7K52M' } }
  const changedPlate = { vehicleJson: { brand: '宝马', series: '3系', gearbox: '8AT', plate: '粤A12345' } }

  for (const target of [first, addon]) {
    const base = buildAssistFingerprint({ ...makeAlbum(nodes), ...withCar }, target)
    assert.notEqual(buildAssistFingerprint({ ...makeAlbum(nodes), ...changedCar }, target), base, target.id)
    assert.equal(
      buildAssistFingerprint({ ...makeAlbum(nodes), ...changedPlate }, target),
      base,
      `车牌不该进 AI 上下文：${target.id}`,
    )
  }
})
