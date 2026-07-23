/**
 * PKG-COACH · 相册教练解析
 * 按服务类型合并通用包与专用包；输出商家编辑页可用的提示结构。
 */
const {
  COMMON_AVOID,
  COMMON_STAGES,
  SERVICE_TYPE_MATCHERS,
  SERVICE_PACKS,
  COMPLETE_CHECKLIST,
} = require('../constants/album-coach-rules')

function normalizeText(value = '') {
  return String(value || '').trim().toLowerCase()
}

function resolveServicePackId(albumView = {}) {
  const templateId = normalizeText(albumView.templateId)
  const serviceName = normalizeText(albumView.serviceName)
  const haystack = `${templateId} ${serviceName}`

  for (const matcher of SERVICE_TYPE_MATCHERS) {
    if ((matcher.templates || []).some((t) => templateId === normalizeText(t))) {
      return matcher.id
    }
    if ((matcher.keywords || []).some((kw) => haystack.includes(normalizeText(kw)))) {
      return matcher.id
    }
  }
  return null
}

function mergeByCode(baseList = [], overrideList = []) {
  const map = new Map()
  ;[...(baseList || []), ...(overrideList || [])].forEach((item) => {
    if (!item || !item.code) return
    map.set(item.code, { ...map.get(item.code), ...item })
  })
  return Array.from(map.values())
}

function resolveStageRules(stageId, pack) {
  const common = COMMON_STAGES[stageId] || {}
  const specific = (pack && pack.stages && pack.stages[stageId]) || {}
  return {
    shoot_avoid: COMMON_AVOID,
    shoot_prefer: mergeByCode(common.shoot_prefer, specific.shoot_prefer),
    note_hints: (specific.note_hints && specific.note_hints.length
      ? specific.note_hints
      : common.note_hints) || [],
    geo_angle: Array.from(
      new Set([...(common.geo_angle || []), ...(specific.geo_angle || [])]),
    ),
  }
}

function nodeImageCount(node = {}) {
  return Array.isArray(node.images) ? node.images.filter(Boolean).length : 0
}

function buildCompletenessReport(albumView = {}) {
  const nodes = albumView.nodes || []
  const byId = {}
  nodes.forEach((n) => {
    byId[n.id || n.nodeId] = n
  })

  const gaps = []
  COMPLETE_CHECKLIST.forEach((item) => {
    const node = byId[item.stageId]
    if (!node) {
      gaps.push({ ...item, reason: 'missing_stage' })
      return
    }
    if (item.code.endsWith('_note') && !String(node.note || '').trim()) {
      gaps.push({ ...item, reason: 'empty_note' })
    }
    if (item.code.endsWith('_image') && nodeImageCount(node) < 1) {
      gaps.push({ ...item, reason: 'empty_images' })
    }
  })
  return {
    ok: gaps.length === 0,
    gaps,
  }
}

/**
 * @param {object} albumView buildMerchantView / buildAlbumView 产物
 * @param {{ stageId?: string }} [options]
 */
function resolveAlbumCoach(albumView = {}, options = {}) {
  const packId = resolveServicePackId(albumView)
  const pack = packId ? SERVICE_PACKS[packId] : null
  const stageId = options.stageId || ''
  const stages = {}
  ;['stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5', 'stage_6'].forEach((id) => {
    stages[id] = resolveStageRules(id, pack)
  })

  const active = stageId && stages[stageId] ? stages[stageId] : null
  const noteHint = active && active.note_hints && active.note_hints[0]
  const preferTitles = (active && active.shoot_prefer ? active.shoot_prefer : [])
    .map((x) => x.title)
    .filter(Boolean)
  const avoidTitles = COMMON_AVOID.map((x) => x.title)

  return {
    version: 1,
    servicePackId: packId || 'common',
    servicePackLabel: (pack && pack.label) || '通用',
    geoPyramidHint: (pack && pack.geoPyramidHint) || '',
    stages,
    activeStageId: stageId || '',
    coachCards: active
      ? [
          {
            type: 'prefer',
            title: '建议拍',
            items: active.shoot_prefer || [],
          },
          {
            type: 'avoid',
            title: '尽量别拍',
            items: active.shoot_avoid || [],
          },
          {
            type: 'note',
            title: '备注怎么写',
            items: active.note_hints || [],
          },
        ]
      : [],
    uploadInlineHints: preferTitles.slice(0, 2),
    notePlaceholder: noteHint
      ? `${noteHint.example || ''}（${(noteHint.bullets || []).join(' / ')}）`
      : '',
    avoidSummary: avoidTitles.slice(0, 4).join('；'),
    draftPromptHints: active ? active.geo_angle || [] : [],
    completenessReport: buildCompletenessReport(albumView),
  }
}

module.exports = {
  resolveServicePackId,
  resolveAlbumCoach,
  buildCompletenessReport,
}
