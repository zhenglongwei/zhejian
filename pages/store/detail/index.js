const { fetchStoreDetail } = require('../../../services/store')
const { fetchCaseList } = require('../../../services/case')
const { fetchServiceList } = require('../../../services/service')
const { buildStoreHeadTags } = require('../../../utils/store-tags')

const STATUS_TEXT = {
  open: '营业中',
  closed: '休息中',
  holiday: '节假日休息',
  suspended: '暂停预约',
  offline: '暂不可预约',
}

const BOTTOM_LEFT_ACTIONS = [
  { key: 'call', type: 'secondary', text: '电话咨询' },
  { key: 'navigate', type: 'secondary', text: '导航' },
]

function buildStoreInfoRows(store) {
  if (!store) return []
  const rows = [
    { label: '地址', value: store.address || '—' },
    { label: '营业时间', value: store.businessHours || '—' },
  ]
  if (store.specialties && store.specialties.length) {
    rows.push({ label: '擅长项目', value: store.specialties.join('、') })
  }
  return rows
}

function buildCertRows(certifications) {
  return (certifications || []).map((item) => ({
    label: item.label,
    value: item.text || '—',
  }))
}

Page({
  data: {
    status: 'loading',
    store: null,
    infoRows: [],
    certRows: [],
    cases: [],
    casesStatus: 'loading',
    services: [],
    servicesStatus: 'loading',
    statusText: '',
    headTags: [],
    errorMessage: '',
    bottomLeftActions: BOTTOM_LEFT_ACTIONS,
  },

  onLoad(options) {
    this.storeId = options.id || 'store_demo_1'
    this.loadPage()
  },

  onPullDownRefresh() {
    this.loadPage().finally(() => wx.stopPullDownRefresh())
  },

  async loadPage() {
    this.setData({ status: 'loading', casesStatus: 'loading', servicesStatus: 'loading', errorMessage: '' })
    try {
      const [store, { list: cases }, { list: services }] = await Promise.all([
        fetchStoreDetail(this.storeId),
        fetchCaseList({ storeId: this.storeId }),
        fetchServiceList({ storeId: this.storeId }),
      ])
      this.setData({
        store: { ...store, caseCount: cases.length },
        headTags: buildStoreHeadTags(store),
        infoRows: buildStoreInfoRows(store),
        certRows: buildCertRows(store.certifications),
        cases,
        services,
        statusText: STATUS_TEXT[store.status] || store.status,
        status: 'normal',
        casesStatus: cases.length ? 'normal' : 'empty',
        servicesStatus: services.length ? 'normal' : 'empty',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败，请重试',
      })
    }
  },

  onRetry() {
    this.loadPage()
  },

  onCaseTap(e) {
    const { caseId } = e.detail
    wx.navigateTo({ url: `/pages/case/detail/index?id=${caseId}` })
  },

  onViewAllCases() {
    wx.switchTab({ url: '/pages/case/index' })
  },

  onViewAllServices() {
    wx.switchTab({ url: '/pages/service/index' })
  },

  onServiceTap(e) {
    const { serviceId } = e.detail
    if (!serviceId) return
    wx.navigateTo({
      url: `/pages/service/detail/index?id=${serviceId}`,
    })
  },

  onCall() {
    const { store } = this.data
    if (!store || !store.phone) return
    wx.makePhoneCall({ phoneNumber: store.phone })
  },

  onBottomLeftAction(e) {
    const { key } = e.detail
    if (key === 'call') this.onCall()
    else if (key === 'navigate') this.onNavigate()
  },

  onNavigate() {
    const { store } = this.data
    if (!store || store.latitude == null || store.longitude == null) {
      wx.showToast({ title: '暂无导航信息', icon: 'none' })
      return
    }
    wx.openLocation({
      latitude: store.latitude,
      longitude: store.longitude,
      name: store.name,
      address: store.address,
      scale: 16,
    })
  },

  onMessage() {
    wx.navigateTo({
      url: `/pages/consult/submit/index?storeId=${this.storeId}&sourcePage=store`,
    })
  },
})
