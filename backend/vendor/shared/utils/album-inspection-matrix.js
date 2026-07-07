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
const { buildMethodRow, buildWarnMethodRow, ADVICE, MATCH_OK } = require('./album-inspection-resolutions')
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
      ? '按顺序看：定损单（赔什么）→ 施工工单（做了什么）→ 结算单（付多少）。三份放一起看，比单张看更容易发现问题。'
      : '按顺序看：报价单（做什么、多少钱）→ 施工工单（做了什么）→ 结算单（付多少）。三份放一起看，比单张看更容易发现问题。'

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
    title: '单据怎么对',
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
  const ifMismatch = '项目或金额对不上，或有报价里没说的增项。'

  if (missingDocs.length === totalCount) {
    return null
  }

  if (hasPre && hasWork && hasSettle) {
    return {
      howToCheck: `① 看${preLabel}：做哪些项目、多少钱；② 看工单：是不是按${preLabel}施工；③ 看结算：实付是否一致、有无额外项目。`,
      ifMatch: MATCH_OK,
      ifMismatch,
      advice,
    }
  }

  if (hasPre && hasSettle && !hasWork) {
    return {
      howToCheck: `先看${preLabel}和结算：项目和钱是否一致；有施工工单后，再核对工单是否覆盖了${preLabel}里的项目。`,
      ifMatch: MATCH_OK,
      ifMismatch,
      advice,
    }
  }

  if (hasPre && hasWork && !hasSettle) {
    return {
      howToCheck: `先看${preLabel}和工单：项目是否一致；交车时对照结算单，看实付是否匹配。`,
      ifMatch: MATCH_OK,
      ifMismatch,
      advice,
    }
  }

  if (hasPre && !hasWork && !hasSettle) {
    return {
      howToCheck: `目前只有${preLabel}，先确认项目和费用；工单、结算补全后再一起看。`,
      ifMatch: MATCH_OK,
      ifMismatch,
      advice,
    }
  }

  if (!hasPre && (hasWork || hasSettle)) {
    return {
      howToCheck: `还缺${preLabel}，先看已有的单；建议向门店要${preLabel}，再和工单、结算一起对。`,
      ifMatch: MATCH_OK,
      ifMismatch,
      advice,
    }
  }

  return {
    howToCheck: '按「施工前 → 施工中 → 交车时」的顺序，把已有单据放一起看项目和金额是否连贯。',
    ifMatch: MATCH_OK,
    ifMismatch,
    advice,
  }
}

function buildDocumentMissingBlock(missingDocs, anchorId) {
  const missingIds = missingDocs.map((doc) => doc.id)
  const risks = []
  const actions = []

  if (missingIds.includes('loss_assessment') && anchorId === 'loss_assessment') {
    risks.push('没有定损单，没法按保险定的范围核对后面做了什么、收了多少钱。')
    actions.push('向门店或保险公司要定损单')
  }
  if (missingIds.includes('repair_quote')) {
    risks.push('没有报价单，没法核对门店是不是按事先说好的项目和价格施工。')
    actions.push('向门店要维修报价单')
  }
  if (missingIds.includes('work_order')) {
    risks.push('没有施工工单，没法核对报价里的项目有没有真的做，结算也难逐项看。')
    actions.push('向门店要施工工单')
  }
  if (missingIds.includes('settlement')) {
    risks.push('没有结算单，没法核对交车时付的钱是否和报价、工单一致。')
    actions.push('向门店要结算单')
  }

  const uniqueActions = [...new Set(actions)]

  return {
    riskHint:
      risks.join('') ||
      '部分单据缺失，暂时没法完整核对。',
    actionHint: uniqueActions.length
      ? `${uniqueActions.join('；')}。`
      : '问门店要缺失的单据。',
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
        leftLabel: '报价里的配件',
        rightLabel: '实际换的配件',
        leftOk: planParts.length > 0,
        rightOk: albumParts.length > 0 && !planOnly,
        howToCheck: '看报价里列了哪些件，相册里实际换的是不是同一批，数量对不对。',
        ifMismatch: '该换的没换，或多了报价里没有的件',
        advice: ADVICE.CONFIRM_STORE,
        missingHints: {
          left: {
            risk: '没有报价里的配件清单，没法按「说好换什么」来核对。',
            action: '向门店要报价单或配件清单。',
          },
          right: {
            risk: '相册里还没录入实际换了哪些配件，没法和报价对比。',
            action: '向门店确认换了哪些件，并请补传到相册。',
          },
          both: {
            risk: '报价和实际换件信息都缺，配件暂时没法核对。',
            action: '向门店要报价，并补传实际换件信息和照片。',
          },
        },
      }),
    )
  }

  if (extras.length) {
    methodRows.push(
      buildWarnMethodRow({
        id: 'extra_parts',
        label: '报价外的配件',
        howToCheck: '看这些配件是否在报价单或工单里',
        ifMismatch: '报价里没说过这项',
        advice: ADVICE.CONFIRM_STORE,
      }),
    )
  }

  if (albumParts.length) {
    methodRows.push(
      buildMethodRow({
        id: 'album_photo',
        leftLabel: '配件信息',
        rightLabel: '配件照片',
        leftOk: albumParts.length > 0,
        rightOk: albumParts.some((p) => p.thumbUrl),
        howToCheck: '看照片里的包装、标签、编码，是否和相册里写的配件一致。',
        ifMismatch: '照片对不上，或没有照片',
        advice: ADVICE.CONFIRM_STORE,
        missingHints: {
          right: {
            risk: '没有配件照片，没法核对包装、标签是否和文字信息一致。',
            action: '向门店要配件外观、包装或编码照片。',
          },
        },
      }),
    )
  }

  if (typeMismatch > 0) {
    methodRows.push(
      buildWarnMethodRow({
        id: 'type_mismatch',
        label: '配件类型是否一致',
        howToCheck: '对照照片和报价：原厂/品牌/拆车件是否和说好的一样',
        ifMismatch: '和告知的类型不一样',
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
          rightLabel: '旧件照片',
          leftOk: hasCredential,
          rightOk: trace.images.length > 0,
          howToCheck: hasWork
            ? '看新件照片、旧件照片、施工工单，是不是说的同一件'
            : '看新件照片和旧件照片是否对得上；有工单的话一起看更清楚',
          ifMismatch: '旧件照片对不上说的那件，要留意是否真换了',
          advice: ADVICE.CONFIRM_STORE,
          missingHints: {
            right: {
              risk: '没有旧件照片，没法确认这件配件是不是真的换过。',
              action: '向门店要旧件或拆下来的照片。',
            },
            left: {
              risk: '没有新件照片，没法和旧件照片对照。',
              action: '向门店要配件包装、标签或编码照片。',
            },
          },
        }),
      )
    })

    if (unlinkedImages.length) {
      methodRows.push(
        buildMethodRow({
          id: 'old_part_unlinked',
          leftLabel: hasWork ? '施工工单' : '换件清单',
          rightLabel: '旧件照片（未标明对应哪件）',
          leftOk: hasWork || albumParts.length > 0,
          rightOk: unlinkedImages.length > 0,
          howToCheck: '这些旧件照片没标明对应哪件配件，可以先整体看有没有拆下来的痕迹',
          ifMismatch: '旧件照片和工单/清单对不上号',
          advice: ADVICE.CONFIRM_STORE,
        }),
      )
    }

    if (!allImages.length) {
      methodRows.push(
        buildMethodRow({
          id: 'old_part_missing',
          leftLabel: '换件项目',
          rightLabel: '旧件照片',
          leftOk: true,
          rightOk: false,
          howToCheck: '说换了件，最好有旧件或拆下来的照片',
          ifMismatch: '可能只修没换',
          advice: ADVICE.CONFIRM_STORE,
          missingHints: {
            right: {
              risk: '没有旧件照片，没法确认配件是不是真的换过。',
              action: '向门店确认是否更换，并请补旧件或拆件照片。',
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
          label: `${pair.albumPart.name || '配件'} · 只修没换`,
          howToCheck: '对照过程照片，看实际修了什么',
          ifMismatch: '和沟通的范围不一致',
          advice: ADVICE.CONFIRM_STORE,
        }),
      )
    }
  })

  return {
    id: 'part_method',
    title: '配件怎么对',
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
        howToCheck: '看定损允许的配件标准，和相册里实际用的是否一致',
        ifMismatch: '用了更低档的件，或没批就先换了',
        advice: ADVICE.CONFIRM_INSURER,
      }),
    )
  }

  if (has('work_order') && processImages.length) {
    methodRows.push(
      buildMethodRow({
        id: 'work_process',
        leftLabel: '施工工单',
        rightLabel: '过程照片',
        leftOk: has('work_order'),
        rightOk: processImages.length > 0,
        howToCheck: '看工单上的项目，有没有对应的过程照片',
        ifMismatch: '该拍的过程没有，或项目和照片对不上',
        advice: ADVICE.CONFIRM_STORE,
        missingHints: {
          right: {
            risk: '没有过程照片，没法核对工单上的项目是不是真的做了。',
            action: '向门店要对应环节的过程照片。',
          },
        },
      }),
    )
  } else if (has('work_order') && !processImages.length) {
    methodRows.push(
      buildMethodRow({
        id: 'work_process',
        leftLabel: '施工工单',
        rightLabel: '过程照片',
        leftOk: true,
        rightOk: false,
        missingHints: {
          right: {
            risk: '没有过程照片，没法核对工单上的项目是不是真的做了。',
            action: '向门店要对应环节的过程照片。',
          },
        },
      }),
    )
  }

  return {
    id: 'cross_method',
    title: '还可以这样看',
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
        label: '修前修后对比',
        leftOk: true,
        rightOk: true,
        howToCheck: '同一角度对比：损伤处是否修好',
        ifMismatch: '还有没修到的，或修得不够',
        advice: ADVICE.CONFIRM_STORE,
      }),
    )
  }
  if ((outcome.completionImages || []).length) {
    methodRows.push(
      buildMethodRow({
        id: 'completion_check',
        label: '修完后 与 进店时',
        leftOk: true,
        rightOk: true,
        howToCheck: '对照进店时的损伤照片和完工照片，看外观是否恢复',
        ifMismatch: '外观没恢复，或范围和工单不一致',
        advice: ADVICE.CONFIRM_STORE,
      }),
    )
  }
  return {
    id: 'outcome_method',
    title: '交车效果',
    layout: 'method',
    methodRows,
    empty: !methodRows.length,
    outcome,
  }
}

function buildMethodView(detail = {}, documentItems = [], processItems = [], outcome = {}, options = {}) {
  const { buildMethodGuideSections } = require('./album-inspection-method-guide')
  const sections = buildMethodGuideSections(detail, documentItems, {
    showPartVerify: Boolean(options.showPartVerify),
  })
  return { sections }
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
    method: buildMethodView(detail, documentItems, processItems, outcome, options),
  }
}

module.exports = {
  MATRIX_STATUS,
  buildInspectionViews,
  buildCompletenessView,
  buildMethodView,
  collectOldPartTraces,
  collectProcessImages,
  buildDocumentPresence,
  resolveDocumentAnchor,
}
