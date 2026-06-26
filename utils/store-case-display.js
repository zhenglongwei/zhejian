/**
 * 门店页案例卡片 · 人读 + GEO 摘要（去模板废话）
 */

function truncate(text, maxLen) {
  const value = String(text || '').trim()
  if (!value) return ''
  if (value.length <= maxLen) return value
  return `${value.slice(0, maxLen)}…`
}

function stripBoilerplate(text) {
  return String(text || '')
    .replace(/^该案例经车主授权[，,]?/u, '')
    .replace(/^该案例为/u, '')
    .replace(/图片已脱敏.*?。/gu, '')
    .replace(/相关隐私信息已进行脱敏。/gu, '')
    .trim()
}

function pickVehicleLabel(item) {
  if (item.vehicleText) return String(item.vehicleText).trim()
  const row = (item.keyInfo || []).find(
    (entry) => entry && (entry.label === '车型' || entry.label === '车辆')
  )
  if (row && row.value) return String(row.value).trim()
  return ''
}

function pickProblem(item) {
  return truncate(item.faultDesc || item.inspectResult || '', 24)
}

function pickRepairFact(item) {
  if (item.repairPlan) return truncate(item.repairPlan, 48)
  if (item.inspectResult && item.faultDesc) {
    return truncate(`${item.faultDesc}；${item.inspectResult}`, 48)
  }
  return truncate(stripBoilerplate(item.aiSummary || item.summary), 48)
}

/** 列表标题：车型 · 项目 · 问题 */
function buildStoreCaseCardTitle(item) {
  const vehicle = pickVehicleLabel(item)
  const service = String(item.serviceName || '').trim()
  const problem = pickProblem(item)
  const parts = []
  if (vehicle) parts.push(vehicle)
  if (service) parts.push(service)
  if (problem && !service.includes(problem)) parts.push(problem)
  if (parts.length) return parts.join(' · ')
  return String(item.title || '公开案例').replace(/维修维修/gu, '维修')
}

/** 列表摘要：检查/方案一句，不含授权套话 */
function buildStoreCaseCardLead(item) {
  const lead = pickRepairFact(item)
  if (lead) return lead
  return truncate(stripBoilerplate(item.summary), 56) || '含脱敏过程图片，详情见案例页。'
}

function enrichStoreCaseListItem(item) {
  if (!item || typeof item !== 'object') return item
  return {
    ...item,
    displayTitle: buildStoreCaseCardTitle(item),
    displayLead: buildStoreCaseCardLead(item),
  }
}

function enrichStoreCaseList(list) {
  return (list || []).map(enrichStoreCaseListItem)
}

module.exports = {
  buildStoreCaseCardTitle,
  buildStoreCaseCardLead,
  enrichStoreCaseList,
}
