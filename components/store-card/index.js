Component({
  properties: {
    storeId: { type: String, value: '' },
    coverImage: { type: String, value: '' },
    distanceText: { type: String, value: '' },
    name: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    address: { type: String, value: '' },
    businessHours: { type: String, value: '' },
    score: { type: null, value: null },
    caseCount: { type: null, value: null },
    cardTags: { type: Array, value: [] },
    showLink: { type: Boolean, value: false },
    linkText: { type: String, value: '查看门店详情 ›' },
    mode: { type: String, value: 'default' },
    anonymousHint: {
      type: String,
      value: '本案例为匿名授权公示，不展示门店名称。',
    },
    contactHint: { type: String, value: '' },
  },

  data: {
    anonymousContactLine: '',
  },

  observers: {
    'mode, subtitle, contactHint'(mode, subtitle, contactHint) {
      if (mode !== 'anonymous') return
      const line =
        contactHint ||
        `可通过下方电话或留言联系服务门店${subtitle ? `（${subtitle}）` : ''}`
      this.setData({ anonymousContactLine: line })
    },
  },

  lifetimes: {
    attached() {
      const { mode, subtitle, contactHint } = this.properties
      if (mode === 'anonymous') {
        const line =
          contactHint ||
          `可通过下方电话或留言联系服务门店${subtitle ? `（${subtitle}）` : ''}`
        this.setData({ anonymousContactLine: line })
      }
    },
  },

  methods: {
    onTap() {
      const { storeId, mode } = this.properties
      if (mode === 'anonymous' || !storeId) return
      this.triggerEvent('tap', { storeId })
    },
  },
})
