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
  },

  data: {
    tierClass: 'basic',
    displayText: '',
  },

  observers: {
    'tier, plan, text'() {
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
        '基础版'
      this.setData({ tierClass, displayText })
    },
  },
})
