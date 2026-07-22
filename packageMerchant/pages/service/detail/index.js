const {
  fetchServiceDetail,
  publishServicePlan,
  unpublishServicePlan,
} = require('../../../../services/service')
const {
  pauseServiceAppointment,
  resumeServiceAppointment,
} = require('../../../../services/merchant-service-plan-actions')
const { SERVICE_STATUS } = require('../../../../constants/service')
const { isAccidentCategory } = require('../../../../constants/price-mode')

/** 避免 showModal 确定后点击穿透再次弹出确认框 */
const MODAL_CLOSE_DELAY_MS = 320

function waitModalClose() {
  return new Promise((resolve) => setTimeout(resolve, MODAL_CLOSE_DELAY_MS))
}

const BANNER_TEXT = {
  draft: '当前为草稿，保存并上架后用户端可见',
  approved: '未上架，点击「上架」后用户端可见',
  published: '已上架，用户端可见（预览）',
  publishedPaused:
    '已暂停预约：用户仍可浏览本服务，暂不可提交咨询',
  suspended: '内容已下架，请联系客服或修改后重新申请',
}

Page({
  data: {
    status: 'loading',
    detail: null,
    errorMessage: '',
    isAccident: false,
    showPriceFactors: false,
    bannerText: '',
    showPublish: false,
    showUnpublish: false,
    showEdit: false,
    leftActions: [],
    rightActions: [],
    actionLoading: false,
  },

  onLoad(options) {
    this.serviceId = options.id || ''
    if (!this.serviceId) {
      this.setData({ status: 'error', errorMessage: '服务方案不存在' })
      return
    }
    this.loadDetail()
  },

  onShow() {
    if (this.serviceId && this.data.detail) {
      this.loadDetail()
    }
  },

  async loadDetail(options = {}) {
    const silent = Boolean(options.silent)
    if (!silent) {
      this.setData({ status: 'loading', errorMessage: '' })
    }
    try {
      const detail = await fetchServiceDetail(this.serviceId, {
        audience: 'merchant',
      })
      const st = detail.status
      const appointmentPaused = Boolean(detail.appointmentPaused)
      const bannerKey =
        st === SERVICE_STATUS.PUBLISHED
          ? appointmentPaused
            ? 'publishedPaused'
            : 'published'
          : st === SERVICE_STATUS.SUSPENDED
            ? 'suspended'
            : st === SERVICE_STATUS.APPROVED
              ? 'approved'
              : 'draft'
      this.setData({
        detail,
        isAccident: Boolean(detail.isAccidentService) || isAccidentCategory(detail),
        showPriceFactors: Boolean((detail.priceFactors || []).length),
        bannerText:
          st === SERVICE_STATUS.SUSPENDED && detail.rejectReason
            ? `${BANNER_TEXT.suspended}（${detail.rejectReason}）`
            : BANNER_TEXT[bannerKey] || '用户端不可见',
        showPublish: detail.canPublish,
        showUnpublish: detail.canUnpublish,
        showEdit: detail.editable,
        leftActions: this.buildLeftActions(detail),
        rightActions: this.buildRightActions(detail),
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
    this.loadDetail()
  },

  buildLeftActions(detail) {
    if (!detail) return []
    const loading = this.data.actionLoading
    const actions = [
      {
        key: 'back',
        type: 'secondary',
        size: 'sm',
        text: '返回列表',
        disabled: loading,
      },
    ]
    if (detail.canPauseAppointment) {
      actions.push({
        key: 'pauseAppointment',
        type: 'secondary',
        size: 'sm',
        text: '暂停预约',
        disabled: loading,
      })
    }
    if (detail.canResumeAppointment) {
      actions.push({
        key: 'resumeAppointment',
        type: 'secondary',
        size: 'sm',
        text: '恢复预约',
        disabled: loading,
      })
    }
    return actions
  },

  buildRightActions(detail) {
    if (!detail) return []
    const actions = []
    const loading = this.data.actionLoading
    if (detail.editable) {
      actions.push({
        key: 'edit',
        type: 'primary',
        size: 'sm',
        text: '编辑方案',
        disabled: loading,
      })
    }
    if (detail.canUnpublish) {
      actions.push({
        key: 'unpublish',
        type: 'secondary',
        size: 'sm',
        text: '下架',
        disabled: loading,
      })
    }
    if (detail.canPublish) {
      actions.push({
        key: 'publish',
        type: 'primary',
        size: 'sm',
        text: '上架',
        disabled: loading,
      })
    }
    return actions
  },

  onLeftAction(e) {
    const { key } = e.detail
    if (key === 'back') this.onBack()
    else if (key === 'pauseAppointment') this.onPauseAppointment()
    else if (key === 'resumeAppointment') this.onResumeAppointment()
  },

  onRightAction(e) {
    const { key } = e.detail
    if (key === 'edit') this.onEdit()
    else if (key === 'unpublish') this.onUnpublish()
    else if (key === 'publish') this.onPublish()
  },

  onCaseTap(e) {
    const { caseId } = e.detail
    wx.navigateTo({ url: `/pages/case/detail/index?id=${caseId}` })
  },

  onManageCases() {
    wx.navigateTo({ url: '/packageMerchant/pages/album/list/index' })
  },

  onStoreTap(e) {
    const storeId = e.currentTarget.dataset.storeId
    if (!storeId) return
    wx.navigateTo({ url: `/pages/store/detail/index?id=${storeId}` })
  },

  onEdit() {
    wx.navigateTo({
      url: `/packageMerchant/pages/service/create/index?id=${this.serviceId}`,
    })
  },

  async onPublish() {
    if (this.data.actionLoading) return
    this.setData({ actionLoading: true })
    try {
      await publishServicePlan(this.serviceId)
      wx.showToast({ title: '已上架', icon: 'success' })
      this.loadDetail()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '上架失败', icon: 'none' })
    } finally {
      this.setData({ actionLoading: false })
    }
  },

  async onUnpublish() {
    if (this.data.actionLoading) return
    const res = await wx.showModal({
      title: '确认下架',
      content: '下架后用户端将不再展示该服务方案',
    })
    if (!res.confirm) return
    this.setData({ actionLoading: true })
    try {
      await unpublishServicePlan(this.serviceId)
      wx.showToast({ title: '已下架', icon: 'success' })
      this.loadDetail()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '下架失败', icon: 'none' })
    } finally {
      this.setData({ actionLoading: false })
    }
  },

  async onPauseAppointment() {
    if (this.data.actionLoading || this._appointmentActionLock) return
    this._appointmentActionLock = true
    try {
      const res = await wx.showModal({
        title: '暂停预约',
        content: '暂停后用户仍可浏览本服务，但无法提交咨询。确认暂停？',
      })
      if (!res.confirm) return
      this.setData({ actionLoading: true })
      await waitModalClose()
      await pauseServiceAppointment(this.serviceId)
      wx.showToast({ title: '已暂停预约', icon: 'success' })
      await this.loadDetail({ silent: true })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ actionLoading: false })
      this._appointmentActionLock = false
    }
  },

  async onResumeAppointment() {
    if (this.data.actionLoading || this._appointmentActionLock) return
    this._appointmentActionLock = true
    try {
      const res = await wx.showModal({
        title: '恢复预约',
        content: '恢复后用户可再次提交咨询。确认恢复？',
      })
      if (!res.confirm) return
      this.setData({ actionLoading: true })
      await waitModalClose()
      await resumeServiceAppointment(this.serviceId)
      wx.showToast({ title: '已恢复预约', icon: 'success' })
      await this.loadDetail({ silent: true })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ actionLoading: false })
      this._appointmentActionLock = false
    }
  },

  onBack() {
    wx.navigateBack()
  },
})
