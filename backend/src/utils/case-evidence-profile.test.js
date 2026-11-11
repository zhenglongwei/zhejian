const test = require('node:test')
const assert = require('node:assert/strict')
const { assessCaseEvidenceProfile } = require('./case-evidence-profile')
const { resolveEvidenceLevel } = require('../schemas/case-trust-meta.schema')

function node(kind, payload, extra = {}) {
  return { id: `node_${kind}`, kind, document: { status: 'confirmed', payload }, ...extra }
}

function fullFlowNodes() {
  return [
    node('intake_inspection', {
      chiefComplaint: '右前门有划痕',
      photos: [{ url: '/p/intake1.jpg' }],
    }),
    node('inspection_report', {
      chiefComplaint: '右前门有划痕',
      findings: [
        { partName: '右前门漆面', result: '需处理', advice: '建议局部补漆', images: [{ url: '/p/insp1.jpg' }] },
      ],
    }),
    node('quote_confirm', {
      lines: [{ name: '右前门局部补漆' }],
    }),
    node('work', {}, {
      photoDraft: { findings: [{ partName: '右前门', url: '/p/work1.jpg' }] },
      document: { status: 'confirmed', payload: { workItems: [{ partName: '右前门局部补漆' }] } },
    }),
    node('repair_report', {
      conclusion: '补漆完成',
      warrantyPeriod: '3个月',
      acceptanceItems: [
        { id: 'acc_1', kind: 'work', name: '右前门局部补漆', result: 'pass', images: [{ url: '/p/acc1.jpg' }, { url: '/p/acc2.jpg' }] },
        { id: 'exterior', kind: 'exterior', name: '外观', result: 'pass', images: [{ url: '/p/ext1.jpg' }] },
      ],
    }),
  ]
}

test('证据画像：五环节定稿 + 多环节图证', () => {
  const profile = assessCaseEvidenceProfile(fullFlowNodes())
  assert.ok(profile)
  assert.equal(profile.sealedStages, 5)
  // 方案环节无图：intake/inspection/work/finish 四环有图
  assert.equal(profile.photoStages, 4)
  assert.equal(profile.totalPhotos, 6)
  assert.equal(profile.exteriorMissingPhoto, false)
  assert.deepEqual(profile.annotations, [])
})

test('判级：图文全留证（≥3环定稿 + ≥2环图证 + 总图≥4）', () => {
  const profile = assessCaseEvidenceProfile(fullFlowNodes())
  const graded = resolveEvidenceLevel(0, profile)
  assert.equal(graded.evidenceLevel, 'rich_images')
  assert.equal(graded.evidenceLevelLabel, '图文全留证')
})

test('判级：部分留证（有图但单环节）', () => {
  const nodes = [
    node('intake_inspection', { chiefComplaint: '异响' }),
    node('inspection_report', {
      findings: [{ partName: '刹车片', result: '需处理', advice: '更换' }],
    }),
    node('repair_report', {
      conclusion: '已更换',
      acceptanceItems: [{ id: 'acc_1', kind: 'work', name: '换刹车片', result: 'pass', images: [{ url: '/p/a.jpg' }] }],
    }),
  ]
  const profile = assessCaseEvidenceProfile(nodes)
  assert.equal(profile.sealedStages, 3)
  assert.equal(profile.photoStages, 1)
  assert.equal(profile.totalPhotos, 1)
  const graded = resolveEvidenceLevel(0, profile)
  assert.equal(graded.evidenceLevel, 'partial_images')
  assert.equal(graded.evidenceLevelLabel, '部分留证')
})

test('判级：仅文字记录（全案例无图）', () => {
  const nodes = [
    node('intake_inspection', { chiefComplaint: '异响' }),
    node('inspection_report', {
      findings: [{ partName: '刹车片', result: '需处理', advice: '更换' }],
    }),
    node('quote_confirm', { lines: [{ name: '换刹车片' }] }),
    node('repair_report', { conclusion: '已更换' }),
  ]
  const profile = assessCaseEvidenceProfile(nodes)
  assert.equal(profile.totalPhotos, 0)
  const graded = resolveEvidenceLevel(0, profile)
  assert.equal(graded.evidenceLevel, 'text_primary')
  assert.equal(graded.evidenceLevelLabel, '仅文字记录')
})

test('判级：外观缺图如实标注 annotation', () => {
  const nodes = [
    node('repair_report', {
      exteriorPhotoWaived: true,
      acceptanceItems: [
        { id: 'acc_1', kind: 'work', name: '补漆', result: 'pass', images: [{ url: '/p/a.jpg' }] },
        { id: 'exterior', kind: 'exterior', name: '外观', result: 'pass', images: [] },
      ],
    }),
  ]
  const profile = assessCaseEvidenceProfile(nodes)
  assert.equal(profile.exteriorMissingPhoto, true)
  assert.equal(profile.exteriorPhotoWaived, true)
  assert.deepEqual(profile.annotations, ['商家未留外观照'])
})

test('兜底：无画像时保持旧图数口径', () => {
  assert.equal(resolveEvidenceLevel(0).evidenceLevel, 'text_primary')
  assert.equal(resolveEvidenceLevel(2).evidenceLevel, 'partial_images')
  assert.equal(resolveEvidenceLevel(5).evidenceLevel, 'rich_images')
})

test('空链返回 null', () => {
  assert.equal(assessCaseEvidenceProfile([]), null)
  assert.equal(assessCaseEvidenceProfile(null), null)
})
