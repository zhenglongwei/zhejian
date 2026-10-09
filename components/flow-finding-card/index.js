Component({
  properties: {
    title: {
      type: String,
      value: '',
    },
    body: {
      type: String,
      value: '',
    },
    images: {
      type: Array,
      value: [],
    },
    meta: {
      type: String,
      value: '',
    },
    metaDanger: {
      type: Boolean,
      value: false,
    },
    showRemove: {
      type: Boolean,
      value: false,
    },
    showEmptyPhoto: {
      type: Boolean,
      value: false,
    },
    sectionIndex: {
      type: Number,
      value: -1,
    },
    findingIndex: {
      type: Number,
      value: -1,
    },
  },
  methods: {
    loc() {
      return {
        sectionIndex: this.data.sectionIndex,
        findingIndex: this.data.findingIndex,
      }
    },
    onTap() {
      this.triggerEvent('cardtap', this.loc())
    },
    onRemove() {
      this.triggerEvent('remove', this.loc())
    },
    onEmptyPhoto() {
      this.triggerEvent('emptyphoto', this.loc())
    },
    onPreview(e) {
      const ds = (e.currentTarget && e.currentTarget.dataset) || {}
      this.triggerEvent('preview', {
        ...this.loc(),
        url: String(ds.url || ''),
      })
    },
  },
})
