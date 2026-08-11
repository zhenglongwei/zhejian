/**
 * 案例审核闸门（完工后唯一阻塞审 · 审案例文稿）
 * - 商家确认完工 → pending_desensitize（等脱敏）
 * - 脱敏结束（成功/部分失败/失败）→ pending_review
 * - 运营通过 → review_passed（案例稿/发布可开，不上线）
 * - 运营驳回 → rejected（解锁商家）
 * - 车主发布 → public_approved
 *
 * 2026-08-11：相册与案例文稿分模块；案例审不挡关联车主查看服务相册。
 */
const { PUBLIC_CASE_STATUS } = require('../constants/v2')

const CASE_REVIEW_UNLOCK_STATUSES = new Set([
  PUBLIC_CASE_STATUS.REJECTED,
  PUBLIC_CASE_STATUS.NEED_MODIFY,
])

const CASE_REVIEW_PASSED_STATUSES = new Set([
  PUBLIC_CASE_STATUS.REVIEW_PASSED,
  PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
  PUBLIC_CASE_STATUS.OFFLINE,
])

const CASE_REVIEW_LOCK_STATUSES = new Set([
  PUBLIC_CASE_STATUS.PENDING_DESENSITIZE,
  PUBLIC_CASE_STATUS.PENDING_REVIEW,
  PUBLIC_CASE_STATUS.REVIEW_PASSED,
  PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
  PUBLIC_CASE_STATUS.OFFLINE,
])

function resolvePublicCaseRowStatus(album) {
  if (!album) return ''
  if (album.publicCase && album.publicCase.status) {
    return String(album.publicCase.status)
  }
  return String(album.publicCaseStatus || '')
}

function isCaseReviewPassed(album) {
  return CASE_REVIEW_PASSED_STATUSES.has(resolvePublicCaseRowStatus(album))
}

function isCaseReviewPending(album) {
  const status = resolvePublicCaseRowStatus(album)
  return (
    status === PUBLIC_CASE_STATUS.PENDING_REVIEW ||
    status === PUBLIC_CASE_STATUS.PENDING_DESENSITIZE
  )
}

function isCaseReviewRejected(album) {
  return CASE_REVIEW_UNLOCK_STATUSES.has(resolvePublicCaseRowStatus(album))
}

function isCaseReviewContentLocked(album) {
  const status = resolvePublicCaseRowStatus(album)
  if (CASE_REVIEW_UNLOCK_STATUSES.has(status)) return false
  if (CASE_REVIEW_LOCK_STATUSES.has(status)) return true
  return false
}

/**
 * 历史字段：曾表示「完工后案例审通过前车主不可看相册」。
 * 2026-08-11 起恒为 false（相册全程对关联车主开放）。
 */
function isOwnerAlbumBlocked() {
  return false
}

/** 映射给仍读 complianceStatus 的前端：pending | passed | rejected | '' */
function mapCaseReviewToComplianceCompat(album) {
  const status = resolvePublicCaseRowStatus(album)
  if (
    status === PUBLIC_CASE_STATUS.PENDING_REVIEW ||
    status === PUBLIC_CASE_STATUS.PENDING_DESENSITIZE
  ) {
    return 'pending'
  }
  if (CASE_REVIEW_PASSED_STATUSES.has(status)) return 'passed'
  if (CASE_REVIEW_UNLOCK_STATUSES.has(status)) return 'rejected'
  return ''
}

function assertCaseReviewPassed(album) {
  if (isCaseReviewPassed(album)) return
  const status = resolvePublicCaseRowStatus(album)
  if (
    status === PUBLIC_CASE_STATUS.PENDING_REVIEW ||
    status === PUBLIC_CASE_STATUS.PENDING_DESENSITIZE
  ) {
    const err = new Error('门店案例审核中，通过后方可查看或发布')
    err.status = 409
    err.code = 'CASE_REVIEW_PENDING'
    throw err
  }
  if (CASE_REVIEW_UNLOCK_STATUSES.has(status)) {
    const err = new Error('门店案例未通过审核，请等待门店修改后重新送审')
    err.status = 409
    err.code = 'CASE_REVIEW_REJECTED'
    throw err
  }
  const err = new Error('须先通过平台案例审核')
  err.status = 409
  err.code = 'CASE_REVIEW_REQUIRED'
  throw err
}

/** 相册详情：不再因案例审拦截；保留函数名供调用方兼容 */
function assertOwnerAlbumAccessible() {
  return
}

module.exports = {
  resolvePublicCaseRowStatus,
  isCaseReviewPassed,
  isCaseReviewPending,
  isCaseReviewRejected,
  isCaseReviewContentLocked,
  isOwnerAlbumBlocked,
  mapCaseReviewToComplianceCompat,
  assertCaseReviewPassed,
  assertOwnerAlbumAccessible,
  CASE_REVIEW_PASSED_STATUSES,
  CASE_REVIEW_UNLOCK_STATUSES,
}
