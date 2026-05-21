const { CASE_SOURCE } = require('../../constants/case-source')
const { buildCaseTags } = require('../../utils/case-tags')
const { isDesensitizedUrl } = require('../../utils/desensitize-mock')

Component({
  properties: {
    caseId: { type: String, value: '' },
    caseSource: {
      type: String,
      value: CASE_SOURCE.MERCHANT_HISTORY,
    },
    coverImage: { type: String, value: '' },
    title: { type: String, value: '' },
    serviceName: { type: String, value: '' },
    summary: { type: String, value: '' },
    priceMode: { type: String, value: 'range' },
    minAmount: { type: null, value: null },
    maxAmount: { type: null, value: null },
    storeName: { type: String, value: '' },
    viewCount: { type: Number, value: 0 },
    muted: {
      type: Boolean,
      value: false,
    },
    showStoreName: { type: Boolean, value: true },
    /** 传入时覆盖默认 buildCaseTags（商家相册列表按状态） */
    tags: {
      type: Array,
      value: [],
    },
  },
  data: {
    tagList: [],
    isHistory: false,
    priceDisclaimer: '',
    safeCoverImage: '',
  },
  observers: {
    'caseSource, tags'(source, tags) {
      this.syncTags(source, tags)
    },
    coverImage(url) {
      this.setData({
        safeCoverImage: isDesensitizedUrl(url) ? url : '',
      })
    },
  },
  lifetimes: {
    attached() {
      this.syncTags(this.properties.caseSource, this.properties.tags)
      this.setData({
        safeCoverImage: isDesensitizedUrl(this.properties.coverImage)
          ? this.properties.coverImage
          : '',
      })
    },
  },
  methods: {
    syncTags(source, tags) {
      const isHistory = source === CASE_SOURCE.MERCHANT_HISTORY
      const tagList =
        tags && tags.length ? tags : buildCaseTags(source)
      this.setData({
        tagList,
        isHistory,
        priceDisclaimer: isHistory ? '商家历史案例，价格仅供参考' : '',
      })
    },
    onTap() {
      if (!this.properties.caseId) return
      this.triggerEvent('tap', { caseId: this.properties.caseId })
    },
  },
})
