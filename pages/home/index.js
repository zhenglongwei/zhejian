const { fetchUserServiceAlbums } = require('../../services/service-album')
const { HOME_PLATFORM_IDENTITY } = require('../../constants/home-entries')
const { H5_CONTENT_SITE_URL, H5_CONTENT_SITE_HINT } = require('../../constants/h5-links')
const { navigateToScanTarget, navigateFromAlbumCode } = require('../../utils/tool-scan')
const { enrichServiceAlbumListItem } = require('../../utils/service-album-display')
const { isLoggedIn, checkAuth } = require('../../utils/auth')

const HOME_ALBUM_PREVIEW_LIMIT = 5

Page({
  data: {
    status: 'normal',
    errorMessage: '',
    platformIdentity: HOME_PLATFORM_IDENTITY,
    h5SiteLabel: '想了解公开维修案例？前往辙见内容站',
    isLoggedIn: false,
    albumPreview: [],
    showAlbumPreview: false,
    showAlbumEmpty: false,
    enterCodeVisible: false,
    enterCodeValue: '',
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    scanning: false,
  },

  onShow() {
    this.refreshPage()
  },

  onPullDownRefresh() {
    this.refreshPage().finally(() => wx.stopPullDownRefresh())
  },

  async refreshPage() {
    const loggedIn = isLoggedIn()
    this.setData({ isLoggedIn: loggedIn })

    if (!loggedIn) {
      this.setData({
        status: 'normal',
        albumPreview: [],
        showAlbumPreview: false,
        showAlbumEmpty: false,
        errorMessage: '',
      })
      return
    }

    const auth = checkAuth({ needPhone: false })
    if (!auth.ok) {
      this.setData({
        status: 'normal',
        albumPreview: [],
        showAlbumPreview: false,
        showAlbumEmpty: false,
        errorMessage: '',
      })
      return
    }

    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const raw = await fetchUserServiceAlbums({ tab: 'private' })
      const albumPreview = (raw || [])
        .slice(0, HOME_ALBUM_PREVIEW_LIMIT)
        .map((item) => enrichServiceAlbumListItem(item, { listTab: 'private' }))
      this.setData({
        status: 'normal',
        albumPreview,
        showAlbumPreview: albumPreview.length > 0,
        showAlbumEmpty: albumPreview.length === 0,
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败，请稍后重试',
        albumPreview: [],
        showAlbumPreview: false,
        showAlbumEmpty: false,
      })
    }
  },

  onRetry() {
    this.refreshPage()
  },

  onScanTap() {
    if (this.data.scanning) return
    this.setData({ scanning: true })
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode', 'barCode'],
      success: (res) => {
        navigateToScanTarget(res.result)
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) return
        wx.showToast({ title: '扫码失败', icon: 'none' })
      },
      complete: () => {
        this.setData({ scanning: false })
      },
    })
  },

  onEnterCodeTap() {
    this.setData({ enterCodeVisible: true, enterCodeValue: '' })
  },

  onEnterCodeClose() {
    this.setData({ enterCodeVisible: false, enterCodeValue: '' })
  },

  onEnterCodeInput(e) {
    this.setData({ enterCodeValue: (e.detail && e.detail.value) || '' })
  },

  onEnterCodeConfirm() {
    const code = (this.data.enterCodeValue || '').trim()
    if (!navigateFromAlbumCode(code)) return
    this.onEnterCodeClose()
  },

  onMyAlbumsTap() {
    if (!isLoggedIn()) {
      this.setData({ loginSheetVisible: true, loginSheetMode: 'login' })
      return
    }
    wx.navigateTo({ url: '/pages/album/list/index' })
  },

  onAlbumPreviewTap(e) {
    const albumId = e.currentTarget.dataset.albumId
    if (!albumId) return
    wx.navigateTo({ url: `/pages/album/detail/index?albumId=${albumId}` })
  },

  onViewAllAlbums() {
    this.onMyAlbumsTap()
  },

  onH5SiteTap() {
    wx.setClipboardData({
      data: H5_CONTENT_SITE_URL,
      success: () => {
        wx.showToast({ title: H5_CONTENT_SITE_HINT, icon: 'none', duration: 2500 })
      },
    })
  },

  onMerchantTap() {
    wx.navigateTo({ url: '/packageMerchant/pages/workbench/index' })
  },

  onHelpTap() {
    wx.showModal({
      title: '使用说明',
      content:
        '车主：扫描门店二维码或输入相册码，查看维修服务记录；登录后在「我的服务相册」管理记录。想了解公开案例请前往内容站。\n\n商家：点击「我是商家」进入工作台，创建服务相册并邀请车主查看。',
      showCancel: false,
      confirmText: '知道了',
    })
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
  },

  onLoginSheetSuccess() {
    this.closeLoginSheet()
    this.refreshPage()
    wx.navigateTo({ url: '/pages/album/list/index' })
  },
})
