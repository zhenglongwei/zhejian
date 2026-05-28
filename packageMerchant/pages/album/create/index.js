const { SERVICE_STATUS } = require('../../../../constants/service')
const { MERCHANT_SERVICE_TAG_OPTIONS } = require('../../../../constants/merchant-service-tags')
const { fetchMerchantServiceList } = require('../../../../services/service')
const { createMerchantServiceAlbum } = require('../../../../services/merchant-service-album')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')

const DEFAULT_COMPLEXITY = 'L2'

function buildServiceQuickOptions(profile, publishedList) {
  const map = new Map()

  ;(profile && profile.services ? profile.services : []).forEach((name) => {
    if (name && !map.has(name)) {
      map.set(name, { name, serviceId: '', complexityLevel: DEFAULT_COMPLEXITY })
    }
  })

  ;(publishedList || []).forEach((item) => {
    const name = item.name || item.serviceName
    if (!name) return
    map.set(name, {
      name,
      serviceId: item.serviceId || item.id || '',
      complexityLevel: item.complexityLevel || DEFAULT_COMPLEXITY,
    })
  })

  if (!map.size) {
    MERCHANT_SERVICE_TAG_OPTIONS.forEach((name) => {
      map.set(name, { name, serviceId: '', complexityLevel: DEFAULT_COMPLEXITY })
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
    complexityLevel: matched ? matched.complexityLevel || DEFAULT_COMPLEXITY : DEFAULT_COMPLEXITY,
  }
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
      userPhone: '',
      vehicleBrand: '',
      vehicleSeries: '',
      complexityLevel: DEFAULT_COMPLEXITY,
    },
    submitting: false,
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
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  validatePhone(phone) {
    if (!phone) return true
    return /^1\d{10}$/.test(phone.trim())
  },

  async onSubmit() {
    if (this.data.submitting) return
    const serviceName = (this.data.form.serviceName || '').trim()
    if (!serviceName) {
      wx.showToast({ title: '请填写服务项目', icon: 'none' })
      return
    }
    const userPhone = (this.data.form.userPhone || '').trim()
    if (!this.validatePhone(userPhone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }

    const meta = resolveServiceMeta(this.data.serviceQuickOptions, serviceName)

    this.setData({ submitting: true })
    try {
      const album = await createMerchantServiceAlbum({
        storeId: this.data.storeId,
        storeName: this.data.storeName,
        serviceId: meta.serviceId,
        serviceName,
        complexityLevel: meta.complexityLevel,
        userPhone,
        vehicle: {
          brand: this.data.form.vehicleBrand.trim(),
          series: this.data.form.vehicleSeries.trim(),
        },
      })
      wx.showToast({ title: '服务相册已创建', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({
          url: `/packageMerchant/pages/album/edit/index?albumId=${album.albumId}`,
        })
      }, 400)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '创建失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
