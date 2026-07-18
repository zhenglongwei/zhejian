const test = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeAlbumContentPackage,
  emptyGeneratingPackage,
  isPackageReady,
  isPackageGenerating,
} = require('../schemas/album-content-package.schema')
const { CONTENT_PACKAGE_STATUS } = require('../constants/album-content-package')
const { buildRulePackage } = require('./album-content-package.service')

test('emptyGeneratingPackage is generating', () => {
  const pkg = emptyGeneratingPackage('2026-07-18T00:00:00.000Z')
  assert.equal(pkg.status, CONTENT_PACKAGE_STATUS.GENERATING)
  assert.ok(isPackageGenerating(pkg))
  assert.equal(isPackageReady(pkg), false)
})

test('normalizeAlbumContentPackage keeps drafts', () => {
  const pkg = normalizeAlbumContentPackage({
    status: 'ready',
    source: 'llm',
    drafts: {
      xiaohongshu: { title: 't', body: 'b', tips: 'tip' },
      zhihu: { title: '', body: '知乎正文' },
    },
    qualitySuggestions: [{ message: '补一下方案说明', level: 'weak' }],
  })
  assert.equal(pkg.status, 'ready')
  assert.equal(pkg.drafts.xiaohongshu.body, 'b')
  assert.equal(pkg.drafts.zhihu.body, '知乎正文')
  assert.equal(pkg.qualitySuggestions.length, 1)
  assert.ok(isPackageReady(pkg))
})

test('buildRulePackage covers five platforms', () => {
  const pkg = buildRulePackage(
    {
      serviceName: '钣金',
      store: { name: '测试店', city: '杭州' },
      vehicleDisplay: '某车',
      nodes: [{ id: 'stage_2', title: '施工', note: '做了钣金' }],
      status: 'completed',
    },
    { suggestions: [{ message: '规则提示', level: 'weak' }] }
  )
  assert.equal(pkg.status, 'ready')
  assert.ok(pkg.drafts.xiaohongshu)
  assert.ok(pkg.drafts.douyin)
  assert.ok(pkg.drafts.wechat_mp)
  assert.match(pkg.drafts.xiaohongshu.body || pkg.drafts.xiaohongshu.title, /钣金/)
})

test('collectMissingFromPanels detects absent rows', () => {
  const {
    collectMissingFromPanels,
  } = require('./album-content-package.service')
  const missing = collectMissingFromPanels([
    {
      title: '过程',
      rows: [
        { id: 'a', label: '施工中', present: true, importanceLabel: '必留' },
        { id: 'b', label: '完工照', present: false, importanceLabel: '必留' },
      ],
    },
  ])
  assert.equal(missing.length, 1)
  assert.equal(missing[0].label, '完工照')
})

test('empty album is not eligible for llm package', () => {
  const {
    isAlbumEligibleForLlmContentPackage,
  } = require('./album-content-package.service')
  const eligible = isAlbumEligibleForLlmContentPackage({
    templateId: 'maintenance',
    nodes: [],
    evidenceItems: [],
    parts: [],
    planParts: [],
  })
  assert.equal(eligible, false)
})
