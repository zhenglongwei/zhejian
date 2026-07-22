/**
 * 公开深链页展示辅助（与 backend PublicPageSections 同序）
 */

/** 技师年限展示：纯数字补「年」，已有单位不重复 */
function formatTechnicianYearsDisplay(years) {
  const raw = String(years == null ? '' : years).trim()
  if (!raw) return ''
  const match = raw.match(/(\d+)/)
  if (!match) return raw
  return `${match[1]}年`
}

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

const TRANSPARENCY_BREAKDOWN_META = {
  album: { label: '过程资料齐全度', max: 25, hint: '已完工相册核心节点齐全比例' },
  case: { label: '公开案例', max: 20, hint: '已审核脱敏案例数量' },
  serviceProfile: { label: '服务资料', max: 15, hint: '上架服务的名称、摘要、封面与价格' },
  qualification: { label: '资质认证', max: 15, hint: '营业执照与维修资质（含有效期）' },
  freshness: { label: '内容新鲜度', max: 10, hint: '最近公开案例与资料核实' },
  capability: { label: '能力资料', max: 5, hint: '已审核技师与设备' },
  leadResponse: { label: '咨询响应', max: 10, hint: '近7日咨询回复（仅商家可见）' },
}

const TRANSPARENCY_METHODOLOGY =
  '满分100分，综合公开案例、已完工过程齐全度、服务资料、资质、新鲜度与能力资料；咨询响应仅商家后台。过程齐全度不代表可浏览进行中相册。'

function buildTransparencyExplain(transparency) {
  if (!transparency) {
    return { rows: [], methodology: TRANSPARENCY_METHODOLOGY, asOfDate: '' }
  }
  const breakdown = transparency.breakdown || {}
  const rows = Object.keys(TRANSPARENCY_BREAKDOWN_META)
    .filter((key) => breakdown[key] != null)
    .map((key) => {
      const meta = TRANSPARENCY_BREAKDOWN_META[key]
      return {
        key,
        label: meta.label,
        score: breakdown[key],
        max: meta.max,
        hint: meta.hint,
      }
    })
  return {
    rows,
    methodology: transparency.methodology || TRANSPARENCY_METHODOLOGY,
    asOfDate: transparency.asOfDate || '',
  }
}

module.exports = {
  formatTechnicianYearsDisplay,
  buildCertRows,
  buildTransparencyMetrics,
  buildTransparencyExplain,
  TRANSPARENCY_METHODOLOGY,
}
