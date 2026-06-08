const { get, post } = require('./request')

/** 小程序 JS 环境无 URLSearchParams，用手动拼接 */
function buildQueryString(query = {}) {
  const parts = []
  if (query.page) parts.push(`page=${encodeURIComponent(String(query.page))}`)
  if (query.pageSize) parts.push(`pageSize=${encodeURIComponent(String(query.pageSize))}`)
  if (query.unreadOnly) parts.push('unreadOnly=1')
  return parts.length ? `?${parts.join('&')}` : ''
}

async function fetchUserNotifications(query = {}) {
  return get(`/user/notifications${buildQueryString(query)}`)
}

async function fetchUserUnreadNotificationCount() {
  const data = await get('/user/notifications/unread-count')
  return Number(data?.count) || 0
}

async function markUserNotificationsRead(ids = []) {
  return post('/user/notifications/read', { ids })
}

async function fetchUserSubscribeTemplates(scene = 'default') {
  const data = await get(`/user/notifications/subscribe-templates?scene=${encodeURIComponent(scene)}`)
  return data?.templates || []
}

async function saveUserSubscribeResults(results = {}) {
  return post('/user/notifications/subscribe', { results })
}

async function fetchMerchantNotifications(query = {}) {
  return get(`/merchant/notifications${buildQueryString(query)}`)
}

async function fetchMerchantUnreadNotificationCount() {
  const data = await get('/merchant/notifications/unread-count')
  return Number(data?.count) || 0
}

async function markMerchantNotificationsRead(ids = []) {
  return post('/merchant/notifications/read', { ids })
}

async function fetchMerchantSubscribeTemplates(scene = 'merchant') {
  const data = await get(`/merchant/notifications/subscribe-templates?scene=${encodeURIComponent(scene)}`)
  return data?.templates || []
}

async function saveMerchantSubscribeResults(results = {}) {
  return post('/merchant/notifications/subscribe', { results })
}

async function fetchMerchantSubscribeStatus(scene = 'merchant') {
  const data = await get(
    `/merchant/notifications/subscribe-status?scene=${encodeURIComponent(scene)}`
  )
  return data || { needsPrompt: false, templates: [] }
}

module.exports = {
  fetchUserNotifications,
  fetchUserUnreadNotificationCount,
  markUserNotificationsRead,
  fetchUserSubscribeTemplates,
  saveUserSubscribeResults,
  fetchMerchantNotifications,
  fetchMerchantUnreadNotificationCount,
  markMerchantNotificationsRead,
  fetchMerchantSubscribeTemplates,
  saveMerchantSubscribeResults,
  fetchMerchantSubscribeStatus,
}
