const { fetchMineSummary, updateUserProfile } = require('../../../services/user')
const { fetchDefaultVehicle } = require('../../../services/vehicle')
const { uploadImage, isLocalTempImagePath } = require('../../../utils/media-upload')
const { isLoggedIn, checkAuth } = require('../../../utils/auth')
const { resolveImageSrc } = require('../../../utils/desensitize-url')

function resolveDisplayAvatarUrl(user, avatarPreview) {
  const raw = avatarPreview || (user && user.avatarUrl) || ''
  if (!raw) return ''
  if (isLocalTempImagePath(raw)) return raw
  return resolveImageSrc(raw) || raw
}

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    isLoggedIn: false,
    user: null,
    vehicleSummary: '',
    vehicleDisplayText: '未添加',
    phoneDisplayText: '未绑定',
    avatarPreview: '',
    displayAvatarUrl: '',
    nicknameInput: '',
    profileUpdating: false,
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    loginSheetBindContext: 'profile',
  },

  onShow() {
    this.loadPage()
  },

  syncFormFields(user, avatarPreview, vehicleSummary) {
    const nickname = (user && user.nickname) || ''
    const phoneDisplayText =
      user && user.isPhoneBound && user.phoneDisplay ? user.phoneDisplay : '未绑定'
    this.setData({
      user,
      nicknameInput: nickname,
      displayAvatarUrl: resolveDisplayAvatarUrl(user, avatarPreview),
      phoneDisplayText,
      vehicleSummary: vehicleSummary || '',
      vehicleDisplayText: vehicleSummary || '未添加',
    })
    this._savedNickname = nickname
  },

  async loadPage() {
    if (!isLoggedIn()) {
      this.setData({ status: 'unauthenticated', isLoggedIn: false, user: null })
      return
    }

    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const summary = await fetchMineSummary()
      if (!summary) {
        this.setData({ status: 'unauthenticated', isLoggedIn: false, user: null })
        return
      }

      let vehicleSummary = ''
      try {
        const auth = checkAuth({ needPhone: false })
        if (auth.ok) {
          const vehicle = await fetchDefaultVehicle()
          if (vehicle && vehicle.displayTitle) {
            vehicleSummary = vehicle.plateDisplay
              ? `${vehicle.displayTitle} · ${vehicle.plateDisplay}`
              : vehicle.displayTitle
          }
        }
      } catch (e) {
        // optional
      }

      this.syncFormFields(summary.user, this.data.avatarPreview, vehicleSummary)
      this.setData({
        status: 'normal',
        isLoggedIn: true,
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onRetry() {
    this.loadPage()
  },

  onLoginTap() {
    this.setData({ loginSheetVisible: true, loginSheetMode: 'login' })
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
  },

  onLoginSheetSuccess() {
    this.closeLoginSheet()
    this.loadPage()
  },

  onBindPhoneTap() {
    this.setData({ loginSheetVisible: true, loginSheetMode: 'bindPhone' })
  },

  onNicknameInput(e) {
    this.setData({ nicknameInput: (e.detail && e.detail.value) || '' })
  },

  async onNicknameBlur(e) {
    const nickname = String((e.detail && e.detail.value) || '').trim()
    if (nickname === this._savedNickname || this.data.profileUpdating) return

    this.setData({ profileUpdating: true })
    try {
      const user = await updateUserProfile({ nickname })
      this.syncFormFields(user, this.data.avatarPreview, this.data.vehicleSummary)
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '昵称保存失败', icon: 'none' })
    } finally {
      this.setData({ profileUpdating: false })
    }
  },

  async onAvatarChoose(e) {
    const tempPath = (e.detail && e.detail.avatarUrl) || ''
    if (!tempPath || this.data.profileUpdating) return

    this.setData({
      profileUpdating: true,
      avatarPreview: tempPath,
      displayAvatarUrl: tempPath,
    })
    wx.showLoading({ title: '上传中', mask: true })
    try {
      const avatarUrl = await uploadImage(tempPath)
      const user = await updateUserProfile({ avatarUrl })
      this.syncFormFields(user, '', this.data.vehicleSummary)
      wx.showToast({ title: '头像已更新', icon: 'success' })
    } catch (err) {
      this.syncFormFields(this.data.user, '', this.data.vehicleSummary)
      wx.showToast({ title: (err && err.message) || '头像更新失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ profileUpdating: false })
    }
  },

  onVehicleTap() {
    const auth = checkAuth({ needPhone: true })
    if (!auth.ok) {
      this.setData({
        loginSheetVisible: true,
        loginSheetMode: auth.reason === 'bindPhone' ? 'bindPhone' : 'login',
      })
      return
    }
    wx.navigateTo({ url: '/pages/mine/vehicle/index' })
  },
})
