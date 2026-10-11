const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../services/merchant')
const {
  createMerchantServiceAlbum,
  decodeMerchantVin,
} = require('../../services/merchant-service-album')
const {
  normalizeVinInput,
  validateCreateSheet,
} = require('../../utils/merchant-album-create-sheet')

const EMPTY_FORM = {
  plate: '',
  mileage: '',
  vin: '',
  vehicleBrand: '',
  vehicleSeries: '',
  vehicleYear: '',
  userPhone: '',
}

Component({
  properties: {
    show: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    form: { ...EMPTY_FORM },
    decodedVehicle: null,
    vehicleHint: '',
    submitting: false,
    storeId: '',
    storeName: '',
  },

  lifetimes: {
    attached() {
      if (this.properties.show) this.ensureStore()
    },
  },

  observers: {
    show(visible) {
      if (visible) this.ensureStore()
    },
  },

  methods: {
    noop() {},

    onClose() {
      if (this.data.submitting) return
      this.triggerEvent('close')
    },

    async ensureStore() {
      if (this.data.storeId) return
      const profile = await fetchMerchantProfile()
      if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
        wx.showToast({ title: '请先完成入驻', icon: 'none' })
        this.triggerEvent('close')
        return
      }
      this.setData({
        storeId: profile.storeId || '',
        storeName: profile.storeName || '',
      })
    },

    onInput(e) {
      const { field } = e.currentTarget.dataset
      const value = e.detail.value
      this.setData({ [`form.${field}`]: value }, () => {
        if (field !== 'vin') return
        const vin = normalizeVinInput(value)
        if (vin.length === 17) this.tryDecodeVin(vin)
        else this.setData({ decodedVehicle: null, vehicleHint: '' })
      })
    },

    openVehicleScan(mode) {
      wx.navigateTo({
        url: `/packageMerchant/pages/album/vehicle-scan/index?mode=${mode}`,
        events: {
          vehicleScanResult: (data) => {
            const patch = {}
            if (data && data.plate) patch['form.plate'] = data.plate
            if (data && data.vin) patch['form.vin'] = data.vin
            const hints = (data && data.vehicleHints) || {}
            this.setData(patch, () => {
              if (data && data.vin) this.tryDecodeVin(normalizeVinInput(data.vin), hints)
              else if (hints.brand || hints.series) this.applyVehicleHints(hints)
            })
          },
        },
      })
    },

    onScanPlate() {
      this.openVehicleScan('plate')
    },

    onScanVin() {
      this.openVehicleScan('vin')
    },

    applyDecodedFields(vehicle = {}) {
      const patch = {}
      if (vehicle.brand) patch['form.vehicleBrand'] = String(vehicle.brand).trim()
      if (vehicle.series) patch['form.vehicleSeries'] = String(vehicle.series).trim()
      const year = String(vehicle.modelYear || vehicle.year || '').trim()
      if (year) patch['form.vehicleYear'] = year
      if (Object.keys(patch).length) this.setData(patch)
    },

    applyVehicleHints(hints = {}, vin = '') {
      const vehicle = { ...(this.data.decodedVehicle || {}), ...hints }
      if (vin) vehicle.vin = vin
      this.setData({ decodedVehicle: vehicle, vehicleHint: '' })
      this.applyDecodedFields(vehicle)
    },

    async tryDecodeVin(vin, fallbackHints = {}) {
      try {
        const data = await decodeMerchantVin(vin)
        const vehicle = { ...(fallbackHints || {}), ...((data && data.vehicle) || {}) }
        if (vin) vehicle.vin = vin
        this.setData({ decodedVehicle: vehicle, vehicleHint: '' })
        this.applyDecodedFields(vehicle)
      } catch (e) {
        if (fallbackHints && (fallbackHints.brand || fallbackHints.series)) {
          this.applyVehicleHints(fallbackHints, vin)
          return
        }
        this.setData({
          decodedVehicle: { vin, ...(fallbackHints || {}) },
          vehicleHint: '未解析出车型，请手填',
        })
      }
    },

    onCreateFromText() {
      if (this.data.submitting) return
      this.triggerEvent('close')
      wx.navigateTo({ url: '/packageMerchant/pages/tools/wechat-archive/index' })
    },

    async onSubmit() {
      if (this.data.submitting) return
      const checked = validateCreateSheet(this.data.form)
      if (!checked.ok) {
        wx.showToast({ title: checked.message, icon: 'none' })
        return
      }
      if (!this.data.storeId) await this.ensureStore()
      if (!this.data.storeId) return

      const vehicle = {
        ...(this.data.decodedVehicle || {}),
        plate: checked.plate,
        mileage: checked.mileage,
        brand: checked.vehicleBrand,
        series: checked.vehicleSeries,
      }
      if (checked.vehicleYear) vehicle.modelYear = checked.vehicleYear
      if (checked.vin) vehicle.vin = checked.vin

      const payload = {
        storeId: this.data.storeId,
        storeName: this.data.storeName,
        vehicle,
      }
      if (checked.userPhone) payload.userPhone = checked.userPhone

      this.setData({ submitting: true })
      try {
        const album = await createMerchantServiceAlbum(payload)
        if (!album || !album.albumId) throw new Error('创建失败')
        this.setData({ form: { ...EMPTY_FORM }, decodedVehicle: null, vehicleHint: '' })
        wx.redirectTo({
          url: `/packageMerchant/pages/album/flow/index?albumId=${album.albumId}`,
        })
      } catch (e) {
        wx.showToast({ title: (e && e.message) || '创建失败', icon: 'none' })
      } finally {
        this.setData({ submitting: false })
      }
    },
  },
})
