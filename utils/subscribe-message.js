const {
  fetchUserSubscribeTemplates,
  saveUserSubscribeResults,
  fetchMerchantSubscribeTemplates,
  saveMerchantSubscribeResults,
} = require('../services/notification')

function pickTemplateIds(templates = []) {
  return templates.map((item) => item.templateId).filter(Boolean)
}

function requestSubscribeMessage(tmplIds = []) {
  const ids = (tmplIds || []).filter(Boolean)
  if (!ids.length) {
    return Promise.resolve({})
  }
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: ids.slice(0, 3),
      success(res) {
        resolve(res || {})
      },
      fail() {
        resolve({})
      },
    })
  })
}

async function requestUserNotificationSubscribe(scene = 'default') {
  try {
    const templates = await fetchUserSubscribeTemplates(scene)
    const tmplIds = pickTemplateIds(templates)
    if (!tmplIds.length) return {}
    const results = await requestSubscribeMessage(tmplIds)
    if (results && Object.keys(results).length) {
      await saveUserSubscribeResults(results)
    }
    return results
  } catch (e) {
    return {}
  }
}

async function requestMerchantNotificationSubscribe(scene = 'merchant') {
  try {
    const templates = await fetchMerchantSubscribeTemplates(scene)
    const tmplIds = pickTemplateIds(templates)
    if (!tmplIds.length) return {}
    const results = await requestSubscribeMessage(tmplIds)
    if (results && Object.keys(results).length) {
      await saveMerchantSubscribeResults(results)
    }
    return results
  } catch (e) {
    return {}
  }
}

module.exports = {
  requestUserNotificationSubscribe,
  requestMerchantNotificationSubscribe,
}
