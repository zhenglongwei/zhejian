/**
 * CASE-GATE-B · 公示审核（脱敏 + 用户侧内容）
 * 合规类驳回走闸门 A（album-compliance），不在此枚举。
 */
const GATE_B_REJECT_TYPE = {
  DESENSITIZE_INCOMPLETE: 'desensitize_incomplete',
  DESENSITIZE_MANUAL: 'desensitize_manual',
  REVIEW_CONTENT: 'review_content',
  REVIEW_IMAGE: 'review_image',
  AUTHORIZATION: 'authorization',
  USER_CONTENT: 'user_content',
  OTHER: 'other',
}

/** 运营在闸门 B 误选时拒绝（应走 album-compliance） */
const GATE_A_ONLY_REJECT_TYPES = new Set([
  'compliance',
  'banned_phrase',
  'external_contact',
  'album_compliance',
  'merchant_content',
])

const GATE_B_REJECT_META = {
  [GATE_B_REJECT_TYPE.DESENSITIZE_INCOMPLETE]: {
    label: '脱敏不完整',
    userHint: '部分图片脱敏未通过，请重试自动脱敏或进入手工打码后再提交公示。',
    userActions: ['retry_desensitize', 'manual_desensitize', 'resubmit_public_case'],
  },
  [GATE_B_REJECT_TYPE.DESENSITIZE_MANUAL]: {
    label: '需手工脱敏',
    userHint: '有图片需您确认或手工打码，请进入脱敏预览处理后再提交公示。',
    userActions: ['manual_desensitize', 'resubmit_public_case'],
  },
  [GATE_B_REJECT_TYPE.REVIEW_CONTENT]: {
    label: '评价文案',
    userHint: '您的评价或补充说明需要修改，请编辑后重新提交公示。',
    userActions: ['edit_review', 'resubmit_public_case'],
  },
  [GATE_B_REJECT_TYPE.REVIEW_IMAGE]: {
    label: '评价配图',
    userHint: '评价配图脱敏或内容不符合要求，请修改评价配图后重新提交公示。',
    userActions: ['edit_review', 'retry_desensitize', 'resubmit_public_case'],
  },
  [GATE_B_REJECT_TYPE.AUTHORIZATION]: {
    label: '授权信息',
    userHint: '授权档位或确认项需要调整，请重新确认授权后再提交公示。',
    userActions: ['edit_authorization', 'resubmit_public_case'],
  },
  [GATE_B_REJECT_TYPE.USER_CONTENT]: {
    label: '用户侧内容',
    userHint: '您提交的内容需要修改，请按提示调整后重新提交公示。',
    userActions: ['edit_review', 'resubmit_public_case'],
  },
  [GATE_B_REJECT_TYPE.OTHER]: {
    label: '其他',
    userHint: '公示内容需要您调整后重新提交，详情见驳回说明。',
    userActions: ['resubmit_public_case'],
  },
}

const GATE_B_SCOPE_LABEL = '脱敏完整性 + 用户侧内容（不含商家留档合规）'

function normalizeGateBRejectType(raw) {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (GATE_A_ONLY_REJECT_TYPES.has(key)) return { error: 'GATE_A_ONLY' }
  if (GATE_B_REJECT_META[key]) return { type: key }
  if (key === 'desensitize') return { type: GATE_B_REJECT_TYPE.DESENSITIZE_INCOMPLETE }
  if (key === 'review') return { type: GATE_B_REJECT_TYPE.REVIEW_CONTENT }
  return { type: GATE_B_REJECT_TYPE.OTHER }
}

function resolveGateBRejectMeta(type) {
  return (
    GATE_B_REJECT_META[type] || GATE_B_REJECT_META[GATE_B_REJECT_TYPE.OTHER]
  )
}

function buildGateBUserPayload(publicCase) {
  if (!publicCase) return null
  const status = publicCase.status
  const rejectType = publicCase.gateBRejectType || ''
  if (status !== 'need_modify' && status !== 'rejected') {
    if (!rejectType) return null
  }
  if (!rejectType) return null
  const meta = resolveGateBRejectMeta(rejectType)
  return {
    rejectType,
    rejectLabel: meta.label,
    rejectReason: publicCase.gateBRejectReason || '',
    userHint: meta.userHint,
    userActions: meta.userActions,
    canResubmitPublicCase: status === 'need_modify' || status === 'rejected',
    desensitizePreviewSource: 'review',
  }
}

function listGateBRejectReasonOptions() {
  return Object.entries(GATE_B_REJECT_META).map(([type, meta]) => ({
    type,
    label: meta.label,
  }))
}

module.exports = {
  GATE_B_REJECT_TYPE,
  GATE_A_ONLY_REJECT_TYPES,
  GATE_B_REJECT_META,
  GATE_B_SCOPE_LABEL,
  normalizeGateBRejectType,
  resolveGateBRejectMeta,
  buildGateBUserPayload,
  listGateBRejectReasonOptions,
}
