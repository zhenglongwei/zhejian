const { getAuthorizationLegalDocument } = require('../../constants/authorization-legal')

Page({
  data: {
    updatedAt: '',
    version: '',
    sections: [],
  },

  onLoad() {
    const doc = getAuthorizationLegalDocument()
    wx.setNavigationBarTitle({ title: doc.title })
    this.setData({
      updatedAt: doc.updatedAt,
      version: doc.version || '',
      sections: doc.sections || [],
    })
  },

  onOpenIncentiveRules() {
    wx.navigateTo({
      url: '/pages/mine/settings/document/index?type=incentive',
    })
  },
})
