/**
 * 门店能力资产单元测试（STORE-ASSET QA-03 + P2）
 */
const assert = require('assert')
const {
  mergeCapabilityFromMerchantEdit,
  approveCapabilityPending,
  buildPublicCapabilityView,
  readCapabilityJson,
  resolveValidUntilState,
  computeStoreListScorePenalty,
  collectApprovedEquipmentImageUrls,
  LIST_SCORE_PENALTY,
} = require('./store-capability')

function run() {
  // 即时字段直接写入；技师变更进 pending
  const merged = mergeCapabilityFromMerchantEdit(
    {
      specialtyBrands: ['宝马'],
      technicians: [],
      equipmentTags: [],
      brandAuthValidUntil: '',
      reviewStatus: 'none',
    },
    {
      specialtyBrands: ['奥迪'],
      notAccepting: ['货车'],
      technicians: [{ id: 't1', name: '张师傅', role: '钣金', years: '8年', credentials: ['二类'] }],
      equipmentTags: [{ id: 'eq1', label: '烤漆房' }],
      brandAuthValidUntil: '2027-12-31',
      brandAuthChanged: true,
      prevBrandAuthUrl: '',
    },
    { brandAuthUrl: '/media/auth.jpg' }
  )
  assert.deepStrictEqual(merged.capability.specialtyBrands, ['奥迪'])
  assert.deepStrictEqual(merged.capability.notAccepting, ['货车'])
  assert.strictEqual(merged.needsReview, true)
  assert.strictEqual(merged.capability.reviewStatus, 'pending')
  assert.strictEqual(merged.capability.technicians.length, 0)
  assert.ok(merged.capability.pending)
  assert.strictEqual(merged.capability.pending.technicians[0].name, '张师傅')

  // 未过审：公开面无技师/设备
  const pendingPublic = buildPublicCapabilityView(merged.capability, {
    brandAuthUrl: '',
  })
  assert.strictEqual(pendingPublic.techniciansPublic.length, 0)
  assert.strictEqual(pendingPublic.equipmentTags.length, 0)
  assert.strictEqual(pendingPublic.brandAuth, null)
  assert.deepStrictEqual(pendingPublic.specialtyBrands, ['奥迪'])
  assert.deepStrictEqual(pendingPublic.notAccepting, ['货车'])

  // 过审后亮
  const approved = approveCapabilityPending(merged.capability, { verifiedAt: '2026-07-17' })
  assert.strictEqual(approved.capability.reviewStatus, 'none')
  assert.strictEqual(approved.capability.technicians[0].name, '张师傅')
  assert.strictEqual(approved.capability.lastProfileVerifiedAt, '2026-07-17')
  const livePublic = buildPublicCapabilityView(approved.capability, {
    brandAuthUrl: '/media/auth.jpg',
  })
  assert.strictEqual(livePublic.techniciansPublic.length, 1)
  assert.strictEqual(livePublic.equipmentTags[0].label, '烤漆房')
  assert.ok(livePublic.brandAuth)
  assert.strictEqual(livePublic.brandAuth.validUntil, '2027-12-31')

  // 授权过期不展示
  const expiredCap = readCapabilityJson({
    ...approved.capability,
    brandAuthValidUntil: '2020-01-01',
  })
  const expiredPublic = buildPublicCapabilityView(
    expiredCap,
    {
      brandAuthUrl: '/media/auth.jpg',
    },
    { today: '2026-07-17' }
  )
  assert.strictEqual(expiredPublic.brandAuth, null)

  // P2-04 有效期状态与轻降权
  assert.strictEqual(resolveValidUntilState('2020-01-01', '2026-07-17').status, 'expired')
  assert.strictEqual(resolveValidUntilState('2026-07-20', '2026-07-17').status, 'expiring')
  assert.strictEqual(resolveValidUntilState('2027-01-01', '2026-07-17').status, 'ok')
  assert.strictEqual(
    computeStoreListScorePenalty(
      { brandAuthValidUntil: '2020-01-01', qualificationValidUntil: '2026-07-20' },
      '2026-07-17'
    ),
    LIST_SCORE_PENALTY.expired + LIST_SCORE_PENALTY.expiring
  )

  // P2-02 设备图收集
  assert.deepStrictEqual(
    collectApprovedEquipmentImageUrls({
      equipmentTags: [
        { label: '烤漆房', imageUrl: '/media/eq1.jpg' },
        { label: '举升机', imageUrl: '' },
      ],
    }),
    ['/media/eq1.jpg']
  )

  console.log('store-capability.test.js ok')
}

run()
