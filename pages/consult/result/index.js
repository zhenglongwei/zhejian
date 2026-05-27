const { getLeadById } = require('../../../services/lead')
const { buildLeadDetailRows } = require('../../../utils/lead-display')
const { formatAppointmentLabel } = require('../../../utils/lead-form')

Page({
  data: {
    status: 'loading',
    success: false,
    lead: null,
    summaryRows: [],
    title: '',
    description: '',
    errorMessage: '',
  },

  onLoad(options) {
    this.leadId = options.leadId || ''
    this.successFlag = options.success === '1'
    if (!this.leadId || !this.successFlag) {
      this.setData({
        status: 'normal',
        success: false,
        title: '提交未完成',
        description: '你可以返回重新提交，或稍后在「我的咨询」中查看。',
        errorMessage: options.message || '',
      })
      return
    }
    this.loadResult()
  },

  async loadResult() {
    this.setData({ status: 'loading' })
    try {
      const lead = await getLeadById(this.leadId)
      this.setData({
        status: 'normal',
        success: true,
        lead,
        summaryRows: this.buildSummaryRows(lead),
        title: '咨询已提交',
        description: '门店将尽快与你联系。实际维修方案和费用需你与门店线下确认。',
      })
    } catch (e) {
      this.setData({
        status: 'normal',
        success: true,
        title: '咨询已提交',
        description: '可在「我的咨询」中查看记录与状态。',
      })
    }
  },

  buildSummaryRows(lead) {
    if (!lead) return []
    const apptLabel = formatAppointmentLabel(lead.appointment)
    const rows = [
      { label: '咨询编号', value: lead.id },
      { label: '服务名称', value: lead.serviceName },
      { label: '门店', value: lead.storeName },
    ]
    if (apptLabel) {
      rows.push({ label: '期望到店', value: apptLabel })
    }
    return rows
  },

  onViewConsult() {
    if (this.leadId) {
      wx.redirectTo({ url: `/pages/consult/detail/index?id=${this.leadId}` })
      return
    }
    wx.redirectTo({ url: '/pages/consult/index' })
  },

  onViewList() {
    wx.redirectTo({ url: '/pages/consult/index' })
  },

  onBackHome() {
    wx.switchTab({ url: '/pages/home/index' })
  },

  onRetry() {
    wx.navigateBack({ delta: 1 })
  },
})
