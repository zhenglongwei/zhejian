const {
  fetchUserVehicles,
  deleteUserVehicle,
  setDefaultVehicle,
} = require('../../../services/vehicle')
const { MAX_USER_VEHICLES, VEHICLE_DELETE_CONFIRM } = require('../../../constants/user-vehicle')
const { isLoggedIn, checkAuth } = require('../../../utils/auth')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    needLogin: false,
    needPhone: false,
    list: [],
    maxVehicles: MAX_USER_VEHICLES,
    canAdd: true,
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    loginSheetBindContext: 'vehicle',
  },

  onShow() {
    this.loadList()
  },

  onPullDownRefresh() {
    this.loadList().finally(() => wx.stopPullDownRefresh())
  },

  async loadList() {
    if (!isLoggedIn()) {
      this.setData({
        status: 'unauthenticated',
        needLogin: true,
        needPhone: false,
        list: [],
        canAdd: false,
        errorMessage: '',
      })
      return
    }

    const auth = checkAuth({ needPhone: true })
    if (!auth.ok) {
      this.setData({
        status: 'unauthenticated',
        needLogin: auth.reason !== 'bindPhone',
        needPhone: auth.reason === 'bindPhone',
        list: [],
        canAdd: false,
        errorMessage: '',
      })
      return
    }

    this.setData({ status: 'loading', errorMessage: '', needLogin: false, needPhone: false })
    try {
      const list = await fetchUserVehicles()
      this.setData({
        list: list || [],
        canAdd: (list || []).length < MAX_USER_VEHICLES,
        status: list && list.length ? 'normal' : 'empty',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
        list: [],
        canAdd: false,
      })
    }
  },

  onRetry() {
    this.loadList()
  },

  onLoginTap() {
    this.setData({
      loginSheetVisible: true,
      loginSheetMode: this.data.needPhone ? 'bindPhone' : 'login',
    })
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
  },

  onLoginSheetSuccess() {
    this.closeLoginSheet()
    this.loadList()
  },

  onAddVehicle() {
    if (!this.data.canAdd) {
      wx.showToast({ title: `最多添加 ${MAX_USER_VEHICLES} 辆车`, icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/mine/vehicle/edit/index' })
  },

  onOpenDetail(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    wx.navigateTo({ url: `/pages/mine/vehicle/detail/index?id=${id}` })
  },

  onEditVehicle(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    wx.navigateTo({ url: `/pages/mine/vehicle/edit/index?id=${id}` })
  },

  async onSetDefault(e) {
    const { id } = e.currentTarget.dataset
    if (!id || this._defaultBusy) return
    this._defaultBusy = true
    try {
      await setDefaultVehicle(id)
      wx.showToast({ title: '已设为默认', icon: 'success' })
      await this.loadList()
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
    } finally {
      this._defaultBusy = false
    }
  },

  onDeleteVehicle(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    wx.showModal({
      title: '删除车辆',
      content: VEHICLE_DELETE_CONFIRM,
      confirmText: '删除',
      confirmColor: '#C0392B',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await deleteUserVehicle(id)
          wx.showToast({ title: '已删除', icon: 'success' })
          await this.loadList()
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' })
        }
      },
    })
  },
})
