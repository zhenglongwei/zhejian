const {
  fetchUserSubscribeTemplates,
  saveUserSubscribeResults,
  fetchMerchantSubscribeTemplates,
  saveMerchantSubscribeResults,
} = require('../services/notification')

function pickTemplateIds(templates = []) {
  return templates.map((item) => item.templateId).filter(Boolean)
}

function countAccepted(results = {}) {
  return Object.keys(results).filter((key) => results[key] === 'accept').length
}

/**
 * 须在用户点击事件里调用（bindtap），不可在 onShow/onLoad 异步回调里直接调。
 */
function requestSubscribeMessage(tmplIds = []) {
  const ids = (tmplIds || []).filter(Boolean)
  if (!ids.length) {
    return Promise.resolve({ __empty: true })
  }
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: ids.slice(0, 3),
      success(res) {
        resolve(res || {})
      },
      fail(err) {
        resolve({ __failed: true, errMsg: (err && err.errMsg) || '订阅授权失败' })
      },
    })
  })
}

function showSubscribeFeedback(results = {}, showToast = true) {
  if (!showToast) return
  if (results.__empty) {
    wx.showToast({ title: '服务端未配置订阅模板', icon: 'none' })
    return
  }
  if (results.__failed) {
    wx.showToast({ title: results.errMsg || '订阅授权失败', icon: 'none' })
    return
  }
  const accepted = countAccepted(results)
  if (accepted > 0) {
    wx.showToast({ title: '已开启，每次授权可收1条微信通知', icon: 'success' })
    return
  }
  wx.showToast({ title: '未开启，可在设置中再次授权', icon: 'none' })
}

function cleanSubscribeResults(results = {}) {
  const cleaned = {}
  Object.keys(results || {}).forEach((key) => {
    if (key.startsWith('__')) return
    cleaned[key] = results[key]
  })
  return cleaned
}

async function requestUserNotificationSubscribe(scene = 'default', options = {}) {
  const { showToast = true } = options
  try {
    const templates = await fetchUserSubscribeTemplates(scene)
    const tmplIds = pickTemplateIds(templates)
    const results = await requestSubscribeMessage(tmplIds)
    showSubscribeFeedback(results, showToast)
    const cleaned = cleanSubscribeResults(results)
    if (Object.keys(cleaned).length) {
      await saveUserSubscribeResults(cleaned)
    }
    return cleaned
  } catch (e) {
    if (showToast) {
      wx.showToast({ title: (e && e.message) || '订阅配置加载失败', icon: 'none' })
    }
    return {}
  }
}

async function requestMerchantNotificationSubscribe(scene = 'merchant', options = {}) {
  const { showToast = true } = options
  try {
    const templates = await fetchMerchantSubscribeTemplates(scene)
    const tmplIds = pickTemplateIds(templates)
    const results = await requestSubscribeMessage(tmplIds)
    showSubscribeFeedback(results, showToast)
    const cleaned = cleanSubscribeResults(results)
    if (Object.keys(cleaned).length) {
      await saveMerchantSubscribeResults(cleaned)
    }
    return cleaned
  } catch (e) {
    if (showToast) {
      wx.showToast({ title: (e && e.message) || '订阅配置加载失败', icon: 'none' })
    }
    return {}
  }
}

module.exports = {
  requestUserNotificationSubscribe,
  requestMerchantNotificationSubscribe,
}
