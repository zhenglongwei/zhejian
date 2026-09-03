/**
 * 商家工作台单页工具台 · M-WB-UI
 * 真源：12_商家工作台UI线框.md
 */

const { attachNavIcon } = require('./nav-icons')
const { SERVICE_ALBUM_REPAIR_DONE_STATUSES } = require('./service-album-status')
const { buildMerchantPlanTag } = require('./merchant-plan-tier')

const MERCHANT_ALBUM_SECTION_TITLE = '服务相册'

const MERCHANT_ALBUM_EMPTY_HINT =
  '为线下维修创建服务相册，记录六阶段过程与配件信息。'

const MERCHANT_CASE_SECTION_TITLE = '案例动态'

const MERCHANT_HUB_DOCK_ITEMS = [
  { key: 'createAlbum', label: '新建相册' },
  { key: 'leads', label: '咨询线索', badgeKey: 'pendingLeads' },
  { key: 'reviews', label: '车主评价', badgeKey: 'pendingReviews' },
  { key: 'services', label: '服务方案' },
]

/** 主账号 · 页内文字链（不占 Dock 格）；切店在扉页，不重复 */
const MERCHANT_HUB_MORE_ITEMS = [
  { key: 'storeHome', label: '门店主页' },
  { key: 'staff', label: '账号管理' },
  { key: 'wechatArchive', label: '微信转案例' },
]

function formatSectionBadge(n) {
  const count = Number(n) || 0
  if (count <= 0) return ''
  return count > 99 ? '99+' : String(count)
}

function overviewMetricIsPositive(raw) {
  if (raw === undefined || raw === null || raw === '') return false
  const n = Number(String(raw).replace(/[^\d.-]/g, ''))
  if (Number.isFinite(n)) return n > 0
  return String(raw).trim() !== '0'
}

function buildMerchantTodoSummary(todos = {}) {
  const pendingLeads = Number(todos.pendingLeads) || 0
  const pendingUpload = Number(todos.pendingUpload) || 0
  const pendingReviews = Number(todos.pendingReviews) || 0
  const pendingFollowUp = Number(todos.pendingFollowUp) || 0
  const items = []
  if (pendingLeads > 0) {
    items.push({
      key: 'leads',
      label: `${pendingLeads} 条咨询待处理`,
      action: 'leads',
    })
  }
  if (pendingUpload > 0) {
    items.push({
      key: 'upload',
      label: `${pendingUpload} 本相册待补留证`,
      action: 'upload',
    })
  }
  if (pendingReviews > 0) {
    items.push({
      key: 'reviews',
      label: `${pendingReviews} 条评价待回复`,
      action: 'reviews',
    })
  }
  if (pendingFollowUp > 0) {
    items.push({
      key: 'followup',
      label: `${pendingFollowUp} 项服务待回访跟进`,
      action: 'followup',
    })
  }
  if (!items.length) return null
  return {
    headline: `${items.length} 项待你处理`,
    items,
  }
}

/** Hero：进行中优先最多 2；无进行中仅最近 1 本 */
function pickMerchantHubAlbums(list = []) {
  const sorted = (list || [])
    .slice()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  if (!sorted.length) return []
  const inProgress = sorted.filter(
    (row) => !SERVICE_ALBUM_REPAIR_DONE_STATUSES.includes(row.status),
  )
  if (inProgress.length) return inProgress.slice(0, 2)
  return [sorted[0]]
}

function buildAlbumSectionBadge() {
  return ''
}

function attachDockBadge(item, todos = {}) {
  const badge =
    item.badgeKey && todos[item.badgeKey]
      ? formatSectionBadge(todos[item.badgeKey])
      : ''
  return {
    ...attachNavIcon({ ...item, desc: '', badge }),
    iconBg: 'well',
  }
}

function buildMerchantHubDock(todos = {}) {
  return MERCHANT_HUB_DOCK_ITEMS.map((item) => attachDockBadge(item, todos))
}

function buildMerchantHubMoreLinks(canManageStaff = false, todos = {}) {
  const base = canManageStaff ? MERCHANT_HUB_MORE_ITEMS : [{ key: 'wechatArchive', label: '微信转案例' }]
  const items = canManageStaff
    ? MERCHANT_HUB_MORE_ITEMS
    : base
  return items.map((item) =>
    attachNavIcon({
      ...item,
      desc: '',
      badge: item.badgeKey ? formatSectionBadge(todos[item.badgeKey]) : '',
    }),
  )
}

function buildMerchantSubscriptionEntry(subscription = {}, isOwner = false) {
  if (!isOwner || !subscription || typeof subscription !== 'object') return null
  return {
    title: '套餐与工具权益',
    desc: '当前免费使用，公开案例基础收录不另收费',
    action: '查看说明',
    tone: 'active',
  }
}

/** 仅拼非 0 段；全空返回 '' */
function buildMerchantOverviewLine(overview = {}) {
  const parts = []
  if (overviewMetricIsPositive(overview.leadSubmit)) {
    parts.push(`近7天咨询 ${overview.leadSubmit}`)
  }
  if (overviewMetricIsPositive(overview.transparency)) {
    parts.push(`透明度 ${overview.transparency}`)
  }
  return parts.join(' · ')
}

/**
 * GEO：机会类目须与本店服务名相关才展示
 * @param {{ hint?: string, services?: Array<{ serviceName?: string }> }|null} geoOpp
 * @param {string[]} storeServiceNames
 */
function filterMerchantGeoOpportunity(geoOpp, storeServiceNames = []) {
  if (!geoOpp || typeof geoOpp !== 'object') return null
  const names = (storeServiceNames || [])
    .map((n) => String(n || '').trim())
    .filter(Boolean)
  if (!names.length) return null

  const services = Array.isArray(geoOpp.services) ? geoOpp.services : []
  const matched = services.find((row) => {
    const target = String((row && row.serviceName) || '').trim()
    if (!target) return false
    return names.some((n) => n === target || n.includes(target) || target.includes(n))
  })
  if (!matched) return null

  const cityCount = Number(matched.cityPublicCaseCount) || 0
  const hint = `您所在城市「${matched.serviceName}」相关公开脱敏案例约 ${cityCount} 条；完善服务相册并授权公开，有助于在「${matched.serviceName} 怎么处理」类问题中成为可引用参考。`
  return {
    ...geoOpp,
    hint,
    matchedServiceName: matched.serviceName,
  }
}

/** 草稿/进行中且图很少 → 待补留证列表 */
function pickPendingUploadAlbums(list = []) {
  return (list || [])
    .filter((row) => {
      const status = String((row && row.status) || '')
      if (!(status === 'draft' || status === 'in_progress')) return false
      const count = Number(row.imageCount)
      const n = Number.isFinite(count) ? count : ((row.images && row.images.length) || 0)
      return n < 2
    })
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

module.exports = {
  MERCHANT_ALBUM_SECTION_TITLE,
  MERCHANT_ALBUM_EMPTY_HINT,
  MERCHANT_CASE_SECTION_TITLE,
  MERCHANT_HUB_MORE_ITEMS,
  buildMerchantTodoSummary,
  pickMerchantHubAlbums,
  pickPendingUploadAlbums,
  buildAlbumSectionBadge,
  buildMerchantHubDock,
  buildMerchantHubMoreLinks,
  buildMerchantOverviewLine,
  buildMerchantSubscriptionEntry,
  buildMerchantPlanTag,
  filterMerchantGeoOpportunity,
  overviewMetricIsPositive,
}
