const { fetchHomeData } = require('../../services/home')
const {
  HOME_PLATFORM_INTRO_ITEMS,
  HOME_PROTECTION_ITEMS,
  HOME_PROTECTION_SUMMARY,
} = require('../../constants/home-entries')
const { fetchStoreTopReviewTags } = require('../../services/review')
const { buildStoreCardTags } = require('../../utils/store-tags')
const { SEARCH_PLACEHOLDER } = require('../../constants/search')
const { GEO_TOPIC_TAG } = require('../../constants/geo-pages')
const { pickCaseDisplayCover } = require('../../utils/desensitize-url')
const {
  resolveCityContext,
  enrichStoresWithDistance,
  DEFAULT_CITY,
} = require('../../utils/city-location')

const INTRO_ACCENTS = ['primary', 'info', 'success']

function resolveIntroItems(points) {
  if (!points || !points.length) return HOME_PLATFORM_INTRO_ITEMS
  return points.map((line, index) => {
    const sep = line.indexOf('：')
    const fallback = HOME_PLATFORM_INTRO_ITEMS[index]
    const accent =
      (fallback && fallback.accent) || INTRO_ACCENTS[index % INTRO_ACCENTS.length]
    if (sep < 0) {
      return {
        id: `intro_${index}`,
        title: line,
        desc: '',
        accent,
      }
    }
    return {
      id: `intro_${index}`,
      title: line.slice(0, sep),
      desc: line.slice(sep + 1),
      accent,
    }
  })
}

function buildHeroTrustCase(cases) {
  if (!cases || !cases.length) return null
  for (let i = 0; i < cases.length; i += 1) {
    const item = cases[i]
    const coverImage = pickCaseDisplayCover(item)
    if (!coverImage) continue
    return {
      id: item.id,
      title: item.title,
      coverImage,
    }
  }
  return null
}

Page({
  data: {
    status: 'loading',
    city: '杭州',
    serviceEntries: [],
    accidentEntry: null,
    recommendedMerchants: [],
    featuredCases: [],
    platformIntroItems: [],
    platformIdentity: '',
    protectionItems: HOME_PROTECTION_ITEMS,
    protectionSummary: HOME_PROTECTION_SUMMARY,
    showMerchants: false,
    showCases: false,
    showGeoTopics: false,
    geoTopics: [],
    geoTopicTag: GEO_TOPIC_TAG,
    heroTrustCase: null,
    cityNotice: '',
    errorMessage: '',
    searchPlaceholder: SEARCH_PLACEHOLDER,
  },

  onLoad() {
    this.bootstrapCity().finally(() => this.loadHome())
  },

  async bootstrapCity() {
    try {
      const app = getApp()
      let ctx = app.globalData.cityContext
      if (!ctx) {
        ctx = await resolveCityContext()
        app.globalData.cityContext = ctx
      }
      if (ctx.outsideNotice) {
        wx.showModal({
          title: '服务城市',
          content: ctx.outsideNotice,
          showCancel: false,
          confirmText: '知道了',
        })
      }
      this._cityContext = ctx
    } catch (e) {
      this._cityContext = {
        city: DEFAULT_CITY,
        locationGranted: false,
        coords: null,
      }
    }
  },

  onPullDownRefresh() {
    this.loadHome().finally(() => wx.stopPullDownRefresh())
  },

  async loadHome() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const data = await fetchHomeData()
      const featuredCases = (data.featuredCases || []).map((item) => ({
        ...item,
        coverImage: pickCaseDisplayCover(item),
      }))
      const heroTrustCase = buildHeroTrustCase(featuredCases)
      const coords = this._cityContext && this._cityContext.coords
      let merchantSource = enrichStoresWithDistance(data.recommendedMerchants || [], coords)
      if (coords) {
        merchantSource = merchantSource.slice().sort((a, b) => {
          const da = a.distanceMeters != null ? a.distanceMeters : Number.MAX_SAFE_INTEGER
          const db = b.distanceMeters != null ? b.distanceMeters : Number.MAX_SAFE_INTEGER
          return da - db
        })
      }
      const merchants = await Promise.all(
        merchantSource.map(async (store) => {
          const reviewTags = await fetchStoreTopReviewTags(store.id, 2)
          return {
            ...store,
            cardTags: buildStoreCardTags(store, reviewTags),
          }
        })
      )
      const cityCtx = this._cityContext || { city: DEFAULT_CITY }
      this.setData({
        city: cityCtx.city.name || data.city.name,
        cityNotice: cityCtx.outsideServiceNotice || '',
        serviceEntries: data.serviceEntries,
        accidentEntry: data.accidentEntry,
        recommendedMerchants: merchants,
        featuredCases,
        platformIntroItems: resolveIntroItems(
          (data.platformIntro && data.platformIntro.points) || []
        ),
        platformIdentity: data.platformIdentity || '',
        protectionItems: HOME_PROTECTION_ITEMS,
        protectionSummary: HOME_PROTECTION_SUMMARY,
        showMerchants: merchants.length > 0,
        showCases: featuredCases.length > 0,
        geoTopics: data.geoTopics || [],
        showGeoTopics: (data.geoTopics || []).length > 0,
        heroTrustCase,
        status: 'normal',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '页面加载失败，请稍后重试',
      })
    }
  },

  onRetry() {
    this.loadHome()
  },

  onCityTap() {
    wx.showModal({
      title: '服务城市',
      content: '当前平台首发服务城市为杭州，更多城市陆续开放。',
      showCancel: false,
    })
  },

  onLearnPlatform() {
    const lines = (this.data.platformIntroItems || []).map(
      (item) => `${item.title}：${item.desc}`
    )
    wx.showModal({
      title: '了解辙见',
      content: lines.length
        ? lines.map((item) => `· ${item}`).join('\n\n')
        : '辙见提供案例展示、服务相册与咨询预约工具，实际维修由门店线下负责。',
      showCancel: false,
      confirmText: '知道了',
    })
  },

  onSearchTap() {
    wx.navigateTo({ url: '/pages/search/index/index' })
  },

  onServiceEntryTap(e) {
    const { targetType, targetId } = e.currentTarget.dataset
    if (targetType === 'service' && targetId) {
      wx.navigateTo({
        url: `/pages/service/detail/index?id=${targetId}`,
      })
      return
    }
    if (targetType === 'category' && targetId) {
      const app = getApp()
      app.globalData.pendingServiceCategory = targetId
      wx.switchTab({ url: '/pages/service/index' })
    }
  },

  onAccidentCases() {
    wx.switchTab({ url: '/pages/case/index' })
  },

  onAccidentBook() {
    const { accidentEntry } = this.data
    const id = accidentEntry && accidentEntry.serviceId
    if (!id) return
    wx.navigateTo({
      url: `/pages/service/detail/index?id=${id}`,
    })
  },

  onViewAllMerchants() {
    wx.switchTab({ url: '/pages/store/index' })
  },

  onStoreTap(e) {
    const storeId = (e.detail && e.detail.storeId) || e.currentTarget.dataset.storeId
    if (!storeId) return
    wx.navigateTo({
      url: `/pages/store/detail/index?id=${storeId}`,
    })
  },

  onCaseTap(e) {
    const caseId =
      (e.detail && e.detail.caseId) ||
      e.currentTarget.dataset.caseId
    if (!caseId) return
    wx.navigateTo({ url: `/pages/case/detail/index?id=${caseId}` })
  },

  onViewAllCases() {
    wx.switchTab({ url: '/pages/case/index' })
  },

  onGeoTopicTap(e) {
    const id = (e.detail && e.detail.topicId) || e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/geo/detail/index?id=${id}` })
  },
})
