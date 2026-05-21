Component({
  properties: {
    rewardId: { type: String, value: '' },
    orderId: { type: String, value: '' },
    sourceLabel: { type: String, value: '' },
    createdAtText: { type: String, value: '' },
    amount: { type: Number, value: 0 },
    statusLabel: { type: String, value: '' },
    statusVariant: { type: String, value: 'default' },
  },

  methods: {
    onTap() {
      const { orderId, rewardId } = this.properties
      this.triggerEvent('tap', { orderId, rewardId })
    },
  },
})
