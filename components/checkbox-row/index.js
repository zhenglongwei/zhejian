Component({
  properties: {
    checked: {
      type: Boolean,
      value: false,
    },
    disabled: {
      type: Boolean,
      value: false,
    },
  },

  methods: {
    onToggle() {
      if (this.properties.disabled) return
      this.triggerEvent('toggle')
      this.triggerEvent('change', { checked: !this.properties.checked })
    },
  },
})
