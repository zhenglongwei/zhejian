const { HOME_PLATFORM_IDENTITY } = require('../../constants/home-entries')

Component({
  properties: {
    title: {
      type: String,
      value: '服务相册',
    },
    subtitle: {
      type: String,
      value: '门店维修记录',
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
