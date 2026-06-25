/**
 * 商家工作台单页工具台 · M-WB-UI
 * 真源：12_商家工作台UI线框.md
 */

const { attachNavIcon } = require('./nav-icons')
const { SERVICE_ALBUM_REPAIR_DONE_STATUSES } = require('./service-album-status')

const MERCHANT_ALBUM_SECTION_TITLE = '服务相册'

const MERCHANT_ALBUM_EMPTY_HINT =
  '为线下维修创建服务相册，记录六阶段过程与配件信息。'

const MERCHANT_CASE_SECTION_TITLE = '案例动态'

const MERCHANT_MANAGE_SECTION_TITLE = '门店管理'

const MERCHANT_HUB_DOCK_ITEMS = [
  { key: 'createAlbum', label: '新建相册' },
  { key: 'leads', label: '咨询线索', badgeKey: 'pendingLeads' },
  { key: 'services', label: '服务方案' },
  { key: 'dashboard', label: '数据概览' },
]

const MERCHANT_MANAGE_CELLS = [
  { key: 'previewStore', label: '预览门店', desc: '查看用户端门店主页' },
  { key: 'shareStore', label: '分享门店', desc: '复制链接或分享卡片' },
  { key: 'editStore', label: '编辑门店资料', desc: '基本资料与资质' },
  { key: 'staff', label: '员工管理', desc: '邀请与管理门店员工' },
]

function formatSectionBadge(n) {
  const count = Number(n) || 0
  if (count <= 0) return ''
  return count > 99 ? '99+' : String(count)
}

function buildMerchantTodoSummary(todos = {}) {
  const items = []
  const pendingLeads = Number(todos.pendingLeads) || 0
  const pendingAuth = Number(todos.pendingAuth) || 0
  const pendingUpload = Number(todos.pendingUpload) || 0
  const geoEvidenceBlocked = Number(todos.geoEvidenceBlocked) || 0

  if (pendingLeads > 0) {
    items.push({
      key: 'leads',
      label: `${pendingLeads} 条咨询待处理`,
      action: 'leads',
    })
  }
  if (pendingAuth > 0) {
    items.push({
      key: 'auth',
      label: `${pendingAuth} 本待车主授权`,
      action: 'auth',
    })
  }
  if (pendingUpload > 0) {
    items.push({
      key: 'upload',
      label: `${pendingUpload} 本待补节点`,
      action: 'upload',
    })
  }
  if (geoEvidenceBlocked > 0) {
    items.push({
      key: 'geo',
      label: `${geoEvidenceBlocked} 个相册待补公开证据`,
      action: 'geo',
    })
  }

  if (!items.length) return null
  return {
    headline: `${items.length} 项待你处理`,
    items,
  }
}

function pickMerchantHubAlbums(list = []) {
  const sorted = (list || [])
    .slice()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  if (!sorted.length) return []
  const heroes = [sorted[0]]
  if (sorted[1] && !SERVICE_ALBUM_REPAIR_DONE_STATUSES.includes(sorted[1].status)) {
    heroes.push(sorted[1])
  }
  return heroes.slice(0, 2)
}

function buildAlbumSectionBadge(todos = {}) {
  const upload = Number(todos.pendingUpload) || 0
  const auth = Number(todos.pendingAuth) || 0
  const total = upload + auth
  return formatSectionBadge(total)
}

function attachDockBadge(item, todos = {}) {
  const badge =
    item.badgeKey && todos[item.badgeKey]
      ? formatSectionBadge(todos[item.badgeKey])
      : ''
  return attachNavIcon({ ...item, desc: '', badge })
}

function buildMerchantHubDock(todos = {}) {
  return MERCHANT_HUB_DOCK_ITEMS.map((item) => attachDockBadge(item, todos))
}

function buildMerchantOverviewLine(overview = {}) {
  const leads = overview.leadSubmit
  const transparency = overview.transparency
  if (!leads && !transparency) return ''
  const parts = []
  if (leads !== undefined && leads !== null && leads !== '') {
    parts.push(`近7天咨询 ${leads}`)
  }
  if (transparency !== undefined && transparency !== null && transparency !== '') {
    parts.push(`透明度 ${transparency}`)
  }
  return parts.join(' · ')
}

module.exports = {
  MERCHANT_ALBUM_SECTION_TITLE,
  MERCHANT_ALBUM_EMPTY_HINT,
  MERCHANT_CASE_SECTION_TITLE,
  MERCHANT_MANAGE_SECTION_TITLE,
  MERCHANT_MANAGE_CELLS,
  buildMerchantTodoSummary,
  pickMerchantHubAlbums,
  buildAlbumSectionBadge,
  buildMerchantHubDock,
  buildMerchantOverviewLine,
}
