const PUBLIC_CASE_STATUS_LABEL = {
  private: '未授权',
  pending_review: '审核中',
  public_approved: '已公示',
  user_rejected: '暂不公示',
}

const PUBLIC_CASE_STATUS_VARIANT = {
  private: 'info',
  pending_review: 'warning',
  public_approved: 'success',
  user_rejected: 'info',
}

const IMAGE_MASK_TAG = {
  none: '',
  pending: '脱敏中',
  ready: '已脱敏',
  partial: '部分脱敏',
  failed: '脱敏失败',
}

function resolveReviewStepLabel(hasReview) {
  return hasReview ? '已完成' : '待填写'
}

function resolveReviewStepVariant(hasReview) {
  return hasReview ? 'success' : 'info'
}

function resolveAuthorizeStepLabel(publicCaseStatus) {
  return PUBLIC_CASE_STATUS_LABEL[publicCaseStatus] || PUBLIC_CASE_STATUS_LABEL.private
}

function resolveAuthorizeStepVariant(publicCaseStatus) {
  return PUBLIC_CASE_STATUS_VARIANT[publicCaseStatus] || 'info'
}

function canStartAuthorizePublic(publicCaseStatus, eligible) {
  return Boolean(eligible) && ['private', 'user_rejected'].includes(publicCaseStatus || 'private')
}

function buildSyncStatusTags({
  publicCaseStatus,
  reviewAuthorizePublic,
  imagesMaskStatus,
  hasReview,
}) {
  if (!hasReview || !reviewAuthorizePublic) return []
  const tags = []
  if (publicCaseStatus === 'public_approved') {
    tags.push({ text: '已同步', variant: 'success' })
  } else if (publicCaseStatus === 'pending_review') {
    tags.push({ text: '待案例通过', variant: 'warning' })
  } else {
    tags.push({ text: '待授权公示', variant: 'info' })
  }
  const mask = IMAGE_MASK_TAG[imagesMaskStatus]
  if (mask) {
    tags.push({
      text: mask,
      variant: imagesMaskStatus === 'failed' ? 'warning' : 'info',
    })
  }
  return tags
}

function buildPublicCaseTag(publicCaseStatus) {
  if (publicCaseStatus === 'pending_review') {
    return { text: '案例审核中', variant: 'warning' }
  }
  if (publicCaseStatus === 'public_approved') {
    return { text: '案例已公示', variant: 'success' }
  }
  return null
}

/** @deprecated 页面不再展示长文案 */
function buildFlowGuideText() {
  return ''
}

/** @deprecated 页面不再展示长文案 */
function buildPublicConsentHint() {
  return ''
}

/** @deprecated 页面不再展示长文案 */
function buildReviewSyncedHint() {
  return ''
}

/** @deprecated 改用 buildSyncStatusTags */
function buildReviewImageMaskHint(imagesMaskStatus) {
  return IMAGE_MASK_TAG[imagesMaskStatus] || ''
}

module.exports = {
  PUBLIC_CASE_STATUS_LABEL,
  resolveReviewStepLabel,
  resolveReviewStepVariant,
  resolveAuthorizeStepLabel,
  resolveAuthorizeStepVariant,
  canStartAuthorizePublic,
  buildSyncStatusTags,
  buildPublicCaseTag,
  buildFlowGuideText,
  buildPublicConsentHint,
  buildReviewSyncedHint,
  buildReviewImageMaskHint,
}
