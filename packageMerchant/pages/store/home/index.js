const { fetchMerchantProfile, MERCHANT_STATUS } = require('../../../../services/merchant')
const { fetchMerchantStats } = require('../../../../services/merchant-stats')
const { fetchMerchantServiceAlbumList } = require('../../../../services/merchant-service-album')
const { isLoggedIn, isMerchantOwner } = require('../../../../utils/auth')
const { buildStoreH5Url, openH5Url } = require('../../../../constants/h5-links')
const {
  buildStoreHomeModel,
  countPublicAlbums,
  monthViewTotal,
} = require('../../../../utils/merchant-store-home')

Page({
  data: {
    status: 'loading',
    statusBarHeight: 20,
    capsulePad: 16,
    canManageStaff: false,
    storeId: '',
    home: null,
  },

  onLoad() {
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    let capsulePad = 16
    try {
      const menu = wx.getMenuButtonBoundingClientRect()
      if (menu && menu.left && sys.windowWidth) {
        capsulePad = Math.max(16, sys.windowWidth - menu.left + 8)
      }
    } catch (e) {
      capsulePad = 96
    }
    this.setData({
      statusBarHeight: sys.statusBarHeight || 20,
      capsulePad,
    })
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
    const canManageStaff = isMerchantOwner()
    const [stats, albums] = await Promise.all([
      fetchMerchantStats({ storeId: profile.storeId, period: 'month' }).catch(() => null),
      fetchMerchantServiceAlbumList({ tab: 'all' }).catch(() => []),
    ])
    const home = buildStoreHomeModel(profile, {
      publicCaseCount: countPublicAlbums(albums),
      monthViewCount: monthViewTotal((stats && stats.summary) || {}),
    })
    this.setData({
      status: 'normal',
      canManageStaff,
      storeId: profile.storeId || '',
      home,
    })
  },

  onLogoMenu() {
    const itemList = this.data.canManageStaff ? ['切换门店', '切换为车主'] : ['切换为车主']
    wx.showActionSheet({
      itemList,
      success: (res) => {
        const picked = itemList[res.tapIndex]
        if (picked === '切换门店') this.onSwitchStore()
        if (picked === '切换为车主') this.onSwitchOwner()
      },
      fail() {},
    })
  },

  onOpenStore() {
    const storeId = this.data.storeId
    if (!storeId) return
    wx.navigateTo({
      url: `/pages/store/detail/index?id=${encodeURIComponent(storeId)}`,
    })
  },

  onEdit() {
    wx.navigateTo({ url: '/packageMerchant/pages/store/edit/index?section=basic' })
  },

  onIntro() {
    wx.navigateTo({ url: '/packageMerchant/pages/store/edit/index?section=basic' })
  },

  onTech() {
    wx.navigateTo({ url: '/packageMerchant/pages/store/edit/index?section=cert' })
  },

  onStaff() {
    wx.navigateTo({ url: '/packageMerchant/pages/staff/list/index' })
  },

  onServices() {
    wx.navigateTo({ url: '/packageMerchant/pages/store/edit/index?section=skill' })
  },

  onSwitchStore() {
    if (!this.data.canManageStaff) return
    wx.navigateTo({ url: '/packageMerchant/pages/store-picker/index' })
  },

  onPreview() {
    const url = buildStoreH5Url({ storeId: this.data.storeId })
    if (!url) return
    openH5Url(url)
  },

  onSwitchOwner() {
    const { persistRole, reLaunchRoleHome, ROLE_OWNER } = require('../../../../utils/app-role')
    persistRole(ROLE_OWNER).then(() => reLaunchRoleHome(ROLE_OWNER))
  },
})
