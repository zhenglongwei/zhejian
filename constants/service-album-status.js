/**
 * 服务相册状态 — V2.0（对齐 04/03_服务相册流程.md §6）
 */
const SERVICE_ALBUM_STATUS = {
  DRAFT: 'draft',
  PENDING_PART_CONFIRM: 'pending_part_confirm',
  IN_PROGRESS: 'in_progress',
  PENDING_DELIVERY: 'pending_delivery',
  COMPLETED: 'completed',
  PENDING_AUTHORIZATION: 'pending_authorization',
  PENDING_REVIEW: 'pending_review',
  PUBLISHED: 'published',
}

const SERVICE_ALBUM_STATUS_LABEL = {
  [SERVICE_ALBUM_STATUS.DRAFT]: '草稿',
  [SERVICE_ALBUM_STATUS.PENDING_PART_CONFIRM]: '配件待确认',
  [SERVICE_ALBUM_STATUS.IN_PROGRESS]: '维修中',
  [SERVICE_ALBUM_STATUS.PENDING_DELIVERY]: '待交付',
  [SERVICE_ALBUM_STATUS.COMPLETED]: '已完工',
  [SERVICE_ALBUM_STATUS.PENDING_AUTHORIZATION]: '待授权公开',
  [SERVICE_ALBUM_STATUS.PENDING_REVIEW]: '审核中',
  [SERVICE_ALBUM_STATUS.PUBLISHED]: '已公开',
}

/** 维修已结束（含完工后的公示流程态，对外仍展示「已完工」） */
const SERVICE_ALBUM_REPAIR_DONE_STATUSES = [
  SERVICE_ALBUM_STATUS.COMPLETED,
  SERVICE_ALBUM_STATUS.PENDING_AUTHORIZATION,
  SERVICE_ALBUM_STATUS.PENDING_REVIEW,
  SERVICE_ALBUM_STATUS.PUBLISHED,
]

/** 用户端相册可见性文案（与维修进度 Tag 分开展示） */
const ALBUM_VISIBILITY_LABEL = {
  private: '私密相册',
  user_rejected: '私密相册',
  authorization_pending: '私密相册',
  pending_review: '审核中',
  public_approved: '公开相册',
  need_modify: '需修改后重提',
}

const ALBUM_VISIBILITY_VARIANT = {
  private: 'default',
  user_rejected: 'default',
  authorization_pending: 'default',
  pending_review: 'info',
  public_approved: 'success',
  need_modify: 'warning',
}

const SERVICE_ALBUM_STATUS_VARIANT = {
  [SERVICE_ALBUM_STATUS.DRAFT]: 'default',
  [SERVICE_ALBUM_STATUS.PENDING_PART_CONFIRM]: 'warning',
  [SERVICE_ALBUM_STATUS.IN_PROGRESS]: 'info',
  [SERVICE_ALBUM_STATUS.PENDING_DELIVERY]: 'info',
  [SERVICE_ALBUM_STATUS.COMPLETED]: 'success',
  [SERVICE_ALBUM_STATUS.PENDING_AUTHORIZATION]: 'info',
  [SERVICE_ALBUM_STATUS.PENDING_REVIEW]: 'info',
  [SERVICE_ALBUM_STATUS.PUBLISHED]: 'success',
}

/** 用户端列表 Tab（公示态三分 · 2026-06-24） */
const SERVICE_ALBUM_LIST_TABS = [
  { key: 'all', label: '全部' },
  { key: 'publishable', label: '可公示' },
  { key: 'published', label: '已公示' },
]

/** @deprecated 兼容旧 tab 参数 */
const SERVICE_ALBUM_LIST_TAB_ALIASES = {
  private: 'publishable',
  public: 'published',
}

function normalizeServiceAlbumListTab(tab) {
  const key = String(tab || 'all').trim()
  if (SERVICE_ALBUM_LIST_TABS.some((item) => item.key === key)) return key
  return SERVICE_ALBUM_LIST_TAB_ALIASES[key] || 'all'
}

/** 商家端列表 Tab */
const MERCHANT_SERVICE_ALBUM_LIST_TABS = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'done', label: '已完工' },
  { key: 'pending_auth', label: '待公开授权' },
]

const MERCHANT_SERVICE_ALBUM_TAB_STATUS_MAP = {
  all: null,
  active: [
    SERVICE_ALBUM_STATUS.DRAFT,
    SERVICE_ALBUM_STATUS.IN_PROGRESS,
    SERVICE_ALBUM_STATUS.PENDING_DELIVERY,
    SERVICE_ALBUM_STATUS.PENDING_PART_CONFIRM,
  ],
  done: [SERVICE_ALBUM_STATUS.COMPLETED],
  pending_auth: [
    SERVICE_ALBUM_STATUS.PENDING_AUTHORIZATION,
    SERVICE_ALBUM_STATUS.PENDING_REVIEW,
    SERVICE_ALBUM_STATUS.PUBLISHED,
  ],
}

module.exports = {
  SERVICE_ALBUM_STATUS,
  SERVICE_ALBUM_STATUS_LABEL,
  SERVICE_ALBUM_STATUS_VARIANT,
  SERVICE_ALBUM_REPAIR_DONE_STATUSES,
  ALBUM_VISIBILITY_LABEL,
  ALBUM_VISIBILITY_VARIANT,
  SERVICE_ALBUM_LIST_TABS,
  SERVICE_ALBUM_LIST_TAB_ALIASES,
  normalizeServiceAlbumListTab,
  MERCHANT_SERVICE_ALBUM_LIST_TABS,
  MERCHANT_SERVICE_ALBUM_TAB_STATUS_MAP,
}
