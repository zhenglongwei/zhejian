const {
  fetchUserVehicle,
  createUserVehicle,
  updateUserVehicle,
} = require('../../../services/vehicle')
const { MAX_USER_VEHICLES } = require('../../../constants/user-vehicle')
const { checkAuth } = require('../../../utils/auth')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    isEdit: false,
    submitting: false,
    maxVehicles: MAX_USER_VEHICLES,
    form: {
      brand: '',
      series: '',
      modelYear: '',
      plate: '',
      isDefault: false,
    },
    loginSheetVisible: false,
    loginSheetMode: 'auto',
    loginSheetBindContext: 'vehicle',
  },

  onLoad(options) {
    this.vehicleId = options.id || ''
    this.setData({ isEdit: Boolean(this.vehicleId) })
    wx.setNavigationBarTitle({ title: this.vehicleId ? '编辑车辆' : '新增车辆' })

    const auth = checkAuth({ needPhone: true })
    if (!auth.ok) {
      this.setData({
        status: 'unauthenticated',
        loginSheetVisible: true,
        loginSheetMode: auth.reason === 'bindPhone' ? 'bindPhone' : 'auto',
      })
      return
    }

    if (this.vehicleId) {
      this.loadVehicle()
    } else {
      this.setData({ status: 'normal' })
    }
  },

  async loadVehicle() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const vehicle = await fetchUserVehicle(this.vehicleId)
      this.setData({
        status: 'normal',
        form: {
          brand: vehicle.brand || '',
          series: vehicle.series || '',
          modelYear: vehicle.modelYear || '',
          plate: vehicle.plateDisplay || '',
          isDefault: Boolean(vehicle.isDefault),
        },
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    if (!field) return
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onDefaultChange(e) {
    this.setData({ 'form.isDefault': Boolean(e.detail.value) })
  },

  onRetry() {
    if (this.vehicleId) {
      this.loadVehicle()
    }
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
    wx.navigateBack({ delta: 1 })
  },

  onLoginSheetSuccess() {
    this.setData({ loginSheetVisible: false })
    if (this.vehicleId) {
      this.loadVehicle()
    } else {
      this.setData({ status: 'normal' })
    }
  },

  validateForm() {
    const { brand, series } = this.data.form
    if (!String(brand).trim()) {
      wx.showToast({ title: '请填写车辆品牌', icon: 'none' })
      return false
    }
    if (!String(series).trim()) {
      wx.showToast({ title: '请填写车型', icon: 'none' })
      return false
    }
    return true
  },

  async onSubmit() {
    if (this.data.submitting || !this.validateForm()) return

    const auth = checkAuth({ needPhone: true })
    if (!auth.ok) {
      this.setData({
        loginSheetVisible: true,
        loginSheetMode: auth.reason === 'bindPhone' ? 'bindPhone' : 'auto',
      })
      return
    }

    const payload = {
      brand: this.data.form.brand.trim(),
      series: this.data.form.series.trim(),
      modelYear: this.data.form.modelYear.trim(),
      plate: this.data.form.plate.trim(),
      isDefault: this.data.form.isDefault,
    }

    this.setData({ submitting: true })
    try {
      if (this.vehicleId) {
        await updateUserVehicle(this.vehicleId, payload)
      } else {
        await createUserVehicle(payload)
      }
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 400)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
