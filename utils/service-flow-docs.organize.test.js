const test = require('node:test')
const assert = require('node:assert/strict')
const { applyOrganizeGroups, mapFindingRows } = require('./service-flow-docs')

const a = { url: 'https://cdn.example/api/v1/media/files/uploads/a.jpg', imageId: '1' }
const b = { url: 'https://cdn.example/api/v1/media/files/uploads/b.jpg', imageId: '2' }
const c = { url: 'https://cdn.example/api/v1/media/files/uploads/c.jpg', imageId: '3' }

test('organize maps 图1 slots onto pending photos in order', () => {
  const { findings, pendingImages } = applyOrganizeGroups({
    pendingImages: [a, b],
    findings: [],
    groups: [{
      partName: '雨刮器',
      result: '状态良好',
      advice: '胶条完好',
      imageSlots: ['图2'],
    }],
    mode: 'inspection',
  })
  assert.equal(findings.length, 1)
  assert.equal(findings[0].partName, '雨刮器')
  assert.match(findings[0].images[0].url, /b\.jpg/)
  assert.equal(pendingImages.length, 1)
  assert.match(pendingImages[0].url, /a\.jpg/)
})

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

test('organize does not invent an unnamed item from photos', () => {
  const { findings, pendingImages } = applyOrganizeGroups({
    pendingImages: [a],
    findings: [],
    groups: [{ partName: '', result: '需处理', advice: '破损', imageSlots: ['图1'] }],
    mode: 'inspection',
  })
  assert.equal(findings.length, 0)
  assert.equal(pendingImages.length, 1)
})

test('groups without matching keys stay unmatched, do not invent pairings', () => {
  const { findings, pendingImages } = applyOrganizeGroups({
    pendingImages: [a, b],
    findings: [],
    groups: [
      { partName: '雨刮器', result: '状态良好', advice: '到位', imageKeys: ['wrong-key'] },
      { partName: '滤芯', result: '状态良好', advice: '干净', imageKeys: [] },
    ],
    mode: 'inspection',
  })
  assert.equal(findings.length, 0)
  assert.equal(pendingImages.length, 2)
  assert.ok(pendingImages.every((img) => /手工归/.test(img.skipReason)))
})

test('does not create photo-less findings', () => {
  const { findings } = applyOrganizeGroups({
    pendingImages: [],
    findings: [],
    groups: [{ partName: '侧裙', result: '需关注', imageKeys: [] }],
    mode: 'inspection',
  })
  assert.equal(findings.length, 0)
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

test('work organize uses confirmed quote name and flags items outside quote', () => {
  const { findings } = applyOrganizeGroups({
    pendingImages: [a, b],
    findings: [],
    groups: [
      { partName: '小保养机油', imageKeys: ['uploads/a.jpg'] },
      { partName: '更换雨刮片', imageKeys: ['uploads/b.jpg'] },
    ],
    mode: 'work',
    quoteNames: ['小保养机油', '机滤'],
  })
  const oil = findings.find((row) => row.partName === '小保养机油')
  const wiper = findings.find((row) => /雨刮/.test(row.partName))
  assert.equal(oil.outsideQuote, false)
  assert.equal(wiper.partName, '更换雨刮片')
  assert.equal(wiper.outsideQuote, true)
})

test('near-synonym work name is a new item, not a fuzzy quote hit', () => {
  const { findings } = applyOrganizeGroups({
    pendingImages: [a],
    findings: [],
    groups: [{
      partName: '机油',
      imageKeys: ['uploads/a.jpg'],
      outsideQuote: false,
    }],
    mode: 'work',
    quoteNames: ['小保养机油'],
  })
  assert.equal(findings[0].partName, '机油')
  assert.equal(findings[0].outsideQuote, true)
})

test('work organize copies exact quote name and fills material', () => {
  const { findings } = applyOrganizeGroups({
    pendingImages: [a],
    findings: [],
    groups: [{
      partName: '车身前部事故损伤修复（含结构件校正/更换及外观件修复）',
      caption: '下摆臂',
      observation: '旧件胶套可见磨损',
      imageKeys: ['uploads/a.jpg'],
      outsideQuote: false,
    }],
    mode: 'work',
    quoteNames: ['车身前部事故损伤修复（含结构件校正/更换及外观件修复）'],
  })
  assert.equal(findings.length, 1)
  assert.equal(findings[0].partName, '车身前部事故损伤修复（含结构件校正/更换及外观件修复）')
  assert.equal(findings[0].material, '下摆臂')
  assert.equal(findings[0].caption, '旧件胶套可见磨损')
  assert.equal(findings[0].outsideQuote, false)
})

test('collectConfirmedQuoteNames only keeps confirmed quote lines', () => {
  const { collectConfirmedQuoteNames } = require('./service-flow-docs')
  const names = collectConfirmedQuoteNames([
    {
      kind: 'quote_confirm',
      document: { status: 'confirmed', payload: { lines: [{ name: '机油' }, { name: '机滤' }] } },
    },
    {
      kind: 'quote_confirm',
      insertedReason: 'addon',
      document: { status: 'draft', payload: { lines: [{ name: '雨刮' }] } },
    },
  ])
  assert.deepEqual(names, ['机油', '机滤'])
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
  assert.equal(findings[0].material, '换了机油和滤芯')
  assert.equal(findings[0].result, '')
  assert.equal(pendingImages.length, 0)
})

test('strict work draft stays empty even if album still has photos', () => {
  const { mapFindingRows } = require('./service-flow-docs')
  const rows = mapFindingRows(
    [a, b],
    [],
    { mode: 'work', strictFindings: true },
  )
  assert.equal(rows.length, 0)
})

test('strict inspection draft stays empty even if album still has captioned photos', () => {
  const { mapFindingRows } = require('./service-flow-docs')
  const rows = mapFindingRows(
    [{ url: a.url, imageId: '1', caption: '机油' }],
    [],
    { strictFindings: true },
  )
  assert.equal(rows.length, 0)
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

test('work prior facts carry intake inspection and confirmed quote as text', () => {
  const { buildPriorOrganizeFacts } = require('./service-flow-docs')
  const facts = buildPriorOrganizeFacts(
    [
      {
        kind: 'intake',
        photoDraft: { chiefComplaint: '漏油', mileageKm: '86500' },
      },
      {
        kind: 'inspection',
        photoDraft: {
          findings: [{ partName: '机油', result: '需处理', advice: '油已乳化' }],
        },
      },
      {
        kind: 'quote_confirm',
        document: {
          status: 'confirmed',
          payload: { lines: [{ name: '更换机油', note: '机油+机滤' }] },
        },
      },
    ],
    'work',
  )
  assert.equal(facts.intake.chiefComplaint, '漏油')
  assert.equal(facts.inspection[0].part, '机油')
  assert.equal(facts.quote[0].name, '更换机油')
  assert.equal(facts.work.length, 0)
})

test('delivery prior facts also carry work items without re-reading photos', () => {
  const { buildPriorOrganizeFacts } = require('./service-flow-docs')
  const facts = buildPriorOrganizeFacts(
    [
      {
        kind: 'quote_confirm',
        document: { status: 'confirmed', payload: { lines: [{ name: '更换机油' }] } },
      },
      {
        kind: 'work',
        photoDraft: { findings: [{ partName: '更换机油', caption: '旧机油已放' }] },
      },
    ],
    'delivery_photos',
  )
  assert.equal(facts.quote[0].name, '更换机油')
  assert.equal(facts.work[0].caption, '旧机油已放')
})

test('intake organize groups mileage reading and paint photos', () => {
  const { applyIntakeOrganizeGroups } = require('./service-flow-docs')
  const applied = applyIntakeOrganizeGroups({
    pendingImages: [a, b],
    groups: [
      { category: 'odometer', reading: '86500', imageKeys: ['a.jpg'] },
      { category: 'paint', imageKeys: ['b.jpg'] },
    ],
  })
  assert.equal(applied.mileageKm, '86500')
  const odo = applied.intakeResults.find((row) => row.category === 'odometer')
  const paint = applied.intakeResults.find((row) => row.category === 'paint')
  assert.equal(odo.needsVerify, true)
  assert.equal(odo.reading, '86500')
  assert.equal(paint.images.length, 1)
  assert.equal(applied.pendingImages.length, 0)
})
