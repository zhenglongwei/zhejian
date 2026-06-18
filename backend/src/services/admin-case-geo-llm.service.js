/**
 * GEO-CITE-C07/C09/C12 · 运营 LLM diff 与采纳
 */
const { prisma } = require('../lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { GEO_LLM_STATUS } = require('../constants/case-geo-llm-status')
const { CASE_ARTICLE_GENERATION_SOURCE } = require('../constants/case-article-status')
const { mergeContentJsonGeo } = require('../schemas/case-geo-content.schema')
const {
  loadCaseLlmContext,
  runCaseGeoLlmOptimization,
  mapTemplateOriginal,
} = require('./case-geo-llm.service')

const ADOPT_FIELDS = [
  'aiSummary',
  'seoTitle',
  'seoDescription',
  'faultDesc',
  'inspectResult',
  'repairPlan',
  'resultConfirm',
  'articleBody',
]

async function getAdminCaseGeoLlmDiff(caseId) {
  const ctx = await loadCaseLlmContext(caseId)
  if (!ctx) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }

  const content =
    ctx.row.contentJson && typeof ctx.row.contentJson === 'object' ? ctx.row.contentJson : {}
  const geo = content.geo && typeof content.geo === 'object' ? content.geo : {}

  return {
    caseId,
    llmStatus: geo.llmStatus || GEO_LLM_STATUS.PENDING,
    llmGeneratedAt: geo.llmGeneratedAt || '',
    llmError: geo.llmError || '',
    llmVerify: geo.llmVerify || null,
    original: mapTemplateOriginal(ctx.templatePayload),
    suggestion: geo.llmDraft || null,
    canAdopt: geo.llmStatus === GEO_LLM_STATUS.READY && Boolean(geo.llmDraft),
    canReject: [GEO_LLM_STATUS.READY, GEO_LLM_STATUS.FAILED].includes(geo.llmStatus),
    disclaimer:
      'LLM 建议稿仅供运营审核；未采纳前不会发布到 H5。采纳后仍须点击「通过」才会公开。',
  }
}

async function adoptAdminCaseGeoLlm(caseId, options = {}) {
  const row = await prisma.publicCase.findUnique({ where: { id: caseId } })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }
  if (row.status !== PUBLIC_CASE_STATUS.PENDING_REVIEW) {
    const err = new Error('当前状态不可采纳 LLM 建议')
    err.status = 409
    throw err
  }

  const content =
    row.contentJson && typeof row.contentJson === 'object' ? { ...row.contentJson } : {}
  const geo = content.geo && typeof content.geo === 'object' ? { ...content.geo } : {}
  const draft = geo.llmDraft
  if (!draft || geo.llmStatus !== GEO_LLM_STATUS.READY) {
    const err = new Error('暂无可采纳的 LLM 建议稿')
    err.status = 409
    throw err
  }

  const geoPatch = {
    faultDesc: draft.faultDesc || geo.faultDesc,
    inspectResult: draft.inspectResult || geo.inspectResult,
    repairPlan: draft.repairPlan || geo.repairPlan,
    resultConfirm: draft.resultConfirm || geo.resultConfirm,
    nodeNarratives: Array.isArray(draft.nodeNarratives) ? draft.nodeNarratives : geo.nodeNarratives,
    generationSource: CASE_ARTICLE_GENERATION_SOURCE.LLM_V1,
    generationVersion: 'llm_v1',
    riskChecked: true,
    llmStatus: GEO_LLM_STATUS.ADOPTED,
    llmAdoptedAt: new Date().toISOString(),
    manualFields: [...new Set([...(Array.isArray(geo.manualFields) ? geo.manualFields : []), ...ADOPT_FIELDS])],
  }

  const nextContent = mergeContentJsonGeo(content, geoPatch)
  const data = {
    contentJson: nextContent,
    aiSummary: draft.aiSummary || row.aiSummary,
    seoTitle: draft.seoTitle || row.seoTitle,
    seoDescription: draft.seoDescription || row.seoDescription,
    articleBody: draft.articleBody || row.articleBody,
  }
  if (data.aiSummary) {
    data.summary = String(data.aiSummary).slice(0, 200)
  }

  await prisma.publicCase.update({ where: { id: caseId }, data })

  if (options.reviewerId) {
    const { appendReviewLog } = require('./admin-case.service')
    await appendReviewLog({
      caseId,
      reviewerId: options.reviewerId,
      reviewAction: 'geo_llm_adopt',
      reviewComment: '运营采纳 LLM GEO 建议稿',
      beforeStatus: row.status,
      afterStatus: row.status,
    })
  }

  const { getAdminCaseDetail } = require('./admin-case.service')
  return getAdminCaseDetail(caseId)
}

async function rejectAdminCaseGeoLlm(caseId, options = {}) {
  const row = await prisma.publicCase.findUnique({ where: { id: caseId } })
  if (!row) {
    const err = new Error('案例不存在')
    err.status = 404
    throw err
  }

  const content =
    row.contentJson && typeof row.contentJson === 'object' ? { ...row.contentJson } : {}
  const nextContent = mergeContentJsonGeo(content, {
    llmStatus: GEO_LLM_STATUS.REJECTED,
    llmRejectedAt: new Date().toISOString(),
  })

  await prisma.publicCase.update({
    where: { id: caseId },
    data: { contentJson: nextContent },
  })

  if (options.reviewerId) {
    const { appendReviewLog } = require('./admin-case.service')
    await appendReviewLog({
      caseId,
      reviewerId: options.reviewerId,
      reviewAction: 'geo_llm_reject',
      reviewComment: options.comment || '运营保留模板稿',
      beforeStatus: row.status,
      afterStatus: row.status,
    })
  }

  const { getAdminCaseDetail } = require('./admin-case.service')
  return getAdminCaseDetail(caseId)
}

async function triggerAdminCaseGeoLlm(caseId) {
  const result = await runCaseGeoLlmOptimization(caseId)
  return getAdminCaseGeoLlmDiff(caseId).then((diff) => ({ ...diff, run: result }))
}

module.exports = {
  getAdminCaseGeoLlmDiff,
  adoptAdminCaseGeoLlm,
  rejectAdminCaseGeoLlm,
  triggerAdminCaseGeoLlm,
}
