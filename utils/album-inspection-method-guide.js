/**
 * 相册检查 ·「检查方法」Tab 三段式段落文案（车主视角）
 */
const {
  buildPartVerifyPairs,
  normalizePlanParts,
  normalizeAlbumParts,
  hasStructuredPlanParts,
} = require('./album-part-pairs')
const { PART_TYPE } = require('../constants/part-type')
const { DOCUMENT_TYPES, resolveDocumentTypesForTemplate } = require('../constants/album-evidence-guide')
const {
  collectOldPartTraces,
  buildDocumentPresence,
  resolveDocumentAnchor,
} = require('./album-inspection-matrix')

const DOC_ORDER = ['loss_assessment', 'repair_quote', 'work_order', 'settlement']

function docLabel(id) {
  return (DOCUMENT_TYPES[id] && DOCUMENT_TYPES[id].label) || id
}

function body(text) {
  return { tone: 'body', text: String(text || '').trim() }
}

function issue(text) {
  return { tone: 'issue', text: String(text || '').trim() }
}

function action(text) {
  return { tone: 'action', text: String(text || '').trim() }
}

function buildDocumentsSection(documentItems = [], detail = {}) {
  const { presence } = buildDocumentPresence(documentItems)
  const has = (id) => Boolean(presence[id] && presence[id].uploaded)
  const templateId = detail.templateId || ''
  const typeIds = new Set(resolveDocumentTypesForTemplate(templateId).map((d) => d.id))
  const orderedIds = DOC_ORDER.filter((id) => typeIds.has(id))
  const anchorId = resolveDocumentAnchor(presence)
  const isAccident = anchorId === 'loss_assessment'
  const preId = isAccident ? 'loss_assessment' : 'repair_quote'
  const preLabel = docLabel(preId)

  const present = orderedIds.filter((id) => has(id)).map((id) => docLabel(id))
  const missing = orderedIds.filter((id) => !has(id)).map((id) => docLabel(id))

  const paragraphs = []

  if (!orderedIds.length) {
    return {
      id: 'documents',
      title: '一、单据互相对比',
      paragraphs: [body('本相册类型暂无标准单据对照项。')],
    }
  }

  if (isAccident) {
    paragraphs.push(
      body(
        '事故维修建议按顺序对照三张单：定损单（保险赔什么）→ 施工工单（实际做了什么）→ 结算单（最后收多少）。三份放一起看，比单张看更容易发现问题。',
      ),
    )
  } else {
    paragraphs.push(
      body(
        '建议按顺序对照三张单：报价单（说好做什么、多少钱）→ 施工工单（实际做了什么）→ 结算单（交车时付多少）。三份放一起看，比单张看更容易发现问题。',
      ),
    )
  }

  if (present.length) {
    paragraphs.push(body(`相册里已有：${present.join('、')}。`))
  }

  if (missing.length) {
    paragraphs.push(issue(`相册里还缺：${missing.join('、')}。`))
    if (missing.includes('报价单') || missing.includes('定损单')) {
      paragraphs.push(
        issue(
          `没有${preLabel}，就没法核对门店是不是按事先说好的项目和价格施工，结算单上的项目也难判断是否合理。`,
        ),
      )
    }
    if (missing.includes('施工工单')) {
      paragraphs.push(
        issue('没有施工工单，没法核对报价/定损里的项目有没有真的做，也容易在结算时出现说不清的项目。'),
      )
    }
    if (missing.includes('维修结算单')) {
      paragraphs.push(issue('没有结算单，没法核对交车时付的钱是否和报价、工单一致。'))
    }
    paragraphs.push(
      action(`向门店要缺失的单据${isAccident && missing.includes('定损单') ? '；定损单也可向保险公司索取' : ''}。`),
    )
  }

  if (has(preId) && has('work_order') && has('settlement')) {
    paragraphs.push(
      body(
        `核对时重点看：① ${preLabel}列了哪些项目、多少钱；② 工单是否按${preLabel}施工；③ 结算实付是否一致、有没有额外项目。`,
      ),
    )
    paragraphs.push(
      issue(
        '若项目对不上、金额突然增加，或结算里出现报价/工单没有的项目，要当场问清楚，避免多付或做了不知情的服务。',
      ),
    )
  } else if (has(preId) && has('settlement') && !has('work_order')) {
    paragraphs.push(
      body(`可先对照${preLabel}和结算单的项目与金额；补上施工工单后，再核对工单是否覆盖了${preLabel}里的项目。`),
    )
    paragraphs.push(issue('缺工单时，无法确认中间施工环节是否与报价一致。'))
  } else if (has(preId) && has('work_order') && !has('settlement')) {
    paragraphs.push(
      body(`可先对照${preLabel}和施工工单的项目；交车时务必对照结算单，看实付是否匹配。`),
    )
  } else if (has(preId) && !has('work_order') && !has('settlement')) {
    paragraphs.push(body(`目前只有${preLabel}，先确认项目和费用是否和你认可的一致；工单、结算补全后再整组对照。`))
  }

  return {
    id: 'documents',
    title: '一、单据互相对比',
    paragraphs,
  }
}

function buildOldPartsSection(detail = {}, documentItems = []) {
  const albumParts = normalizeAlbumParts(detail.parts || [])
  const planParts = normalizePlanParts(detail.planParts || [])
  const { pairs } = buildPartVerifyPairs(planParts, albumParts)
  const { presence } = buildDocumentPresence(documentItems)
  const hasWork = Boolean(presence.work_order && presence.work_order.uploaded)
  const { traces, allImages } = collectOldPartTraces(detail)

  const replaceParts = pairs.filter(
    (p) =>
      p.albumPart &&
      p.albumPart.partType !== PART_TYPE.REPAIR_INSTEAD_REPLACE,
  )
  const repairOnly = pairs.filter(
    (p) => p.albumPart && p.albumPart.partType === PART_TYPE.REPAIR_INSTEAD_REPLACE,
  )

  const paragraphs = []

  paragraphs.push(
    body(
      '这一项看的是：门店说「换了件」，有没有旧件或拆下来的照片作证明。相册里的照片不能代替实车查看，关键配件最好到店让门店展示旧件，或更换时你在场确认。',
    ),
  )

  if (!albumParts.length && !planParts.length) {
    paragraphs.push(body('本相册暂无更换类配件记录，如无换件可跳过此项。'))
    return { id: 'old_parts', title: '二、旧件与单据对比', paragraphs }
  }

  if (repairOnly.length) {
    const names = repairOnly
      .map((p) => (p.albumPart && p.albumPart.name) || '')
      .filter(Boolean)
      .join('、')
    if (names) {
      paragraphs.push(
        body(`门店标注「只修没换」的配件：${names}。对照施工过程照片，看实际维修范围是否和你沟通的一致。`),
      )
    }
  }

  if (!allImages.length && (replaceParts.length || albumParts.length)) {
    paragraphs.push(
      issue(
        '相册登记了更换配件，但没有旧件或拆件照片。无法确认是否真的更换，存在只修不换、以次充好等风险。',
      ),
    )
    paragraphs.push(
      action('向门店确认是否更换，并请补旧件照片；更稳妥的是到店查看旧件实物，或更换时在场见证。'),
    )
  } else if (allImages.length) {
    const linked = traces.filter((t) => t.planPartId)
    const unlinked = traces.filter((t) => !t.planPartId)

    if (linked.length) {
      paragraphs.push(
        body(
          hasWork
            ? '有旧件照片时，请对照新件照片、旧件照片和施工工单，看是不是同一件配件。'
            : '有旧件照片时，请对照新件照片和旧件照片；有施工工单的话一起看更清楚。',
        ),
      )
      paragraphs.push(
        issue('若旧件照片对不上说的那件配件，或新旧件明显不配套，要警惕是否真的换了、是否换对件。'),
      )
    }

    if (unlinked.length) {
      paragraphs.push(
        issue(
          `有 ${unlinked.length} 张旧件照片未标明对应哪件配件，只能先整体看有没有拆件痕迹，难以逐项核对。`,
        ),
      )
      paragraphs.push(action('向门店确认每张照片对应哪件配件，或请其补全说明。'))
    }
  }

  paragraphs.push(
    body('相册无法证明配件已装到车上。涉及刹车、转向、电池等关键件，建议实车检查或更换时在场。'),
  )

  return { id: 'old_parts', title: '二、旧件与单据对比', paragraphs }
}

function buildNewPartsSection(detail = {}, documentItems = [], options = {}) {
  const planParts = normalizePlanParts(detail.planParts || [])
  const albumParts = normalizeAlbumParts(detail.parts || [])
  const structured = hasStructuredPlanParts(detail.planParts, detail.planPartsLockedAt)
  const { pairs, extras } = buildPartVerifyPairs(planParts, albumParts)
  const showPartVerify = Boolean(options.showPartVerify)

  const paragraphs = []

  paragraphs.push(
    body(
      '这一项看的是：实际用的配件，是否和报价单里列的一致——件名、数量、类型（原厂/品牌/拆车等）是否对得上。',
    ),
  )

  if (!planParts.length && !albumParts.length) {
    paragraphs.push(body('本相册暂无配件清单，可向门店索取报价单中的配件明细后再核对。'))
    return { id: 'new_parts', title: '三、新配件与单据', paragraphs }
  }

  let planOnly = 0
  let typeMismatch = 0
  const planOnlyNames = []
  pairs.forEach((pair) => {
    if (pair.linkStatus === 'plan_only') {
      planOnly += 1
      if (pair.planPart && pair.planPart.name) planOnlyNames.push(pair.planPart.name)
    }
    if (pair.fieldDiffs && pair.fieldDiffs.includes('partType')) typeMismatch += 1
  })

  if (planParts.length && (!albumParts.length || planOnly > 0)) {
    if (!albumParts.length) {
      paragraphs.push(
        issue('报价里列了配件，但相册还没有录入实际换了哪些。无法核对是否按报价更换。'),
      )
      paragraphs.push(action('向门店确认更换清单，并请把实际换件信息和照片补传到相册。'))
    } else if (planOnlyNames.length) {
      paragraphs.push(
        issue(
          `报价里有、相册里还没对应记录的配件：${planOnlyNames.join('、')}。可能存在漏换，或换了但没录入。`,
        ),
      )
      paragraphs.push(action('向门店逐项确认上述配件是否已更换。'))
    }
  }

  if (extras.length) {
    const extraNames = extras
      .map((p) => (p.albumPart && p.albumPart.name) || '')
      .filter(Boolean)
    paragraphs.push(
      issue(
        extraNames.length
          ? `相册里多了报价没有的配件：${extraNames.join('、')}。可能是未经确认的增项。`
          : '相册里有报价单未列出的配件，可能是未经确认的增项。',
      ),
    )
    paragraphs.push(action('向门店确认这些配件是否在报价或工单里，是否为额外收费项目。'))
  }

  if (typeMismatch > 0) {
    paragraphs.push(
      issue('有配件的类型（原厂/品牌/拆车等）与报价告知不一致，可能未按约定品质更换。'),
    )
    paragraphs.push(action('对照配件照片和报价，向门店确认实际使用的配件类型。'))
  }

  const noPhoto = albumParts.filter((p) => !p.thumbUrl)
  if (albumParts.length && noPhoto.length === albumParts.length) {
    paragraphs.push(issue('配件信息已录入，但没有配件照片，无法核对包装、标签是否和文字一致。'))
    paragraphs.push(action('向门店要配件外观、包装或编码照片。'))
  } else if (noPhoto.length > 0) {
    const names = noPhoto.map((p) => p.name).filter(Boolean).join('、')
    paragraphs.push(issue(`以下配件缺少照片：${names}。`))
    paragraphs.push(action('向门店索取对应配件的凭证照片。'))
  }

  if (
    structured &&
    albumParts.length &&
    planOnly === 0 &&
    !extras.length &&
    typeMismatch === 0 &&
    noPhoto.length === 0
  ) {
    paragraphs.push(body('报价配件与相册登记基本一致。仍建议对照配件照片，确认包装、标签与报价类型一致。'))
  }

  if (isAccidentLossContext(detail, documentItems)) {
    paragraphs.push(
      body('事故车还可对照定损单：实际用的配件标准是否和定损要求一致。'),
    )
    paragraphs.push(issue('若用了更低档的件，或定损未批就先换了，可向保险公司核对。'))
  }

  if (showPartVerify) {
    paragraphs.push(
      body('本相册支持「配件验真」：可按门店告知的验真方式，用配件编码自行查询是否与登记一致（平台不鉴定真伪）。'),
    )
  }

  return { id: 'new_parts', title: '三、新配件与单据', paragraphs }
}

function isAccidentLossContext(detail, documentItems) {
  const { presence } = buildDocumentPresence(documentItems)
  return Boolean(presence.loss_assessment && presence.loss_assessment.uploaded)
}

function buildMethodGuideSections(detail = {}, documentItems = [], options = {}) {
  return [
    buildDocumentsSection(documentItems, detail),
    buildOldPartsSection(detail, documentItems),
    buildNewPartsSection(detail, documentItems, options),
  ]
}

function collectGuideIssues(sections = []) {
  const issues = []
  ;(sections || []).forEach((section) => {
    ;(section.paragraphs || []).forEach((para) => {
      if (para.tone === 'issue') issues.push({ label: section.title, text: para.text })
      if (para.tone === 'action') issues.push({ label: section.title, action: para.text })
    })
  })
  return issues
}

module.exports = {
  buildMethodGuideSections,
  collectGuideIssues,
  buildDocumentsSection,
  buildOldPartsSection,
  buildNewPartsSection,
}
