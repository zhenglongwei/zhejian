const {
  fetchMerchantStaffList,
  inviteMerchantStaff,
  removeMerchantStaff,
} = require('../../../../services/merchant-staff')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')
const { isMerchantOwner } = require('../../../../utils/auth')

Page({
  data: {
    status: 'loading',
    list: [],
    memberCount: 0,
    maxStaff: 8,
    errorMessage: '',
    invitePhone: '',
    inviting: false,
    showInvite: false,
  },

  onShow() {
    this.ensureAccess()
  },

  onPullDownRefresh() {
    this.loadList({ silent: true }).finally(() => wx.stopPullDownRefresh())
  },

  async ensureAccess() {
    if (!isMerchantOwner()) {
      wx.showModal({
        title: '仅管理员可操作',
        content: '员工账号由店铺管理员添加与管理',
        showCancel: false,
        success: () => wx.navigateBack(),
      })
      return
    }
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      wx.showModal({
        title: '请先入驻',
        content: '完成商家入驻后可管理员工',
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
    const forceLoading = this.data.status !== 'normal'
    this.loadList({ forceLoading })
  },

  /**
   * @param {{ forceLoading?: boolean, silent?: boolean }} opts
   * forceLoading：首屏骨架；silent：刷新列表但不收起邀请区、不闪全页 loading
   */
  async loadList(opts = {}) {
    const silent = Boolean(opts.silent)
    const forceLoading = Boolean(opts.forceLoading) && !silent
    const showInvite = this.data.showInvite

    if (forceLoading) {
      this.setData({ status: 'loading', errorMessage: '' })
    }
    try {
      const data = await fetchMerchantStaffList()
      this.setData({
        status: 'normal',
        list: data.list || [],
        memberCount: data.memberCount || 0,
        maxStaff: data.maxStaff || 8,
        showInvite,
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
        showInvite: false,
      })
    }
  },

  onRetry() {
    this.loadList({ forceLoading: true })
  },

  onOpenInvite() {
    if (this.data.memberCount >= this.data.maxStaff) return
    this.setData({ showInvite: true, invitePhone: '' })
  },

  onCloseInvite() {
    this.setData({ showInvite: false, invitePhone: '' })
  },

  onInviteInput(e) {
    this.setData({ invitePhone: (e.detail && e.detail.value) || '' })
  },

  async onSubmitInvite() {
    const phone = String(this.data.invitePhone || '').trim()
    if (!phone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' })
      return
    }
    if (this.data.inviting) return
    this.setData({ inviting: true })
    try {
      const res = await inviteMerchantStaff(phone)
      wx.showModal({
        title: '已添加',
        content: res.hint || '添加成功',
        showCancel: false,
      })
      this.setData({ showInvite: false, invitePhone: '' })
      await this.loadList({ silent: true })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '添加失败', icon: 'none' })
    } finally {
      this.setData({ inviting: false })
    }
  },

  onRemoveStaff(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || '该员工'
    if (!id) return
    wx.showModal({
      title: '移除员工',
      content: `确定移除「${name}」？移除后将无法进入本店工作台`,
      success: async (res) => {
        if (!res.confirm) return
        try {
          await removeMerchantStaff(id)
          wx.showToast({ title: '已移除', icon: 'success' })
          await this.loadList({ silent: true })
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
        }
      },
    })
  },
})
