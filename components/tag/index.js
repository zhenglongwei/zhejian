const VARIANT_CLASS = {
  order: 'tag--order',
  history: 'tag--history',
  desensitized: 'tag--desensitized',
  audited: 'tag--audited',
  onsite: 'tag--onsite',
  reference: 'tag--reference',
  complex: 'tag--complex',
  accident: 'tag--accident',
  success: 'tag--success',
  warning: 'tag--warning',
  danger: 'tag--danger',
  info: 'tag--info',
  default: '',
}

Component({
  properties: {
    variant: {
      type: String,
      value: 'default',
    },
    text: {
      type: String,
      value: '',
    },
  },
  data: {
    variantClass: '',
  },
  observers: {
    variant(v) {
      this.setData({ variantClass: VARIANT_CLASS[v] || '' })
    },
  },
  lifetimes: {
    attached() {
      this.setData({
        variantClass: VARIANT_CLASS[this.properties.variant] || '',
      })
    },
  },
})
