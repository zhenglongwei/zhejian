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
      const { planAmount, amount } = this.properties
      const value = planAmount != null ? planAmount : amount
      this.setData({
        showPrice: value != null && Number(value) > 0,
      })
    },

    onShareTap() {
      this.triggerEvent('share')
    },
  },
})
