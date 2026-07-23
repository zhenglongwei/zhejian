/**
 * 脱敏工作台 — 任务数据 → 展示项（用户端 / 商家端共用）
 */
const { ASSET_STATUS } = require('../constants/desensitize')
const { getWorkbenchStats } = require('../services/desensitize')

const STATUS_LABEL = {
  [ASSET_STATUS.RAW_UPLOADED]: '待脱敏',
  [ASSET_STATUS.MASKING]: '处理中',
  [ASSET_STATUS.MASKED_READY]: '待确认',
  [ASSET_STATUS.MASK_FAILED]: '需处理',
  [ASSET_STATUS.MANUAL_MASKED]: '已打码',
  [ASSET_STATUS.CONFIRMED]: '已确认',
}

const TAG_VARIANT = {
  [ASSET_STATUS.RAW_UPLOADED]: 'warning',
  [ASSET_STATUS.MASKING]: 'info',
  [ASSET_STATUS.MASKED_READY]: 'desensitized',
  [ASSET_STATUS.MASK_FAILED]: 'warning',
  [ASSET_STATUS.MANUAL_MASKED]: 'desensitized',
  [ASSET_STATUS.CONFIRMED]: 'success',
}

function buildWorkbenchItems(task) {
  const manualMaskStatuses = new Set([
    ASSET_STATUS.RAW_UPLOADED,
    ASSET_STATUS.MASK_FAILED,
    ASSET_STATUS.MASKED_READY,
    ASSET_STATUS.MANUAL_MASKED,
  ])
  return (task.rawAssets || []).map((asset) => ({
    id: asset.id,
    nodeTitle: asset.nodeTitle,
    rawUrl: asset.url,
    maskedUrl: asset.maskedUrl || '',
    statusLabel: STATUS_LABEL[asset.status] || asset.status,
    tagVariant: TAG_VARIANT[asset.status] || 'info',
    showRetry: asset.status === ASSET_STATUS.MASK_FAILED,
    showManualMask: manualMaskStatuses.has(asset.status),
    showExclude: false,
  }))
}

function mapTaskToWorkbenchState(task, options = {}) {
  const stats = getWorkbenchStats(task)
  const allowExclude = Boolean(options.allowExclude)
  const workbenchItems = buildWorkbenchItems(task).map((item) => ({
    ...item,
    showExclude: allowExclude,
  }))
  return {
    workbenchItems,
    stats,
    canConfirm: stats.canConfirm,
    needPreviewHint: stats.needPreview && stats.processed > 0,
    pageStatus: workbenchItems.length ? 'normal' : 'empty',
  }
}

module.exports = {
  STATUS_LABEL,
  TAG_VARIANT,
  buildWorkbenchItems,
  mapTaskToWorkbenchState,
}
