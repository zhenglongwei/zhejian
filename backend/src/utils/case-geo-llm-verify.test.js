/**
 * LLM 输出事实溯源校验：单据链原料必须进证据池
 */
const assert = require('assert')
const { verifyLlmDraftAgainstEvidence } = require('./case-geo-llm-verify')
const { buildCaseFactPack } = require('./case-geo-factpack')

function flowNode(kind, extra = {}) {
  return { id: `fn_${kind}`, kind, title: kind, sortOrder: 0, ...extra }
}

const FLOW = [
  flowNode('intake', {
    photoDraft: { chiefComplaint: '过减速带时右前轮咯噔响' },
    document: { status: 'confirmed', payload: {} },
  }),
  flowNode('inspection_report', {
    document: {
      status: 'delivered',
      payload: {
        chiefComplaint: '过减速带时右前轮咯噔响',
        findings: [
          {
            partName: '右前小吊杆球头',
            result: '需处理',
            advice: '球头松旷，胶套开裂',
            images: [],
          },
        ],
      },
    },
  }),
  flowNode('work', {
    status: 'completed',
    photoDraft: {
      findings: [{ partName: '更换右前小吊杆', caption: '旧件胶套已开裂', outsideQuote: false }],
    },
    document: { status: 'confirmed', payload: {} },
  }),
]

const OPTIONS = {
  serviceName: '底盘异响检修',
  city: '杭州',
  storeName: '城北店',
}

/**
 * 用单据链里的真料写摘要：必须能过校验
 * 这条若挂，说明证据池没认 facts，真料会被当成编造打回
 */
function testFactsBackedSummaryPasses() {
  const pack = buildCaseFactPack(FLOW)
  const draft = {
    aiSummary:
      '车主反映过减速带异响。检测发现右前小吊杆球头松旷、胶套开裂，需处理。门店更换右前小吊杆后复查，异响消除。',
    faultDesc: '',
    inspectResult: '',
    repairPlan: '',
    resultConfirm: '',
    articleBody: '检测发现右前小吊杆球头松旷，胶套开裂。',
    missingEvidence: [],
    confidence: 'high',
  }
  const verify = verifyLlmDraftAgainstEvidence(draft, [], { ...OPTIONS, factPack: pack })
  assert.deepEqual(verify.unmappedFields, [], `不应有未溯源字段：${verify.unmappedFields}`)
  assert.equal(verify.passed, true)
}

/** 没喂 facts 时，同样的摘要会被判定无出处——证明上面的通过确实靠 facts */
function testSameSummaryFailsWithoutFactPack() {
  const draft = {
    aiSummary:
      '车主反映过减速带异响。检测发现右前小吊杆球头松旷、胶套开裂，需处理。门店更换右前小吊杆后复查，异响消除。',
    faultDesc: '',
    inspectResult: '',
    repairPlan: '',
    resultConfirm: '',
    articleBody: '检测发现右前小吊杆球头松旷，胶套开裂。',
    missingEvidence: [],
    confidence: 'high',
  }
  const verify = verifyLlmDraftAgainstEvidence(draft, [], { ...OPTIONS })
  assert.ok(verify.unmappedFields.length > 0, '无 facts 时这些词应被判为无出处')
}

/** 编造的内容即便有 facts 也要被拦下 */
function testFabricationStillBlocked() {
  const pack = buildCaseFactPack(FLOW)
  const draft = {
    aiSummary: '本单更换了变速箱总成与三元催化器，做了全车喷漆，费用八千元。',
    faultDesc: '',
    inspectResult: '',
    repairPlan: '',
    resultConfirm: '',
    articleBody: '更换了变速箱总成，做了全车喷漆。',
    missingEvidence: [],
    confidence: 'high',
  }
  const verify = verifyLlmDraftAgainstEvidence(draft, [], { ...OPTIONS, factPack: pack })
  assert.equal(verify.passed, false, '编造内容必须被拦')
  assert.ok(verify.unmappedFields.includes('aiSummary'))
}

/** 老数据无单据链：证据池不含 facts，行为与改动前一致 */
function testLegacyNoFactsUnchanged() {
  const draft = {
    aiSummary: '',
    faultDesc: '',
    inspectResult: '',
    repairPlan: '',
    resultConfirm: '',
    articleBody: '',
    missingEvidence: [],
    confidence: 'medium',
  }
  const verify = verifyLlmDraftAgainstEvidence(draft, [], {
    ...OPTIONS,
    factPack: buildCaseFactPack([]),
  })
  assert.equal(verify.passed, true, '空字段应视为通过')
}

testFactsBackedSummaryPasses()
testSameSummaryFailsWithoutFactPack()
testFabricationStillBlocked()
testLegacyNoFactsUnchanged()
console.log('case-geo-llm-verify.test.js OK')
