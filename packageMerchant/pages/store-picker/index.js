const {
  fetchMerchantWorkbenchEntries,
  switchMerchantStore,
  refreshMerchantSession,
  MERCHANT_STATUS,
} = require('../../../services/merchant')
const { MERCHANT_STORE_PICKER_COPY } = require('../../../constants/merchant-onboarding-copy')
const { isMerchant, isMerchantOwner } = require('../../../utils/auth')

function resolveEntryTagVariant(status) {
  if (status === MERCHANT_STATUS.APPROVED) return 'success'
  if (status === MERCHANT_STATUS.PENDING) return 'warning'
  if (status === MERCHANT_STATUS.REJECTED || status === MERCHANT_STATUS.NEED_MODIFY) return 'danger'
  return 'default'
}

function resolveActionHint(item = {}) {
  if (item.canEnterWorkbench) return '进入工作台 ›'
  if (item.status === MERCHANT_STATUS.PENDING) return '查看审核进度 ›'
  return '继续填写 ›'
}

function decorateEntries(list = []) {
  return list.map((item) => ({
    ...item,
    tagVariant: resolveEntryTagVariant(item.status),
    actionHint: resolveActionHint(item),
  }))
}

Page({
  data: {
    status: 'loading',
    entries: [],
    copy: MERCHANT_STORE_PICKER_COPY,
    errorMessage: '',
    switching: false,
  },

  onShow() {
    this.loadEntries()
  },

  async loadEntries() {
    if (!this.data.switching) {
      this.setData({ status: 'loading', errorMessage: '' })
    }

    try {
      await refreshMerchantSession().catch(() => null)

      if (isMerchant() && !isMerchantOwner()) {
        wx.redirectTo({ url: '/packageMerchant/pages/workbench/index' })
        return
      }

      const data = await fetchMerchantWorkbenchEntries()
      const entries = decorateEntries(data.list || [])

      if (!entries.length) {
        if (isMerchant()) {
          wx.redirectTo({ url: '/packageMerchant/pages/workbench/index' })
          return
        }
        this.setData({ status: 'empty', entries: [] })
        return
      }

      this.setData({ status: 'normal', entries })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '门店列表加载失败',
      })
    }
  },

  onRetry() {
    this.loadEntries()
  },

  onGoOnboarding() {
    wx.navigateTo({ url: '/packageMerchant/pages/onboarding/index' })
  },

  onAddStore() {
    wx.navigateTo({ url: '/packageMerchant/pages/onboarding/index?newStore=1' })
  },

  async onEntryTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    const entry = this.data.entries[index]
    if (!entry || this.data.switching) return

    if (entry.canEnterWorkbench) {
      await this.enterStore(entry)
      return
    }

    wx.navigateTo({
      url: `/packageMerchant/pages/onboarding/index?merchantId=${entry.merchantId}`,
    })
  },

  async enterStore(entry, options = {}) {
    if (this.data.switching) return
    this.setData({ switching: true })
    try {
      wx.showLoading({ title: '进入工作台', mask: true })
      await switchMerchantStore(entry.storeId)
      wx.hideLoading()
      const url = '/packageMerchant/pages/workbench/index'
      if (options.redirect) {
        wx.redirectTo({ url })
      } else {
        wx.navigateTo({ url })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '进入失败', icon: 'none' })
    } finally {
      this.setData({ switching: false })
    }
  },
})
