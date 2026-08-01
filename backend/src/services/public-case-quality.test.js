const test = require('node:test')
const assert = require('node:assert/strict')
const {
  PUBLIC_CASE_SCORE_PASS_THRESHOLD,
  assessPublicCaseQuality,
  assertPublicCaseQualityReady,
} = require('./public-case-quality.service')

const readyAlbum = {
  serviceName: '刹车片更换',
  imageCount: 4,
  planAmount: 680,
  nodes: [
    { id: 'stage_1', title: '接车', note: '制动偏软，车主反映踩下偏绵', images: ['a.jpg'] },
    { id: 'stage_2', title: '检测', note: '刹车片磨损严重，建议更换前片', images: ['b.jpg'] },
    { id: 'stage_3', title: '方案', note: '更换前刹车片并做制动系统检查', images: ['c.jpg'] },
    { id: 'stage_6', title: '交付', note: '试车制动正常，交还车主', images: ['d.jpg'] },
  ],
  imageMeta: [
    { nodeId: 'stage_2', visibility: 'public', publicGateStatus: 'passed' },
    { nodeId: 'stage_4', visibility: 'public', publicGateStatus: 'passed' },
  ],
}

test('assessPublicCaseQuality passes when quality score >= threshold and no privacy block', () => {
  const result = assessPublicCaseQuality(readyAlbum)
  assert.equal(result.publicCasePrivacyPass, true)
  assert.ok(result.publicCaseScore >= PUBLIC_CASE_SCORE_PASS_THRESHOLD)
  assert.equal(result.publicCaseScorePass, true)
  assert.ok(!result.privacyBlocks.length)
})

test('geo incomplete fails publish while public media alone is not enough', () => {
  const result = assessPublicCaseQuality({
    serviceName: '保养',
    imageCount: 1,
    nodes: [{ id: 'stage_2', title: '检测', note: '检查完成', images: ['b.jpg'] }],
    imageMeta: [{ nodeId: 'stage_2', visibility: 'public', publicGateStatus: 'passed' }],
  })
  assert.equal(result.publicCasePrivacyPass, true)
  assert.equal(result.geoQuality.level, 'block')
  assert.equal(result.publicCaseScorePass, false)
  assert.ok(result.qualitySuggestions.some((item) => item.category === 'quality'))
  assert.equal(result.privacyBlocks.length, 0)
})

test('empty album with no public media is privacy-blocked', () => {
  const result = assessPublicCaseQuality({
    serviceName: '保养',
    imageCount: 0,
    nodes: [],
    imageMeta: [],
  })
  assert.equal(result.publicCasePrivacyPass, false)
  assert.equal(result.publicCaseScorePass, false)
  assert.ok(result.privacyBlocks.some((item) => item.issue === 'no_public_media'))
})

test('pii in note is privacy block regardless of quality score', () => {
  const result = assessPublicCaseQuality({
    ...readyAlbum,
    nodes: readyAlbum.nodes.map((node, index) =>
      index === 0 ? { ...node, note: '联系车主13800138000' } : node,
    ),
  })
  assert.equal(result.publicCasePrivacyPass, false)
  assert.equal(result.publicCaseScorePass, false)
  assert.ok(result.privacyBlocks.some((item) => item.issue === 'pii_in_note'))
})

test('privacy-rejected images with no public pool triggers privacy block', () => {
  const result = assessPublicCaseQuality({
    serviceName: '保养',
    imageCount: 2,
    planAmount: 300,
    nodes: [
      { id: 'stage_1', title: '接车', note: '常规保养', images: ['a.jpg'] },
      { id: 'stage_2', title: '检测', note: '检查完成', images: ['b.jpg'] },
      { id: 'stage_3', title: '方案', note: '更换机油机滤', images: [] },
    ],
    imageMeta: [
      {
        nodeId: 'stage_2',
        visibility: 'private',
        publicGateStatus: 'rejected',
        publicGateReason: 'plate',
      },
    ],
  })
  assert.equal(result.publicCasePrivacyPass, false)
  assert.ok(result.privacyBlocks.some((item) => item.issue === 'no_public_media_privacy'))
})

test('assertPublicCaseQualityReady throws with PUBLIC_CASE_QUALITY_BLOCKED', () => {
  assert.throws(
    () =>
      assertPublicCaseQualityReady({
        serviceName: '保养',
        imageCount: 0,
        nodes: [],
        imageMeta: [],
      }),
    (err) => err.code === 'PUBLIC_CASE_QUALITY_BLOCKED' && err.status === 409,
  )
})

test('only always-private quote image cannot authorize publish', () => {
  const result = assessPublicCaseQuality({
    serviceName: '电瓶更换',
    imageCount: 1,
    nodes: [
      { id: 'stage_1', title: '接车', note: '', images: [] },
      { id: 'stage_2', title: '检测', note: '', images: [] },
      { id: 'stage_3', title: '方案与报价', note: '', images: ['quote.jpg'] },
      { id: 'stage_4', title: '施工', note: '', images: [] },
      { id: 'stage_5', title: '配件', note: '', images: [] },
      { id: 'stage_6', title: '交付', note: '', images: [] },
    ],
    imageMeta: [
      {
        nodeId: 'stage_3',
        visibility: 'private',
        publicGateStatus: 'skipped',
      },
    ],
  })
  assert.equal(result.publicCaseScorePass, false)
  assert.equal(result.publicCasePrivacyPass, false)
  assert.ok(result.privacyBlocks.some((item) => item.issue === 'no_public_media'))
})

test('geo incomplete blocks publish even when numeric score would look high', () => {
  const result = assessPublicCaseQuality({
    serviceName: '保养',
    imageCount: 2,
    planAmount: 300,
    nodes: [
      { id: 'stage_1', title: '接车', note: '', images: [] },
      { id: 'stage_2', title: '检测', note: '检查完成', images: ['b.jpg'] },
      { id: 'stage_3', title: '方案', note: '更换机油', images: [] },
    ],
    imageMeta: [
      { nodeId: 'stage_2', visibility: 'public', publicGateStatus: 'passed' },
    ],
  })
  assert.equal(result.geoQuality.level, 'block')
  assert.equal(result.publicCaseScorePass, false)
})
