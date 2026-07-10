const { resolveMerchantPlanTier } = require('../../constants/merchant-plan-tier')

Component({
  properties: {
    tier: {
      type: String,
      value: '',
    },
    plan: {
      type: String,
      value: '',
    },
    text: {
      type: String,
      value: '',
    },
    size: {
      type: String,
      value: 'md',
    },
  },

  data: {
    tierClass: 'basic',
    displayText: '',
    sizeClass: 'md',
  },

  observers: {
    'tier, plan, text, size'() {
      this.syncDisplay()
    },
  },

  lifetimes: {
    attached() {
      this.syncDisplay()
    },
  },

  methods: {
    syncDisplay() {
      const plan = this.properties.plan
      const tierProp = this.properties.tier
      const resolved = plan ? resolveMerchantPlanTier(plan) : null
      const tierClass = tierProp || (resolved && resolved.tier) || 'basic'
      const displayText =
        this.properties.text ||
        (resolved && resolved.text) ||
        '免费版'
      const size = this.properties.size || 'md'
      const sizeClass = size === 'sm' || size === 'lg' ? size : 'md'
      this.setData({ tierClass, displayText, sizeClass })
    },
  },
})
