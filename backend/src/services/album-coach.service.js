/**
 * PKG-COACH · 相册教练解析
 * 按服务类型合并通用包与专用包；输出商家编辑页可用的提示结构。
 * 规则优先读运营覆盖（album-coach-config），再回落到内置常量。
 */
const { getRuntimeRules } = require('./album-coach-config.service')

function normalizeText(value = '') {
  return String(value || '').trim().toLowerCase()
}

function resolveServicePackId(albumView = {}, rules = null) {
  const runtime = rules || getRuntimeRules()
  const matchers = runtime.SERVICE_TYPE_MATCHERS || []
  const templateId = normalizeText(albumView.templateId)
  const serviceName = normalizeText(albumView.serviceName)
  const haystack = `${templateId} ${serviceName}`

  for (const matcher of matchers) {
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

function resolveStageRules(stageId, pack, rules) {
  const common = (rules.COMMON_STAGES && rules.COMMON_STAGES[stageId]) || {}
  const specific = (pack && pack.stages && pack.stages[stageId]) || {}
  const shootPrefer = specific.replace_shoot_prefer
    ? specific.shoot_prefer || []
    : mergeByCode(common.shoot_prefer, specific.shoot_prefer)
  return {
    shoot_avoid: rules.COMMON_AVOID,
    shoot_prefer: shootPrefer,
    note_hints: withExamplePrefixOnNoteHints(
      (specific.note_hints && specific.note_hints.length
        ? specific.note_hints
        : common.note_hints) || [],
    ),
    geo_angle: Array.from(
      new Set([...(common.geo_angle || []), ...(specific.geo_angle || [])]),
    ),
  }
}

function nodeImageCount(node = {}) {
  return Array.isArray(node.images) ? node.images.filter(Boolean).length : 0
}

/** 备注示例统一加「示例：」前缀，避免商家当成必填原文 */
function formatNoteExample(example = '') {
  const text = String(example || '').trim()
  if (!text) return ''
  if (/^示例[:：]/.test(text)) return text
  return `示例：${text}`
}

function formatNotePlaceholder(noteHint) {
  if (!noteHint) return ''
  const example = formatNoteExample(noteHint.example)
  if (!example) return ''
  const bullets = (noteHint.bullets || []).filter(Boolean)
  return bullets.length ? `${example}（${bullets.join(' / ')}）` : example
}

function withExamplePrefixOnNoteHints(list = []) {
  return (list || []).map((item) => {
    if (!item || typeof item !== 'object') return item
    return {
      ...item,
      example: formatNoteExample(item.example),
    }
  })
}

function buildCompletenessReport(albumView = {}, rules = null) {
  const runtime = rules || getRuntimeRules()
  const checklist = runtime.COMPLETE_CHECKLIST || []
  const nodes = albumView.nodes || []
  const byId = {}
  nodes.forEach((n) => {
    byId[n.id || n.nodeId] = n
  })

  const gaps = []
  checklist.forEach((item) => {
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
  const rules = getRuntimeRules()
  const packId = resolveServicePackId(albumView, rules)
  const pack = packId ? rules.SERVICE_PACKS[packId] : null
  const stageId = options.stageId || ''
  const stages = {}
  ;['stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5', 'stage_6'].forEach((id) => {
    stages[id] = resolveStageRules(id, pack, rules)
  })

  const active = stageId && stages[stageId] ? stages[stageId] : null
  const noteHint = active && active.note_hints && active.note_hints[0]
  const preferTitles = (active && active.shoot_prefer ? active.shoot_prefer : [])
    .map((x) => x.title)
    .filter(Boolean)
  const avoidTitles = (rules.COMMON_AVOID || []).map((x) => x.title)

  return {
    version: rules.meta?.version || 1,
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
    notePlaceholder: formatNotePlaceholder(noteHint),
    avoidSummary: avoidTitles.slice(0, 4).join('；'),
    draftPromptHints: active ? active.geo_angle || [] : [],
    completenessReport: buildCompletenessReport(albumView, rules),
    configMeta: {
      updatedAt: rules.meta?.updatedAt || null,
      updatedBy: rules.meta?.updatedBy || '',
    },
  }
}

module.exports = {
  resolveServicePackId,
  resolveAlbumCoach,
  buildCompletenessReport,
}
