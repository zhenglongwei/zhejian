const { fetchMerchantOrderDetail, submitOrderComplete } = require('../../../../services/merchant-order')
const { ORDER_STATUS } = require('../../../../constants/order-status')
const { PRICE_MODE } = require('../../../../constants/price-mode')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    orderId: '',
    detail: null,
    form: {
      repairSummary: '',
      partsSummary: '',
      priceNote: '',
      warrantyNote: '',
      generateCaseDraft: false,
    },
    needPriceNote: false,
    isAccident: false,
    priceComplianceType: 'price',
    priceNotePlaceholder: '实际费用或区间说明（到店检测/施工后填写）',
    showEmptyAlbumTip: false,
    submitting: false,
  },

  onLoad(options) {
    this.orderId = options.orderId || ''
    if (!this.orderId) {
      this.setData({
        status: 'error',
        errorMessage: '订单信息缺失',
      })
      return
    }
    this.loadDetail()
  },

  async loadDetail() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const detail = await fetchMerchantOrderDetail(this.orderId)
      if (detail.status !== ORDER_STATUS.IN_SERVICE) {
        this.setData({
          status: 'error',
          errorMessage: '当前订单状态不可提交完工',
        })
        return
      }
      const needPriceNote =
        detail.priceMode === PRICE_MODE.RANGE ||
        detail.priceMode === PRICE_MODE.CONSULT ||
        detail.priceMode === PRICE_MODE.ACCIDENT
      const isAccident = Boolean(detail.flags && detail.flags.isAccident)
      const imageCount =
        (detail.albumEntry && detail.albumEntry.imageCount) || 0
      this.setData({
        detail,
        orderId: this.orderId,
        needPriceNote,
        isAccident,
        priceComplianceType: isAccident ? 'accident' : 'price',
        showEmptyAlbumTip: imageCount === 0,
        status: 'normal',
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
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onDraftChange(e) {
    this.setData({ 'form.generateCaseDraft': Boolean(e.detail.checked) })
  },

  validateForm() {
    const { form, needPriceNote } = this.data
    if (!(form.repairSummary || '').trim()) {
      wx.showToast({ title: '请填写维修说明', icon: 'none' })
      return false
    }
    if (needPriceNote && !(form.priceNote || '').trim()) {
      wx.showToast({ title: '请填写价格说明', icon: 'none' })
      return false
    }
    return true
  },

  onSubmit() {
    if (this.data.submitting || !this.validateForm()) return
    const { showEmptyAlbumTip, form } = this.data
    const submit = () => this.doSubmit()

    if (showEmptyAlbumTip) {
      wx.showModal({
        title: '尚未上传维修图片',
        content:
          '上传维修过程图片有助于用户理解维修过程，也能提升门店透明度和案例曝光。仍要提交完工吗？',
        confirmText: '继续提交',
        cancelText: '先去上传',
        success: (res) => {
          if (res.confirm) submit()
          else {
            wx.navigateTo({
              url: `/packageMerchant/pages/order/album/index?orderId=${this.orderId}`,
            })
          }
        },
      })
      return
    }

    wx.showModal({
      title: '提交完工',
      content: '提交后将通知用户确认完工，确定提交吗？',
      confirmText: '确认提交',
      success: (res) => {
        if (res.confirm) submit()
      },
    })
  },

  async doSubmit() {
    this.setData({ submitting: true })
    try {
      wx.showLoading({ title: '提交中', mask: true })
      await submitOrderComplete(this.orderId, this.data.form)
      wx.hideLoading()
      wx.showToast({ title: '已提交完工', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({
          url: `/packageMerchant/pages/order/detail/index?id=${this.orderId}`,
        })
      }, 500)
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

  onRetry() {
    this.loadDetail()
  },
})
