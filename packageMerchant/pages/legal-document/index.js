const { getMerchantLegalDocument } = require('../../../constants/merchant-legal')

Page({
  data: {
    updatedAt: '',
    version: '',
    sections: [],
  },

  onLoad(options) {
    const type = (options && options.type) || 'merchant'
    const doc = getMerchantLegalDocument(type)
    wx.setNavigationBarTitle({ title: doc.title })
    this.setData({
      updatedAt: doc.updatedAt,
      version: doc.version || '',
      sections: doc.sections || [],
    })
  },
})
