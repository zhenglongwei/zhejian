/**
 * 发给车主前：同一轮只查一次；车主拒绝后再发才新一轮
 * 真源：docs/04_维修过程相册/26_ · 28_
 */

function text(value) {
  return String(value || '').trim()
}

function isReviewRoundStale(node, extra = {}) {
  const current = (node && node.aiReview) || {}
  const rejectedAt = text(
    extra.rejectedAt || (node && node.document && node.document.ownerRejectedAt) || '',
  )
  if (rejectedAt && (!current.updatedAt || text(current.updatedAt) < rejectedAt)) return true
  return false
}

/** 本轮已出结论（含失败）后，改字/采用改法不再拦发出 */
function isAckStale(node, extra = {}) {
  const current = (node && node.aiReview) || {}
  if (isReviewRoundStale(node, extra)) return true
  if (current.status !== 'ready' && current.status !== 'failed') return true
  return false
}

function canReuseReviewThisRound(node, extra = {}) {
  if (isReviewRoundStale(node, extra)) return false
  const status = text(node && node.aiReview && node.aiReview.status)
  return status === 'queued' || status === 'running' || status === 'ready' || status === 'failed'
}

module.exports = {
  isReviewRoundStale,
  isAckStale,
  canReuseReviewThisRound,
}
