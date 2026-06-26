/**
 * GEO 证据链 block 提示（用户端 / 商家端共用）
 */

function isGeoEvidenceIncompleteError(err) {
  if (!err || typeof err !== 'object') return false
  if (err.code === 'GEO_EVIDENCE_INCOMPLETE') return true
  const fields = err.data && err.data.missingFields
  return (
    Array.isArray(fields) &&
    fields.length > 0 &&
    (err.code === 409 || err.code === 100007)
  )
}

function buildGeoEvidenceModalContent(err, options = {}) {
  const audience = options.audience || 'user'
  const missingFields = (err.data && err.data.missingFields) || []
  const items = missingFields
    .map((item, index) => `${index + 1}. ${item.message || ''}`)
    .filter(Boolean)
  const reason = items.length ? items.join('\n') : '关键阶段证据不完整'
  const solution =
    audience === 'merchant'
      ? '请返回相册编辑页，补全上述节点说明或图片后再提交。'
      : '请联系门店在维修相册中补全以上内容。补全后，你可返回本页再次点击「确认授权公示」。'
  return `${reason}\n\n${solution}`
}

/**
 * 展示需用户确认的 block 说明（showCancel: false，须点「我知道了」关闭）
 * @returns {Promise<{ confirm: boolean }>}
 */
function showGeoEvidenceIncompleteModal(err, options = {}) {
  const audience = options.audience || 'user'
  return new Promise((resolve) => {
    wx.showModal({
      title: options.title || '资料不完整，暂无法提交',
      content: buildGeoEvidenceModalContent(err, { audience }),
      showCancel: false,
      confirmText: options.confirmText || '我知道了',
      success: (res) => resolve({ confirm: Boolean(res.confirm) }),
      fail: () => resolve({ confirm: false }),
    })
  })
}

module.exports = {
  isGeoEvidenceIncompleteError,
  buildGeoEvidenceModalContent,
  showGeoEvidenceIncompleteModal,
}
