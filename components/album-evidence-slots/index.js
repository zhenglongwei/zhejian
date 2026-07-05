Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    items: {
      type: Array,
      value: [],
    },
    disabled: {
      type: Boolean,
      value: false,
    },
    uploadHint: {
      type: String,
      value: '',
    },
  },

  methods: {
    onImagesChange(e) {
      const { id } = e.currentTarget.dataset
      const images = (e.detail && e.detail.images) || []
      if (!id) return
      const next = (this.properties.items || []).map((item) =>
        item.id === id ? { ...item, images } : item,
      )
      this.triggerEvent('change', { items: next })
    },
  },
})
