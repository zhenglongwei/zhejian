Component({
  properties: {
    showFavorite: {
      type: Boolean,
      value: true,
    },
    isFavorited: {
      type: Boolean,
      value: false,
    },
    showShare: {
      type: Boolean,
      value: true,
    },
    shareDisabled: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    favoriteText: '收藏',
  },

  observers: {
    isFavorited(val) {
      this.setData({ favoriteText: val ? '已收藏' : '收藏' })
    },
  },

  lifetimes: {
    attached() {
      this.setData({
        favoriteText: this.properties.isFavorited ? '已收藏' : '收藏',
      })
    },
  },

  methods: {
    onFavoriteTap() {
      this.triggerEvent('favorite')
    },

    onShareTap() {
      if (this.properties.shareDisabled) return
      this.triggerEvent('share')
    },
  },
})
