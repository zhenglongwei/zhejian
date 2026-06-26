const { PUBLIC_AUTH_TIER, shouldShowStorePublicly } = require('../../constants/case-authorization')
const { PRICE_MODE } = require('../../constants/price-mode')
const { buildCaseTags, buildCaseTrustTags } = require('../../utils/case-tags')
const { pickCaseDisplayCover } = require('../../utils/desensitize-url')

Component({
  properties: {
    caseId: { type: String, value: '' },
    authorizationTier: {
      type: String,
      value: PUBLIC_AUTH_TIER.NAMED,
    },
    coverImage: { type: String, value: '' },
    coverImageDesensitized: { type: String, value: '' },
    title: { type: String, value: '' },
    serviceName: { type: String, value: '' },
    summary: { type: String, value: '' },
    priceMode: { type: String, value: 'range' },
    amount: { type: null, value: null },
    minAmount: { type: null, value: null },
    maxAmount: { type: null, value: null },
    storeName: { type: String, value: '' },
    viewCount: { type: Number, value: 0 },
    showStoreName: { type: Boolean, value: true },
    embedded: { type: Boolean, value: false },
    trustOnlyTags: { type: Boolean, value: false },
    showPriceDisclaimer: { type: null, value: null },
    tags: {
      type: Array,
      value: [],
    },
  },
  data: {
    tagList: [],
    displayCover: '',
    displayStoreName: false,
    priceShowSuffix: true,
    priceShowDisclaimer: true,
  },
  observers: {
    showPriceDisclaimer(showPriceDisclaimer) {
      if (showPriceDisclaimer != null) {
        this.setData({ priceShowDisclaimer: Boolean(showPriceDisclaimer) })
      }
    },
    priceMode(priceMode) {
      const isFixed = priceMode === PRICE_MODE.FIXED
      this.setData({
        priceShowSuffix: !isFixed,
        priceShowDisclaimer: !isFixed,
      })
    },
    'authorizationTier, tags, showStoreName, storeName, trustOnlyTags'(
      authorizationTier,
      tags,
      showStoreName,
      storeName,
      trustOnlyTags
    ) {
      this.syncTags(authorizationTier, tags, showStoreName, storeName, trustOnlyTags)
    },
    'coverImage, coverImageDesensitized'() {
      this.syncDisplayCover()
    },
  },
  lifetimes: {
    attached() {
      const { authorizationTier, tags, showStoreName, storeName, priceMode, trustOnlyTags, showPriceDisclaimer } =
        this.properties
      const isFixed = priceMode === PRICE_MODE.FIXED
      this.setData({
        priceShowSuffix: !isFixed,
        priceShowDisclaimer:
          showPriceDisclaimer != null ? Boolean(showPriceDisclaimer) : !isFixed,
      })
      this.syncTags(authorizationTier, tags, showStoreName, storeName, trustOnlyTags)
    },
    ready() {
      this.syncDisplayCover()
    },
  },
  methods: {
    syncDisplayCover() {
      const displayCover = pickCaseDisplayCover(this.properties)
      if (displayCover !== this.data.displayCover) {
        this.setData({ displayCover })
      }
    },
    syncTags(authorizationTier, tags, showStoreName, storeName, trustOnlyTags) {
      let tagList = tags && tags.length ? tags : buildCaseTags(authorizationTier)
      if (trustOnlyTags) {
        tagList = buildCaseTrustTags()
      }
      const canShowStore =
        shouldShowStorePublicly(authorizationTier) &&
        showStoreName !== false &&
        Boolean(storeName)
      this.setData({
        tagList,
        displayStoreName: canShowStore,
      })
    },
    onTap() {
      if (!this.properties.caseId) return
      // 勿用事件名 tap：真机上 bind:tap 会与原生冒泡叠加，导致回调执行两次且第二次 detail 为空
      this.triggerEvent('cardtap', { caseId: this.properties.caseId })
    },
  },
})
