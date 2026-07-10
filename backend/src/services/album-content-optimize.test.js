const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildRuleOptimizeDraft,
  buildNodeNotesFromGeo,
  mergeOptimizeDraftIntoCaseDraft,
} = require('./album-content-optimize.service')
const { resolveMerchantContentOptimizeCapability } = require('./merchant-subscription.service')
const { MERCHANT_PLAN, MERCHANT_SUBSCRIPTION_STATUS } = require('../constants/merchant-subscription')

const sampleAlbumView = {
  serviceName: '刹车片更换',
  storeName: '测试门店',
  store: { city: '杭州', name: '测试门店' },
  storeNote: '',
  nodes: [
    { id: 'stage_1', nodeId: 'stage_1', title: '接车', note: '刹车异响' },
    { id: 'stage_2', nodeId: 'stage_2', title: '检测', note: '片厚不足' },
  ],
}

test('resolveMerchantContentOptimizeCapability uses rule mode for all plans', () => {
  const free = resolveMerchantContentOptimizeCapability({
    plan: MERCHANT_PLAN.FREE,
    status: MERCHANT_SUBSCRIPTION_STATUS.ACTIVE,
  })
  assert.equal(free.llmEnabled, false)
  assert.equal(free.mode, 'rule')

  const standard = resolveMerchantContentOptimizeCapability({
    plan: MERCHANT_PLAN.INDEX_99,
    status: MERCHANT_SUBSCRIPTION_STATUS.ACTIVE,
  })
  assert.equal(standard.llmEnabled, false)
  assert.equal(standard.mode, 'rule')
})

test('buildRuleOptimizeDraft produces geo and nodeNotes', () => {
  const capability = { plan: 'free', mode: 'rule' }
  const draft = buildRuleOptimizeDraft(sampleAlbumView, capability)
  assert.equal(draft.status, 'ready')
  assert.ok(draft.geo.faultDesc || draft.geo.inspectResult)
  assert.ok(Object.keys(draft.nodeNotes || {}).length >= 1)
  assert.ok((draft.suggestions || []).length >= 1)
})

test('mergeOptimizeDraftIntoCaseDraft updates summary and nodes only', () => {
  const caseDraft = {
    summary: '旧摘要',
    contentJson: {
      nodes: [
        { id: 'stage_1', note: '原说明' },
        { id: 'stage_2', note: '检测说明' },
      ],
      geo: { faultDesc: '旧故障' },
    },
  }
  const optimizeDraft = {
    status: 'ready',
    source: 'rule',
    aiSummary: '新摘要建议',
    geo: { faultDesc: '新故障描述', inspectResult: '新检测' },
    nodeNotes: { stage_1: '润色后接车说明' },
  }
  const merged = mergeOptimizeDraftIntoCaseDraft(caseDraft, optimizeDraft)
  assert.equal(merged.summary, '新摘要建议')
  assert.equal(merged.contentJson.nodes[0].note, '润色后接车说明')
  assert.equal(merged.contentJson.geo.faultDesc, '新故障描述')
})

test('buildNodeNotesFromGeo maps stage fields', () => {
  const notes = buildNodeNotesFromGeo(
    { faultDesc: '故障A', inspectResult: '检测B' },
    sampleAlbumView.nodes
  )
  assert.equal(notes.stage_1, '故障A')
  assert.equal(notes.stage_2, '检测B')
})
