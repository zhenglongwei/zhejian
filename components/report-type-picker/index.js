Component({
  properties: {
    options: {
      type: Array,
      value: [],
    },
    value: {
      type: String,
      value: '',
    },
  },
  methods: {
    onSelect(e) {
      const { value } = e.currentTarget.dataset
      if (!value || value === this.properties.value) return
      this.triggerEvent('change', { value })
    },
  },
})
