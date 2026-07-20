const {
  buildHelpCenterTabs,
  getHelpPathSections,
} = require('../../../constants/help-content')
const { openH5ContentSite } = require('../../../constants/h5-links')
const { openPlatformSupportContact } = require('../../../utils/support-contact')

Page({
  data: {
    tabs: buildHelpCenterTabs(),
    activeTab: 'owner',
    sections: getHelpPathSections('owner'),
  },

  onTabChange(e) {
    const key = e.detail.key
    if (!key || key === this.data.activeTab) return
    this.setData({
      activeTab: key,
      sections: getHelpPathSections(key),
    })
  },

  onOpenAbout() {
    wx.navigateTo({ url: '/pages/mine/settings/about/index' })
  },

  onOpenH5Site() {
    openH5ContentSite()
  },

  onContactSupport() {
    openPlatformSupportContact()
  },
})
