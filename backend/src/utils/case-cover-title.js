/**
 * 公开案例列表封面标题：本店发布 = 店名 · 车型 · 客户主诉。
 * 未认领不写店名。详情页标题不走这里。
 */

function cleanText(text) {
  return String(text || '')
    .replace(/\s*[（(]\s*已脱敏\s*[）)]\s*/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isBlankJob(text) {
  const value = cleanText(text)
  return !value || value === '服务留档' || value === '维修案例' || value === '公开案例'
}

function isGenericComplaint(text) {
  const value = cleanText(text)
  return !value || value === '用户反馈的相关问题' || value === '到店进行相关检查'
}

function firstReadableClause(text, maxLen = 36) {
  const raw = cleanText(text).replace(/[。！？]+$/u, '')
  if (!raw) return ''
  const sentence = raw.split(/[。！？]/u).map((part) => part.trim()).find(Boolean) || raw
  if (sentence.length <= maxLen) return sentence
  const clause = sentence.split(/[，,]/u).map((part) => part.trim()).find(Boolean) || sentence
  if (clause.length <= maxLen) return clause
  return clause.slice(0, maxLen)
}

function trimVehicleForCover(text) {
  const value = cleanText(text)
  if (!value || value.length <= 18) return value
  const parts = value.split(' ').filter(Boolean)
  if (parts.length >= 2) return parts.slice(0, 2).join(' ')
  return value.slice(0, 18)
}

function composeCaseCoverTitle({
  storeName,
  vehicleText,
  chiefComplaint,
  serviceName,
  fallbackTitle,
  showStore = true,
} = {}) {
  const shop = showStore ? cleanText(storeName) : ''
  const vehicle = trimVehicleForCover(vehicleText)
  const complaint = isGenericComplaint(chiefComplaint)
    ? ''
    : firstReadableClause(chiefComplaint, 36)
  let job = complaint
  if (!job && !isBlankJob(serviceName)) job = firstReadableClause(serviceName, 36)
  if (!job && !isBlankJob(fallbackTitle)) job = firstReadableClause(fallbackTitle, 36)

  const parts = []
  if (shop) parts.push(shop)
  if (vehicle && vehicle !== shop) parts.push(vehicle)
  if (job && parts.indexOf(job) === -1) parts.push(job)
  if (!parts.length) return '公开案例'
  return parts.join(' · ')
}

module.exports = {
  composeCaseCoverTitle,
  firstReadableClause,
}
