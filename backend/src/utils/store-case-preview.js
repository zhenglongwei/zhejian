/**
 * 门店公开页案例预览（主信号文案）
 * 标题优先：车型 · 服务 · 问题（与 H5 /utils/store-case-display 口径一致）
 */

const {
  extractPublicViewFromContentJson,
  extractSnapshotFromContentJson,
} = require('../schemas/case-snapshot.schema')

function truncate(text, maxLen) {
  const value = String(text || '').trim()
  if (!value) return ''
  if (value.length <= maxLen) return value
  return `${value.slice(0, maxLen)}…`
}

function stripDesensitizeParen(text) {
  return String(text || '')
    .replace(/\s*[（(]\s*已脱敏\s*[）)]\s*/gu, '')
    .trim()
}

function isGenericFault(text) {
  const v = String(text || '').trim()
  return !v || v === '用户反馈的相关问题' || v === '到店进行相关检查'
}

function pickVehicleText(content, snapshot, publicView, geo) {
  if (content.vehicleText) return stripDesensitizeParen(content.vehicleText)
  const vehicle = snapshot?.vehicle || {}
  const brand = vehicle.brand || vehicle.series || ''
  const model = vehicle.model || ''
  const composed = [brand, model].filter(Boolean).join(' ')
  if (composed) return stripDesensitizeParen(composed)
  if (geo.vehicleText) return stripDesensitizeParen(geo.vehicleText)
  if (publicView?.storeName && false) return ''
  return ''
}

/**
 * @param {{ id?: string, title?: string, serviceName?: string, contentJson?: object }} row
 */
function mapStoreCasePreview(row = {}) {
  const content = row.contentJson && typeof row.contentJson === 'object' ? row.contentJson : {}
  const snapshot = extractSnapshotFromContentJson(content)
  const publicView = extractPublicViewFromContentJson(content)
  const geo =
    (content.geo && typeof content.geo === 'object' ? content.geo : null) ||
    (snapshot && snapshot.geo && typeof snapshot.geo === 'object' ? snapshot.geo : {}) ||
    {}
  const facts = (publicView && publicView.facts) || {}

  const vehicleText = pickVehicleText(content, snapshot, publicView, geo)
  const serviceName = String(
    row.serviceName || publicView?.serviceName || snapshot?.serviceName || geo.serviceName || ''
  ).trim()
  const faultRaw = facts.faultDesc || geo.faultDesc || content.faultDesc || ''
  const faultDesc = isGenericFault(faultRaw) ? '' : truncate(faultRaw, 24)

  const parts = []
  if (vehicleText) parts.push(vehicleText)
  if (serviceName) parts.push(serviceName)
  if (faultDesc && !serviceName.includes(faultDesc)) parts.push(faultDesc)

  const title =
    parts.length > 0
      ? parts.join(' · ')
      : String(row.title || serviceName || '公开案例').replace(/维修维修/gu, '维修')

  const slug = geo.slug || content.slug || ''
  const id = row.id || ''
  const path = slug
    ? `/case/${encodeURIComponent(slug)}.html`
    : id
      ? `/case/view.html?id=${encodeURIComponent(id)}`
      : ''

  return {
    id,
    title: truncate(title, 48),
    serviceName,
    vehicleText,
    faultDesc,
    slug,
    path,
  }
}

module.exports = {
  mapStoreCasePreview,
}
