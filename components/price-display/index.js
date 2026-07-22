const { formatYuan } = require('../../utils/format')
const {
  PRICE_MODE,
  normalizePriceMode,
  resolveReferenceAmount,
} = require('../../constants/price-mode')

Component({
  properties: {
    mode: {
      type: String,
      value: PRICE_MODE.FIXED,
    },
    amount: { type: null, value: null },
    minAmount: { type: null, value: null },
    maxAmount: { type: null, value: null },
    currency: { type: String, value: '¥' },
    showDisclaimer: { type: Boolean, value: true },
    showSuffix: { type: Boolean, value: true },
    /** 覆盖默认副文案 */
    disclaimerText: { type: String, value: '' },
  },
  data: {
    priceText: '',
    disclaimer: '',
    showPrice: true,
  },
  observers: {
    'mode, amount, minAmount, maxAmount, currency, showDisclaimer, showSuffix, disclaimerText'() {
      this.updateDisplay()
    },
  },
  lifetimes: {
    attached() {
      this.updateDisplay()
    },
  },
  methods: {
    updateDisplay() {
      const {
        mode,
        amount,
        minAmount,
        maxAmount,
        currency,
        showDisclaimer,
        showSuffix,
        disclaimerText,
      } = this.properties

      const normalized = normalizePriceMode(mode)
      let priceText = ''
      let showPrice = true
      let disclaimer = ''

      if (normalized === PRICE_MODE.FIXED) {
        priceText = `${currency}${formatYuan(amount)}${showSuffix ? ' 起' : ''}`
        // 一口价不展示「参考价 / 到店检测」类提示
        disclaimer = ''
      } else {
        const ref = resolveReferenceAmount({ amount, minAmount, maxAmount })
        if (ref != null) {
          priceText = `参考价 ${currency}${formatYuan(ref)}`
          disclaimer = showDisclaimer
            ? disclaimerText || '到店检测后确定'
            : ''
        } else {
          priceText = '到店检测后确定'
          showPrice = false
          disclaimer = ''
        }
      }

      this.setData({ priceText, disclaimer, showPrice })
    },
  },
})
