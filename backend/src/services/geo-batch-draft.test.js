/**
 * GEO-TOPIC-H04 · 批量 draft 状态策略单测
 */
const assert = require('assert')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
const {
  BATCH_DRAFT_MODE,
  resolveBatchDraftMode,
  resolveStatusForCreate,
  resolveStatusForUpdate,
  summarizeDraftBatch,
} = require('./geo-batch-draft.service')
const { generateGeoPageDrafts } = require('./geo-page-generator.service')
const { GEO_TOPIC_SEED_ALL } = require('../constants/geo-topic-seed-list')

function run() {
  assert.strictEqual(resolveBatchDraftMode({}), BATCH_DRAFT_MODE.DRAFT)
  assert.strictEqual(resolveBatchDraftMode({ publish: true }), BATCH_DRAFT_MODE.PUBLISH)
  assert.strictEqual(
    resolveBatchDraftMode({ contentOnly: true }),
    BATCH_DRAFT_MODE.CONTENT_ONLY
  )

  const createDraft = resolveStatusForCreate(BATCH_DRAFT_MODE.DRAFT)
  assert.strictEqual(createDraft.status, GEO_PAGE_STATUS.DRAFT)
  assert.strictEqual(createDraft.publishedAt, null)

  const createPublish = resolveStatusForCreate(BATCH_DRAFT_MODE.PUBLISH)
  assert.strictEqual(createPublish.status, GEO_PAGE_STATUS.PUBLISHED)
  assert.ok(createPublish.publishedAt instanceof Date)

  const updateDraft = resolveStatusForUpdate(
    { status: GEO_PAGE_STATUS.PUBLISHED, publishedAt: new Date('2026-01-01') },
    BATCH_DRAFT_MODE.DRAFT
  )
  assert.deepStrictEqual(updateDraft, {})

  const updatePublish = resolveStatusForUpdate(
    { status: GEO_PAGE_STATUS.DRAFT, publishedAt: null },
    BATCH_DRAFT_MODE.PUBLISH
  )
  assert.strictEqual(updatePublish.status, GEO_PAGE_STATUS.PUBLISHED)
  assert.ok(updatePublish.publishedAt instanceof Date)

  const drafts = generateGeoPageDrafts(GEO_TOPIC_SEED_ALL)
  const summary = summarizeDraftBatch(drafts)
  assert.strictEqual(summary.draftCount, GEO_TOPIC_SEED_ALL.length)
  assert.strictEqual(summary.missingFaq, 0)
  drafts.forEach((draft) => {
    assert.ok(!draft.aiSummary.includes('常见咨询汇总'), `forbidden template in ${draft.slug}`)
  })

  console.log('[geo-batch-draft.test] ok', summary)
}

run()
