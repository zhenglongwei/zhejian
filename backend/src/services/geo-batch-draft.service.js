/**
 * GEO-TOPIC-H04 · 种子词库批量 draft 生成（默认不降级已发布专题）
 */
const { prisma } = require('../lib/prisma')
const { GEO_TOPIC_SEED_ALL } = require('../constants/geo-topic-seed-list')
const { GEO_PAGE_STATUS } = require('../constants/geo-page-status')
const { generateGeoPageDrafts } = require('./geo-page-generator.service')
const { listCases } = require('./content.service')
const {
  normalizeFaq,
  normalizeFaqLinks,
  normalizeServiceMeta,
} = require('../schemas/geo-page.schema')

const BATCH_DRAFT_MODE = {
  DRAFT: 'draft',
  PUBLISH: 'publish',
  CONTENT_ONLY: 'content_only',
}

function resolveBatchDraftMode(input = {}) {
  if (input.mode) return input.mode
  if (input.publish === true || input.publish === 'true') return BATCH_DRAFT_MODE.PUBLISH
  if (input.contentOnly === true || input.contentOnly === 'true') {
    return BATCH_DRAFT_MODE.CONTENT_ONLY
  }
  return BATCH_DRAFT_MODE.DRAFT
}

function draftToContentFields(draft) {
  return {
    slug: draft.slug,
    title: draft.title,
    summary: draft.summary,
    coverImage: draft.coverImage || '',
    pageType: draft.pageType,
    city: draft.city || '',
    serviceId: draft.serviceId || '',
    faultTag: draft.faultTag || '',
    vehicleSeries: draft.vehicleSeries || '',
    keywordsJson: draft.keywords || [],
    scenariosJson: draft.scenarios || [],
    priceFactorsJson: draft.priceFactors || [],
    faqJson: normalizeFaq(draft.faq || []),
    faqLinksJson: normalizeFaqLinks(draft.faqLinks || []),
    relatedCaseIdsJson: draft.relatedCaseIds || [],
    relatedStoreIdsJson: draft.relatedStoreIds || [],
    primaryStoreId: draft.primaryStoreId || '',
    relatedServiceId: draft.relatedServiceId || '',
    seoTitle: draft.seoTitle || '',
    seoDescription: draft.seoDescription || '',
    aiSummary: draft.aiSummary || '',
    serviceMetaJson: normalizeServiceMeta(draft.serviceMeta || {}),
  }
}

function resolveStatusForCreate(mode) {
  if (mode === BATCH_DRAFT_MODE.PUBLISH) {
    return {
      status: GEO_PAGE_STATUS.PUBLISHED,
      publishedAt: new Date(),
    }
  }
  return {
    status: GEO_PAGE_STATUS.DRAFT,
    publishedAt: null,
  }
}

function resolveStatusForUpdate(existing, mode) {
  if (mode === BATCH_DRAFT_MODE.PUBLISH) {
    return {
      status: GEO_PAGE_STATUS.PUBLISHED,
      publishedAt: existing.publishedAt || new Date(),
    }
  }
  return {}
}

function summarizeDraftBatch(drafts, cases = []) {
  const withAggregateSummary = drafts.filter((draft) =>
    String(draft.aiSummary || '').includes('例脱敏案例')
  ).length
  const missingFaq = drafts.filter((draft) => !Array.isArray(draft.faq) || draft.faq.length < 1)
    .length

  return {
    draftCount: drafts.length,
    withAggregateSummary,
    caseCount: cases.length,
    missingFaq,
  }
}

/**
 * @param {{
 *   seeds?: import('../constants/geo-topic-seed-list').GeoTopicSeed[],
 *   allCases?: object[],
 *   mode?: string,
 *   publish?: boolean,
 *   contentOnly?: boolean,
 *   dryRun?: boolean,
 *   client?: import('@prisma/client').PrismaClient,
 * }} [options]
 */
async function batchUpsertGeoPageDrafts(options = {}) {
  const mode = resolveBatchDraftMode(options)
  const client = options.client || prisma
  const seeds = options.seeds || GEO_TOPIC_SEED_ALL

  const cases =
    options.allCases ||
    (await listCases({ limit: 500 })).list ||
    []

  const drafts = generateGeoPageDrafts(seeds, { allCases: cases })
  const summary = summarizeDraftBatch(drafts, cases)

  if (summary.missingFaq > 0) {
    const err = new Error(`批量 draft 存在 ${summary.missingFaq} 条缺少 FAQ`)
    err.status = 500
    throw err
  }

  const result = {
    mode,
    dryRun: Boolean(options.dryRun),
    ...summary,
    created: 0,
    updated: 0,
    skipped: 0,
    preservedPublished: 0,
    publishedSet: 0,
  }

  if (options.dryRun) {
    return result
  }

  for (const draft of drafts) {
    if (!draft.id || !draft.slug) {
      result.skipped += 1
      continue
    }

    const existing = await client.geoPage.findUnique({
      where: { slug: draft.slug },
      select: { id: true, slug: true, pageType: true, status: true, publishedAt: true },
    })

    if (existing?.pageType === 'service_base') {
      result.skipped += 1
      continue
    }

    const content = draftToContentFields(draft)

    if (!existing) {
      const statusFields = resolveStatusForCreate(mode)
      await client.geoPage.create({
        data: {
          id: draft.id,
          ...content,
          ...statusFields,
        },
      })
      result.created += 1
      if (statusFields.status === GEO_PAGE_STATUS.PUBLISHED) result.publishedSet += 1
      continue
    }

    const statusFields = resolveStatusForUpdate(existing, mode)
    await client.geoPage.update({
      where: { id: existing.id },
      data: {
        ...content,
        ...statusFields,
      },
    })
    result.updated += 1

    if (mode === BATCH_DRAFT_MODE.PUBLISH) {
      result.publishedSet += 1
    } else if (existing.status === GEO_PAGE_STATUS.PUBLISHED) {
      result.preservedPublished += 1
    }
  }

  return result
}

module.exports = {
  BATCH_DRAFT_MODE,
  resolveBatchDraftMode,
  draftToContentFields,
  resolveStatusForCreate,
  resolveStatusForUpdate,
  summarizeDraftBatch,
  batchUpsertGeoPageDrafts,
}
