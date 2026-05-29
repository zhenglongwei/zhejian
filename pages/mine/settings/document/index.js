const { getLegalDocument } = require('../../../../constants/settings-legal')

Page({
  data: {
    updatedAt: '',
    sections: [],
  },

  onLoad(options) {
    const type = (options && options.type) || 'agreement'
    const doc = getLegalDocument(type)
    wx.setNavigationBarTitle({ title: doc.title })
    this.setData({
      updatedAt: doc.updatedAt,
      sections: doc.sections || [],
    })
  },
})
