const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeCaseEnrichment,
  buildEnrichmentFromPublicCaseRow,
  resolveCaseEnrichment,
  mergeCaseEnrichmentPatch,
} = require('../schemas/case-enrichment.schema')
const { resolveGeoReadableFields } = require('../schemas/case-geo-content.schema')

test('normalizeCaseEnrichment requires version >= 1', () => {
  assert.equal(normalizeCaseEnrichment(null), null)
  assert.equal(normalizeCaseEnrichment({ version: 0 }), null)
  const ok = normalizeCaseEnrichment({
    version: 1,
    aiSummary: '摘要',
    geo: { faultDesc: '故障' },
  })
  assert.equal(ok.version, 1)
  assert.equal(ok.aiSummary, '摘要')
  assert.equal(ok.geo.faultDesc, '故障')
})

test('buildEnrichmentFromPublicCaseRow maps legacy contentJson.geo + faq', () => {
  const row = {
    aiSummary: '顶列摘要',
    seoTitle: 'SEO 标题',
    seoDescription: 'SEO 描述',
    articleVersion: 2,
    contentJson: {
      faq: [{ q: '问', a: '答' }, { title: '延伸阅读', url: 'https://mp.weixin.qq.com/s/abc' }],
      geo: {
        faultDesc: '刹车异响',
        sections: [{ key: 'overview', title: '概况', content: '正文' }],
      },
    },
  }
  const enrichment = buildEnrichmentFromPublicCaseRow(row)
  assert.equal(enrichment.version, 2)
  assert.equal(enrichment.aiSummary, '顶列摘要')
  assert.equal(enrichment.geo.faultDesc, '刹车异响')
  assert.equal(enrichment.faq.length, 1)
  assert.equal(enrichment.faqLinks.length, 1)
})

test('resolveCaseEnrichment prefers enrichment_json column', () => {
  const row = {
    aiSummary: '旧摘要',
    enrichmentJson: {
      version: 3,
      aiSummary: '新摘要',
      geo: { inspectResult: '检测结论' },
    },
    contentJson: { geo: { faultDesc: '应忽略' } },
  }
  const resolved = resolveCaseEnrichment(row)
  assert.equal(resolved.version, 3)
  assert.equal(resolved.aiSummary, '新摘要')
  assert.equal(resolved.geo.inspectResult, '检测结论')
})

test('mergeCaseEnrichmentPatch bumps version without touching snapshot fields', () => {
  const base = normalizeCaseEnrichment({
    version: 2,
    aiSummary: '旧',
    geo: { faultDesc: '快照故障' },
  })
  const next = mergeCaseEnrichmentPatch(
    base,
    { aiSummary: '新摘要', seoTitle: '新 SEO' },
    { bumpVersion: true, previousVersion: 2 }
  )
  assert.equal(next.version, 3)
  assert.equal(next.aiSummary, '新摘要')
  assert.equal(next.geo.faultDesc, '快照故障')
})

test('resolveGeoReadableFields reads enrichment_json first', () => {
  const row = {
    aiSummary: '旧',
    seoTitle: '旧 SEO',
    enrichmentJson: {
      version: 1,
      aiSummary: '提炼层摘要',
      seoTitle: '提炼层 SEO',
      seoDescription: '提炼层描述',
      geo: { repairPlan: '方案' },
    },
    contentJson: { geo: { faultDesc: '回落' } },
  }
  const readable = resolveGeoReadableFields(row)
  assert.equal(readable.aiSummary, '提炼层摘要')
  assert.equal(readable.seoTitle, '提炼层 SEO')
  assert.equal(readable.geo.repairPlan, '方案')
})
