/**
 * GEO 证据链 block 提示（用户端 / 商家端共用）
 */

const GEO_MISSING_LABELS = {
  stage_1: '接车',
  stage_2: '检测',
  stage_3: '方案和报价',
  images: '过程图片',
}

const GEO_MISSING_ORDER = ['stage_1', 'stage_2', 'stage_3', 'images']

function getGeoMissingFields(err) {
  if (!err || typeof err !== 'object') return []
  return (err.data && err.data.missingFields) || err.missingFields || []
}

function isGeoEvidenceIncompleteError(err) {
  if (!err || typeof err !== 'object') return false
  if (err.code === 'GEO_EVIDENCE_INCOMPLETE' || err.code === 100007) return true
  const fields = getGeoMissingFields(err)
  if (!fields.length) return false
  if (err.code === 409) return true
  const quality = (err.data && err.data.geoQuality) || err.geoQuality
  return Boolean(quality && quality.level === 'block')
}

function buildGeoEvidenceMissingLabels(missingFields = []) {
  const labels = []
  for (const key of GEO_MISSING_ORDER) {
    const matched = (missingFields || []).some(
      (item) => (item.stage || item.field) === key
    )
    if (matched) labels.push(GEO_MISSING_LABELS[key])
  }
  return labels
}

function buildGeoEvidenceUserContent(missingFields = []) {
  const labels = buildGeoEvidenceMissingLabels(missingFields)
  if (!labels.length) {
    return '请联系门店补全维修相册中的关键材料。'
  }
  return `请联系门店补齐${labels.join('、')}材料。`
}

function buildGeoEvidenceMerchantContent(missingFields = []) {
  const labels = buildGeoEvidenceMissingLabels(missingFields)
  if (!labels.length) {
    return '请返回相册编辑，补全接车、检测、方案等关键材料后再提交。'
  }
  return `请返回相册编辑，补齐${labels.join('、')}材料后再提交。`
}

function buildGeoEvidenceModalContent(err, options = {}) {
  const audience = options.audience || 'user'
  const missingFields = getGeoMissingFields(err)
  return audience === 'merchant'
    ? buildGeoEvidenceMerchantContent(missingFields)
    : buildGeoEvidenceUserContent(missingFields)
}

/**
 * 展示需用户确认的 block 说明（showCancel: false，须点「我知道了」关闭）
 * @returns {Promise<{ confirm: boolean }>}
 */
function showGeoEvidenceIncompleteModal(err, options = {}) {
  return new Promise((resolve) => {
    wx.showModal({
      title: options.title || '暂无法提交',
      content: buildGeoEvidenceModalContent(err, options),
      showCancel: false,
      confirmText: options.confirmText || '我知道了',
      success: (res) => resolve({ confirm: Boolean(res.confirm) }),
      fail: () => resolve({ confirm: false }),
    })
  })
}

module.exports = {
  GEO_MISSING_LABELS,
  getGeoMissingFields,
  isGeoEvidenceIncompleteError,
  buildGeoEvidenceMissingLabels,
  buildGeoEvidenceUserContent,
  buildGeoEvidenceMerchantContent,
  buildGeoEvidenceModalContent,
  showGeoEvidenceIncompleteModal,
}
