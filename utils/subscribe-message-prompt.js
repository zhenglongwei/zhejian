const {
  requestUserNotificationSubscribe,
  requestMerchantNotificationSubscribe,
} = require('./subscribe-message')

const STORAGE_PREFIX = 'zj_subscribe_prompt_v1'

function hasPrompted(storageKey) {
  if (!storageKey) return false
  try {
    return Boolean(wx.getStorageSync(`${STORAGE_PREFIX}:${storageKey}`))
  } catch (e) {
    return false
  }
}

function markPrompted(storageKey) {
  if (!storageKey) return
  try {
    wx.setStorageSync(`${STORAGE_PREFIX}:${storageKey}`, Date.now())
  } catch (e) {
    // ignore
  }
}

function promptNotificationSubscribe(options = {}) {
  const {
    requestSubscribe,
    scene = 'default',
    title = '开启微信通知',
    content = '',
    confirmText = '开启通知',
    cancelText = '暂不',
    storageKey = '',
    skipIfPrompted = true,
    showToast = true,
  } = options

  if (storageKey && skipIfPrompted && hasPrompted(storageKey)) {
    return Promise.resolve({ skipped: true })
  }

  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      confirmText,
      cancelText,
      success: (res) => {
        if (storageKey) markPrompted(storageKey)
        if (!res.confirm) {
          resolve({ accepted: false })
          return
        }
        requestSubscribe(scene, { showToast })
          .then((results) => resolve({ accepted: true, results }))
          .catch(() => resolve({ accepted: false }))
      },
      fail: () => resolve({ accepted: false }),
    })
  })
}

/**
 * 场景弹窗 → 用户确认后再调 wx.requestSubscribeMessage（须在 confirm 点击链内）。
 */
function promptUserNotificationSubscribe(options = {}) {
  return promptNotificationSubscribe({
    ...options,
    requestSubscribe: requestUserNotificationSubscribe,
  })
}

/** 相册维修进行中：扫码/首次进入详情时引导 */
function promptAlbumProgressSubscribe(albumId) {
  if (!albumId) return Promise.resolve({ skipped: true })
  return promptUserNotificationSubscribe({
    scene: 'album',
    title: '跟进维修进度',
    content:
      '维修尚未完工，开启微信通知后可在相册有更新时收到提醒。微信为一次性订阅，每条通知需单独授权。',
    confirmText: '开启通知',
    storageKey: `album:${albumId}:progress`,
  })
}

/** 提交发布到公开网站后：引导接收审核结果 */
function promptAuthorizeAuditSubscribe(albumId = '') {
  const storageKey = albumId ? `authorize:audit:${albumId}` : 'authorize:audit'
  return promptUserNotificationSubscribe({
    scene: 'authorize',
    title: '接收审核结果',
    content:
      '你已提交发布到公开网站，开启微信通知后可在审核通过或未通过时收到提醒。微信为一次性订阅，每条通知需单独授权。',
    confirmText: '开启通知',
    storageKey,
    skipIfPrompted: false,
  })
}

/** 商家 · 新咨询线索 */
function promptMerchantLeadSubscribe(leadId = '') {
  const storageKey = leadId ? `merchant:lead:${leadId}` : 'merchant:lead'
  return promptNotificationSubscribe({
    requestSubscribe: requestMerchantNotificationSubscribe,
    scene: 'lead',
    title: '接收新咨询提醒',
    content:
      '开启微信通知后，可在有新咨询线索时收到提醒。微信为一次性订阅，每条通知需单独授权。',
    confirmText: '开启通知',
    storageKey,
  })
}

/** 商家 · 案例/留档审核结果 */
function promptMerchantAuditSubscribe(refId = '') {
  const storageKey = refId ? `merchant:audit:${refId}` : 'merchant:audit'
  return promptNotificationSubscribe({
    requestSubscribe: requestMerchantNotificationSubscribe,
    scene: 'audit',
    title: '接收审核结果',
    content:
      '开启微信通知后，可在案例审核或留档合规审查有结果时收到提醒。微信为一次性订阅，每条通知需单独授权。',
    confirmText: '开启通知',
    storageKey,
  })
}

/** 商家 · 工作台消息页：新咨询 + 审核结果 */
function promptMerchantWorkbenchSubscribe() {
  return promptNotificationSubscribe({
    requestSubscribe: requestMerchantNotificationSubscribe,
    scene: 'merchant',
    title: '开启微信通知',
    content:
      '开启后可接收新咨询线索、案例审核与留档合规结果提醒。微信为一次性订阅，每条通知需单独授权。',
    confirmText: '开启通知',
    storageKey: 'merchant:workbench',
  })
}

module.exports = {
  promptUserNotificationSubscribe,
  promptAlbumProgressSubscribe,
  promptAuthorizeAuditSubscribe,
  promptMerchantLeadSubscribe,
  promptMerchantAuditSubscribe,
  promptMerchantWorkbenchSubscribe,
}
