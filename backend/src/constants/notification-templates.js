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

/**
 * 字段名可通过 WECHAT_TMPL_*_FIELD_* 环境变量覆盖，默认 thing/time 组合
 */
function buildSubscribePayload(templateKey, payload = {}) {
  const fields = (config.wechat.subscribeFields || {})[templateKey] || {}
  const title = clipWechatField(payload.title, 20)
  const content = clipWechatField(payload.content, 20)
  const storeName = clipWechatField(payload.storeName, 20)
  const serviceName = clipWechatField(payload.serviceName, 20)
  const timeValue = clipWechatField(
    payload.time instanceof Date
      ? payload.time.toISOString().slice(0, 16).replace('T', ' ')
      : payload.time || new Date().toISOString().slice(0, 16).replace('T', ' '),
    20
  )

  const data = {}
  data[fields.title || 'thing1'] = { value: title }
  data[fields.content || 'thing2'] = { value: content || storeName || serviceName }
  data[fields.time || 'time3'] = { value: timeValue }
  return data
}

module.exports = {
  SUBSCRIBE_TEMPLATE_KEYS,
  getSubscribeTemplateId,
  buildSubscribePayload,
}
