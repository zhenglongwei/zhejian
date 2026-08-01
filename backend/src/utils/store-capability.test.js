/**
 * 门店能力资产单元测试（STORE-ASSET QA-03 + P2）
 */
const assert = require('assert')
const {
  mergeCapabilityFromMerchantEdit,
  approveCapabilityPending,
  buildPublicCapabilityView,
  resolveValidUntilState,
  computeStoreListScorePenalty,
  collectApprovedEquipmentImageUrls,
  LIST_SCORE_PENALTY,
} = require('./store-capability')

function run() {
  // 技师/设备即时写入；仅品牌授权变更进 pending
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
      brandAuthItems: [
        {
          id: 'ba1',
          brandName: '宝马',
          imageUrl: '/media/auth.jpg',
          validUntil: '2027-12-31',
        },
      ],
    },
    { brandAuthItems: [] }
  )
  assert.deepStrictEqual(merged.capability.specialtyBrands, ['奥迪'])
  assert.deepStrictEqual(merged.capability.notAccepting, ['货车'])
  assert.strictEqual(merged.needsReview, true)
  assert.strictEqual(merged.capability.reviewStatus, 'pending')
  assert.strictEqual(merged.capability.technicians[0].name, '张师傅')
  assert.strictEqual(merged.capability.equipmentTags[0].label, '烤漆房')
  assert.ok(merged.capability.pending)
  assert.strictEqual(merged.capability.pending.brandAuthItems[0].brandName, '宝马')
  assert.ok(!merged.capability.pending.technicians)

  // 公开面：技师/设备即时可见；新授权待审不展示
  const pendingPublic = buildPublicCapabilityView(merged.capability, {
    brandAuthItems: [],
  })
  assert.strictEqual(pendingPublic.techniciansPublic.length, 1)
  assert.strictEqual(pendingPublic.equipmentTags.length, 1)
  assert.strictEqual(pendingPublic.brandAuth, null)
  assert.deepStrictEqual(pendingPublic.specialtyBrands, ['奥迪'])
  assert.deepStrictEqual(pendingPublic.notAccepting, ['货车'])

  // 仅改技师/设备：不进审
  const techOnly = mergeCapabilityFromMerchantEdit(
    {
      technicians: [{ id: 't1', name: '张师傅', role: '钣金', years: '8年', credentials: [] }],
      equipmentTags: [{ id: 'eq1', label: '烤漆房' }],
      reviewStatus: 'none',
    },
    {
      technicians: [{ id: 't1', name: '李工', role: '机电', years: '5年', credentials: [] }],
      equipmentTags: [{ id: 'eq1', label: '烤漆房' }, { id: 'eq2', label: '举升机' }],
    },
    { brandAuthItems: [] }
  )
  assert.strictEqual(techOnly.needsReview, false)
  assert.strictEqual(techOnly.capability.reviewStatus, 'none')
  assert.strictEqual(techOnly.capability.technicians[0].name, '李工')
  assert.strictEqual(techOnly.capability.equipmentTags.length, 2)
  assert.strictEqual(techOnly.capability.pending, null)

  // 已有品牌授权待审时，只改技师：不重新提交审核，保留原 pending
  const pendingAuth = {
    id: 'ba1',
    brandName: '宝马',
    imageUrl: '/media/auth.jpg',
    validUntil: '2027-12-31',
  }
  const whilePending = mergeCapabilityFromMerchantEdit(
    {
      technicians: [{ id: 't1', name: '张师傅', role: '钣金', years: '8年', credentials: [] }],
      equipmentTags: [],
      reviewStatus: 'pending',
      pending: {
        submittedAt: '2026-07-01T00:00:00.000Z',
        brandAuthItems: [pendingAuth],
      },
    },
    {
      technicians: [{ id: 't1', name: '王工', role: '机电', years: '3年', credentials: [] }],
      brandAuthItems: [{ ...pendingAuth, imageUrl: '/media/auth.jpg?sign=abc' }],
    },
    { brandAuthItems: [] }
  )
  assert.strictEqual(whilePending.needsReview, false)
  assert.strictEqual(whilePending.capability.reviewStatus, 'pending')
  assert.strictEqual(whilePending.capability.pending.submittedAt, '2026-07-01T00:00:00.000Z')
  assert.strictEqual(whilePending.capability.technicians[0].name, '王工')

  // 过审后亮品牌授权；技师/设备保持即时版不被 pending 覆盖
  const approved = approveCapabilityPending(merged.capability, { verifiedAt: '2026-07-17' })
  assert.strictEqual(approved.capability.reviewStatus, 'none')
  assert.strictEqual(approved.capability.technicians[0].name, '张师傅')
  assert.strictEqual(approved.capability.lastProfileVerifiedAt, '2026-07-17')
  assert.ok(approved.brandAuthItems)
  assert.strictEqual(approved.brandAuthItems[0].brandName, '宝马')
  const livePublic = buildPublicCapabilityView(approved.capability, {
    brandAuthItems: approved.brandAuthItems,
  })
  assert.strictEqual(livePublic.techniciansPublic.length, 1)
  assert.strictEqual(livePublic.equipmentTags[0].label, '烤漆房')
  assert.ok(livePublic.brandAuth)
  assert.strictEqual(livePublic.brandAuth.validUntil, '2027-12-31')
  assert.strictEqual(livePublic.brandAuthItems.length, 1)

  // 授权过期不展示
  const expiredPublic = buildPublicCapabilityView(
    approved.capability,
    {
      brandAuthItems: [
        {
          id: 'ba1',
          brandName: '宝马',
          imageUrl: '/media/auth.jpg',
          validUntil: '2020-01-01',
        },
      ],
    },
    { today: '2026-07-17' }
  )
  assert.strictEqual(expiredPublic.brandAuth, null)
  assert.strictEqual(expiredPublic.brandAuthItems.length, 0)

  // 兼容旧单图字段
  const legacyPublic = buildPublicCapabilityView(
    { brandAuthValidUntil: '2027-01-01', technicians: [], equipmentTags: [] },
    { brandAuthUrl: '/media/legacy.jpg' },
    { today: '2026-07-17' }
  )
  assert.ok(legacyPublic.brandAuth)
  assert.strictEqual(legacyPublic.brandAuthItems.length, 1)

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
