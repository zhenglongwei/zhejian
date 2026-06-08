const { config } = require('../config')

const SUBSCRIBE_TEMPLATE_KEYS = {
  byScene: {
    default: ['consult', 'album', 'audit'],
    consult: ['consult'],
    album: ['album', 'audit'],
    authorize: ['audit'],
    lead: ['lead'],
    merchant: ['lead', 'audit'],
  },
  byTemplateId: {},
}

function loadTemplateMap() {
  const map = config.wechat.subscribeTemplates || {}
  Object.entries(map).forEach(([key, templateId]) => {
    if (templateId) {
      SUBSCRIBE_TEMPLATE_KEYS.byTemplateId[templateId] = key
    }
  })
}

function getSubscribeTemplateId(key) {
  loadTemplateMap()
  return (config.wechat.subscribeTemplates || {})[key] || ''
}

function clipWechatField(value, max = 20) {
  return String(value || '—').slice(0, max)
}

function formatLeadTime(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) {
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(now.getHours())}:${pad(now.getMinutes())}`
  }
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatAuditDate(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) {
    const now = new Date()
    return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

function shortRefNo(refId = '', max = 32) {
  const value = String(refId || '').trim()
  if (!value) return '—'
  return value.length <= max ? value : value.slice(-max)
}

/**
 * 字段名可通过 WECHAT_TMPL_*_FIELD_* 环境变量覆盖
 */
function buildSubscribePayload(templateKey, payload = {}) {
  const fields = (config.wechat.subscribeFields || {})[templateKey] || {}
  const title = clipWechatField(payload.title, 20)
  const content = clipWechatField(payload.content, 20)
  const storeName = clipWechatField(payload.storeName, 20)
  const serviceName = clipWechatField(payload.serviceName || '服务相册', 20)
  const status = clipWechatField(payload.status || payload.auditStatus || title || '已更新', 20)
  const tips = clipWechatField(payload.tips || payload.remark || content || '可查看详情', 20)
  const auditStatus = clipWechatField(payload.auditStatus || payload.status || title, 20)
  const caseNo = shortRefNo(payload.caseNo || payload.refId, 32)
  const auditTime = formatAuditDate(payload.time || payload.auditTime || new Date())
  const remark = clipWechatField(payload.remark || payload.tips || content, 20)
  const timeValue = clipWechatField(
    payload.time instanceof Date
      ? payload.time.toISOString().slice(0, 16).replace('T', ' ')
      : payload.time || new Date().toISOString().slice(0, 16).replace('T', ' '),
    20
  )

  const data = {}

  /** 新留言通知（商家新线索）：留言人 + 时间 + 温馨提示 */
  if (fields.sender && fields.leadTime && fields.tips && !fields.service) {
    const sender = clipWechatField(payload.sender || '咨询用户', 20)
    const leadTime = formatLeadTime(payload.time || payload.leadTime || new Date())
    data[fields.sender] = { value: sender }
    data[fields.leadTime] = { value: leadTime }
    data[fields.tips] = { value: tips }
    return data
  }

  /** 审核结果通知：phrase1 + character_string14 + date2 + thing3 */
  if (fields.auditStatus && fields.caseNo) {
    data[fields.auditStatus] = { value: auditStatus }
    data[fields.caseNo] = { value: caseNo }
    if (fields.auditTime) {
      data[fields.auditTime] = { value: auditTime }
    }
    if (fields.remark) {
      data[fields.remark] = { value: remark }
    }
    return data
  }

  /** 服务进度通知：thing1 服务项目 + thing2 服务状态 + thing6 温馨提示 */
  if (fields.tips) {
    data[fields.service || 'thing1'] = { value: serviceName }
    data[fields.status || 'thing2'] = { value: status }
    data[fields.tips] = { value: tips }
    return data
  }

  data[fields.title || 'thing1'] = { value: title }
  data[fields.content || 'thing2'] = { value: content || storeName || serviceName }
  if (fields.time) {
    data[fields.time] = { value: timeValue }
  }
  return data
}

module.exports = {
  SUBSCRIBE_TEMPLATE_KEYS,
  getSubscribeTemplateId,
  buildSubscribePayload,
  formatAuditDate,
  formatLeadTime,
  shortRefNo,
}
