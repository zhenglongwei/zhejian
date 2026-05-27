const { fetchServiceAlbum, submitPartConfirm } = require('../../../services/service-album')
const {
  PART_TYPE_VARIANT,
  NON_OEM_CONFIRM_COPY,
  PLAN_CONFIRM_COPY,
} = require('../../../constants/part-type')
const { PRICE_MODE } = require('../../../constants/price-mode')
const { isLoggedIn, checkAuth } = require('../../../utils/auth')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    album: null,
    confirmItem: null,
    confirmCopy: null,
    partTypeVariant: 'default',
    checked: false,
    submitting: false,
    showPartPrice: false,
    partPriceAmount: null,
    showPlanPrice: false,
    planMinAmount: null,
    planMaxAmount: null,
    priceMode: PRICE_MODE.FIXED,
    priceModeRange: PRICE_MODE.RANGE,
  },

  onLoad(options) {
    this.albumId = options.albumId || ''
    this.confirmId = options.confirmId || ''
    if (!this.albumId || !this.confirmId) {
      this.setData({
        status: 'error',
        errorMessage: '确认项不存在',
      })
      return
    }
    this.loadConfirm()
  },

  async loadConfirm() {
    if (!isLoggedIn() || !checkAuth({ needPhone: true }).ok) {
      this.setData({
        status: 'error',
        errorMessage: '请先登录并绑定手机号',
      })
      return
    }

    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const album = await fetchServiceAlbum(this.albumId)
      const confirmItem = (album.pendingConfirms || []).find(
        (item) => item.id === this.confirmId
      )
      if (!confirmItem) {
        this.setData({
          status: 'error',
          errorMessage: '该确认项已处理或不存在',
        })
        return
      }

      const isPart = confirmItem.type === 'part'
      const confirmCopy = isPart ? NON_OEM_CONFIRM_COPY : PLAN_CONFIRM_COPY
      const partTypeVariant =
        PART_TYPE_VARIANT[confirmItem.partType] || 'warning'

      this.setData({
        album,
        confirmItem,
        confirmCopy,
        partTypeVariant,
        checked: false,
        showPartPrice: isPart && confirmItem.actualPrice != null,
        partPriceAmount: confirmItem.actualPrice,
        showPlanPrice:
          !isPart &&
          confirmItem.planMinAmount != null &&
          confirmItem.planMaxAmount != null,
        planMinAmount: confirmItem.planMinAmount,
        planMaxAmount: confirmItem.planMaxAmount,
        status: 'normal',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onRetry() {
    this.loadConfirm()
  },

  onCheckToggle() {
    this.setData({ checked: !this.data.checked })
  },

  onReject() {
    wx.showModal({
      title: '要求重新报价',
      content: '将通知门店你不同意当前方案或配件，门店需重新确认后再施工。',
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        this.submitConfirm(true)
      },
    })
  },

  onConfirm() {
    const { checked, confirmCopy } = this.data
    if (!checked) {
      wx.showToast({ title: '请先勾选确认项', icon: 'none' })
      return
    }
    this.submitConfirm(false)
  },

  async submitConfirm(rejected) {
    if (this.data.submitting) return
    const { confirmCopy } = this.data
    this.setData({ submitting: true })
    try {
      wx.showLoading({ title: '提交中', mask: true })
      await submitPartConfirm(this.albumId, this.confirmId, {
        rejected,
        checkboxText: confirmCopy.checkbox,
        buttonText: rejected ? '要求重新报价' : confirmCopy.confirmButton,
      })
      wx.hideLoading()
      wx.showToast({
        title: rejected ? '已通知门店' : '确认成功',
        icon: 'success',
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 600)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({
        title: (e && e.message) || '提交失败',
        icon: 'none',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
