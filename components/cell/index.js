Component({
  properties: {
    title: {
      type: String,
      value: '',
    },
    desc: {
      type: String,
      value: '',
    },
    badge: {
      type: String,
      value: '',
    },
    arrow: {
      type: Boolean,
      value: true,
    },
    border: {
      type: Boolean,
      value: true,
    },
    disabled: {
      type: Boolean,
      value: false,
    },
  },

  methods: {
    onTap() {
      if (this.properties.disabled) return
      this.triggerEvent('tap')
    },
  },
})
