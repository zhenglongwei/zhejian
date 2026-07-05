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
const {
  resolveImportanceLabel,
  EVIDENCE_STRENGTH,
  DOCUMENT_TYPES,
  resolveDocumentTypesForTemplate,
} = require('../constants/album-evidence-guide')
const { buildMethodRow, buildWarnMethodRow, ADVICE } = require('./album-inspection-resolutions')
const {
  isOldPartEvidenceItem,
  normalizeImageList,
  resolveProcessImagesForStage,
} = require('./album-evidence-items')

const DOCUMENT_TIMELINE_ORDER = [
  'loss_assessment',
  'repair_quote',
  'work_order',
  'settlement',
]

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

function findProcessNode(detail = {}) {
  return (detail.nodes || []).find(
    (n) => n && (n.id === 'stage_5' || n.nodeId === 'stage_5'),
  )
}

/** B-EVID-06 / U-ALB-INSP-06 · 结构化旧件留痕（不再用 stage_5 过程图启发式） */
function collectOldPartTraces(detail = {}) {
  const traces = (detail.evidenceItems || [])
    .filter(isOldPartEvidenceItem)
    .map((item) => ({
      id: item.id,
      planPartId: String(item.planPartId || item.linkKey || '').trim(),
      images: normalizeImageList(item.images),
    }))
    .filter((item) => item.images.length > 0)

  const allImages = []
  traces.forEach((trace) => {
    trace.images.forEach((url) => {
      if (!allImages.includes(url)) allImages.push(url)
    })
  })

  return { traces, allImages }
}

function collectProcessImages(detail = {}) {
  const processNode = findProcessNode(detail)
  if (!processNode) return []

  const evidenceItems = detail.evidenceItems || []
  if (evidenceItems.length) {
    return resolveProcessImagesForStage(processNode, evidenceItems)
  }

  return normalizeImageList(processNode.images)
}

function resolveTracePartLabel(trace, pairs = [], planParts = []) {
  const id = trace.planPartId
  if (!id) return '换件项'
  const pair = pairs.find((p) => {
    const planId = p.planPart && p.planPart.planPartId
    const albumLink =
      p.albumPart && (p.albumPart.planPartId || p.albumPart.linkKey || p.partKey)
    return planId === id || albumLink === id || p.partKey === id
  })
  if (pair) {
    return (pair.planPart && pair.planPart.name) || (pair.albumPart && pair.albumPart.name) || '换件项'
  }
  const plan = (planParts || []).find((p) => p.planPartId === id)
  return (plan && plan.name) || '换件项'
}

function findPairForTrace(trace, pairs = []) {
  const id = trace.planPartId
  if (!id) return null
  return (
    pairs.find((p) => {
      const planId = p.planPart && p.planPart.planPartId
      const albumLink =
        p.albumPart && (p.albumPart.planPartId || p.albumPart.linkKey || p.partKey)
      return planId === id || albumLink === id || p.partKey === id
    }) || null
  )
}

function finalizeInventoryRow(row, audience = 'owner') {
  const present = Boolean(row.present)
  return {
    ...row,
    importanceLabel:
      row.importanceLabel ||
      resolveImportanceLabel(EVIDENCE_STRENGTH.RECOMMENDED, audience),
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

function buildCompletenessDocumentPanel(documentItems = [], audience = 'owner') {
  const rows = documentItems.map((item) =>
    finalizeInventoryRow(
      {
        id: item.id,
        label: item.label,
        importanceLabel: item.importanceLabel,
        present: Boolean(item.uploaded),
        thumb: (item.images || [])[0] || '',
        images: item.images || [],
      },
      audience,
    ),
  )

  return { id: 'documents', title: '单据', layout: 'inventory', rows, empty: !rows.length }
}

function buildCompletenessPartPanel(
  detail = {},
  oldPartTrace = { traces: [], allImages: [] },
  audience = 'owner',
) {
  const planParts = normalizePlanParts(detail.planParts || [])
  const albumParts = normalizeAlbumParts(detail.parts || [])
  const structured = hasStructuredPlanParts(detail.planParts, detail.planPartsLockedAt)
  const { pairs, extras } = buildPartVerifyPairs(planParts, albumParts)
  const importance = structured
    ? resolveImportanceLabel(EVIDENCE_STRENGTH.RECOMMENDED, audience)
    : resolveImportanceLabel(EVIDENCE_STRENGTH.OPTIONAL, audience)
  const rows = []

  pairs.forEach((pair) => {
    const name = (pair.planPart && pair.planPart.name) || (pair.albumPart && pair.albumPart.name) || '—'
    const photos = pair.albumPart && pair.albumPart.thumbUrl ? [pair.albumPart.thumbUrl] : []
    rows.push(
      finalizeInventoryRow(
        {
          id: pair.partKey || name,
          label: `${name}凭证`,
          importanceLabel: importance,
          present: photos.length > 0,
          thumb: photos[0] || '',
          images: photos,
        },
        audience,
      ),
    )
  })

  extras.forEach((extra) => {
    const name = (extra.albumPart && extra.albumPart.name) || '增项'
    const photos = extra.albumPart && extra.albumPart.thumbUrl ? [extra.albumPart.thumbUrl] : []
    rows.push(
      finalizeInventoryRow(
        {
          id: extra.partKey,
          label: `${name}凭证`,
          importanceLabel: importance,
          present: photos.length > 0,
          thumb: photos[0] || '',
          images: photos,
        },
        audience,
      ),
    )
  })

  if (!rows.length && albumParts.length) {
    albumParts.forEach((part) => {
      const photos = part.thumbUrl ? [part.thumbUrl] : []
      rows.push(
        finalizeInventoryRow(
          {
            id: part.partKey,
            label: `${part.name}凭证`,
            importanceLabel: importance,
            present: photos.length > 0,
            thumb: photos[0] || '',
            images: photos,
          },
          audience,
        ),
      )
    })
  }

  if (rows.length) {
    const oldPartImages = oldPartTrace.allImages || []
    rows.push(
      finalizeInventoryRow(
        {
          id: 'part_old_trace',
          label: '旧件留痕',
          importanceLabel: resolveImportanceLabel(EVIDENCE_STRENGTH.RECOMMENDED, audience),
          present: oldPartImages.length > 0,
          thumb: oldPartImages[0] || '',
          images: oldPartImages,
        },
        audience,
      ),
    )
  }

  return { id: 'parts', title: '配件', layout: 'inventory', rows, empty: !rows.length }
}

function buildCompletenessProcessPanel(processItems = [], processImages = [], audience = 'owner') {
  const importance = resolveImportanceLabel(EVIDENCE_STRENGTH.RECOMMENDED, audience)
  const items = processItems.length ? processItems : [{ id: 'process_overall', label: '施工过程' }]
  const rows = items.map((item) =>
    finalizeInventoryRow(
      {
        id: item.id,
        label: item.label,
        importanceLabel: importance,
        present: processImages.length > 0,
        thumb: processImages[0] || '',
        images: processImages,
      },
      audience,
    ),
  )

  return { id: 'process', title: '过程', layout: 'inventory', rows, empty: false }
}

function buildCompletenessOutcomePanel(outcome = {}, audience = 'owner') {
  const importance = resolveImportanceLabel(EVIDENCE_STRENGTH.RECOMMENDED, audience)
  const rows = []
  const completionImages = outcome.completionImages || []

  rows.push(
    finalizeInventoryRow(
      {
        id: 'completion',
        label: '完工效果',
        importanceLabel: importance,
        present: completionImages.length > 0,
        thumb: completionImages[0] || '',
        images: completionImages,
      },
      audience,
    ),
  )

  ;(outcome.comparePairs || []).forEach((pair, index) => {
    const complete = Boolean(pair.beforeUrl && pair.afterUrl)
    const images = [pair.beforeUrl, pair.afterUrl].filter(Boolean)
    rows.push(
      finalizeInventoryRow(
        {
          id: pair.id || `compare_${index}`,
          label: pair.title || `前后对比组 ${index + 1}`,
          importanceLabel: importance,
          present: complete,
          thumb: pair.afterUrl || pair.beforeUrl || '',
          images,
        },
        audience,
      ),
    )
  })

  return { id: 'outcome', title: '完工', layout: 'inventory', rows, empty: !rows.length }
}

function buildCompletenessView(
  detail = {},
  documentItems = [],
  processItems = [],
  outcome = {},
  audience = 'owner',
) {
  const oldPartTrace = collectOldPartTraces(detail)
  const processImages = collectProcessImages(detail)
  const panels = [
    buildCompletenessDocumentPanel(documentItems, audience),
    buildCompletenessPartPanel(detail, oldPartTrace, audience),
    buildCompletenessProcessPanel(processItems, processImages, audience),
    buildCompletenessOutcomePanel(outcome, audience),
  ].filter((panel) => !panel.empty)

  return { summary: countInventoryRows(panels), panels }
}

function buildMethodDocumentPanel(documentItems = [], detail = {}) {
  const { presence } = buildDocumentPresence(documentItems)
  const has = (id) => Boolean(presence[id] && presence[id].uploaded)
  const anchorId = resolveDocumentAnchor(presence)
  const templateId = detail.templateId || ''
  const typeDefs = resolveDocumentTypesForTemplate(templateId)
  const typeIds = new Set(typeDefs.map((def) => def.id))
  const orderedIds = DOCUMENT_TIMELINE_ORDER.filter((id) => typeIds.has(id))
  const missingDocs = orderedIds
    .filter((id) => !has(id))
    .map((id) => ({
      id,
      label: (DOCUMENT_TYPES[id] && DOCUMENT_TYPES[id].label) || id,
    }))
  const preLabel = anchorId === 'loss_assessment' ? '定损单' : '报价单'
  const intro =
    orderedIds.includes('loss_assessment') && anchorId === 'loss_assessment'
      ? '定损单、施工工单、结算单沿施工时间线互相关联：定损定范围，工单对施工，结算对交车费用。建议整组对照，而不是两两分开看。'
      : '报价单、施工工单、结算单沿施工时间线互相关联：报价定方案，工单对施工，结算对交车费用。建议整组对照，而不是两两分开看。'

  const bundle = {
    intro,
    checkGuide: buildDocumentCheckGuide({
      has,
      anchorId,
      preLabel,
      missingDocs,
      totalCount: orderedIds.length,
    }),
  }

  if (missingDocs.length) {
    bundle.missingBlock = buildDocumentMissingBlock(missingDocs, anchorId)
  }

  return {
    id: 'doc_method',
    title: '单据对照',
    layout: 'document-bundle',
    documentBundle: bundle,
    empty: !orderedIds.length || (!bundle.checkGuide && !bundle.missingBlock),
  }
}

function buildDocumentCheckGuide({ has, anchorId, preLabel, missingDocs = [], totalCount = 0 }) {
  const preId = anchorId === 'loss_assessment' ? 'loss_assessment' : 'repair_quote'
  const hasPre = has(preId)
  const hasWork = has('work_order')
  const hasSettle = has('settlement')
  const advice =
    anchorId === 'loss_assessment' ? ADVICE.CONFIRM_INSURER : ADVICE.CONFIRM_STORE
  const ifMismatch = '项目增删、金额变动、结算超范围且无说明。'

  if (missingDocs.length === totalCount) {
    return null
  }

  if (hasPre && hasWork && hasSettle) {
    return {
      howToCheck: `依次对照：① ${preLabel}定了哪些项目与金额；② 工单是否覆盖这些项目；③ 结算是否与前面一致、有无未告知增项。`,
      ifMatch: '正常',
      ifMismatch,
      advice,
    }
  }

  if (hasPre && hasSettle && !hasWork) {
    return {
      howToCheck: `目前已有${preLabel}与结算单，可先核对项目与金额是否一致；补齐施工工单后，建议再核对工单是否覆盖${preLabel}项目。`,
      ifMatch: '正常',
      ifMismatch,
      advice,
    }
  }

  if (hasPre && hasWork && !hasSettle) {
    return {
      howToCheck: `目前已有${preLabel}与施工工单，可先核对工项是否一致；交车时对照结算单，确认实付与项目是否匹配。`,
      ifMatch: '正常',
      ifMismatch,
      advice,
    }
  }

  if (hasPre && !hasWork && !hasSettle) {
    return {
      howToCheck: `目前仅有${preLabel}，可先确认方案与费用；后续补齐工单与结算单，再整组对照。`,
      ifMatch: '正常',
      ifMismatch,
      advice,
    }
  }

  if (!hasPre && (hasWork || hasSettle)) {
    return {
      howToCheck: `目前缺少${preLabel}，可先查看已有单据；建议向门店索取${preLabel}后再与工单、结算整组对照。`,
      ifMatch: '正常',
      ifMismatch,
      advice,
    }
  }

  return {
    howToCheck: '按施工前 → 施工中 → 交车时的顺序，把已有单据放在一起看项目与金额是否连贯。',
    ifMatch: '正常',
    ifMismatch,
    advice,
  }
}

function buildDocumentMissingBlock(missingDocs, anchorId) {
  const missingIds = missingDocs.map((doc) => doc.id)
  const risks = []
  const actions = []

  if (missingIds.includes('loss_assessment') && anchorId === 'loss_assessment') {
    risks.push('缺少定损单时，无法以保险核损结果为基准核对后续施工与结算。')
    actions.push('向门店或保险公司索取定损单')
  }
  if (missingIds.includes('repair_quote')) {
    risks.push('缺少报价单时，无法核对门店是否按事先约定的方案与费用施工。')
    actions.push('向门店索取维修报价单或方案说明')
  }
  if (missingIds.includes('work_order')) {
    risks.push('缺少施工工单时，无法核对报价/定损项目是否落实到施工，结算项目也难以逐项核实。')
    actions.push('向门店索取施工工单')
  }
  if (missingIds.includes('settlement')) {
    risks.push('缺少结算单时，无法核对交车费用是否与报价/工单一致。')
    actions.push('向门店索取维修结算单')
  }

  const uniqueActions = [...new Set(actions)]

  return {
    riskHint:
      risks.join('') ||
      `部分单据缺失，对照暂时无法完整进行。`,
    actionHint: uniqueActions.length
      ? `${uniqueActions.join('；')}。`
      : `向门店索取缺失单据。`,
  }
}

function buildMethodPartPanel(detail = {}, oldPartTrace = {}, documentItems = []) {
  const planParts = normalizePlanParts(detail.planParts || [])
  const albumParts = normalizeAlbumParts(detail.parts || [])
  const structured = hasStructuredPlanParts(detail.planParts, detail.planPartsLockedAt)
  const { pairs, extras } = buildPartVerifyPairs(planParts, albumParts)
  const { presence } = buildDocumentPresence(documentItems)
  const hasWork = Boolean(presence.work_order && presence.work_order.uploaded)
  const { traces, allImages } = oldPartTrace
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
        missingHints: {
          left: {
            risk: '没有维修方案，无法以方案为基准核对实际更换的配件。',
            action: '向门店索取维修方案或报价说明。',
          },
          right: {
            risk: '相册未登记配件，无法对照方案核对实际更换情况。',
            action: '向门店确认更换清单，并补录配件登记与凭证图。',
          },
          both: {
            risk: '方案与登记均缺，配件对照暂时无法进行。',
            action: '向门店索取维修方案并补录配件登记。',
          },
        },
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
        missingHints: {
          right: {
            risk: '没有配件凭证图，无法核对包装、标签与登记是否一致。',
            action: '向门店索取配件外观、包装或编码照片。',
          },
        },
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
    const linkedTraces = traces.filter((trace) => trace.planPartId)
    const unlinkedImages = traces
      .filter((trace) => !trace.planPartId)
      .flatMap((trace) => trace.images)

    linkedTraces.forEach((trace) => {
      const partName = resolveTracePartLabel(trace, pairs, planParts)
      const pair = findPairForTrace(trace, pairs)
      const hasCredential = Boolean(pair && pair.albumPart && pair.albumPart.thumbUrl)
      methodRows.push(
        buildMethodRow({
          id: `old_part_${trace.planPartId || trace.id}`,
          leftLabel: partName,
          rightLabel: '旧件图',
          leftOk: hasCredential,
          rightOk: trace.images.length > 0,
          howToCheck: hasWork
            ? '对照新件凭证、旧件图与施工工单是否为同一换件项'
            : '对照新件凭证与旧件图；建议结合施工工单整组查看',
          ifMismatch: '旧件与登记换件项不对应，存在以修代换风险',
          advice: ADVICE.CONFIRM_STORE,
          missingHints: {
            right: {
              risk: '该换件项缺少旧件留痕，无法确认是否真的更换。',
              action: '向门店索取该配件旧件外观或拆下过程照片。',
            },
            left: {
              risk: '该换件项缺少新件凭证图，无法与旧件图对照。',
              action: '向门店索取配件包装、标签或编码照片。',
            },
          },
        }),
      )
    })

    if (unlinkedImages.length) {
      methodRows.push(
        buildMethodRow({
          id: 'old_part_unlinked',
          leftLabel: hasWork ? '施工工单' : '换件登记',
          rightLabel: '旧件图（未关联）',
          leftOk: hasWork || albumParts.length > 0,
          rightOk: unlinkedImages.length > 0,
          howToCheck: '未关联具体配件的旧件图，可先整体查看是否有拆下留痕',
          ifMismatch: '旧件图与工单或登记项难以逐项对应',
          advice: ADVICE.CONFIRM_STORE,
        }),
      )
    }

    if (!allImages.length) {
      methodRows.push(
        buildMethodRow({
          id: 'old_part_missing',
          leftLabel: '换件项',
          rightLabel: '旧件留痕',
          leftOk: true,
          rightOk: false,
          howToCheck: '声称更换是否留有旧件或拆下照片',
          ifMismatch: '以修代换、未真换',
          advice: ADVICE.CONFIRM_STORE,
          missingHints: {
            right: {
              risk: '没有旧件留痕，无法确认配件是否真的更换，存在以修代换风险。',
              action: '向门店确认更换情况，并索取旧件外观或拆下过程照片。',
            },
          },
        }),
      )
    }
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
        missingHints: {
          right: {
            risk: '没有施工过程照片，无法核对工单工项是否确有施工留痕。',
            action: '向门店索取对应环节的过程照片。',
          },
        },
      }),
    )
  } else if (has('work_order') && !processImages.length) {
    methodRows.push(
      buildMethodRow({
        id: 'work_process',
        leftLabel: '施工工单',
        rightLabel: '过程图',
        leftOk: true,
        rightOk: false,
        missingHints: {
          right: {
            risk: '没有施工过程照片，无法核对工单工项是否确有施工留痕。',
            action: '向门店索取对应环节的过程照片。',
          },
        },
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
  const oldPartTrace = collectOldPartTraces(detail)
  const processImages = collectProcessImages(detail)
  const panels = [
    buildMethodDocumentPanel(documentItems, detail),
    buildMethodPartPanel(detail, oldPartTrace, documentItems),
    buildMethodCrossPanel(documentItems, detail, processImages),
    buildMethodOutcomePanel(outcome),
  ].filter((panel) => !panel.empty)

  return { panels }
}

function buildInspectionViews(
  detail = {},
  documentItems = [],
  processItems = [],
  outcome = {},
  options = {},
) {
  const audience = options.audience || 'owner'
  return {
    completeness: buildCompletenessView(detail, documentItems, processItems, outcome, audience),
    method: buildMethodView(detail, documentItems, processItems, outcome),
  }
}

module.exports = {
  MATRIX_STATUS,
  buildInspectionViews,
  buildCompletenessView,
  buildMethodView,
  collectOldPartTraces,
  collectProcessImages,
}
