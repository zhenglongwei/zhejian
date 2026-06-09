/**
 * DS-B-02 / DS-B-03 · 审核通过后生成案例文章（模板，非 AI）
 */
const { prisma } = require('../lib/prisma')
const {
  CASE_ARTICLE_STATUS,
  CASE_ARTICLE_GENERATION_SOURCE,
} = require('../constants/case-article-status')
const { mergeContentJsonGeo } = require('../schemas/case-geo-content.schema')
const { generateCaseFaq } = require('../utils/case-faq')
const {
  GENERATION_VERSION,
  buildDisplayCaseTitle,
  buildSeoTitle,
  buildSeoDescription,
  buildAiSummary,
  buildKeyInfo,
  buildGeoSections,
  buildNodeNarratives,
  buildArticleBody,
  countNodeImages,
  resolveSeoNoindex,
  defaultInspectResult,
  defaultRepairPlan,
} = require('../utils/case-article-templates')
const {
  buildCaseSlug,
  resolveCaseCanonicalPath,
  ensureUniqueCaseSlug,
} = require('../utils/case-slug')

/**
 * @param {object} input
 * @param {string} input.caseId
 * @param {object} input.draft buildCaseDraft 产物
 * @param {object} [input.albumView] buildAlbumView 产物
 * @param {boolean} [input.coldStart]
 * @param {boolean} [input.hasUserAuthorization]
 * @param {string} [input.serviceItemId]
 * @param {string} [input.templateId]
 * @param {number} [input.previousArticleVersion]
 */
function buildCaseArticlePayload(input) {
  const draft = input.draft || {}
  const albumView = input.albumView || {}
  const content = draft.contentJson && typeof draft.contentJson === 'object' ? draft.contentJson : {}
  const nodes = content.nodes || albumView.nodes || []
  const coldStart = Boolean(input.coldStart ?? content.coldStart)
  const city = draft.city || albumView.store?.city || ''
  const serviceName = draft.serviceName || albumView.serviceName || '维修服务'
  const storeName = draft.storeName || albumView.store?.name || ''
  const vehicle = albumView.vehicle || {}
  const storeNote = String(albumView.storeNote || '').trim()
  const imageCount = countNodeImages(nodes)
  const hasImages = imageCount > 0

  const faultDesc = storeNote ? storeNote.slice(0, 120) : ''
  const inspectResult = defaultInspectResult()
  const repairPlan = storeNote
    ? storeNote.slice(0, 200)
    : defaultRepairPlan(serviceName)

  const sections = buildGeoSections({
    city,
    vehicle,
    serviceName,
    storeName,
    storeNote,
    faultDesc,
    inspectResult,
    repairPlan,
    coldStart,
    hasImages,
  })

  const geoBlock = {
    keyInfo: buildKeyInfo({ city, vehicle, serviceName, storeName }),
    faultDesc: faultDesc || (coldStart ? '到店进行相关检查' : '用户反馈的相关问题'),
    inspectResult,
    repairPlan,
    priceFactors: [],
    sections,
    nodeNarratives: buildNodeNarratives(nodes),
    generationSource: CASE_ARTICLE_GENERATION_SOURCE.TEMPLATE,
    generationVersion: GENERATION_VERSION,
    riskChecked: false,
  }

  const faq =
    Array.isArray(content.faq) && content.faq.length >= 3
      ? content.faq
      : generateCaseFaq({
          serviceName,
          serviceItemId: input.serviceItemId || '',
          templateId: input.templateId || '',
          coldStart,
        })

  const displayTitle = buildDisplayCaseTitle({ city, vehicle, serviceName })
  const seoTitle = buildSeoTitle({ city, vehicle, serviceName, storeName })
  const seoDescription = buildSeoDescription({ city, vehicle, serviceName, coldStart })
  const aiSummary = buildAiSummary({
    city,
    vehicle,
    serviceName,
    faultDesc: geoBlock.faultDesc,
    inspectResult,
    repairPlan,
    coldStart,
    hasImages,
  })
  const articleBody = buildArticleBody(sections)
  const caseId = input.caseId || draft.id
  const prevVersion = Number.isFinite(input.previousArticleVersion)
    ? input.previousArticleVersion
    : 0
  const slug = buildCaseSlug({ city, vehicle, serviceName, caseId })

  const mergedContentJson = mergeContentJsonGeo(
    { ...content, faq },
    geoBlock
  )

  return {
    title: displayTitle,
    summary: draft.summary || seoDescription.slice(0, 200),
    seoTitle,
    seoDescription,
    aiSummary,
    articleBody,
    articleStatus: CASE_ARTICLE_STATUS.READY,
    articleVersion: prevVersion + 1,
    articleGeneratedAt: new Date(),
    seoNoindex: resolveSeoNoindex({ city, serviceName, imageCount }),
    slug,
    canonicalPath: resolveCaseCanonicalPath({ slug, caseId }),
    contentJson: mergedContentJson,
  }
}

/**
 * 从 DB 读取案例并生成写入（供 system API / 补跑）
 * @param {string} caseId
 * @param {{ force?: boolean, persist?: boolean }} [options]
 */
async function generateAndSaveCaseArticle(caseId, options = {}) {
  const row = await prisma.publicCase.findUnique({
    where: { id: caseId },
    include: {
      album: {
        include: {
          nodes: { orderBy: { sortOrder: 'asc' } },
          images: { orderBy: [{ nodeId: 'asc' }, { idx: 'asc' }] },
          authorization: true,
        },
      },
    },
  })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }

  const content =
    row.contentJson && typeof row.contentJson === 'object' ? row.contentJson : {}
  if (
    row.articleStatus === CASE_ARTICLE_STATUS.READY &&
    row.articleBody &&
    !options.force
  ) {
    return {
      caseId,
      generated: false,
      source: 'existing',
      articleStatus: row.articleStatus,
    }
  }

  const { buildAlbumView } = require('./service-album.service')
  const { buildCaseDraft, resolvePublishTask, buildNodesFromTask } = require('./public-case.service')
  const album = row.album
  const albumView = buildAlbumView(album)
  const task = await resolvePublishTask(row.albumId, {})
  const coldStart = Boolean(content.coldStart)
  const hasUserAuth = album.authorization?.status === 'authorized'
  const draft = buildCaseDraft(buildAlbumView(album), task, row.authorizationTier, {
    coldStart,
    hasUserAuthorization: hasUserAuth,
    serviceItemId: album.serviceItemId || '',
    templateId: album.templateId || '',
  })
  if (task && Array.isArray(draft.contentJson?.nodes)) {
    draft.contentJson.nodes = buildNodesFromTask(draft.contentJson.nodes, task)
  }

  const payload = buildCaseArticlePayload({
    caseId,
    draft,
    albumView,
    coldStart,
    hasUserAuthorization: hasUserAuth,
    serviceItemId: album.serviceItemId || '',
    templateId: album.templateId || '',
    previousArticleVersion: row.articleVersion,
  })
  payload.slug = await ensureUniqueCaseSlug(prisma, payload.slug, caseId)
  payload.canonicalPath = resolveCaseCanonicalPath({ slug: payload.slug, caseId })

  if (options.persist !== false) {
    await prisma.publicCase.update({
      where: { id: caseId },
      data: {
        title: payload.title,
        summary: payload.summary,
        seoTitle: payload.seoTitle,
        seoDescription: payload.seoDescription,
        aiSummary: payload.aiSummary,
        articleBody: payload.articleBody,
        articleStatus: payload.articleStatus,
        articleVersion: payload.articleVersion,
        articleGeneratedAt: payload.articleGeneratedAt,
        seoNoindex: payload.seoNoindex,
        slug: payload.slug,
        canonicalPath: payload.canonicalPath,
        contentJson: payload.contentJson,
      },
    })
  }

  return {
    caseId,
    generated: true,
    source: CASE_ARTICLE_GENERATION_SOURCE.TEMPLATE,
    articleStatus: payload.articleStatus,
    articleVersion: payload.articleVersion,
    seoNoindex: payload.seoNoindex,
    slug: payload.slug,
  }
}

module.exports = {
  buildCaseArticlePayload,
  generateAndSaveCaseArticle,
}
