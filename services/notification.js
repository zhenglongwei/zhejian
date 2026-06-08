const { get, post } = require('./request')

async function fetchUserNotifications(query = {}) {
  const params = new URLSearchParams()
  if (query.page) params.set('page', String(query.page))
  if (query.pageSize) params.set('pageSize', String(query.pageSize))
  if (query.unreadOnly) params.set('unreadOnly', '1')
  const qs = params.toString()
  return get(`/user/notifications${qs ? `?${qs}` : ''}`)
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
  const params = new URLSearchParams()
  if (query.page) params.set('page', String(query.page))
  if (query.pageSize) params.set('pageSize', String(query.pageSize))
  if (query.unreadOnly) params.set('unreadOnly', '1')
  const qs = params.toString()
  return get(`/merchant/notifications${qs ? `?${qs}` : ''}`)
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
}
