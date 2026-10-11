const { fetchMerchantProfile, MERCHANT_STATUS } = require('../../../../services/merchant')
const { isLoggedIn, isMerchantOwner } = require('../../../../utils/auth')

Page({
  data: {
    storeName: '',
    address: '',
    canManageStaff: false,
  },

  onShow() {
    this.load()
  },

  async load() {
    if (!isLoggedIn()) {
      wx.redirectTo({ url: '/packageMerchant/pages/workbench/index' })
      return
    }
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      wx.redirectTo({ url: '/packageMerchant/pages/workbench/index' })
      return
    }
    this.setData({
      storeName: profile.storeName || '门店',
      address: profile.address || '',
      canManageStaff: isMerchantOwner(),
    })
  },

  onEdit() {
    wx.navigateTo({ url: '/packageMerchant/pages/store/edit/index' })
  },

  onStaff() {
    wx.navigateTo({ url: '/packageMerchant/pages/staff/list/index' })
  },

  onServices() {
    wx.navigateTo({ url: '/packageMerchant/pages/service/list/index' })
  },

  onSwitchOwner() {
    const { persistRole, reLaunchRoleHome, ROLE_OWNER } = require('../../../../utils/app-role')
    persistRole(ROLE_OWNER).then(() => reLaunchRoleHome(ROLE_OWNER))
  },
})
