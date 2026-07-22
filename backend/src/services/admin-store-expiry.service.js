/**
 * 卷十一 P2-04：资质 / 品牌授权过期催办列表
 */
const { prisma } = require('../lib/prisma')
const { formatShanghaiDate } = require('../lib/shanghai-date')
const { readCapabilityJson, resolveValidUntilState } = require('../utils/store-capability')

function pushItem(items, base, kind, label, state) {
  if (state.status !== 'expired' && state.status !== 'expiring') return
  items.push({
    ...base,
    kind,
    kindLabel: label,
    validUntil: state.validUntil,
    daysLeft: state.daysLeft,
    expiryStatus: state.status,
    expiryStatusLabel: state.status === 'expired' ? '已过期' : '即将过期',
  })
}

async function listStoreExpiryFollowUps(query = {}) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20))
  const tab = String(query.tab || 'all').toLowerCase()
  const today = formatShanghaiDate()

  const stores = await prisma.store.findMany({
    where: { status: 'ACTIVE' },
    include: {
      merchant: {
        select: {
          id: true,
          name: true,
          contactName: true,
          status: true,
          qualificationJson: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 800,
  })

  const items = []
  for (const store of stores) {
    const base = {
      storeId: store.id,
      storeName: store.name || '',
      merchantId: store.merchantId,
      merchantName: store.merchant?.name || '',
      contactName: store.merchant?.contactName || '',
      merchantStatus: store.merchant?.status || '',
    }
    const cap = readCapabilityJson(store.capabilityJson)
    const photos =
      store.photosJson && typeof store.photosJson === 'object' ? store.photosJson : {}
    const brandItems =
      Array.isArray(photos.brandAuthItems) && photos.brandAuthItems.length
        ? photos.brandAuthItems
        : photos.brandAuthUrl
          ? [
              {
                brandName: '品牌授权',
                validUntil: cap.brandAuthValidUntil || '',
              },
            ]
          : cap.brandAuthValidUntil
            ? [{ brandName: '品牌授权', validUntil: cap.brandAuthValidUntil }]
            : []
    if (brandItems.length) {
      brandItems.forEach((item) => {
        const label = String(item.brandName || '品牌授权').trim() || '品牌授权'
        const brandState = resolveValidUntilState(
          String(item.validUntil || cap.brandAuthValidUntil || '').trim(),
          today
        )
        pushItem(items, base, 'brand_auth', label, brandState)
      })
    } else {
      const brandState = resolveValidUntilState(cap.brandAuthValidUntil, today)
      pushItem(items, base, 'brand_auth', '品牌授权', brandState)
    }

    const qual =
      store.merchant?.qualificationJson && typeof store.merchant.qualificationJson === 'object'
        ? store.merchant.qualificationJson
        : {}
    const qualState = resolveValidUntilState(String(qual.validUntil || '').trim(), today)
    pushItem(items, base, 'qualification', '维修资质', qualState)
  }

  let filtered = items
  if (tab === 'expired') filtered = items.filter((i) => i.expiryStatus === 'expired')
  else if (tab === 'expiring') filtered = items.filter((i) => i.expiryStatus === 'expiring')

  filtered.sort((a, b) => {
    if (a.expiryStatus !== b.expiryStatus) {
      return a.expiryStatus === 'expired' ? -1 : 1
    }
    return (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999)
  })

  const total = filtered.length
  const slice = filtered.slice((page - 1) * pageSize, page * pageSize)

  return {
    list: slice,
    page,
    pageSize,
    total,
    tab,
    asOfDate: today,
  }
}

module.exports = {
  listStoreExpiryFollowUps,
}
