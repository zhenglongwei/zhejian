const { HOME_PLATFORM_IDENTITY } = require('../../constants/home-entries')
const { PRODUCT_NAME, PRODUCT_SUBTITLE } = require('../../constants/product-brand')

Component({
  properties: {
    title: {
      type: String,
      value: PRODUCT_NAME,
    },
    subtitle: {
      type: String,
      value: PRODUCT_SUBTITLE,
    },
    showBand: {
      type: Boolean,
      value: true,
    },
    showCompliance: {
      type: Boolean,
      value: true,
    },
    complianceText: {
      type: String,
      value: '',
    },
  },

  data: {
    resolvedComplianceText: HOME_PLATFORM_IDENTITY,
  },

  observers: {
    complianceText(text) {
      this.setData({
        resolvedComplianceText: text || HOME_PLATFORM_IDENTITY,
      })
    },
  },

  lifetimes: {
    attached() {
      const { complianceText } = this.properties
      this.setData({
        resolvedComplianceText: complianceText || HOME_PLATFORM_IDENTITY,
      })
    },
  },
})
