const { HOME_PLATFORM_IDENTITY } = require('../../constants/home-entries')

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    storePhone: {
      type: String,
      value: '',
    },
    contactLabel: {
      type: String,
      value: '联系门店',
    },
    complianceType: {
      type: String,
      value: 'homePlatform',
    },
    complianceText: {
      type: String,
      value: '',
    },
    showCompliance: {
      type: Boolean,
      value: true,
    },
  },

  data: {
    resolvedComplianceText: HOME_PLATFORM_IDENTITY,
    showContact: false,
  },

  observers: {
    'storePhone, complianceText, complianceType': function (
      storePhone,
      complianceText,
      complianceType,
    ) {
      this.syncDisplay(storePhone, complianceText, complianceType)
    },
  },

  lifetimes: {
    attached() {
      const { storePhone, complianceText, complianceType } = this.properties
      this.syncDisplay(storePhone, complianceText, complianceType)
    },
  },

  methods: {
    syncDisplay(storePhone, complianceText, complianceType) {
      const phone = String(storePhone || '').trim()
      let resolvedComplianceText = complianceText
      if (!resolvedComplianceText && complianceType === 'homePlatform') {
        resolvedComplianceText = HOME_PLATFORM_IDENTITY
      }
      this.setData({
        showContact: Boolean(phone),
        resolvedComplianceText,
      })
    },

    onContactTap() {
      const phone = String(this.properties.storePhone || '').trim()
      if (!phone) return
      this.triggerEvent('contact', { phone })
    },
  },
})
