Component({
  properties: {
    images: {
      type: Array,
      value: [],
    },
    label: {
      type: String,
      value: '未归组',
    },
    canAssign: {
      type: Boolean,
      value: false,
    },
    canPromote: {
      type: Boolean,
      value: true,
    },
    readOnly: {
      type: Boolean,
      value: false,
    },
  },
  methods: {
    emit(name, index, extra = {}) {
      const n = Number(index)
      if (!Number.isFinite(n) || n < 0) return
      this.triggerEvent(name, { index: n, ...extra })
    },
    onPreview(e) {
      const ds = (e.currentTarget && e.currentTarget.dataset) || {}
      this.emit('preview', ds.index, { url: String(ds.url || '') })
    },
    onAssign(e) {
      if (this.properties.readOnly) return
      const ds = (e.currentTarget && e.currentTarget.dataset) || {}
      this.emit('assign', ds.index)
    },
    onPromote(e) {
      if (this.properties.readOnly) return
      const ds = (e.currentTarget && e.currentTarget.dataset) || {}
      this.emit('promote', ds.index)
    },
    onRemove(e) {
      if (this.properties.readOnly) return
      const ds = (e.currentTarget && e.currentTarget.dataset) || {}
      this.emit('remove', ds.index)
    },
  },
})
