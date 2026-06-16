/**
 * GEO-CITE-A13 · album-geo-extract / case-geo-quality 单测
 * 运行：node src/utils/album-geo-extract.test.js
 */
const assert = require('assert')
const { extractGeoFromAlbumNodes } = require('./album-geo-extract')
const { assessGeoEvidence, assertGeoPublishable, GEO_QUALITY_LEVEL } = require('./case-geo-quality')

function nodesFixture(overrides = {}) {
  const base = [
    { id: 'stage_1', title: '接车记录', note: '刹车异响', images: ['a.jpg'] },
    { id: 'stage_2', title: '检测诊断', note: '制动片磨损', images: [] },
    { id: 'stage_3', title: '方案与报价', note: '更换前制动片', images: [] },
    { id: 'stage_6', title: '完工交付', note: '试车正常', images: [] },
  ]
  return base.map((n) => ({ ...n, ...(overrides[n.id] || {}) }))
}

function run() {
  const full = extractGeoFromAlbumNodes(nodesFixture(), {
    serviceName: '刹车保养',
    planAmount: 680,
    storeNote: '门店补充',
  })
  assert.strictEqual(full.faultDesc, '刹车异响')
  assert.strictEqual(full.inspectResult, '制动片磨损')
  assert.ok(full.repairPlan.includes('更换前制动片'))
  assert.ok(full.repairPlan.includes('680'))
  assert.strictEqual(full.resultConfirm, '试车正常')
  assert.strictEqual(full.storeNote, '门店补充')
  assert.strictEqual(full.fromNodes.faultDesc, true)
  assert.strictEqual(full.fromNodes.inspectResult, true)

  const noStoreNote = extractGeoFromAlbumNodes(
    [
      { id: 'stage_1', note: '机油灯亮', images: [] },
      { id: 'stage_2', note: '机油不足', images: [] },
      { id: 'stage_3', note: '更换机油机滤', images: [] },
    ],
    { serviceName: '小保养' }
  )
  assert.strictEqual(noStoreNote.faultDesc, '机油灯亮')
  assert.strictEqual(noStoreNote.inspectResult, '机油不足')
  assert.ok(noStoreNote.repairPlan.includes('更换机油机滤'))
  assert.strictEqual(noStoreNote.fromNodes.faultDesc, true)

  const coldStartFallback = extractGeoFromAlbumNodes([], { coldStart: true, serviceName: '检测' })
  assert.strictEqual(coldStartFallback.faultDesc, '到店进行相关检查')
  assert.ok(coldStartFallback.inspectResult.length > 0)

  const ready = assessGeoEvidence({
    nodes: nodesFixture(),
    planAmount: 680,
    imageCount: 1,
  })
  assert.strictEqual(ready.level, GEO_QUALITY_LEVEL.READY)

  const blockMissingInspect = assessGeoEvidence({
    nodes: nodesFixture({ stage_2: { note: '', images: [] } }),
    planAmount: 680,
    imageCount: 1,
  })
  assert.strictEqual(blockMissingInspect.level, GEO_QUALITY_LEVEL.BLOCK)
  assert.ok(blockMissingInspect.missingFields.some((f) => f.field === 'stage_2'))

  const blockNoPlan = assessGeoEvidence({
    nodes: nodesFixture({
      stage_3: { note: '', images: [] },
    }),
    imageCount: 1,
  })
  assert.strictEqual(blockNoPlan.level, GEO_QUALITY_LEVEL.BLOCK)

  const planAmountOnly = assessGeoEvidence({
    nodes: nodesFixture({
      stage_3: { note: '', images: [] },
    }),
    planAmount: 399,
    imageCount: 1,
  })
  assert.notStrictEqual(planAmountOnly.level, GEO_QUALITY_LEVEL.BLOCK)

  const albumView = {
    nodes: nodesFixture(),
    serviceName: '刹车保养',
    planAmount: 680,
    storeNote: '',
    imageCount: 1,
  }
  assertGeoPublishable(albumView)

  let threw = false
  try {
    assertGeoPublishable({
      nodes: nodesFixture({ stage_2: { note: '', images: [] } }),
      serviceName: '刹车保养',
      planAmount: 680,
      imageCount: 1,
    })
  } catch (e) {
    threw = true
    assert.strictEqual(e.status, 409)
    assert.strictEqual(e.code, 'GEO_EVIDENCE_INCOMPLETE')
    assert.ok(Array.isArray(e.missingFields))
  }
  assert.strictEqual(threw, true)

  console.log('[test] album-geo-extract.test.js ✅ 全部通过')
}

run()
