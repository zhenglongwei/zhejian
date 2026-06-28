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

const MERCHANT_HUB_DOCK_ITEMS = [
  { key: 'createAlbum', label: '新建相册' },
  { key: 'leads', label: '咨询线索', badgeKey: 'pendingLeads' },
  { key: 'services', label: '服务方案' },
]

/** 主账号 · 页内文字链（不占 Dock 格） */
const MERCHANT_HUB_MORE_ITEMS = [
  { key: 'subscription', label: '套餐与公域收录' },
  { key: 'storeHome', label: '门店主页' },
  { key: 'editStore', label: '编辑资料' },
  { key: 'staff', label: '员工管理' },
  { key: 'addStore', label: '注册新门店' },
  { key: 'switchStore', label: '切换门店' },
]

function formatSectionBadge(n) {
  const count = Number(n) || 0
  if (count <= 0) return ''
  return count > 99 ? '99+' : String(count)
}

function buildMerchantTodoSummary(todos = {}) {
  const pendingLeads = Number(todos.pendingLeads) || 0
  if (pendingLeads <= 0) return null

  return {
    headline: `${pendingLeads} 条咨询待处理`,
    items: [
      {
        key: 'leads',
        label: '查看咨询线索',
        action: 'leads',
      },
    ],
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

function buildMerchantHubMoreLinks(canManageStaff = false) {
  if (!canManageStaff) return []
  return MERCHANT_HUB_MORE_ITEMS.slice()
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
  MERCHANT_HUB_MORE_ITEMS,
  buildMerchantTodoSummary,
  pickMerchantHubAlbums,
  buildAlbumSectionBadge,
  buildMerchantHubDock,
  buildMerchantHubMoreLinks,
  buildMerchantOverviewLine,
}
