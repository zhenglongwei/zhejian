const {
  HELP_CENTER_IDENTITY,
  HELP_CENTER_ABOUT,
  buildHelpCenterTabs,
  getHelpPathSections,
} = require('../../../constants/help-content')
const { openH5ContentSite } = require('../../../constants/h5-links')
const { openPlatformSupportContact } = require('../../../utils/support-contact')

Page({
  data: {
    tabs: buildHelpCenterTabs(),
    activeTab: 'owner',
    identity: HELP_CENTER_IDENTITY,
    sections: getHelpPathSections('owner'),
    about: HELP_CENTER_ABOUT,
  },

  onTabChange(e) {
    const key = e.detail.key
    if (!key || key === this.data.activeTab) return
    this.setData({
      activeTab: key,
      sections: getHelpPathSections(key),
    })
  },

  onOpenH5Site() {
    openH5ContentSite()
  },

  onContactSupport() {
    openPlatformSupportContact()
  },
})
