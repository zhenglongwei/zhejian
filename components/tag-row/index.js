const { buildCaseTags } = require('../../utils/case-tags')

Component({
  properties: {
    tags: { type: Array, value: [] },
    authorizationTier: { type: String, value: '' },
  },
  data: {
    tagList: [],
  },
  observers: {
    'tags, authorizationTier'(tags, authorizationTier) {
      const tagList =
        tags && tags.length
          ? tags
          : authorizationTier
            ? buildCaseTags(authorizationTier)
            : []
      this.setData({ tagList })
    },
  },
  lifetimes: {
    attached() {
      const { tags, authorizationTier } = this.properties
      const tagList =
        tags && tags.length
          ? tags
          : authorizationTier
            ? buildCaseTags(authorizationTier)
            : []
      this.setData({ tagList })
    },
  },
})
