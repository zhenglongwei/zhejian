Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    variant: {
      type: String,
      value: 'card',
    },
    thumbUrl: {
      type: String,
      value: '',
    },
    name: {
      type: String,
      value: '',
    },
    partType: {
      type: String,
      value: '',
    },
    typeVariant: {
      type: String,
      value: 'default',
    },
    qty: {
      type: Number,
      value: 0,
    },
    priceAmount: {
      type: null,
      value: null,
    },
    tappable: {
      type: Boolean,
      value: true,
    },
    index: {
      type: Number,
      value: -1,
    },
    isLast: {
      type: Boolean,
      value: false,
    },
  },

  methods: {
    onTap() {
      if (!this.properties.tappable || this.properties.variant !== 'card') return
      this.triggerEvent('tap', { index: this.properties.index })
    },
  },
})
