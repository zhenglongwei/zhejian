/**
 * B-INSP-01 · 相册检查 AI 建议（规则兜底 + 多模态 LLM + 报告存储）
 */
const { randomUUID } = require('crypto')
const { prisma } = require('../lib/prisma')
const config = require('../config')
const { chatCompletion } = require('../lib/dashscope-chat')
const { loadAlbum, buildAlbumView } = require('./service-album.service')
const { buildPlanPartsContext } = require('./album-plan-parts.service')
const { buildAlbumSummaryFields } = require('../utils/album-summary')
const { buildInspectionImageCaptions } = require('./album-inspection-vision.service')
const {
  buildRuleBasedAdvice,
  buildLlmContext,
  buildLlmSystemPrompt,
  buildLlmUserPrompt,
  extractAdviceJson,
  normalizeAdvicePayload,
} = require('../utils/album-inspection-advice')

async function assertUserAlbumAccess(albumId, userId) {
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在或已被删除')
    err.status = 404
    throw err
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const phone = user?.phone || ''
  const allowed = album.userId === userId || (phone && album.userPhone === phone)
  if (!allowed) {
    const err = new Error('仅关联车主可查看，请确认登录手机号与门店登记一致')
    err.status = 403
    throw err
  }
  return album
}

function buildInspectionDetail(album) {
  const view = buildAlbumView(album)
  const planCtx = buildPlanPartsContext(album)
  const summaryFields = buildAlbumSummaryFields(album, {
    ...view,
    formatPlanAmountLabel: (amount) => (amount != null ? `¥${amount}` : ''),
  })
  return {
    ...view,
    ...summaryFields,
    planParts: planCtx.planParts,
    planPartsLockedAt: planCtx.planPartsLockedAt,
    parts: summaryFields.parts || album.partsJson || [],
  }
}

function normalizeRequestOptions(body = {}) {
  const focusStageId = String(body.focusStageId || body.stageId || '').trim()
  const triggerContext = String(body.triggerContext || 'inspect_page').trim()
  return {
    focusStageId,
    triggerContext: triggerContext || 'inspect_page',
  }
}

async function callInspectionLlm(detail, requestOptions = {}) {
  const llm = config.inspLlm || {}
  if (!llm.enabled) return null
  if (llm.dryRun) {
    return normalizeAdvicePayload(
      {
        summary: '（LLM 试运行）已收到相册摘要，正式环境将生成完整报告。',
        processStatus: requestOptions.focusStageId
          ? `当前关注节点：${requestOptions.focusStageId}`
          : '全流程检查',
        focusAreas: ['请优先查看完整性 Tab 中标记为 × 的项目。'],
        suspectedIssues: [],
        partVerifyReminders: [],
        suggestedPhotos: [],
        nextSteps: ['向门店确认缺失项。'],
      },
      'llm',
    )
  }
  if (!String(llm.apiKey || '').trim()) return null

  let imageCaptions = []
  try {
    imageCaptions = await buildInspectionImageCaptions(detail, requestOptions)
  } catch (e) {
    console.warn('[inspection-advice] vision captions skipped', e && e.message)
  }

  const context = buildLlmContext(detail, {
    ...requestOptions,
    imageCaptions,
  })

  const completion = await chatCompletion({
    apiUrl: llm.apiUrl,
    apiKey: llm.apiKey,
    model: llm.model,
    temperature: 0.25,
    enableThinking: llm.enableThinking,
    timeoutMs: llm.timeoutMs,
    responseFormat: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildLlmSystemPrompt() },
      { role: 'user', content: buildLlmUserPrompt(context) },
    ],
  })

  const parsed = extractAdviceJson(completion.text)
  if (!parsed) return null
  const advice = normalizeAdvicePayload(parsed, 'llm')
  if (!advice.summary && !advice.suspectedIssues.length && !advice.focusAreas.length) {
    return null
  }
  return advice
}

async function saveInspectionReport(albumId, userId, payload, requestOptions = {}) {
  const id = randomUUID()
  await prisma.albumInspectionReport.create({
    data: {
      id,
      albumId,
      userId,
      source: payload.source || 'rule',
      payloadJson: {
        ...payload,
        request: requestOptions,
      },
    },
  })
  return id
}

async function generateAlbumInspectionAdvice(albumId, userId, body = {}) {
  const album = await assertUserAlbumAccess(albumId, userId)
  const detail = buildInspectionDetail(album)
  const requestOptions = normalizeRequestOptions(body)
  const ruleAdvice = buildRuleBasedAdvice(detail, requestOptions)
  let advice = ruleAdvice

  try {
    const llmAdvice = await callInspectionLlm(detail, requestOptions)
    if (llmAdvice) {
      advice = llmAdvice
    }
  } catch (e) {
    console.warn('[inspection-advice] llm fallback to rule', e && e.message)
  }

  const reportId = await saveInspectionReport(albumId, userId, advice, requestOptions)
  return {
    ...advice,
    reportId,
    generatedAt: new Date().toISOString(),
    focusStageId: requestOptions.focusStageId || '',
  }
}

module.exports = {
  generateAlbumInspectionAdvice,
  buildInspectionDetail,
}
