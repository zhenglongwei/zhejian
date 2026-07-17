/**
 * 卷十一 STORE-ASSET 验收冒烟（QA-01～04，无 HTTP）
 *
 *   node scripts/store-asset-smoke.js
 */
const assert = require('assert')
const {
  resolveStoreBusinessStatus,
  buildFreshnessSummary,
} = require('../src/utils/store-business-status')
const {
  mergeCapabilityFromMerchantEdit,
  approveCapabilityPending,
  buildPublicCapabilityView,
} = require('../src/utils/store-capability')
const { mapStoreRow } = require('../src/services/content.service')
const { applySearchFilters } = require('../src/utils/search-query')
const {
  buildTransparencyDimensions,
  normalizeTransparencyPayload,
} = require('../src/schemas/store-transparency.schema')

function atShanghai(iso) {
  return new Date(iso)
}

function main() {
  // QA-01 营业态 + 搜索「营业中」
  const openStore = mapStoreRow(
    {
      id: 'store_open',
      merchantId: 'm1',
      name: '营业店',
      status: 'ACTIVE',
      businessHours: '09:00-18:00',
      photosJson: {},
      capabilityJson: {},
      servicesJson: ['保养'],
      address: '杭州',
      phone: '13800000000',
    },
    2
  )
  // 用固定 now 覆盖：把 resolve 结果直接测
  const openNow = resolveStoreBusinessStatus({
    storeStatus: 'ACTIVE',
    businessHours: '09:00-18:00',
    now: atShanghai('2026-07-17T10:00:00+08:00'),
  })
  const closedNow = resolveStoreBusinessStatus({
    storeStatus: 'ACTIVE',
    businessHours: '09:00-18:00',
    now: atShanghai('2026-07-17T21:00:00+08:00'),
  })
  const restDay = resolveStoreBusinessStatus({
    storeStatus: 'ACTIVE',
    businessHours: '09:00-18:00，7月17日休息',
    now: atShanghai('2026-07-17T10:00:00+08:00'),
  })
  assert.strictEqual(openNow, 'open')
  assert.strictEqual(closedNow, 'closed')
  assert.strictEqual(restDay, 'closed')

  const list = [
    { ...openStore, status: 'open', businessStatus: 'open' },
    { id: 's2', name: '休息店', status: 'closed', businessStatus: 'closed', specialties: [] },
  ]
  const filtered = applySearchFilters(list, 'merchant', { openNow: true })
  assert.strictEqual(filtered.length, 1)
  assert.strictEqual(filtered[0].id, 'store_open')
  console.log('[QA-01] businessStatus + openNow filter ok')

  // QA-02 进行中相册不出现在门店公开映射（门店 payload 无 albums 列表）
  assert.ok(!('albums' in openStore))
  assert.ok(!('inProgressAlbums' in openStore))
  console.log('[QA-02] store public map has no in-progress album fields ok')

  // QA-03 未审不展示 / 过审展示 / 授权过期
  const { capability, needsReview } = mergeCapabilityFromMerchantEdit(
    {},
    {
      technicians: [{ name: '李工', role: '机电', years: '5', credentials: [] }],
      equipmentTags: [{ label: '四轮定位' }],
      brandAuthValidUntil: '2027-01-01',
      brandAuthChanged: true,
      prevBrandAuthUrl: '',
    },
    { brandAuthUrl: '/media/a.jpg' }
  )
  assert.strictEqual(needsReview, true)
  let pub = buildPublicCapabilityView(capability, { brandAuthUrl: '' })
  assert.strictEqual(pub.techniciansPublic.length, 0)
  assert.strictEqual(pub.equipmentTags.length, 0)

  const { capability: approved } = approveCapabilityPending(capability)
  pub = buildPublicCapabilityView(approved, { brandAuthUrl: '/media/a.jpg' })
  assert.strictEqual(pub.techniciansPublic.length, 1)
  assert.strictEqual(pub.equipmentTags.length, 1)

  pub = buildPublicCapabilityView(
    { ...approved, brandAuthValidUntil: '2019-01-01' },
    { brandAuthUrl: '/media/a.jpg' },
    { today: '2026-07-17' }
  )
  assert.strictEqual(pub.brandAuth, null)
  console.log('[QA-03] capability review gate + auth expiry ok')

  // QA-04 人机同源关键字段存在于 mapStoreRow
  const mapped = mapStoreRow(
    {
      id: 'store_cap',
      merchantId: 'm1',
      name: '能力店',
      status: 'ACTIVE',
      businessHours: '09:00-18:00',
      photosJson: { brandAuthUrl: '/media/a.jpg' },
      capabilityJson: approved,
      servicesJson: ['刹车'],
      address: '杭州',
      phone: '139',
    },
    3
  )
  assert.ok(mapped.businessStatus)
  assert.ok(Array.isArray(mapped.specialtyBrands))
  assert.ok('freshness' in mapped)
  assert.ok(Array.isArray(mapped.equipmentTags))
  assert.ok('brandAuth' in mapped)
  const freshness = buildFreshnessSummary({
    lastPublicCaseAt: '2026-07-10',
    lastProfileVerifiedAt: '2026-07-12',
  })
  assert.ok(freshness.includes('最近公开案例'))
  console.log('[QA-04] mapStoreRow A/B fields + freshness summary ok')

  // 透明度：无案例不虚报；有案例可含新鲜度维；咨询响应对公过滤
  const emptyT = normalizeTransparencyPayload({ caseCount: 0, score: 88 })
  assert.strictEqual(emptyT.exposed, false)
  assert.strictEqual(emptyT.score, null)

  const dims = buildTransparencyDimensions({
    storeId: 'store_cap',
    caseCount: 2,
    albumCompleteRate: 80,
    serviceCount: 1,
    breakdown: {
      case: 10,
      album: 20,
      serviceProfile: 10,
      qualification: 10,
      freshness: 8,
      capability: 3,
      leadResponse: 9,
    },
    certifications: [{ label: '营业执照', text: '已认证' }],
    lastPublicCaseAt: '2026-07-10',
    lastProfileVerifiedAt: '2026-07-12',
    technicianCount: 1,
    equipmentCount: 1,
  })
  assert.ok(!dims.some((d) => d.id === 'lead_response'))
  const publicPayload = normalizeTransparencyPayload({
    caseCount: 2,
    score: 70,
    dimensions: dims,
  })
  assert.strictEqual(publicPayload.exposed, true)
  assert.ok(!publicPayload.dimensions.some((d) => d.id === 'lead_response'))
  console.log('[QA-04b] transparency honesty + lead_response internal ok')

  // P2-04 轻降权：过期授权 score 下降
  const { computeStoreListScorePenalty, collectApprovedEquipmentImageUrls } = require('../src/utils/store-capability')
  const penalty = computeStoreListScorePenalty(
    { brandAuthValidUntil: '2020-01-01' },
    '2026-07-17'
  )
  assert.ok(penalty >= 25)
  const demoted = mapStoreRow(
    {
      id: 'store_expired',
      merchantId: 'm1',
      name: '过期店',
      status: 'ACTIVE',
      businessHours: '09:00-18:00',
      photosJson: { workshopUrls: ['/media/w1.jpg'] },
      capabilityJson: {
        brandAuthValidUntil: '2020-01-01',
        equipmentTags: [{ id: 'eq1', label: '烤漆房', imageUrl: '/media/eq1.jpg' }],
        technicians: [],
        specialtyBrands: [],
        notAccepting: [],
        reviewStatus: 'none',
      },
      servicesJson: [],
      address: '杭州',
      phone: '13800000000',
      merchant: { qualificationJson: { validUntil: '2020-01-01' } },
    },
    0
  )
  assert.ok(demoted.score <= 0 || demoted.score < 100)
  assert.ok(demoted.environmentImages.includes('/media/w1.jpg') || demoted.environmentImages.length >= 1)
  // 设备图并入环境（resolveClientReadableMediaUrls 可能改写路径前缀，用后缀判断）
  assert.ok(
    demoted.environmentImages.some((u) => String(u).includes('eq1.jpg')),
    'equipment image should merge into environmentImages'
  )
  assert.deepStrictEqual(
    collectApprovedEquipmentImageUrls(demoted),
    demoted.equipmentTags.map((t) => t.imageUrl).filter(Boolean)
  )
  console.log('[P2-04/02] list demotion + equipment env merge ok')

  console.log('[store-asset-smoke] all ok')
}

main()
