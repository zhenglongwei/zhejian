const { PUBLIC_AUTH_TIER, shouldShowStorePublicly } = require('../../constants/case-authorization')
const { buildCaseTags } = require('../../utils/case-tags')
const { resolveImageSrc } = require('../../utils/desensitize-url')

Component({
  properties: {
    caseId: { type: String, value: '' },
    authorizationTier: {
      type: String,
      value: PUBLIC_AUTH_TIER.NAMED,
    },
    coverImage: { type: String, value: '' },
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
    tags: {
      type: Array,
      value: [],
    },
  },
  data: {
    tagList: [],
    safeCoverImage: '',
    displayStoreName: false,
  },
  observers: {
    'authorizationTier, tags, showStoreName, storeName'(authorizationTier, tags, showStoreName, storeName) {
      this.syncTags(authorizationTier, tags, showStoreName, storeName)
    },
    coverImage(url) {
      this.setData({ safeCoverImage: resolveImageSrc(url) })
    },
  },
  lifetimes: {
    attached() {
      const { authorizationTier, tags, showStoreName, storeName } = this.properties
      this.syncTags(authorizationTier, tags, showStoreName, storeName)
      this.setData({
        safeCoverImage: resolveImageSrc(this.properties.coverImage),
      })
    },
  },
  methods: {
    syncTags(authorizationTier, tags, showStoreName, storeName) {
      const tagList =
        tags && tags.length ? tags : buildCaseTags(authorizationTier)
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
      this.triggerEvent('tap', { caseId: this.properties.caseId })
    },
    onCoverError() {
      this.setData({ safeCoverImage: '' })
    },
  },
})
