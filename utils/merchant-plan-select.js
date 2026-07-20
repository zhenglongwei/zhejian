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

/** 审核通过后进入套餐说明；已确认过则进门店选择 */
function redirectAfterMerchantApproved(merchantId, from = 'audit') {
  if (hasAcknowledgedMerchantPlan(merchantId)) {
    wx.redirectTo({ url: '/packageMerchant/pages/store-picker/index' })
    return
  }
  wx.redirectTo({ url: buildPlanSelectUrl(merchantId, from) })
}

module.exports = {
  planSelectStorageKey,
  hasAcknowledgedMerchantPlan,
  saveMerchantPlanAck,
  buildPlanSelectUrl,
  redirectAfterMerchantApproved,
}
