const { getHelpPathSections } = require('../../../constants/help-content')
const { openH5ContentSite } = require('../../../constants/h5-links')
const { openPlatformSupportContact } = require('../../../utils/support-contact')

Page({
  data: {
    sections: getHelpPathSections('owner'),
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
