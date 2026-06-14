/**
 * 服务相册维修摘要（AiSummaryBlock）— U-ALB-17
 * 规则化拼装，供抽屉 / 授权预览；GEO 案例生成可复用字段口径。
 */

const {
  resolveIssueDesc,
  resolveInspectionResult,
  resolveRepairSolution,
  buildPartsSummary,
} = require('./album-summary')

function truncateChinese(text, maxLen) {
  const s = String(text || '').trim()
  if (!s) return ''
  if (s.length <= maxLen) return s
  return `${s.slice(0, maxLen - 1)}…`
}

function buildVehicleTitle(vehicle = {}) {
  const parts = [vehicle.brand, vehicle.series].filter(Boolean)
  return parts.join(' ') || '车辆'
}

function normalizePartsPhrase(partsSummary) {
  const text = String(partsSummary || '').trim()
  if (!text) return ''
  return text.replace(/ 等 \d+ 项$/, '等')
}

/**
 * @param {object} input
 * @param {'private'|'authorize'} [input.scene] 私密抽屉 / 授权预览
 */
function buildAlbumAiSummary(input = {}) {
  const {
    serviceName = '维修服务',
    vehicle = {},
    nodes = [],
    storeNote = '',
    storeName = '',
    city = '',
    partsJson = [],
    imageCount = 0,
    scene = 'private',
  } = input

  const vehicleTitle = buildVehicleTitle(vehicle)
  const fault = resolveIssueDesc(vehicle, nodes)
  const inspect = resolveInspectionResult(nodes)
  const plan = resolveRepairSolution(nodes, storeNote)
  const partsSummary = normalizePartsPhrase(buildPartsSummary(partsJson))
  const cityPart = String(city || '').trim() || (storeName ? '' : '当地')
  const serviceLabel = String(serviceName || '维修服务').trim()

  const segments = []

  if (scene === 'authorize') {
    segments.push(
      `本页为${cityPart ? `${cityPart}` : ''}${vehicleTitle}${serviceLabel}授权公示预览。`
    )
  } else {
    segments.push(`本相册记录了${vehicleTitle}的${serviceLabel}过程。`)
  }

  if (fault) {
    segments.push(`车辆主要情况为${fault}。`)
  }

  if (inspect && plan) {
    segments.push(`${inspect}，${plan}。`)
  } else if (inspect) {
    segments.push(`${inspect}。`)
  } else if (plan) {
    segments.push(`${plan}。`)
  } else if (fault) {
    segments.push('门店按流程完成检测与施工。')
  }

  if (partsSummary) {
    segments.push(`涉及配件包括${partsSummary}。`)
  }

  const count = Number(imageCount) || 0
  if (count > 0) {
    segments.push(`共 ${count} 张过程图${scene === 'authorize' ? '将用于公示预览' : '供查阅留档'}。`)
  }

  if (scene === 'authorize') {
    segments.push('公示版本使用脱敏图，不包含车牌、VIN、手机号等隐私信息。')
  } else {
    segments.push('相册为车主私密留档，公开须另行授权并脱敏。')
  }

  segments.push('实际费用以门店方案报价为准。')

  let text = segments.join('')
  text = text.replace(/。+/g, '。')
  return truncateChinese(text, 300)
}

module.exports = {
  buildAlbumAiSummary,
  buildVehicleTitle,
}
