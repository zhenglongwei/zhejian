Component({
  properties: {
    storeId: { type: String, value: '' },
    name: { type: String, value: '' },
    address: { type: String, value: '' },
    businessHours: { type: String, value: '' },
    score: { type: null, value: null },
    caseCount: { type: null, value: null },
    cardTags: { type: Array, value: [] },
    showLink: { type: Boolean, value: false },
    linkText: { type: String, value: '查看门店详情 ›' },
  },

  methods: {
    onTap() {
      const { storeId } = this.properties
      if (!storeId) return
      this.triggerEvent('tap', { storeId })
    },
  },
})
