const assert = require('assert')
const {
  buildLeadPromptCandidate,
  stripPii,
} = require('../utils/geo-lead-prompt-desensitize')
const { aggregateLeadPromptCandidates } = require('../services/geo-lead-prompt-candidate.service')

function run() {
  const clean = buildLeadPromptCandidate({
    serviceName: '刹车片更换',
    city: '杭州',
    description: '刹车异响比较严重，想先检查一下',
  })
  assert.strictEqual(clean.ok, true)
  assert.strictEqual(clean.promptType, 'B')
  assert.ok(clean.prompt.includes('刹车异响'))

  const pii = buildLeadPromptCandidate({
    serviceName: '小保养',
    description: '联系我13812345678处理保养',
  })
  assert.strictEqual(pii.ok, false)

  assert.ok(!stripPii('浙A12345临牌').includes('浙A12345'))

  const leads = [
    {
      id: 'l1',
      serviceName: '刹车片更换',
      description: '刹车异响比较明显',
      vehicleJson: null,
      storeId: 's1',
      createdAt: new Date(),
    },
    {
      id: 'l2',
      serviceName: '刹车片更换',
      description: '刹车时有吱吱声',
      vehicleJson: null,
      storeId: 's1',
      createdAt: new Date(),
    },
  ]
  const storeMap = new Map([['s1', { id: 's1', address: '杭州市西湖区某某路' }]])
  const candidates = aggregateLeadPromptCandidates(leads, storeMap)
  assert.ok(candidates.length >= 1)
  assert.ok(candidates[0].leadCount >= 1)

  console.log('[geo-lead-prompt-candidate.test] ok')
}

run()
