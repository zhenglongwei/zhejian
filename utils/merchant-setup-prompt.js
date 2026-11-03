/** 工作台补认证提醒：本轮打开只弹一次，回首页不重复；下次冷启动再弹。 */

const SESSION_KEY = 'mch_setup_prompt_session'
const SEEN_KEY = 'mch_setup_prompt_seen'

function beginSetupPromptSession() {
  try {
    wx.setStorageSync(SESSION_KEY, `s_${Date.now()}`)
  } catch (_) {
    // ignore
  }
}

function currentSetupPromptSession() {
  try {
    return String(wx.getStorageSync(SESSION_KEY) || '')
  } catch (_) {
    return ''
  }
}

function hasSeenSetupPrompt(merchantId) {
  const id = String(merchantId || '').trim()
  if (!id) return false
  const session = currentSetupPromptSession()
  if (!session) return false
  try {
    const seen = wx.getStorageSync(SEEN_KEY) || {}
    return seen[id] === session
  } catch (_) {
    return false
  }
}

function markSetupPromptSeen(merchantId) {
  const id = String(merchantId || '').trim()
  if (!id) return
  const session = currentSetupPromptSession() || `s_${Date.now()}`
  try {
    if (!currentSetupPromptSession()) {
      wx.setStorageSync(SESSION_KEY, session)
    }
    const seen = wx.getStorageSync(SEEN_KEY) || {}
    seen[id] = session
    wx.setStorageSync(SEEN_KEY, seen)
  } catch (_) {
    // ignore
  }
}

module.exports = {
  beginSetupPromptSession,
  hasSeenSetupPrompt,
  markSetupPromptSeen,
}
