const { prisma } = require('../lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { sanitizeClientMediaUrl } = require('../lib/media-url')
const {
  HOME_SERVICE_ENTRIES,
  HOME_ACCIDENT_ENTRY,
  HOME_PLATFORM_INTRO,
  HOME_PLATFORM_IDENTITY,
  HOME_PROTECTION_TEXT,
  HOME_GEO_TOPICS,
  HOME_RECOMMENDED_MERCHANTS,
} = require('../constants/home')

function mapPublicCase(item) {
  return {
    id: item.id,
    albumId: item.albumId,
    authorizationTier: item.authorizationTier,
    coverImage: sanitizeClientMediaUrl(item.coverImage),
    title: item.title,
    serviceName: item.serviceName,
    summary: item.summary,
    priceMode: item.priceMode || 'range',
    minAmount: item.minAmount,
    maxAmount: item.maxAmount,
    storeId: item.storeId,
    storeName: item.storeName,
    city: item.city || '杭州',
    viewCount: 0,
  }
}

async function fetchFeaturedCases(limit = 3) {
  const rows = await prisma.publicCase.findMany({
    where: { status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  })
  if (rows.length) return rows.map(mapPublicCase)
  return [
    {
      id: 'case_svc_demo_completed',
      albumId: 'alb_svc_demo_completed',
      authorizationTier: 'named',
      coverImage: '',
      title: '杭州大众朗逸 · 小保养套餐',
      serviceName: '小保养套餐',
      summary: '该案例经车主授权，记录了小保养维修过程。图片已脱敏并通过平台审核。',
      priceMode: 'range',
      minAmount: 380,
      maxAmount: 480,
      storeId: 'store_demo_1',
      storeName: '辙见示范店（杭州滨江）',
      city: '杭州',
      viewCount: 128,
    },
  ]
}

async function getHomePayload() {
  const serviceEntries = HOME_SERVICE_ENTRIES.filter((e) => e.status === 'enabled').sort(
    (a, b) => a.sort - b.sort
  )
  const featuredCases = await fetchFeaturedCases(3)

  return {
    city: {
      code: 'hangzhou',
      name: '杭州',
      isServiceCity: true,
    },
    serviceEntries,
    accidentEntry: HOME_ACCIDENT_ENTRY,
    geoTopics: HOME_GEO_TOPICS,
    recommendedMerchants: HOME_RECOMMENDED_MERCHANTS,
    featuredCases,
    platformIntro: { points: HOME_PLATFORM_INTRO },
    platformIdentity: HOME_PLATFORM_IDENTITY,
    protectionText: HOME_PROTECTION_TEXT,
  }
}

module.exports = {
  getHomePayload,
}
