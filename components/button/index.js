Component({
  properties: {
    type: {
      type: String,
      value: 'primary',
    },
    size: {
      type: String,
      value: 'default',
    },
    disabled: {
      type: Boolean,
      value: false,
    },
    loading: {
      type: Boolean,
      value: false,
    },
    block: {
      type: Boolean,
      value: false,
    },
    openType: {
      type: String,
      value: '',
    },
  },
  methods: {
    onTap() {
      if (this.properties.disabled || this.properties.loading) return
      this.triggerEvent('tap')
    },
  },
})
