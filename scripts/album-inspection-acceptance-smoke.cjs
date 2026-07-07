/**
 * U-ALB-INSP-04 · 检查页验收冒烟（静态规则）
 * 运行：node scripts/album-inspection-acceptance-smoke.cjs
 */
const assert = require('assert')
const { buildAlbumInspectionView } = require('../utils/album-inspection-view')
const { collectOldPartTraces, collectProcessImages } = require('../utils/album-inspection-matrix')
const { buildMethodGuideSections } = require('../utils/album-inspection-method-guide')
const {
  AI_INSPECTION_DISCLAIMER,
  AI_INSPECTION_EVIDENCE_LIMIT_LINES,
  AI_INSPECTION_CONSENT,
  COMPLETENESS_TAB_HINT,
  METHOD_TAB_HINT,
} = require('../constants/album-evidence-guide')
const { buildOldPartEvidenceItems } = require('../utils/album-evidence-items')
const { buildDocumentItems } = require('../utils/album-inspection-view')
const {
  buildRuleBasedAdvice,
  buildLlmSystemPrompt,
  normalizeAdvicePayload,
} = require('../utils/album-inspection-advice')
const {
  buildInspectionTimelineContext,
  collectVisionImageCandidates,
} = require('../utils/album-inspection-context')

let passed = 0
let failed = 0

function ok(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed += 1
    console.error(`  ✗ ${name}`)
    console.error(`    ${err.message}`)
  }
}

function baseDetail(overrides = {}) {
  return {
    templateId: 'default',
    serviceName: '刹车片更换',
    planParts: [{ planPartId: 'plan_1', name: '前刹车片' }],
    parts: [
      {
        partId: 'p1',
        planPartId: 'plan_1',
        partName: '前刹车片',
        photos: ['https://cdn.example/new.jpg'],
      },
    ],
    evidenceItems: [
      {
        id: 'repair_quote',
        category: 'document',
        stageId: 'stage_3',
        label: '维修报价单',
        images: ['https://cdn.example/quote.jpg'],
      },
      {
        id: 'work_order',
        category: 'document',
        stageId: 'stage_5',
        label: '施工工单',
        images: ['https://cdn.example/wo.jpg'],
      },
      {
        id: 'settlement',
        category: 'document',
        stageId: 'stage_6',
        label: '维修结算单',
        images: ['https://cdn.example/settle.jpg'],
      },
      ...buildOldPartEvidenceItems([
        { traceKey: 't1', images: ['https://cdn.example/old.jpg'], planPartId: 'plan_1' },
      ]),
    ],
    nodes: [
      { id: 'stage_3', images: ['https://cdn.example/quote.jpg'] },
      {
        id: 'stage_5',
        images: [
          'https://cdn.example/old.jpg',
          'https://cdn.example/proc.jpg',
          'https://cdn.example/wo.jpg',
        ],
      },
      { id: 'stage_6', images: ['https://cdn.example/settle.jpg', 'https://cdn.example/done.jpg'] },
    ],
    ...overrides,
  }
}

function allInventoryRows(view) {
  return (view.completeness.panels || []).flatMap((panel) => panel.rows || [])
}

function methodSections(view) {
  return view.method.sections || []
}

console.log('U-ALB-INSP-04 album-inspection acceptance smoke\n')

ok('完整性 Tab 行含 ✓/× 与重要度', () => {
  const view = buildAlbumInspectionView(baseDetail())
  const rows = allInventoryRows(view)
  assert(rows.length > 0, 'expected inventory rows')
  rows.forEach((row) => {
    assert(['✓', '×'].includes(row.statusSymbol), `bad symbol for ${row.id}`)
    assert(row.importanceLabel, `missing importance for ${row.id}`)
    assert(!row.riskHint, `completeness row must not expose riskHint: ${row.id}`)
    assert(!row.howToCheck, `completeness row must not expose howToCheck: ${row.id}`)
  })
})

ok('完整性 Tab 含「旧件留痕」且读 structured old_part', () => {
  const view = buildAlbumInspectionView(baseDetail())
  const partsPanel = view.completeness.panels.find((p) => p.id === 'parts')
  const oldRow = (partsPanel.rows || []).find((r) => r.id === 'part_old_trace')
  assert(oldRow, 'missing part_old_trace row')
  assert.equal(oldRow.label, '旧件留痕')
  assert.equal(oldRow.present, true)
  assert.deepEqual(oldRow.images, ['https://cdn.example/old.jpg'])
})

ok('过程图与旧件分桶', () => {
  const detail = baseDetail()
  assert.deepEqual(collectOldPartTraces(detail).allImages, ['https://cdn.example/old.jpg'])
  assert.deepEqual(collectProcessImages(detail), ['https://cdn.example/proc.jpg'])
})

ok('方法 Tab 为三段式段落', () => {
  const view = buildAlbumInspectionView(baseDetail())
  const sections = methodSections(view)
  assert.equal(sections.length, 3, 'expected 3 method sections')
  assert.equal(sections[0].id, 'documents')
  assert.equal(sections[1].id, 'old_parts')
  assert.equal(sections[2].id, 'new_parts')
  sections.forEach((section) => {
    assert(section.paragraphs && section.paragraphs.length > 0, `empty paragraphs: ${section.id}`)
    section.paragraphs.forEach((para) => {
      assert(['body', 'issue', 'action'].includes(para.tone), `bad tone in ${section.id}`)
    })
  })
})

ok('方法 Tab 缺单据时输出 issue 段落', () => {
  const detail = baseDetail({
    evidenceItems: [],
    nodes: [],
    parts: [],
    planParts: [],
  })
  const view = buildAlbumInspectionView(detail)
  const docSection = methodSections(view).find((s) => s.id === 'documents')
  assert(docSection, 'expected documents section')
  const issues = docSection.paragraphs.filter((p) => p.tone === 'issue')
  assert(issues.length > 0, 'expected issue paragraphs when docs missing')
  const invRows = allInventoryRows(view)
  invRows.forEach((row) => {
    assert(!row.actionHint, 'inventory must not contain actionHint')
  })
})

ok('方法 Tab 缺配件登记时输出 issue 段落', () => {
  const detail = baseDetail({ parts: [] })
  const documentItems = buildDocumentItems(detail)
  const sections = buildMethodGuideSections(detail, documentItems, { showPartVerify: false })
  const newSection = sections.find((s) => s.id === 'new_parts')
  const issues = newSection.paragraphs.filter((p) => p.tone === 'issue')
  assert(issues.some((p) => /报价|换了哪些/.test(p.text)), 'expected plan vs album issue')
})

ok('方法 Tab 建议文案合规前缀', () => {
  const view = buildAlbumInspectionView(baseDetail({ parts: [] }))
  const sections = methodSections(view)
  sections.forEach((section) => {
    section.paragraphs
      .filter((p) => p.tone === 'action')
      .forEach((para) => {
        assert(
          /向门店|向保险公司/.test(para.text),
          `action out of compliance: ${para.text}`,
        )
      })
  })
})

ok('事故车定损锚点文案', () => {
  const detail = baseDetail({
    templateId: 'accident',
    evidenceItems: [
      {
        id: 'loss_assessment',
        category: 'document',
        stageId: 'stage_3',
        label: '定损单',
        images: ['https://cdn.example/loss.jpg'],
      },
      {
        id: 'work_order',
        category: 'document',
        stageId: 'stage_5',
        label: '施工工单',
        images: ['https://cdn.example/wo.jpg'],
      },
    ],
    nodes: [
      { id: 'stage_3', images: ['https://cdn.example/loss.jpg'] },
      { id: 'stage_5', images: ['https://cdn.example/wo.jpg'] },
    ],
    parts: [],
    planParts: [],
  })
  const view = buildAlbumInspectionView(detail)
  const docSection = methodSections(view).find((s) => s.id === 'documents')
  assert(docSection.paragraphs.some((p) => /定损单/.test(p.text)), 'expected loss anchor copy')
})

ok('AI 免责常量可用于结果区块', () => {
  assert(
    AI_INSPECTION_DISCLAIMER.includes('不构成') || AI_INSPECTION_DISCLAIMER.includes('鉴定'),
    'AI disclaimer should deny legal conclusion',
  )
  assert(
    AI_INSPECTION_CONSENT.includes('配件') || AI_INSPECTION_CONSENT.includes('验真'),
    'consent should mention part verify boundary',
  )
  assert(
    Array.isArray(AI_INSPECTION_EVIDENCE_LIMIT_LINES) && AI_INSPECTION_EVIDENCE_LIMIT_LINES.length >= 2,
    'evidence limit lines should exist',
  )
  assert(
    AI_INSPECTION_EVIDENCE_LIMIT_LINES.some((line) => /造假|作假/.test(line)),
    'evidence limit should mention fraud boundary',
  )
  assert(
    AI_INSPECTION_EVIDENCE_LIMIT_LINES.some((line) => /第三方|鉴定/.test(line)),
    'evidence limit should mention third-party appraisal',
  )
  assert(COMPLETENESS_TAB_HINT.includes('重要度'), 'completeness hint should explain importance')
  assert(METHOD_TAB_HINT.length > 0, 'method hint should exist')
})

ok('AI 建议规则兜底含 overallOpinion 与 partVerifyReminders', () => {
  const detail = baseDetail()
  const advice = buildRuleBasedAdvice(detail)
  assert(advice.overallOpinion && advice.overallOpinion.summary, 'expected overallOpinion.summary')
  assert(advice.overallOpinion.completeness, 'expected overallOpinion.completeness')
  assert(Array.isArray(advice.comparisons), 'expected comparisons array')
  assert(Array.isArray(advice.partVerifyReminders), 'expected partVerifyReminders array')
  assert(
    advice.partVerifyReminders.some((row) => /验真|真伪/.test(row.reason || row.action || '')),
    'expected part verify reminder copy',
  )
})

ok('focusStageId 影响规则兜底 overallOpinion', () => {
  const detail = baseDetail()
  const advice = buildRuleBasedAdvice(detail, { focusStageId: 'stage_5' })
  const text =
    advice.overallOpinion.completeness +
    (advice.focusAreas || []).join('')
  assert(/施工|stage_5|关注/.test(text), 'expected focus hint')
})

ok('LLM system prompt 含六节点与三段式报告结构', () => {
  const prompt = buildLlmSystemPrompt()
  assert(/接车|检测|报价|配件|施工|完工/.test(prompt), 'expected six stages')
  assert(/overallOpinion|comparisons|photoAppendix|limitationNote/.test(prompt), 'expected structured report fields')
  assert(/无效照片/.test(prompt), 'expected invalid photo handling')
  assert(/单据之间|单据.*配件|施工/.test(prompt), 'expected comparison dimensions')
  assert(/不负责|不.*鉴定|验真/.test(prompt), 'expected verify boundary')
  assert(/focusStageId|任意节点/.test(prompt), 'expected any-node trigger guidance')
})

ok('normalizeAdvicePayload 结构化 overallOpinion 与 comparisons', () => {
  const payload = normalizeAdvicePayload(
    {
      overallOpinion: {
        summary: '  总评  ',
        completeness: '较齐全',
        missingItems: ['旧件图'],
        potentialIssues: ['缺旧件'],
        recommendedActions: ['向门店确认'],
      },
      comparisons: [
        { title: '报价与结算', process: '项目一致', conclusion: '基本一致' },
        { title: '', process: '', conclusion: '' },
      ],
      photoAppendix: [
        {
          stageId: 'stage_3',
          stageTitle: '方案',
          photos: [{ label: '报价单', description: '维修报价单', valid: true }],
        },
      ],
      limitationNote: '相册不能杜绝造假',
    },
    'llm',
  )
  assert.equal(payload.overallOpinion.summary, '总评')
  assert.equal(payload.comparisons.length, 1)
  assert.equal(payload.photoAppendix.length, 1)
  assert.equal(payload.summary, '总评')
})

ok('collectVisionImageCandidates 优先 focusStageId 附近', () => {
  const detail = baseDetail()
  const all = collectVisionImageCandidates(detail, { maxImages: 4 })
  const focused = collectVisionImageCandidates(detail, { focusStageId: 'stage_5', maxImages: 4 })
  assert(all.length > 0, 'expected image candidates')
  assert(focused.length > 0, 'expected focused candidates')
  assert(
    focused.some((item) => item.stageId === 'stage_5'),
    'focused list should include focus stage',
  )
})

ok('buildInspectionTimelineContext 含六节点时间线', () => {
  const ctx = buildInspectionTimelineContext(baseDetail(), { focusStageId: 'stage_4' })
  assert.equal(ctx.timeline.length, 6, 'expected 6 stages')
  assert(ctx.focusStageId === 'stage_4' || ctx.focusStageTitle, 'expected focus meta')
})

ok('商家编辑页自检列名「规范」且用必留/建议留', () => {
  const {
    buildMerchantEditInspectionView,
    collectCriticalMissingFromPanels,
  } = require('../utils/album-merchant-inspection')
  const { MERCHANT_INSPECTION_HINT } = require('../constants/album-evidence-guide')
  const view = buildMerchantEditInspectionView({
    detail: { serviceName: '刹车片更换' },
    templateId: 'default',
    nodes: baseDetail().nodes,
    evidenceItems: baseDetail().evidenceItems,
    parts: baseDetail().parts,
    planParts: baseDetail().planParts,
    comparePairRows: [],
  })
  assert.equal(view.importanceColumnLabel, '规范')
  assert(MERCHANT_INSPECTION_HINT.includes('规范'))
  const rows = allInventoryRows(view)
  assert(rows.length > 0, 'expected merchant inventory rows')
  rows.forEach((row) => {
    assert(
      ['必留', '建议留', '可选'].includes(row.importanceLabel),
      `unexpected merchant label: ${row.importanceLabel}`,
    )
    assert(!['关键', '一般'].includes(row.importanceLabel), 'must not use owner labels')
  })
  assert.equal((view.method.sections || []).length, 0, 'merchant view is completeness-only')
  const critical = collectCriticalMissingFromPanels(view.completeness.panels)
  assert(Array.isArray(critical), 'critical missing list')
})

ok('规则 AI 建议含 focusAreas 且 suspectedIssues 为对象数组', () => {
  const { buildRuleBasedAdvice } = require('../utils/album-inspection-advice')
  const advice = buildRuleBasedAdvice(baseDetail({ parts: [] }))
  assert(advice.focusAreas.length > 0, 'expected focusAreas')
  assert.equal(advice.source, 'rule')
  advice.suspectedIssues.forEach((item) => {
    assert(item && typeof item.text === 'string', 'suspectedIssues item shape')
  })
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
