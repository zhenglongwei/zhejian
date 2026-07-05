/**
 * 相册检查 · 完整性(✓/×) + 检查方法(五列表)
 */
const {
  buildPartVerifyPairs,
  normalizePlanParts,
  normalizeAlbumParts,
  hasStructuredPlanParts,
} = require('./album-part-pairs')
const { PART_TYPE } = require('../constants/part-type')
const { resolveOwnerImportance, EVIDENCE_STRENGTH } = require('../constants/album-evidence-guide')
const { buildMethodRow, buildWarnMethodRow, ADVICE } = require('./album-inspection-resolutions')

const MATRIX_STATUS = {
  OK: 'ok',
  MISSING: 'missing',
  WARN: 'warn',
  REVIEW: 'review',
}

function resolveDocumentAnchor(presence = {}) {
  if (presence.loss_assessment && presence.loss_assessment.uploaded) {
    return 'loss_assessment'
  }
  return 'repair_quote'
}

function buildDocumentPresence(documentItems = []) {
  const presence = {}
  documentItems.forEach((item) => {
    presence[item.id] = item
  })
  return { presence }
}

function collectProcessImages(detail = {}) {
  const images = []
  const processNode = (detail.nodes || []).find(
    (n) => n && (n.id === 'stage_5' || n.nodeId === 'stage_5'),
  )
  if (processNode && processNode.images) {
    processNode.images.forEach((url) => {
      const value = String(url || '').trim()
      if (value) images.push(value)
    })
  }
  return images
}

function finalizeInventoryRow(row) {
  const present = Boolean(row.present)
  return {
    ...row,
    importanceLabel: row.importanceLabel || resolveOwnerImportance(EVIDENCE_STRENGTH.RECOMMENDED),
    statusSymbol: present ? '✓' : '×',
    statusLevel: present ? MATRIX_STATUS.OK : MATRIX_STATUS.MISSING,
  }
}

function countInventoryRows(panels = []) {
  let done = 0
  let total = 0
  panels.forEach((panel) => {
    ;(panel.rows || []).forEach((row) => {
      total += 1
      if (row.present) done += 1
    })
  })
  return { done, total, missing: Math.max(total - done, 0) }
}

function buildCompletenessDocumentPanel(documentItems = []) {
  const rows = documentItems.map((item) =>
    finalizeInventoryRow({
      id: item.id,
      label: item.label,
      importanceLabel: item.importanceLabel,
      present: Boolean(item.uploaded),
      thumb: (item.images || [])[0] || '',
      images: item.images || [],
    }),
  )

  return { id: 'documents', title: '单据', layout: 'inventory', rows, empty: !rows.length }
}

function buildCompletenessPartPanel(detail = {}, processImages = []) {
  const planParts = normalizePlanParts(detail.planParts || [])
  const albumParts = normalizeAlbumParts(detail.parts || [])
  const structured = hasStructuredPlanParts(detail.planParts, detail.planPartsLockedAt)
  const { pairs, extras } = buildPartVerifyPairs(planParts, albumParts)
  const importance = structured
    ? resolveOwnerImportance(EVIDENCE_STRENGTH.RECOMMENDED)
    : resolveOwnerImportance(EVIDENCE_STRENGTH.OPTIONAL)
  const rows = []

  pairs.forEach((pair) => {
    const name = (pair.planPart && pair.planPart.name) || (pair.albumPart && pair.albumPart.name) || '—'
    const photos = pair.albumPart && pair.albumPart.thumbUrl ? [pair.albumPart.thumbUrl] : []
    rows.push(
      finalizeInventoryRow({
        id: pair.partKey || name,
        label: `${name}凭证`,
        importanceLabel: importance,
        present: photos.length > 0,
        thumb: photos[0] || '',
        images: photos,
      }),
    )
  })

  extras.forEach((extra) => {
    const name = (extra.albumPart && extra.albumPart.name) || '增项'
    const photos = extra.albumPart && extra.albumPart.thumbUrl ? [extra.albumPart.thumbUrl] : []
    rows.push(
      finalizeInventoryRow({
        id: extra.partKey,
        label: `${name}凭证`,
        importanceLabel: importance,
        present: photos.length > 0,
        thumb: photos[0] || '',
        images: photos,
      }),
    )
  })

  if (!rows.length && albumParts.length) {
    albumParts.forEach((part) => {
      const photos = part.thumbUrl ? [part.thumbUrl] : []
      rows.push(
        finalizeInventoryRow({
          id: part.partKey,
          label: `${part.name}凭证`,
          importanceLabel: importance,
          present: photos.length > 0,
          thumb: photos[0] || '',
          images: photos,
        }),
      )
    })
  }

  if (rows.length) {
    rows.push(
      finalizeInventoryRow({
        id: 'part_old_trace',
        label: '旧件/过程留痕',
        importanceLabel: importance,
        present: processImages.length > 0,
        thumb: processImages[0] || '',
        images: processImages,
      }),
    )
  }

  return { id: 'parts', title: '配件', layout: 'inventory', rows, empty: !rows.length }
}

function buildCompletenessProcessPanel(processItems = [], processImages = []) {
  const importance = resolveOwnerImportance(EVIDENCE_STRENGTH.RECOMMENDED)
  const items = processItems.length ? processItems : [{ id: 'process_overall', label: '施工过程' }]
  const rows = items.map((item) =>
    finalizeInventoryRow({
      id: item.id,
      label: item.label,
      importanceLabel: importance,
      present: processImages.length > 0,
      thumb: processImages[0] || '',
      images: processImages,
    }),
  )

  return { id: 'process', title: '过程', layout: 'inventory', rows, empty: false }
}

function buildCompletenessOutcomePanel(outcome = {}) {
  const importance = resolveOwnerImportance(EVIDENCE_STRENGTH.RECOMMENDED)
  const rows = []
  const completionImages = outcome.completionImages || []

  rows.push(
    finalizeInventoryRow({
      id: 'completion',
      label: '完工效果',
      importanceLabel: importance,
      present: completionImages.length > 0,
      thumb: completionImages[0] || '',
      images: completionImages,
    }),
  )

  ;(outcome.comparePairs || []).forEach((pair, index) => {
    const complete = Boolean(pair.beforeUrl && pair.afterUrl)
    const images = [pair.beforeUrl, pair.afterUrl].filter(Boolean)
    rows.push(
      finalizeInventoryRow({
        id: pair.id || `compare_${index}`,
        label: pair.title || `前后对比组 ${index + 1}`,
        importanceLabel: importance,
        present: complete,
        thumb: pair.afterUrl || pair.beforeUrl || '',
        images,
      }),
    )
  })

  return { id: 'outcome', title: '完工', layout: 'inventory', rows, empty: !rows.length }
}

function buildCompletenessView(detail = {}, documentItems = [], processItems = [], outcome = {}) {
  const processImages = collectProcessImages(detail)
  const panels = [
    buildCompletenessDocumentPanel(documentItems),
    buildCompletenessPartPanel(detail, processImages),
    buildCompletenessProcessPanel(processItems, processImages),
    buildCompletenessOutcomePanel(outcome),
  ].filter((panel) => !panel.empty)

  return { summary: countInventoryRows(panels), panels }
}

function buildMethodDocumentPanel(documentItems = []) {
  const { presence } = buildDocumentPresence(documentItems)
  const has = (id) => Boolean(presence[id] && presence[id].uploaded)
  const anchorId = resolveDocumentAnchor(presence)
  const methodRows = []

  if (anchorId === 'loss_assessment') {
    methodRows.push(
      buildMethodRow({
        id: 'loss_work',
        leftLabel: '定损单',
        rightLabel: '施工工单',
        leftOk: has('loss_assessment'),
        rightOk: has('work_order'),
        howToCheck: '核对工项、部位、配件标准',
        ifMismatch: '增项、漏项、超定损范围',
        advice: ADVICE.CONFIRM_INSURER,
      }),
      buildMethodRow({
        id: 'loss_settle',
        leftLabel: '定损单',
        rightLabel: '结算单',
        leftOk: has('loss_assessment'),
        rightOk: has('settlement'),
        howToCheck: '核对结算项目与金额',
        ifMismatch: '超范围、未告知增项',
        advice: ADVICE.CONFIRM_STORE,
      }),
    )
  } else {
    methodRows.push(
      buildMethodRow({
        id: 'quote_work',
        leftLabel: '报价单',
        rightLabel: '施工工单',
        leftOk: has('repair_quote'),
        rightOk: has('work_order'),
        howToCheck: '核对项目是否一致',
        ifMismatch: '擅自改方案、增删项目',
        advice: ADVICE.CONFIRM_STORE,
      }),
      buildMethodRow({
        id: 'quote_settle',
        leftLabel: '报价单',
        rightLabel: '结算单',
        leftOk: has('repair_quote'),
        rightOk: has('settlement'),
        howToCheck: '核对金额与项目',
        ifMismatch: '费用变动、增项',
        advice: ADVICE.CONFIRM_STORE,
      }),
      buildMethodRow({
        id: 'work_settle',
        leftLabel: '施工工单',
        rightLabel: '结算单',
        leftOk: has('work_order'),
        rightOk: has('settlement'),
        howToCheck: '核对交车结算',
        ifMismatch: '交车增项',
        advice: ADVICE.CONFIRM_STORE,
      }),
    )
  }

  return {
    id: 'doc_method',
    title: '单据对照',
    subtitle: anchorId === 'loss_assessment' ? '基准：定损单' : '基准：报价单',
    layout: 'method',
    methodRows,
    empty: !methodRows.length,
  }
}

function buildMethodPartPanel(detail = {}, processImages = []) {
  const planParts = normalizePlanParts(detail.planParts || [])
  const albumParts = normalizeAlbumParts(detail.parts || [])
  const structured = hasStructuredPlanParts(detail.planParts, detail.planPartsLockedAt)
  const { pairs, extras } = buildPartVerifyPairs(planParts, albumParts)
  const methodRows = []

  let planOnly = 0
  let typeMismatch = 0
  pairs.forEach((pair) => {
    if (pair.linkStatus === 'plan_only') planOnly += 1
    if (pair.fieldDiffs && pair.fieldDiffs.includes('partType')) typeMismatch += 1
  })

  if ((structured || planParts.length) && pairs.length) {
    methodRows.push(
      buildMethodRow({
        id: 'plan_album',
        leftLabel: '方案',
        rightLabel: '登记',
        leftOk: planParts.length > 0,
        rightOk: albumParts.length > 0 && !planOnly,
        howToCheck: '核对件名、数量',
        ifMismatch: '漏换、擅自增项',
        advice: ADVICE.CONFIRM_STORE,
      }),
    )
  }

  if (extras.length) {
    methodRows.push(
      buildWarnMethodRow({
        id: 'extra_parts',
        label: '增项 ↔ 方案',
        howToCheck: '核对增项是否在报价/工单内',
        ifMismatch: '未经确认的增项',
        advice: ADVICE.CONFIRM_STORE,
      }),
    )
  }

  if (albumParts.length) {
    methodRows.push(
      buildMethodRow({
        id: 'album_photo',
        leftLabel: '登记',
        rightLabel: '凭证图',
        leftOk: albumParts.length > 0,
        rightOk: albumParts.some((p) => p.thumbUrl),
        howToCheck: '看包装、标签、编码',
        ifMismatch: '类型不符、凭证缺失',
        advice: ADVICE.CONFIRM_STORE,
      }),
    )
  }

  if (typeMismatch > 0) {
    methodRows.push(
      buildWarnMethodRow({
        id: 'type_mismatch',
        label: '凭证 ↔ 方案类型',
        howToCheck: '对照包装与方案配件类型',
        ifMismatch: '未按告知类型更换',
        advice: ADVICE.CONFIRM_STORE,
      }),
    )
  }

  if (albumParts.length) {
    methodRows.push(
      buildMethodRow({
        id: 'old_process',
        leftLabel: '换件项',
        rightLabel: '旧件/过程图',
        leftOk: true,
        rightOk: processImages.length > 0,
        howToCheck: '声称更换是否有旧件或拆下过程',
        ifMismatch: '以修代换、未真换',
        advice: ADVICE.CONFIRM_STORE,
      }),
    )
  }

  pairs.forEach((pair) => {
    if (pair.albumPart && pair.albumPart.partType === PART_TYPE.REPAIR_INSTEAD_REPLACE) {
      methodRows.push(
        buildWarnMethodRow({
          id: `rir_${pair.partKey}`,
          label: `${pair.albumPart.name || '配件'} · 以修代换`,
          howToCheck: '对照过程图确认维修范围',
          ifMismatch: '范围与沟通不符',
          advice: ADVICE.CONFIRM_STORE,
        }),
      )
    }
  })

  return {
    id: 'part_method',
    title: '配件对照',
    layout: 'method',
    methodRows,
    empty: !methodRows.length,
  }
}

function buildMethodCrossPanel(documentItems = [], detail = {}, processImages = []) {
  const { presence } = buildDocumentPresence(documentItems)
  const has = (id) => Boolean(presence[id] && presence[id].uploaded)
  const albumParts = normalizeAlbumParts(detail.parts || [])
  const methodRows = []

  if (has('loss_assessment') && albumParts.length) {
    methodRows.push(
      buildMethodRow({
        id: 'loss_part',
        leftLabel: '定损单',
        rightLabel: '配件类型',
        leftOk: true,
        rightOk: true,
        howToCheck: '理赔配件标准 vs 登记/凭证',
        ifMismatch: '降级件、未批先换',
        advice: ADVICE.CONFIRM_INSURER,
      }),
    )
  }

  if (has('work_order') && processImages.length) {
    methodRows.push(
      buildMethodRow({
        id: 'work_process',
        leftLabel: '施工工单',
        rightLabel: '过程图',
        leftOk: has('work_order'),
        rightOk: processImages.length > 0,
        howToCheck: '工项是否有对应施工图',
        ifMismatch: '过程缺失、项实不符',
        advice: ADVICE.CONFIRM_STORE,
      }),
    )
  }

  return {
    id: 'cross_method',
    title: '交叉对照',
    layout: 'method',
    methodRows,
    empty: !methodRows.length,
  }
}

function buildMethodOutcomePanel(outcome = {}) {
  const methodRows = []
  if (outcome.hasCompare) {
    methodRows.push(
      buildMethodRow({
        id: 'compare_slider',
        label: '前后对比',
        leftOk: true,
        rightOk: true,
        howToCheck: '同角度看损伤是否修复',
        ifMismatch: '漏修、修复不足',
        advice: ADVICE.CONFIRM_STORE,
      }),
    )
  }
  if ((outcome.completionImages || []).length) {
    methodRows.push(
      buildMethodRow({
        id: 'completion_check',
        label: '完工 ↔ 接车损伤',
        leftOk: true,
        rightOk: true,
        howToCheck: '对照接车图与工单范围',
        ifMismatch: '外观未恢复、范围不符',
        advice: ADVICE.CONFIRM_STORE,
      }),
    )
  }
  return {
    id: 'outcome_method',
    title: '完工对照',
    layout: 'method',
    methodRows,
    empty: !methodRows.length,
    outcome,
  }
}

function buildMethodView(detail = {}, documentItems = [], processItems = [], outcome = {}) {
  const panels = [
    buildMethodDocumentPanel(documentItems),
    buildMethodPartPanel(detail, collectProcessImages(detail)),
    buildMethodCrossPanel(documentItems, detail, collectProcessImages(detail)),
    buildMethodOutcomePanel(outcome),
  ].filter((panel) => !panel.empty)

  const { presence } = buildDocumentPresence(documentItems)
  const anchorId = resolveDocumentAnchor(presence)

  return {
    anchorHint: anchorId === 'loss_assessment' ? '基准：定损单' : '基准：报价单',
    panels,
  }
}

function buildInspectionViews(detail = {}, documentItems = [], processItems = [], outcome = {}) {
  return {
    completeness: buildCompletenessView(detail, documentItems, processItems, outcome),
    method: buildMethodView(detail, documentItems, processItems, outcome),
  }
}

module.exports = {
  MATRIX_STATUS,
  buildInspectionViews,
  buildCompletenessView,
  buildMethodView,
}
