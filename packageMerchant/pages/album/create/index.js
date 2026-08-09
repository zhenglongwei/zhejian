const { SERVICE_STATUS } = require('../../../../constants/service')
const { MERCHANT_SERVICE_TAG_OPTIONS } = require('../../../../constants/merchant-service-tags')
const { fetchMerchantServiceList } = require('../../../../services/service')
const {
  createMerchantServiceAlbum,
  decodeMerchantVin,
} = require('../../../../services/merchant-service-album')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')

const DEFAULT_COMPLEXITY = 'L2'

function normalizeOwnerPhone(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizePlateInput(value) {
  return String(value || '')
    .trim()
    .replace(/[\s·.]/g, '')
    .toUpperCase()
}

function normalizeVinInput(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

function buildServiceQuickOptions(profile, publishedList) {
  const map = new Map()

  ;(profile && profile.services ? profile.services : []).forEach((name) => {
    if (name && !map.has(name)) {
      map.set(name, { name, serviceId: '', serviceItemId: '', complexityLevel: DEFAULT_COMPLEXITY })
    }
  })

  ;(publishedList || []).forEach((item) => {
    const name = item.name || item.serviceName
    if (!name) return
    map.set(name, {
      name,
      serviceId: item.serviceId || item.id || '',
      serviceItemId: item.serviceItemId || '',
      complexityLevel: item.complexityLevel || DEFAULT_COMPLEXITY,
    })
  })

  if (!map.size) {
    MERCHANT_SERVICE_TAG_OPTIONS.forEach((name) => {
      map.set(name, { name, serviceId: '', serviceItemId: '', complexityLevel: DEFAULT_COMPLEXITY })
    })
  }

  return Array.from(map.values())
}

function buildSuggestTags(options, keyword) {
  const value = (keyword || '').trim()
  const lower = value.toLowerCase()
  const list = lower
    ? options.filter((item) => item.name.toLowerCase().includes(lower))
    : options

  return list.map((item) => ({
    ...item,
    selected: value === item.name,
  }))
}

function resolveServiceMeta(options, serviceName) {
  const name = (serviceName || '').trim()
  const matched = options.find((item) => item.name === name)
  return {
    serviceId: matched ? matched.serviceId || '' : '',
    serviceItemId: matched ? matched.serviceItemId || '' : '',
    complexityLevel: matched ? matched.complexityLevel || DEFAULT_COMPLEXITY : DEFAULT_COMPLEXITY,
  }
}

function buildVehiclePreview(vehicle) {
  if (!vehicle || typeof vehicle !== 'object') return ''
  const parts = [
    vehicle.brand,
    vehicle.series,
    vehicle.modelYear,
    vehicle.engineModel,
    vehicle.chassisCode,
  ].filter(Boolean)
  return parts.length ? `已解析：${parts.join(' · ')}` : ''
}

Page({
  data: {
    status: 'loading',
    serviceQuickOptions: [],
    serviceSuggestTags: [],
    serviceSuggestVisible: false,
    form: {
      serviceName: '',
      serviceId: '',
      plate: '',
      vin: '',
      userPhone: '',
      complexityLevel: DEFAULT_COMPLEXITY,
    },
    decodedVehicle: null,
    vehiclePreview: '',
    submitting: false,
    submitLabel: '创建并请车主扫码',
    storeName: '',
    storeId: '',
  },

  onLoad() {
    this.initPage()
  },

  async initPage() {
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      wx.showModal({
        title: '请先入驻',
        success: (res) => {
          if (res.confirm) {
            wx.redirectTo({ url: '/packageMerchant/pages/onboarding/index' })
          } else {
            wx.navigateBack()
          }
        },
      })
      return
    }

    this.setData({
      storeName: profile.storeName || '—',
      storeId: profile.storeId || 'store_demo_1',
    })

    let publishedList = []
    try {
      const { list } = await fetchMerchantServiceList(SERVICE_STATUS.PUBLISHED)
      publishedList = list || []
    } catch (e) {
      /* keep empty */
    }

    const serviceQuickOptions = buildServiceQuickOptions(profile, publishedList)
    this.setData({
      serviceQuickOptions,
      status: 'normal',
    })
    this.refreshSubmitLabel()
  },

  refreshSubmitLabel() {
    const phone = normalizeOwnerPhone(this.data.form.userPhone)
    this.setData({
      submitLabel: phone.length === 11 ? '创建相册' : '创建并请车主扫码',
    })
  },

  onServiceFocus() {
    clearTimeout(this._serviceBlurTimer)
    this.setData({
      serviceSuggestVisible: true,
      serviceSuggestTags: buildSuggestTags(
        this.data.serviceQuickOptions,
        this.data.form.serviceName
      ),
    })
  },

  onServiceBlur() {
    this._serviceBlurTimer = setTimeout(() => {
      this.setData({ serviceSuggestVisible: false })
    }, 180)
  },

  onServiceInput(e) {
    const value = e.detail.value || ''
    const meta = resolveServiceMeta(this.data.serviceQuickOptions, value)
    this.setData({
      'form.serviceName': value,
      'form.serviceId': meta.serviceId,
      'form.complexityLevel': meta.complexityLevel,
      serviceSuggestTags: buildSuggestTags(this.data.serviceQuickOptions, value),
      serviceSuggestVisible: true,
    })
  },

  onPickServiceSuggest(e) {
    clearTimeout(this._serviceBlurTimer)
    const { name } = e.currentTarget.dataset
    const meta = resolveServiceMeta(this.data.serviceQuickOptions, name)
    this.setData({
      'form.serviceName': name,
      'form.serviceId': meta.serviceId,
      'form.complexityLevel': meta.complexityLevel,
      serviceSuggestVisible: false,
    })
    wx.hideKeyboard()
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    const value = e.detail.value
    this.setData({ [`form.${field}`]: value }, () => {
      if (field === 'userPhone') this.refreshSubmitLabel()
      if (field === 'vin') {
        const vin = normalizeVinInput(value)
        if (vin.length === 17) {
          this.tryDecodeVin(vin)
        } else {
          this.setData({ decodedVehicle: null, vehiclePreview: '' })
        }
      }
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
          if (!Object.keys(patch).length && !Object.keys(hints).length) return
          this.setData(patch, () => {
            if (data && data.vin) {
              this.tryDecodeVin(normalizeVinInput(data.vin), hints)
            } else if (Object.keys(hints).length) {
              this.applyVehicleHints(hints)
            }
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

  applyVehicleHints(hints = {}, vin = '') {
    const vehicle = {
      ...(this.data.decodedVehicle || {}),
      ...hints,
    }
    if (vin) vehicle.vin = vin
    this.setData({
      decodedVehicle: vehicle,
      vehiclePreview: buildVehiclePreview(vehicle) || (vin ? `已识别车架号 ${vin}` : ''),
    })
  },

  async tryDecodeVin(vin, fallbackHints = {}) {
    try {
      const data = await decodeMerchantVin(vin)
      const vehicle = { ...(fallbackHints || {}), ...((data && data.vehicle) || {}) }
      if (vin) vehicle.vin = vin
      this.setData({
        decodedVehicle: vehicle,
        vehiclePreview: buildVehiclePreview(vehicle),
      })
    } catch (e) {
      if (fallbackHints && (fallbackHints.brand || fallbackHints.series || fallbackHints.engineModel)) {
        this.applyVehicleHints(fallbackHints, vin)
        return
      }
      this.setData({
        decodedVehicle: { vin, ...(fallbackHints || {}) },
        vehiclePreview: 'VIN 已填写；解析失败可稍后在编辑页手工补全车型',
      })
    }
  },

  async onSubmit() {
    if (this.data.submitting) return
    const serviceName = (this.data.form.serviceName || '').trim()
    if (!serviceName) {
      wx.showToast({ title: '请填写服务项目', icon: 'none' })
      return
    }
    const plate = normalizePlateInput(this.data.form.plate)
    if (!plate) {
      wx.showToast({ title: '请填写或扫描车牌号', icon: 'none' })
      return
    }

    const userPhone = normalizeOwnerPhone(this.data.form.userPhone)
    if (userPhone && userPhone.length !== 11) {
      wx.showToast({ title: '请填写正确的手机号', icon: 'none' })
      return
    }

    const vin = normalizeVinInput(this.data.form.vin)
    if (vin && vin.length !== 17) {
      wx.showToast({ title: '车架号须为 17 位', icon: 'none' })
      return
    }

    const meta = resolveServiceMeta(this.data.serviceQuickOptions, serviceName)
    let vehicle = {
      plate,
      ...(this.data.decodedVehicle || {}),
    }
    if (vin) vehicle.vin = vin
    if ((!vehicle.brand || !vehicle.series) && vin) {
      wx.showLoading({ title: '解析车型…', mask: true })
      try {
        const data = await decodeMerchantVin(vin)
        vehicle = { ...vehicle, ...((data && data.vehicle) || {}) }
        if (vin) vehicle.vin = vin
      } catch (e) {
        /* 保留扫描铭牌兜底字段，允许无品牌创建后在编辑页补全 */
      } finally {
        wx.hideLoading()
      }
    }

    this.setData({ submitting: true })
    try {
      const payload = {
        storeId: this.data.storeId,
        storeName: this.data.storeName,
        serviceId: meta.serviceId,
        serviceItemId: meta.serviceItemId,
        serviceName,
        complexityLevel: meta.complexityLevel,
        vehicle,
      }
      if (userPhone) {
        payload.userPhone = userPhone
      }
      const album = await createMerchantServiceAlbum(payload)
      if (userPhone) {
        wx.showToast({ title: '已关联车主手机号', icon: 'success' })
        setTimeout(() => {
          wx.redirectTo({
            url: `/packageMerchant/pages/album/edit/index?albumId=${album.albumId}`,
          })
        }, 400)
      } else {
        wx.showToast({ title: '请车主扫码关联', icon: 'success' })
        setTimeout(() => {
          wx.redirectTo({
            url: `/packageMerchant/pages/album/invite/index?albumId=${album.albumId}`,
          })
        }, 400)
      }
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '创建失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
