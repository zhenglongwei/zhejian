const { fetchMerchantProfile, fetchMerchantStores, MERCHANT_STATUS } = require('../../../../services/merchant')
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
    canSwitchStore: false,
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
    let canSwitchStore = false
    if (canManageStaff) {
      try {
        const stores = await fetchMerchantStores()
        canSwitchStore = (stores.list || []).length > 0
      } catch (e) {
        canSwitchStore = true
      }
    }
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
      canSwitchStore,
      storeId: profile.storeId || '',
      home,
    })
  },

  onLogoMenu() {
    wx.showActionSheet({
      itemList: ['切换为车主'],
      success: (res) => {
        if (res.tapIndex === 0) this.onSwitchOwner()
      },
      fail() {},
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
    if (!this.data.canSwitchStore) return
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
