/**
 * U-ALB-INSP-04 · 检查页验收冒烟（静态规则）
 * 运行：node scripts/album-inspection-acceptance-smoke.cjs
 */
const assert = require('assert')
const { buildAlbumInspectionView } = require('../utils/album-inspection-view')
const { collectOldPartTraces, collectProcessImages } = require('../utils/album-inspection-matrix')
const {
  AI_INSPECTION_DISCLAIMER,
  COMPLETENESS_TAB_HINT,
} = require('../constants/album-evidence-guide')
const { buildOldPartEvidenceItems } = require('../utils/album-evidence-items')

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

function allMethodRows(view) {
  return (view.method.panels || []).flatMap((panel) => panel.methodRows || [])
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

ok('方法 Tab 缺项长文仅在 method 面板', () => {
  const view = buildAlbumInspectionView(
    baseDetail({
      evidenceItems: [
        {
          id: 'repair_quote',
          category: 'document',
          stageId: 'stage_3',
          label: '维修报价单',
          images: [],
        },
      ],
      nodes: [{ id: 'stage_3', images: [] }],
      parts: [],
      planParts: [],
    }),
  )
  const invRows = allInventoryRows(view)
  invRows.forEach((row) => {
    assert(!row.actionHint, 'inventory must not contain actionHint')
  })
  const docPanel = view.method.panels.find((p) => p.id === 'doc_method')
  assert(docPanel && docPanel.documentBundle, 'expected document bundle in method tab')
  assert(
    docPanel.documentBundle.missingBlock || docPanel.documentBundle.checkGuide,
    'expected method-side document guidance',
  )
})

ok('方法 Tab 行级旧件对照（planPartId）', () => {
  const view = buildAlbumInspectionView(baseDetail())
  const rows = allMethodRows(view)
  const linked = rows.find((r) => r.id === 'old_part_plan_1')
  assert(linked, 'expected linked old part method row')
  assert(linked.howToCheck, 'expected howToCheck on linked row')
})

ok('方法 Tab 建议文案合规前缀', () => {
  const view = buildAlbumInspectionView(baseDetail())
  const rows = allMethodRows(view)
  rows.forEach((row) => {
    if (row.advice) {
      assert(
        /向门店|向保险公司/.test(row.advice),
        `advice out of compliance: ${row.advice}`,
      )
    }
    if (row.actionHint) {
      assert(
        /向门店|向保险公司/.test(row.actionHint),
        `actionHint out of compliance: ${row.actionHint}`,
      )
    }
  })
  const bundle = view.method.panels.find((p) => p.id === 'doc_method')?.documentBundle
  if (bundle && bundle.checkGuide && bundle.checkGuide.advice) {
    assert(/向门店|向保险公司/.test(bundle.checkGuide.advice))
  }
})

ok('事故车定损锚点（模式 A）不出现报价↔工单 pairwise', () => {
  const view = buildAlbumInspectionView(
    baseDetail({
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
    }),
  )
  const rows = allMethodRows(view)
  const bad = rows.find(
    (r) => r.label && /报价.*工单|repair_quote.*work_order/i.test(String(r.label)),
  )
  assert(!bad, 'mode A should not expose quote↔work pairwise row')
  const bundle = view.method.panels.find((p) => p.id === 'doc_method')?.documentBundle
  assert(bundle && bundle.intro && bundle.intro.includes('定损'), 'expected loss anchor intro')
})

ok('AI 免责常量可用于结果区块', () => {
  assert(
    AI_INSPECTION_DISCLAIMER.includes('不构成') || AI_INSPECTION_DISCLAIMER.includes('鉴定'),
    'AI disclaimer should deny legal conclusion',
  )
  assert(COMPLETENESS_TAB_HINT.includes('重要度'), 'completeness hint should explain importance')
})

ok('商家编辑页自检列名「规范」且用必留/建议留', () => {
  const { buildMerchantEditInspectionView } = require('../utils/album-merchant-inspection')
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
  assert.equal((view.method.panels || []).length, 0, 'merchant view is completeness-only')
})

ok('规则 AI 建议含 focusAreas 且 suspectedIssues 为对象数组', () => {
  const { buildRuleBasedAdvice } = require('../utils/album-inspection-advice')
  const advice = buildRuleBasedAdvice(baseDetail())
  assert(advice.focusAreas.length > 0, 'expected focusAreas')
  assert.equal(advice.source, 'rule')
  advice.suspectedIssues.forEach((item) => {
    assert(item && typeof item.text === 'string', 'suspectedIssues item shape')
  })
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
