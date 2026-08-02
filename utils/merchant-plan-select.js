const PLAN_SELECT_STORAGE_PREFIX = 'merchant_plan_ack_v1_'

function planSelectStorageKey(merchantId) {
  return `${PLAN_SELECT_STORAGE_PREFIX}${merchantId || 'default'}`
}

function hasAcknowledgedMerchantPlan(merchantId) {
  try {
    return Boolean(wx.getStorageSync(planSelectStorageKey(merchantId)))
  } catch (e) {
    return false
  }
}

function saveMerchantPlanAck(merchantId, planId) {
  const key = planSelectStorageKey(merchantId)
  const payload = {
    planId: planId || 'free',
    at: Date.now(),
  }
  try {
    wx.setStorageSync(key, payload)
  } catch (e) {
    /* ignore */
  }
  return payload
}

function buildPlanSelectUrl(merchantId, from) {
  const q = []
  if (merchantId) q.push(`merchantId=${encodeURIComponent(merchantId)}`)
  if (from) q.push(`from=${encodeURIComponent(from)}`)
  return `/packageMerchant/pages/plan-select/index${q.length ? `?${q.join('&')}` : ''}`
}

/** 审核通过后直接进门店选择（当前免费，不再经过试用/付费说明） */
function redirectAfterMerchantApproved(merchantId) {
  saveMerchantPlanAck(merchantId, 'free')
  wx.redirectTo({ url: '/packageMerchant/pages/store-picker/index' })
}

module.exports = {
  planSelectStorageKey,
  hasAcknowledgedMerchantPlan,
  saveMerchantPlanAck,
  buildPlanSelectUrl,
  redirectAfterMerchantApproved,
}
