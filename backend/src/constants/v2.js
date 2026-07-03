const LEAD_STATUS = {
  SUBMITTED: 'SUBMITTED',
  VIEWED: 'VIEWED',
  CONTACTED: 'CONTACTED',
  CANCELLED: 'CANCELLED',
  CLOSED: 'CLOSED',
}

const LEAD_USER_CANCELLABLE = [LEAD_STATUS.SUBMITTED, LEAD_STATUS.VIEWED]

const LEAD_CLOSE_REASON = {
  UNREACHABLE: 'UNREACHABLE',
  VISITED: 'VISITED',
  DUPLICATE: 'DUPLICATE',
  INVALID: 'INVALID',
  OTHER: 'OTHER',
}

const SERVICE_ALBUM_STATUS = {
  DRAFT: 'draft',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  PENDING_AUTHORIZATION: 'pending_authorization',
  PUBLISHED: 'published',
}

/** 维修已结束（含公示流程中的历史 status 值，对外视为已完工） */
const SERVICE_ALBUM_REPAIR_DONE_STATUSES = [
  SERVICE_ALBUM_STATUS.COMPLETED,
  SERVICE_ALBUM_STATUS.PENDING_AUTHORIZATION,
  'pending_review',
  SERVICE_ALBUM_STATUS.PUBLISHED,
]

function isServiceAlbumRepairDone(status) {
  return SERVICE_ALBUM_REPAIR_DONE_STATUSES.includes(status)
}

const DEFAULT_STAGE_NODES = [
  { nodeId: 'stage_1', title: '接车记录', sortOrder: 0 },
  { nodeId: 'stage_2', title: '检测记录', sortOrder: 1 },
  { nodeId: 'stage_3', title: '方案与报价', sortOrder: 2 },
  { nodeId: 'stage_4', title: '配件/材料凭证', sortOrder: 3 },
  { nodeId: 'stage_5', title: '施工过程', sortOrder: 4 },
  { nodeId: 'stage_6', title: '完工交付', sortOrder: 5 },
]

const PUBLIC_CASE_STATUS = {
  PENDING_REVIEW: 'pending_review',
  PUBLIC_APPROVED: 'public_approved',
  USER_REJECTED: 'user_rejected',
  REJECTED: 'rejected',
  NEED_MODIFY: 'need_modify',
  OFFLINE: 'offline',
}

const RISK_LEVEL_ORDER = {
  low: 1,
  medium: 2,
  high: 3,
  forbidden: 4,
}

module.exports = {
  LEAD_STATUS,
  LEAD_USER_CANCELLABLE,
  LEAD_CLOSE_REASON,
  SERVICE_ALBUM_STATUS,
  SERVICE_ALBUM_REPAIR_DONE_STATUSES,
  isServiceAlbumRepairDone,
  DEFAULT_STAGE_NODES,
  PUBLIC_CASE_STATUS,
  RISK_LEVEL_ORDER,
}
