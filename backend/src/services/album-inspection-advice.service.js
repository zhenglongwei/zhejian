/**
 * B-INSP-01 · 相册检查 AI 建议（多模态 LLM + 报告存储，失败不兜底规则答案）
 */
const { randomUUID } = require('crypto')
const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const { chatCompletion } = require('../lib/dashscope-chat')
const { loadAlbum, buildAlbumView } = require('./service-album.service')
const { buildPlanPartsContext } = require('./album-plan-parts.service')
const { buildAlbumSummaryFields } = require('../utils/album-summary')
const { buildInspectionImageCaptions } = require('./album-inspection-vision.service')
const {
  buildLlmContext,
  buildLlmSystemPrompt,
  buildLlmUserPrompt,
  extractAdviceJson,
  normalizeAdvicePayload,
} = require('../utils/album-inspection-advice')
const {
  buildAlbumInspectionContentFingerprint,
} = require('../utils/album-inspection-content-fingerprint')
const { isServiceAlbumRepairDone } = require('../constants/v2')

function isSuccessfulInspectionReport(row = {}) {
  const payload = row.payloadJson || {}
  if (payload.status === 'failed') return false
  const source = row.source || payload.source || ''
  if (source === 'failed' || source === 'rule') return false
  return true
}

async function assertAiAnalysisTrialAvailable(albumId, userId, album) {
  if (!isServiceAlbumRepairDone(album.status)) {
    const err = new Error('相册完工后才可试用 AI 分析')
    err.status = 400
    throw err
  }
  const rows = await prisma.albumInspectionReport.findMany({
    where: { albumId, userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  if (rows.some(isSuccessfulInspectionReport)) {
    const err = new Error('本相册 AI 分析试用次数已用完')
    err.status = 400
    throw err
  }
}

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

function buildFailurePayload(errorMessage, errorTitle = '调用失败') {
  return {
    status: 'failed',
    source: 'failed',
    errorTitle,
    errorMessage: String(errorMessage || 'AI 检查调用失败').trim(),
    overallOpinion: {
      summary: '',
      completeness: '',
      missingItems: [],
      potentialIssues: [],
      recommendedActions: [],
    },
    comparisons: [],
    photoAppendix: [],
    limitationNote: '',
    summary: '',
    processStatus: '',
    focusAreas: [],
    stageObservations: [],
    suspectedIssues: [],
    partVerifyReminders: [],
    suggestedPhotos: [],
    nextSteps: [],
  }
}

function resolveInspectionErrorMessage(error) {
  const code = error && error.code
  const message = String((error && error.message) || '').trim()
  if (code === 'LLM_TIMEOUT' || message === 'llm_timeout') {
    return 'AI 分析超时，请稍后重试（分析照片较多时可能需要更久）'
  }
  if (/fetch failed|ECONNRESET|ETIMEDOUT|network/i.test(message)) {
    return 'AI 服务连接异常，请稍后重试'
  }
  return message || 'AI 检查调用失败'
}

function mapReportRow(row) {
  const payload = row.payloadJson || {}
  return {
    reportId: row.id,
    createdAt: row.createdAt.toISOString(),
    source: row.source,
    status: payload.status || (row.source === 'failed' ? 'failed' : 'success'),
    payload,
  }
}

async function callInspectionLlm(detail, requestOptions = {}) {
  const llm = config.inspLlm || {}
  if (!llm.enabled) {
    throw new Error('AI 检查服务未启用，请稍后再试')
  }
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
  if (!String(llm.apiKey || '').trim()) {
    throw new Error('未配置大模型 API Key（INSP_LLM_API_KEY 或 DASHSCOPE_API_KEY）')
  }

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

  let completion
  try {
    completion = await chatCompletion({
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
  } catch (e) {
    throw new Error(resolveInspectionErrorMessage(e))
  }

  const parsed = extractAdviceJson(completion.text)
  if (!parsed) {
    throw new Error('模型返回内容无法解析为检查报告')
  }
  const advice = normalizeAdvicePayload(parsed, 'llm')
  const opinion = advice.overallOpinion || {}
  const hasContent =
    opinion.summary ||
    opinion.completeness ||
    (advice.comparisons && advice.comparisons.length) ||
    (advice.photoAppendix && advice.photoAppendix.length)
  if (!hasContent) {
    throw new Error('模型返回的检查报告为空')
  }
  return advice
}

async function saveInspectionReport(albumId, userId, payload, requestOptions = {}, detail = null) {
  const id = randomUUID()
  const contentFingerprint = detail
    ? buildAlbumInspectionContentFingerprint(detail)
    : payload.contentFingerprint || ''
  await prisma.albumInspectionReport.create({
    data: {
      id,
      albumId,
      userId,
      source: payload.source || 'llm',
      payloadJson: {
        ...payload,
        contentFingerprint,
        request: requestOptions,
      },
    },
  })
  return id
}

async function generateAlbumInspectionAdvice(albumId, userId, body = {}) {
  const album = await assertUserAlbumAccess(albumId, userId)
  await assertAiAnalysisTrialAvailable(albumId, userId, album)
  const detail = buildInspectionDetail(album)
  const requestOptions = normalizeRequestOptions(body)

  try {
    const advice = await callInspectionLlm(detail, requestOptions)
    const successPayload = {
      ...advice,
      status: 'success',
      source: advice.source || 'llm',
    }
    const reportId = await saveInspectionReport(albumId, userId, successPayload, requestOptions, detail)
    return {
      ...successPayload,
      reportId,
      generatedAt: new Date().toISOString(),
      focusStageId: requestOptions.focusStageId || '',
    }
  } catch (e) {
    const errorMessage = resolveInspectionErrorMessage(e)
    console.warn('[inspection-advice] llm failed', errorMessage)
    const failurePayload = buildFailurePayload(errorMessage)
    const reportId = await saveInspectionReport(albumId, userId, failurePayload, requestOptions, detail)
    return {
      ...failurePayload,
      reportId,
      generatedAt: new Date().toISOString(),
      focusStageId: requestOptions.focusStageId || '',
    }
  }
}

async function listAlbumInspectionReports(albumId, userId, options = {}) {
  await assertUserAlbumAccess(albumId, userId)
  const limit = Math.max(1, Math.min(Number(options.limit) || 30, 50))
  const rows = await prisma.albumInspectionReport.findMany({
    where: { albumId, userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return {
    items: rows.map(mapReportRow),
  }
}

module.exports = {
  generateAlbumInspectionAdvice,
  listAlbumInspectionReports,
  buildInspectionDetail,
}
