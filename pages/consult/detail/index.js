const { getLeadById, cancelLead } = require('../../../services/lead')
const { LEAD_USER_CANCELLABLE } = require('../../../constants/lead-status')
const { DESIGN_TOKENS } = require('../../../constants/design-tokens')
const { enrichLeadListItem, buildLeadDetailRows } = require('../../../utils/lead-display')
const { isLoggedIn, checkAuth } = require('../../../utils/auth')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    lead: null,
    detailRows: [],
    canCancel: false,
    cancelling: false,
    leftActions: [{ key: 'call', text: '拨打门店', type: 'secondary' }],
    loginSheetVisible: false,
    loginSheetMode: 'auto',
  },

  onLoad(options) {
    this.leadId = options.id || ''
    if (!this.leadId) {
      this.setData({
        status: 'error',
        errorMessage: '咨询记录不存在',
      })
      return
    }
    this.loadDetail()
  },

  onShow() {
    if (this.leadId && this.data.status === 'normal') {
      this.loadDetail()
    }
  },

  async loadDetail() {
    if (!isLoggedIn()) {
      this.setData({
        status: 'error',
        errorMessage: '请先登录后查看咨询详情',
      })
      return
    }

    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const raw = await getLeadById(this.leadId)
      const lead = enrichLeadListItem(raw)
      this.setData({
        lead,
        detailRows: buildLeadDetailRows(raw),
        canCancel: LEAD_USER_CANCELLABLE.includes(lead.status),
        status: 'normal',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败，请重试',
      })
    }
  },

  onRetry() {
    this.loadDetail()
  },

  onLeftAction(e) {
    const { key } = e.detail || {}
    if (key === 'call') {
      this.onCallStore()
    }
  },

  onCallStore() {
    const phone = this.data.lead && this.data.lead.storePhone
    if (!phone) {
      wx.showToast({ title: '暂无门店电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  onCancelConsult() {
    if (this.data.cancelling || !this.data.canCancel) return
    wx.showModal({
      title: '取消咨询',
      content: '确定要取消这条咨询吗？取消后门店将不再跟进。',
      confirmText: '确认取消',
      confirmColor: DESIGN_TOKENS.COLOR_DANGER,
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ cancelling: true })
        try {
          await cancelLead(this.leadId)
          wx.showToast({ title: '已取消', icon: 'success' })
          this.loadDetail()
        } catch (e) {
          wx.showToast({
            title: (e && e.message) || '取消失败，请稍后重试',
            icon: 'none',
          })
        } finally {
          this.setData({ cancelling: false })
        }
      },
    })
  },

  ensureAuth() {
    const auth = checkAuth({ needPhone: false })
    if (!auth.ok) {
      this.setData({
        loginSheetVisible: true,
        loginSheetMode: 'login',
      })
      return false
    }
    return true
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
  },

  onLoginSheetSuccess() {
    this.closeLoginSheet()
    this.loadDetail()
  },
})
