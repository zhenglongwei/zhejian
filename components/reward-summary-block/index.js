Component({
  properties: {
    variant: { type: String, value: 'submit' },
    amount: { type: Number, value: 0 },
    leadText: { type: String, value: '' },
    metaText: { type: String, value: '' },
    showCompliance: { type: Boolean, value: true },
    showRulesLink: { type: Boolean, value: true },
  },

  methods: {
    onOpenRules() {
      this.triggerEvent('rules')
    },
  },
})
