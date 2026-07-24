const { COMPLIANCE_COPY } = require('../../constants/compliance-copy')

Component({
  properties: {
    type: {
      type: String,
      value: 'price',
    },
    text: {
      type: String,
      value: '',
    },
  },
  data: {
    content: '',
    prewrap: false,
  },
  lifetimes: {
    attached() {
      this.updateContent()
    },
  },
  observers: {
    type() {
      this.updateContent()
    },
    text() {
      this.updateContent()
    },
  },
  methods: {
    updateContent() {
      const { type, text } = this.properties
      const resolvedType = type === 'platformDisplay' ? 'displayDisclaimer' : type
      this.setData({
        content: text || COMPLIANCE_COPY[resolvedType] || COMPLIANCE_COPY.price,
        prewrap: resolvedType === 'partRisk' || resolvedType === 'aiInspection',
      })
    },
  },
})
