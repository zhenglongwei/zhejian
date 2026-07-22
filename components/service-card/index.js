const {
  PRICE_MODE,
  PRICE_MODE_LABEL,
  normalizePriceMode,
} = require('../../constants/price-mode')

const MODE_TAG_VARIANT = {
  [PRICE_MODE.FIXED]: 'success',
  [PRICE_MODE.CONSULT]: 'onsite',
}

const MAX_TAGS = 3

Component({
  properties: {
    serviceId: { type: String, value: '' },
    name: { type: String, value: '' },
    categoryName: { type: String, value: '' },
    summary: { type: String, value: '' },
    priceMode: { type: String, value: PRICE_MODE.CONSULT },
    amount: { type: null, value: null },
    minAmount: { type: null, value: null },
    maxAmount: { type: null, value: null },
    storeName: { type: String, value: '' },
    onlinePaymentEnabled: { type: Boolean, value: false },
    showStoreName: { type: Boolean, value: true },
    showTags: { type: Boolean, value: true },
    readonly: { type: Boolean, value: false },
    embedded: { type: Boolean, value: false },
    showSuffix: { type: null, value: null },
    disclaimerText: { type: String, value: '' },
    /** 商家列表：草稿 / 已上架等工作流状态 */
    statusLabel: { type: String, value: '' },
    statusVariant: { type: String, value: 'warning' },
  },
  data: {
    tagList: [],
    showPriceSuffix: true,
  },
  observers: {
    'priceMode, statusLabel, statusVariant, categoryName, showTags'() {
      this.syncTags()
    },
  },
  lifetimes: {
    attached() {
      this.syncTags()
    },
  },
  methods: {
    syncTags() {
      const {
        priceMode,
        statusLabel,
        statusVariant,
        categoryName,
        showTags,
      } = this.properties
      const normalized = normalizePriceMode(priceMode)
      if (!showTags) {
        this.setData({
          tagList: [],
          showPriceSuffix: normalized !== PRICE_MODE.FIXED,
        })
        return
      }
      const modeLabel = PRICE_MODE_LABEL[normalized] || normalized
      const modeVariant = MODE_TAG_VARIANT[normalized] || 'default'
      const tags = []
      if (statusLabel) {
        tags.push({ variant: statusVariant, text: statusLabel })
      }
      tags.push({ variant: modeVariant, text: modeLabel })
      if (categoryName && !statusLabel) {
        tags.push({ variant: 'info', text: categoryName })
      }
      this.setData({
        tagList: tags.slice(0, MAX_TAGS),
        showPriceSuffix: normalized !== PRICE_MODE.FIXED,
      })
    },
    onTap() {
      if (this.properties.readonly) return
      if (!this.properties.serviceId) return
      this.triggerEvent('cardtap', { serviceId: this.properties.serviceId })
    },
  },
})
