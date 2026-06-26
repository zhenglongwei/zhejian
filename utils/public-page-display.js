/**
 * 公开深链页展示辅助（与 backend PublicPageSections 同序）
 */

function buildCertRows(certifications) {
  return (certifications || []).map((item) => ({
    label: item.label,
    value: item.text || '—',
  }))
}

function buildTransparencyMetrics(transparency) {
  if (!transparency) return []
  const cells = []
  if (transparency.caseCount > 0) {
    cells.push({ num: String(transparency.caseCount), label: '公开案例' })
  }
  if (transparency.albumCompleteRate != null && transparency.albumCompleteRate > 0) {
    cells.push({ num: `${transparency.albumCompleteRate}%`, label: '相册完整率' })
  }
  if (transparency.score > 0) {
    cells.push({ num: String(transparency.score), label: '透明度评分' })
  }
  if (transparency.serviceCount > 0) {
    cells.push({ num: String(transparency.serviceCount), label: '可预约服务' })
  }
  return cells
}

module.exports = {
  buildCertRows,
  buildTransparencyMetrics,
}
