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

/** ALB-UX · 新建相册四阶段（接车→检测→施工→完工）；存量可仍含 stage_3/4 */
const DEFAULT_STAGE_NODES = [
  { nodeId: 'stage_1', title: '接车记录', sortOrder: 0 },
  { nodeId: 'stage_2', title: '检测记录', sortOrder: 1 },
  { nodeId: 'stage_5', title: '施工过程', sortOrder: 2 },
  { nodeId: 'stage_6', title: '完工交付', sortOrder: 3 },
]

/** 兼容读：旧六阶段 ID 顺序 */
const LEGACY_STAGE_IDS = [
  'stage_1',
  'stage_2',
  'stage_3',
  'stage_4',
  'stage_5',
  'stage_6',
]

const PUBLIC_CASE_STATUS = {
  /** 完工后脱敏处理中，尚未进入运营人审 */
  PENDING_DESENSITIZE: 'pending_desensitize',
  PENDING_REVIEW: 'pending_review',
  /** 运营案例审通过；短信未发出时停在此态，不得公开 */
  REVIEW_PASSED: 'review_passed',
  /** 已通知车主，异议窗口内 */
  NOTIFY_WINDOW: 'notify_window',
  PUBLIC_APPROVED: 'public_approved',
  USER_REJECTED: 'user_rejected',
  /** 车主在窗口内阻止，本相册不得再送审 */
  OWNER_BLOCKED: 'owner_blocked',
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
  LEGACY_STAGE_IDS,
  PUBLIC_CASE_STATUS,
  RISK_LEVEL_ORDER,
}
