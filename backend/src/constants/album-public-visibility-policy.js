/**
 * PV-REFORM · 阶段 × 公开池策略（单上传自动分流）
 */

const STAGE_IMAGE_POLICY = {
  stage_1: 'always_private',
  stage_2: 'gate',
  stage_3: 'always_private',
  stage_4: 'gate',
  stage_5: 'gate',
  stage_6: 'gate',
}

const VISIBILITY = {
  PRIVATE: 'private',
  PUBLIC: 'public',
}

const PUBLIC_GATE_STATUS = {
  PENDING: 'pending',
  PASSED: 'passed',
  REJECTED: 'rejected',
  SKIPPED: 'skipped',
}

/** H5/Feed 硬上限（不截断留档，仅限制 snapshot.publicView.media） */
const PUBLIC_MEDIA_SOFT_CAP = 30

/** PKG-COACH：公开关键帧默认张数（可被 buildPublicView options.softCap 覆盖） */
const PUBLIC_MEDIA_KEYFRAME_DEFAULT = 8

function resolveStageImagePolicy(nodeId) {
  return STAGE_IMAGE_POLICY[String(nodeId || '').trim()] || 'gate'
}

function isAlwaysPrivateStage(nodeId) {
  return resolveStageImagePolicy(nodeId) === 'always_private'
}

module.exports = {
  STAGE_IMAGE_POLICY,
  VISIBILITY,
  PUBLIC_GATE_STATUS,
  PUBLIC_MEDIA_SOFT_CAP,
  PUBLIC_MEDIA_KEYFRAME_DEFAULT,
  resolveStageImagePolicy,
  isAlwaysPrivateStage,
}
