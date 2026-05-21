const { REVIEW_DIMENSIONS, COLLAPSE_FROM_INDEX } = require('../../constants/review-dimensions')

const STAR_RANGE = [1, 2, 3, 4, 5]

Component({
  properties: {
    values: {
      type: Object,
      value: {},
    },
    disabled: {
      type: Boolean,
      value: false,
    },
    collapseFrom: {
      type: Number,
      value: COLLAPSE_FROM_INDEX,
    },
  },

  data: {
    dimensions: REVIEW_DIMENSIONS,
    starRange: STAR_RANGE,
    expanded: false,
    visibleDimensions: [],
    hasCollapsed: REVIEW_DIMENSIONS.length > COLLAPSE_FROM_INDEX,
  },

  observers: {
    collapseFrom() {
      this.syncVisible()
    },
  },

  lifetimes: {
    attached() {
      this.syncVisible()
    },
  },

  methods: {
    syncVisible() {
      const { collapseFrom } = this.properties
      const { expanded } = this.data
      const dimensions = REVIEW_DIMENSIONS
      const hasCollapsed = dimensions.length > collapseFrom
      const visibleDimensions =
        expanded || !hasCollapsed
          ? dimensions
          : dimensions.slice(0, collapseFrom)
      this.setData({ visibleDimensions, hasCollapsed, dimensions })
    },

    onToggleExpand() {
      this.setData({ expanded: !this.data.expanded }, () => this.syncVisible())
    },

    onStarTap(e) {
      if (this.properties.disabled) return
      const { key, value } = e.currentTarget.dataset
      if (!key || !value) return
      const next = {
        ...(this.properties.values || {}),
        [key]: Number(value),
      }
      this.triggerEvent('change', { values: next })
    },
  },
})
