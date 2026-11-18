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

/**
 * 报价与交车共用一张微信模板，一次授权只给一条额度。
 * 车主确认报价时顺手再要一次：勾过「总是保持以上选择」的用户不会再看到弹窗，
 * 这样交车那条通知才发得出去；没勾的用户拒绝也不影响，站内信照发。
 */
function topUpAlbumFlowSubscribeQuota(albumId) {
  if (!albumId) return Promise.resolve({ skipped: true })
  const storageKey = `album:${albumId}:flow-quota`
  if (hasPrompted(storageKey)) return Promise.resolve({ skipped: true })
  markPrompted(storageKey)
  return requestUserNotificationSubscribe('flow_confirm', { showToast: false })
}

/**
 * 车主首次打开某个相册时：一次授权「订单状态变更提醒」（确认报价 + 确认交车）和「服务评价通知」。
 * 报价与交车共用同一张微信模板，一次授权只能发出其中一条，额度用完后走站内信。
 */
function promptAlbumFlowSubscribe(albumId) {
  if (!albumId) return Promise.resolve({ skipped: true })
  return promptUserNotificationSubscribe({
    scene: 'flow_confirm',
    title: '开启本次服务的提醒',
    content:
      '门店确认报价、确认交车、邀请评价时会各通知你一次，避免错过要确认的单据。微信为一次性订阅，每条通知需单独授权。',
    confirmText: '开启通知',
    storageKey: `album:${albumId}:flow`,
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

/** 商家 · 工作台消息页：审核结果 */
function promptMerchantWorkbenchSubscribe() {
  return promptNotificationSubscribe({
    requestSubscribe: requestMerchantNotificationSubscribe,
    scene: 'merchant',
    title: '开启微信通知',
    content:
      '开启后可接收案例审核与留档合规结果提醒。微信为一次性订阅，每条通知需单独授权。',
    confirmText: '开启通知',
    storageKey: 'merchant:workbench',
  })
}

module.exports = {
  promptUserNotificationSubscribe,
  promptAlbumProgressSubscribe,
  promptAlbumFlowSubscribe,
  topUpAlbumFlowSubscribeQuota,
  promptAuthorizeAuditSubscribe,
  promptMerchantAuditSubscribe,
  promptMerchantWorkbenchSubscribe,
}
