const test = require('node:test')
const assert = require('node:assert/strict')
const { applyOrganizeGroups, mapFindingRows } = require('./service-flow-docs')

const a = { url: 'https://cdn.example/api/v1/media/files/uploads/a.jpg', imageId: '1' }
const b = { url: 'https://cdn.example/api/v1/media/files/uploads/b.jpg', imageId: '2' }
const c = { url: 'https://cdn.example/api/v1/media/files/uploads/c.jpg', imageId: '3' }

test('organize merges same part into one inspection item and fills empty fields', () => {
  const { findings, pendingImages } = applyOrganizeGroups({
    pendingImages: [a, b],
    findings: [{ partName: '液压位', result: '', advice: '', images: [] }],
    groups: [
      {
        partName: '液压位',
        result: '需处理',
        advice: '油位偏低',
        imageKeys: ['uploads/a.jpg', 'uploads/b.jpg'],
      },
    ],
    mode: 'inspection',
  })
  assert.equal(findings.length, 1)
  assert.equal(findings[0].partName, '液压位')
  assert.equal(findings[0].result, '需处理')
  assert.equal(findings[0].advice, '油位偏低')
  assert.equal(findings[0].images.length, 2)
  assert.equal(pendingImages.length, 0)
})

test('organize does not overwrite filled inspection fields', () => {
  const { findings } = applyOrganizeGroups({
    pendingImages: [a],
    findings: [{
      partName: '液压位',
      result: '需关注',
      advice: '店员已写',
      images: [],
    }],
    groups: [{
      partName: '液压位',
      result: '需处理',
      advice: '模型想改',
      imageKeys: ['uploads/a.jpg'],
    }],
    mode: 'inspection',
  })
  assert.equal(findings[0].result, '需关注')
  assert.equal(findings[0].advice, '店员已写')
})

test('unmatched photos stay pending', () => {
  const { findings, pendingImages } = applyOrganizeGroups({
    pendingImages: [a, c],
    findings: [],
    groups: [{
      partName: '滤芯',
      result: '状态良好',
      advice: '干净',
      imageKeys: ['uploads/a.jpg'],
    }],
    mode: 'inspection',
  })
  assert.equal(findings.length, 1)
  assert.equal(findings[0].partName, '滤芯')
  assert.equal(pendingImages.length, 1)
  assert.match(pendingImages[0].url, /c\.jpg/)
})

test('work organize groups by job name without result', () => {
  const { findings, pendingImages } = applyOrganizeGroups({
    pendingImages: [a, b],
    findings: [],
    groups: [{
      partName: '更换机油',
      caption: '换了机油和滤芯',
      imageKeys: ['uploads/a.jpg', 'uploads/b.jpg'],
    }],
    mode: 'work',
  })
  assert.equal(findings.length, 1)
  assert.equal(findings[0].partName, '更换机油')
  assert.equal(findings[0].caption, '换了机油和滤芯')
  assert.equal(findings[0].result, '')
  assert.equal(pendingImages.length, 0)
})

test('work pending keys stay out of empty-draft remap', () => {
  const rows = mapFindingRows(
    [a, c],
    [],
    { mode: 'work', pendingKeys: [a.url, c.url] },
  )
  assert.equal(rows.length, 0)
})

test('pending keys are not turned into new findings on load', () => {
  const rows = mapFindingRows(
    [a, c],
    [{ partName: '液压位', result: '需处理', advice: '补油', images: [a] }],
    { pendingKeys: [c.url] },
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].partName, '液压位')
})
