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

const IMAGE_MASK_STATUS_LABEL = {
  none: '',
  pending: '配图脱敏中',
  ready: '配图已脱敏',
  partial: '部分配图已脱敏',
  failed: '配图脱敏失败',
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

function buildFlowGuideText() {
  return '通常可先评价、再授权公示相册；顺序不必严格。勾选公开的评价在脱敏后，会随授权公示案例一并展示。'
}

function buildPublicConsentHint(publicCaseStatus) {
  if (publicCaseStatus === 'public_approved') {
    return '勾选后，评价文字、评分与脱敏配图将在公开案例中展示。'
  }
  if (publicCaseStatus === 'pending_review') {
    return '相册公示审核中；若勾选，评价内容将在案例通过后展示（配图经脱敏）。'
  }
  return '需完成相册授权公示且审核通过后，勾选的评价内容才会出现在公开案例中（配图经脱敏）。'
}

function buildReviewSyncedHint(publicCaseStatus, reviewAuthorizePublic, imagesMaskStatus = 'none') {
  if (!reviewAuthorizePublic) return ''
  const maskNote =
    imagesMaskStatus === 'partial'
      ? '部分配图脱敏失败，公开案例仅展示已成功脱敏的图片。'
      : imagesMaskStatus === 'failed'
        ? '配图脱敏未成功，公开案例暂不展示配图。'
        : ''
  if (publicCaseStatus === 'public_approved') {
    return maskNote ? `评价已同步至公示案例。${maskNote}` : '评价已同步至公示案例（含脱敏配图）。'
  }
  if (publicCaseStatus === 'pending_review') {
    return maskNote
      ? `已记录公开意愿，案例审核通过后将展示评价。${maskNote}`
      : '已记录公开意愿，案例审核通过后将展示评价（含脱敏配图）。'
  }
  return maskNote
    ? `已记录公开意愿；完成相册授权公示且审核通过后将展示评价。${maskNote}`
    : '已记录公开意愿；完成相册授权公示且审核通过后将展示评价（含脱敏配图）。'
}

function buildReviewImageMaskHint(imagesMaskStatus) {
  return IMAGE_MASK_STATUS_LABEL[imagesMaskStatus] || ''
}

module.exports = {
  PUBLIC_CASE_STATUS_LABEL,
  resolveReviewStepLabel,
  resolveReviewStepVariant,
  resolveAuthorizeStepLabel,
  resolveAuthorizeStepVariant,
  canStartAuthorizePublic,
  buildFlowGuideText,
  buildPublicConsentHint,
  buildReviewSyncedHint,
  buildReviewImageMaskHint,
}
