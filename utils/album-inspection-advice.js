/**
 * 相册检查 · AI 建议（规则引擎 + LLM 上下文，不含原图）
 * B-INSP-01
 */
const { buildAlbumInspectionView } = require('./album-inspection-view')
const { collectOldPartTraces } = require('./album-inspection-matrix')

function normalizeAdvicePayload(raw = {}, source = 'rule') {
  const pickLines = (list) =>
    (Array.isArray(list) ? list : [])
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (item && typeof item.text === 'string') return item.text.trim()
        return ''
      })
      .filter(Boolean)

  return {
    focusAreas: pickLines(raw.focusAreas).slice(0, 6),
    suspectedIssues: pickLines(raw.suspectedIssues).slice(0, 8).map((text) => ({ text })),
    suggestedPhotos: pickLines(raw.suggestedPhotos).slice(0, 6),
    nextSteps: pickLines(raw.nextSteps).slice(0, 6),
    source: String(source || 'rule'),
  }
}

function collectMissingInventoryLabels(view = {}) {
  const labels = []
  ;(view.completeness?.panels || []).forEach((panel) => {
    ;(panel.rows || []).forEach((row) => {
      if (!row.present && row.label) labels.push(String(row.label))
    })
  })
  return labels
}

function collectMethodMissingRows(view = {}) {
  const rows = []
  ;(view.method?.panels || []).forEach((panel) => {
    ;(panel.methodRows || []).forEach((row) => {
      if (row.isMissing || row.rowLevel === 'missing') {
        rows.push({
          label: row.label || row.missingSummary || '对照项',
          riskHint: row.riskHint || '',
          actionHint: row.actionHint || '',
        })
      }
    })
    const bundle = panel.documentBundle
    if (bundle && bundle.missingBlock) {
      rows.push({
        label: '单据对照',
        riskHint: bundle.missingBlock.riskHint || '',
        actionHint: bundle.missingBlock.actionHint || '',
      })
    }
  })
  return rows
}

function collectLinkedOldPartGaps(detail = {}, view = {}) {
  const { traces } = collectOldPartTraces(detail)
  const linked = traces.filter((t) => t.planPartId)
  const unlinked = traces.filter((t) => !t.planPartId)
  const missingOldPart = !(view.completeness?.panels || [])
    .flatMap((p) => p.rows || [])
    .some((row) => row.id === 'part_old_trace' && row.present)
  return { linked, unlinked, missingOldPart, total: traces.length }
}

function buildRuleBasedAdvice(detail = {}, view = null) {
  const inspection = view || buildAlbumInspectionView(detail)
  const missingLabels = collectMissingInventoryLabels(inspection)
  const methodMissing = collectMethodMissingRows(inspection)
  const oldPart = collectLinkedOldPartGaps(detail, inspection)
  const focusAreas = []
  const suspectedIssues = []
  const suggestedPhotos = []
  const nextSteps = []

  if (missingLabels.length) {
    focusAreas.push(`完整性 Tab 有 ${missingLabels.length} 项未留痕，建议先看「检查方法」了解如何对照。`)
  } else {
    focusAreas.push('主要留痕项已齐，可按「检查方法」逐项对照单据与配件。')
  }

  methodMissing.slice(0, 4).forEach((row) => {
    if (row.riskHint) suspectedIssues.push(row.riskHint)
    if (row.actionHint) nextSteps.push(row.actionHint.endsWith('。') ? row.actionHint : `${row.actionHint}。`)
  })

  if (oldPart.missingOldPart && (detail.parts || []).length) {
    suspectedIssues.push('更换类项目缺少旧件留痕，无法确认是否真的更换。')
    suggestedPhotos.push('旧件外观或拆下过程照片')
    nextSteps.push('向门店确认更换情况，并索取旧件外观或拆下过程照片。')
  }

  if (oldPart.unlinked.length) {
    focusAreas.push(`有 ${oldPart.unlinked.length} 张旧件图未关联具体配件，建议结合工单与配件凭证整体查看。`)
  }

  missingLabels.slice(0, 5).forEach((label) => {
    suggestedPhotos.push(`${label}相关照片或单据`)
  })

  if (!nextSteps.length) {
    nextSteps.push('如有疑问，可使用「配件验真」或相册内反馈联系门店。')
  }

  return normalizeAdvicePayload(
    {
      focusAreas,
      suspectedIssues,
      suggestedPhotos,
      nextSteps,
    },
    'rule',
  )
}

function buildLlmContext(detail = {}, view = null) {
  const inspection = view || buildAlbumInspectionView(detail)
  const oldPart = collectLinkedOldPartGaps(detail, inspection)
  const inventory = (inspection.completeness?.panels || []).flatMap((panel) =>
    (panel.rows || []).map((row) => ({
      panel: panel.title,
      label: row.label,
      present: Boolean(row.present),
      importance: row.importanceLabel,
    })),
  )
  const methodMissing = collectMethodMissingRows(inspection)
  const parts = (detail.parts || []).map((part) => ({
    name: part.partName || part.name || '',
    planPartId: part.planPartId || part.linkKey || '',
    hasCredential: Boolean(
      (part.photos && part.photos.length) || part.thumbUrl,
    ),
  }))

  return {
    serviceName: detail.serviceName || '',
    storeName: (detail.store && detail.store.name) || detail.storeName || '',
    templateId: detail.templateId || '',
    completenessSummary: inspection.completeness?.summary || {},
    inventory,
    methodMissing: methodMissing.map((row) => ({
      label: row.label,
      riskHint: row.riskHint,
      actionHint: row.actionHint,
    })),
    parts,
    oldPartTraces: {
      total: oldPart.total,
      linkedCount: oldPart.linked.length,
      unlinkedCount: oldPart.unlinked.length,
      missingOldPart: oldPart.missingOldPart,
    },
  }
}

function buildLlmSystemPrompt() {
  return [
    '你是汽车维修服务相册的「AI 辅助检查」助手，服务对象是车主。',
    '你只能根据用户提供的结构化摘要作建议，禁止编造未出现的配件、金额、鉴定结论。',
    '禁止输出「100% 修好」「平台担保」「已鉴定为真/假」等表述。',
    '输出 JSON，不要 markdown。字段：',
    '{"focusAreas":["…"],"suspectedIssues":["…"],"suggestedPhotos":["…"],"nextSteps":["…"]}',
    'focusAreas：建议优先查看的顺序（2～4 条）。',
    'suspectedIssues：基于缺失项的风险提示（0～5 条，短句）。',
    'suggestedPhotos：建议向门店补充的照片类型（0～5 条）。',
    'nextSteps：行动建议，使用「向门店确认/索取」或「向保险公司核对」。',
  ].join('\n')
}

function buildLlmUserPrompt(context = {}) {
  return [
    '以下是本相册检查页的结构化摘要（不含原图 URL）：',
    JSON.stringify(context),
    '请生成辅助检查建议 JSON。',
  ].join('\n')
}

function extractAdviceJson(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  const jsonText =
    start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate
  try {
    return JSON.parse(jsonText)
  } catch (e) {
    return null
  }
}

module.exports = {
  normalizeAdvicePayload,
  buildRuleBasedAdvice,
  buildLlmContext,
  buildLlmSystemPrompt,
  buildLlmUserPrompt,
  extractAdviceJson,
  collectMissingInventoryLabels,
  collectMethodMissingRows,
}
