const { fetchUserVehicle } = require('../../../../services/vehicle')
const { fetchUserServiceAlbums } = require('../../../../services/service-album')
const { enrichServiceAlbumListItem } = require('../../../../utils/service-album-display')
const { isLoggedIn, checkAuth } = require('../../../../utils/auth')

Page({
  data: {
    vehicleId: '',
    vehicle: null,
    status: 'loading',
    errorMessage: '',
    list: [],
  },

  onLoad(options) {
    this.vehicleId = options.id || options.vehicleId || ''
    if (!this.vehicleId) {
      this.setData({
        status: 'error',
        errorMessage: '车辆不存在',
      })
      return
    }
    this.loadPage()
  },

  onShow() {
    if (this.vehicleId && this.data.status !== 'loading') {
      this.loadPage({ silent: true })
    }
  },

  onPullDownRefresh() {
    this.loadPage().finally(() => wx.stopPullDownRefresh())
  },

  async loadPage(options = {}) {
    if (!isLoggedIn()) {
      this.setData({
        status: 'error',
        errorMessage: '请先登录后查看',
      })
      return
    }
    const auth = checkAuth({ needPhone: true })
    if (!auth.ok) {
      this.setData({
        status: 'error',
        errorMessage: auth.reason === 'bindPhone' ? '请先绑定手机号' : '请先登录后查看',
      })
      return
    }

    if (!options.silent) {
      this.setData({ status: 'loading', errorMessage: '' })
    }

    try {
      const [vehicle, albums] = await Promise.all([
        fetchUserVehicle(this.vehicleId),
        fetchUserServiceAlbums({ vehicleId: this.vehicleId, tab: 'all' }),
      ])
      const list = (albums || []).map((item) =>
        enrichServiceAlbumListItem(item, { audience: 'user', listTab: 'private' }),
      )
      this.setData({
        vehicle,
        list,
        status: list.length ? 'normal' : 'empty',
        errorMessage: '',
      })
      if (vehicle && vehicle.displayTitle) {
        wx.setNavigationBarTitle({ title: vehicle.displayTitle })
      }
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
        vehicle: null,
        list: [],
      })
    }
  },

  onRetry() {
    this.loadPage()
  },

  onEditVehicle() {
    wx.navigateTo({ url: `/pages/mine/vehicle/edit/index?id=${this.vehicleId}` })
  },

  onOpenAllAlbums() {
    wx.navigateTo({ url: '/pages/album/list/index' })
  },

  onAlbumTap(e) {
    const albumId = (e.detail && e.detail.id) || (e.currentTarget.dataset && e.currentTarget.dataset.id)
    if (!albumId) return
    wx.navigateTo({ url: `/pages/album/detail/index?albumId=${albumId}` })
  },
})
