const {
  getMerchantLeadById,
  markLeadViewed,
  markLeadContacted,
  closeLead,
} = require('../../../../services/merchant-lead')
const { LEAD_STATUS } = require('../../../../constants/lead-status')
const {
  LEAD_CLOSE_REASON,
  LEAD_CLOSE_REASON_OPTIONS,
} = require('../../../../constants/lead-close-reason')
const { DESIGN_TOKENS } = require('../../../../constants/design-tokens')
const {
  enrichMerchantLeadListItem,
  buildMerchantLeadDetailRows,
} = require('../../../../utils/lead-display')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    lead: null,
    detailRows: [],
    leftActions: [],
    showPrimaryAction: false,
    primaryActionText: '',
    primaryActionKey: '',
    showClosePanel: false,
    closeNote: '',
    pendingCloseReason: '',
    acting: false,
  },

  onLoad(options) {
    this.leadId = options.id || ''
    if (!this.leadId) {
      this.setData({
        status: 'error',
        errorMessage: '咨询线索不存在',
      })
      return
    }
    this.ensureMerchant()
  },

  onShow() {
    if (this.leadId && this.storeId && this.data.status === 'normal') {
      this.loadDetail()
    }
  },

  async ensureMerchant() {
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      wx.showModal({
        title: '请先入驻',
        content: '完成商家入驻后可查看咨询线索',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/packageMerchant/pages/onboarding/index' })
          } else {
            wx.navigateBack()
          }
        },
      })
      return
    }
    this.storeId = profile.storeId || ''
    this.loadDetail()
  },

  async loadDetail() {
    if (!this.leadId || !this.storeId) return
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      let raw = await getMerchantLeadById(this.leadId, this.storeId)
      if (raw.status === LEAD_STATUS.SUBMITTED) {
        raw = await markLeadViewed(this.leadId, this.storeId)
      }
      const lead = enrichMerchantLeadListItem(raw)
      this.setData({
        lead,
        detailRows: buildMerchantLeadDetailRows(raw),
        ...this.buildBottomBarState(lead.status),
        status: 'normal',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败，请重试',
      })
    }
  },

  buildBottomBarState(status) {
    const leftActions = [{ key: 'call', text: '拨打电话', type: 'secondary' }]
    let showPrimaryAction = false
    let primaryActionText = ''
    let primaryActionKey = ''

    if ([LEAD_STATUS.SUBMITTED, LEAD_STATUS.VIEWED].includes(status)) {
      showPrimaryAction = true
      primaryActionText = '标记已联系'
      primaryActionKey = 'contact'
    } else if (status === LEAD_STATUS.CONTACTED) {
      showPrimaryAction = true
      primaryActionText = '关闭线索'
      primaryActionKey = 'close'
    }

    return {
      leftActions,
      showPrimaryAction,
      primaryActionText,
      primaryActionKey,
    }
  },

  onRetry() {
    this.loadDetail()
  },

  onLeftAction(e) {
    const { key } = e.detail || {}
    if (key === 'call') {
      this.onCallUser()
    }
  },

  onPrimaryAction() {
    const { primaryActionKey, acting } = this.data
    if (acting || !primaryActionKey) return
    if (primaryActionKey === 'contact') {
      this.onMarkContacted()
      return
    }
    if (primaryActionKey === 'close') {
      this.onCloseTap()
    }
  },

  onCallUser() {
    const phone = this.data.lead && this.data.lead.contact && this.data.lead.contact.phone
    if (!phone) {
      wx.showToast({ title: '暂无联系电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  async onMarkContacted() {
    if (this.data.acting) return
    this.setData({ acting: true })
    try {
      await markLeadContacted(this.leadId, this.storeId)
      wx.showToast({ title: '已标记联系', icon: 'success' })
      this.loadDetail()
    } catch (e) {
      wx.showToast({
        title: (e && e.message) || '操作失败，请稍后重试',
        icon: 'none',
      })
    } finally {
      this.setData({ acting: false })
    }
  },

  onCloseTap() {
    const options = LEAD_CLOSE_REASON_OPTIONS.map((item) => item.label)
    wx.showActionSheet({
      itemList: options,
      success: (res) => {
        const picked = LEAD_CLOSE_REASON_OPTIONS[res.tapIndex]
        if (!picked) return
        if (picked.key === LEAD_CLOSE_REASON.OTHER) {
          this.setData({
            showClosePanel: true,
            pendingCloseReason: picked.key,
            closeNote: '',
          })
          return
        }
        this.confirmClose(picked.key, '')
      },
    })
  },

  onCloseNoteInput(e) {
    const value = (e.detail && e.detail.value) || ''
    this.setData({ closeNote: value })
  },

  onCancelClosePanel() {
    this.setData({
      showClosePanel: false,
      pendingCloseReason: '',
      closeNote: '',
    })
  },

  onSubmitClosePanel() {
    const { pendingCloseReason, closeNote } = this.data
    if (!pendingCloseReason) return
    if (!closeNote.trim()) {
      wx.showToast({ title: '请填写关闭说明', icon: 'none' })
      return
    }
    this.confirmClose(pendingCloseReason, closeNote.trim())
  },

  confirmClose(reason, note) {
    wx.showModal({
      title: '关闭线索',
      content: '关闭后用户端咨询记录将同步为已关闭，确认继续？',
      confirmText: '确认关闭',
      confirmColor: DESIGN_TOKENS.COLOR_DANGER,
      success: async (res) => {
        if (!res.confirm) return
        if (this.data.acting) return
        this.setData({ acting: true })
        try {
          await closeLead(this.leadId, this.storeId, { reason, note })
          wx.showToast({ title: '已关闭', icon: 'success' })
          this.setData({
            showClosePanel: false,
            pendingCloseReason: '',
            closeNote: '',
          })
          this.loadDetail()
        } catch (e) {
          wx.showToast({
            title: (e && e.message) || '关闭失败，请稍后重试',
            icon: 'none',
          })
        } finally {
          this.setData({ acting: false })
        }
      },
    })
  },
})
