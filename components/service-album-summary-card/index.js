const { PRICE_MODE } = require('../../constants/price-mode')

Component({
  properties: {
    statusVariant: {
      type: String,
      value: 'default',
    },
    statusLabel: {
      type: String,
      value: '',
    },
    visibilityLabel: {
      type: String,
      value: '',
    },
    visibilityVariant: {
      type: String,
      value: 'default',
    },
    title: {
      type: String,
      value: '',
    },
    rows: {
      type: Array,
      value: [],
    },
    showShare: {
      type: Boolean,
      value: false,
    },
    priceMode: {
      type: String,
      value: PRICE_MODE.FIXED,
    },
    amount: {
      type: null,
      value: null,
    },
    planAmount: {
      type: null,
      value: null,
    },
  },

  data: {
    showPrice: false,
  },

  observers: {
    'planAmount, amount'() {
      this.updatePriceVisibility()
    },
  },

  lifetimes: {
    attached() {
      this.updatePriceVisibility()
    },
  },

  methods: {
    updatePriceVisibility() {
      // 相册藏价：摘要卡不再展示方案报价
      this.setData({ showPrice: false })
    },

    onShareTap() {
      this.triggerEvent('share')
    },
  },
})
