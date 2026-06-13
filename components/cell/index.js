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
    dot: {
      type: Boolean,
      value: false,
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
    icon: {
      type: String,
      value: '',
    },
    iconBg: {
      type: String,
      value: '',
    },
  },

  methods: {
    onTap() {
      if (this.properties.disabled) return
      this.triggerEvent('celltap')
    },
  },
})
