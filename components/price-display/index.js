const { formatYuan, formatPriceRange } = require('../../utils/format')
const { PRICE_MODE } = require('../../constants/price-mode')

const DISCLAIMERS = {
  [PRICE_MODE.RANGE]: '实际费用以门店检测结果为准',
  [PRICE_MODE.CONSULT]: '到店检测后报价',
  [PRICE_MODE.ACCIDENT]: '不线上报价，请预约到店检测后确认方案',
}

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
    /** 覆盖默认免责文案 */
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

      let priceText = ''
      let showPrice = true
      let disclaimer = ''

      if (mode === PRICE_MODE.FIXED) {
        priceText = `${currency}${formatYuan(amount)}${showSuffix ? ' 起' : ''}`
      } else if (mode === PRICE_MODE.RANGE) {
        priceText = `参考区间 ${formatPriceRange(minAmount, maxAmount, currency)}`
      } else if (mode === PRICE_MODE.CONSULT) {
        showPrice = false
        priceText = '到店检测后报价'
      } else if (mode === PRICE_MODE.ACCIDENT) {
        showPrice = false
        priceText = '预约到店检测后报价'
      }

      if (showDisclaimer) {
        disclaimer = disclaimerText || DISCLAIMERS[mode] || ''
      }

      this.setData({ priceText, disclaimer, showPrice })
    },
  },
})
