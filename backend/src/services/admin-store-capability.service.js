const { prisma } = require('../lib/prisma')
const { newId, toIso } = require('../lib/ids')
const {
  readCapabilityJson,
  approveCapabilityPending,
  rejectCapabilityPending,
  buildMerchantCapabilityEditorView,
} = require('../utils/store-capability')
const {
  resolveStoreCapabilityJson,
  saveStoreCapabilityJson,
  isCapabilityFieldError,
} = require('../utils/store-capability-load')

async function appendCapabilityReviewLog({
  merchantId,
  storeId,
  reviewerId,
  reviewAction,
  reviewComment,
}) {
  if (!prisma.merchantReviewLog) return
  try {
    await prisma.merchantReviewLog.create({
      data: {
        id: newId('mrl'),
        merchantId,
        storeId: storeId || '',
        reviewerId: reviewerId || 'admin_system',
        reviewAction,
        reviewComment: reviewComment || '',
        beforeStatus: 'capability_pending',
        afterStatus: reviewAction,
      },
    })
  } catch (e) {
    console.warn('[store-capability-review] review log skip', e.message)
  }
}

async function listStoreCapabilityReviews(query = {}) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20))
  const tab = String(query.tab || 'pending').toLowerCase()

  const stores = await prisma.store.findMany({
    where: { status: 'ACTIVE' },
    include: {
      merchant: {
        select: { id: true, name: true, status: true, contactName: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 500,
  })

  const withCap = await Promise.all(
    stores.map(async (store) => {
      const capabilityJson = await resolveStoreCapabilityJson(store)
      return { store, capabilityJson }
    })
  )

  const filtered = withCap.filter(({ capabilityJson }) => {
    const cap = readCapabilityJson(capabilityJson)
    if (tab === 'pending') return cap.reviewStatus === 'pending'
    if (tab === 'rejected') return cap.reviewStatus === 'rejected'
    return cap.reviewStatus === 'pending' || cap.reviewStatus === 'rejected'
  })

  const total = filtered.length
  const slice = filtered.slice((page - 1) * pageSize, page * pageSize)

  return {
    list: slice.map(({ store, capabilityJson }) => {
      const cap = readCapabilityJson(capabilityJson)
      return {
        storeId: store.id,
        storeName: store.name,
        merchantId: store.merchantId,
        merchantName: store.merchant?.name || '',
        contactName: store.merchant?.contactName || '',
        reviewStatus: cap.reviewStatus,
        submittedAt: cap.pending?.submittedAt || toIso(store.updatedAt),
        technicianCount: (cap.pending?.technicians || cap.technicians || []).length,
        equipmentCount: (cap.pending?.equipmentTags || cap.equipmentTags || []).length,
      }
    }),
    page,
    pageSize,
    total,
    tab,
  }
}

async function getStoreCapabilityReviewDetail(storeId) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      merchant: {
        select: {
          id: true,
          name: true,
          contactName: true,
          contactPhone: true,
          status: true,
        },
      },
    },
  })
  if (!store) {
    const err = new Error('门店不存在')
    err.status = 404
    throw err
  }

  const capabilityJson = await resolveStoreCapabilityJson(store)
  const photos =
    store.photosJson && typeof store.photosJson === 'object' ? store.photosJson : {}
  const editor = buildMerchantCapabilityEditorView(capabilityJson, photos)
  const cap = readCapabilityJson(capabilityJson)

  return {
    storeId: store.id,
    storeName: store.name,
    address: store.address,
    merchantId: store.merchantId,
    merchantName: store.merchant?.name || '',
    contactName: store.merchant?.contactName || '',
    contactPhone: store.merchant?.contactPhone || '',
    merchantStatus: store.merchant?.status || '',
    reviewStatus: cap.reviewStatus,
    pending: cap.pending,
    published: {
      technicians: cap.technicians,
      equipmentTags: cap.equipmentTags,
      brandAuthValidUntil: cap.brandAuthValidUntil,
      brandAuthUrl: photos.brandAuthUrl || '',
      specialtyBrands: cap.specialtyBrands,
      notAccepting: cap.notAccepting,
      lastProfileVerifiedAt: cap.lastProfileVerifiedAt,
    },
    editor,
  }
}

async function persistApprovedCapability(storeId, capability, photos) {
  try {
    await prisma.store.update({
      where: { id: storeId },
      data: {
        capabilityJson: capability,
        photosJson: photos,
      },
    })
  } catch (e) {
    if (!isCapabilityFieldError(e)) throw e
    await prisma.store.update({
      where: { id: storeId },
      data: { photosJson: photos },
    })
    await saveStoreCapabilityJson(storeId, capability)
  }
}

async function approveStoreCapability(storeId, adminUser = {}) {
  const store = await prisma.store.findUnique({ where: { id: storeId } })
  if (!store) {
    const err = new Error('门店不存在')
    err.status = 404
    throw err
  }
  const capabilityJson = await resolveStoreCapabilityJson(store)
  const cap = readCapabilityJson(capabilityJson)
  if (cap.reviewStatus !== 'pending' || !cap.pending) {
    const err = new Error('当前无可审核的能力变更')
    err.status = 400
    throw err
  }

  const { capability, brandAuthUrl } = approveCapabilityPending(capabilityJson)
  const photos =
    store.photosJson && typeof store.photosJson === 'object' ? { ...store.photosJson } : {}
  if (brandAuthUrl) {
    photos.brandAuthUrl = brandAuthUrl
  }

  await persistApprovedCapability(storeId, capability, photos)

  await appendCapabilityReviewLog({
    merchantId: store.merchantId,
    storeId,
    reviewerId: String(adminUser.userId || adminUser.id || 'admin_system'),
    reviewAction: 'approve_capability',
    reviewComment: '门店能力变更通过',
  })

  return getStoreCapabilityReviewDetail(storeId)
}

async function rejectStoreCapability(storeId, reason = '', adminUser = {}) {
  const store = await prisma.store.findUnique({ where: { id: storeId } })
  if (!store) {
    const err = new Error('门店不存在')
    err.status = 404
    throw err
  }
  const capabilityJson = await resolveStoreCapabilityJson(store)
  const cap = readCapabilityJson(capabilityJson)
  if (cap.reviewStatus !== 'pending' || !cap.pending) {
    const err = new Error('当前无可审核的能力变更')
    err.status = 400
    throw err
  }

  const capability = rejectCapabilityPending(capabilityJson, reason)
  try {
    await prisma.store.update({
      where: { id: storeId },
      data: { capabilityJson: capability },
    })
  } catch (e) {
    if (!isCapabilityFieldError(e)) throw e
    await saveStoreCapabilityJson(storeId, capability)
  }

  await appendCapabilityReviewLog({
    merchantId: store.merchantId,
    storeId,
    reviewerId: String(adminUser.userId || adminUser.id || 'admin_system'),
    reviewAction: 'reject_capability',
    reviewComment: String(reason || '').slice(0, 200),
  })

  return getStoreCapabilityReviewDetail(storeId)
}

module.exports = {
  listStoreCapabilityReviews,
  getStoreCapabilityReviewDetail,
  approveStoreCapability,
  rejectStoreCapability,
}
