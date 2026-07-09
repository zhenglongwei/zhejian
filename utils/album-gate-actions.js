/**
 * CASE-GATE-A/B · 用户端闸门提示与操作
 */
const { submitServicePublicCaseReview } = require('../services/public-case')
const { prepareServiceAuthorizePreview } = require('../services/service-album')

const GATE_ACTION_LABEL = {
  edit_review: '修改评价',
  edit_authorization: '重新确认授权',
  retry_desensitize: '重试自动脱敏',
  manual_desensitize: '手工打码',
  resubmit_public_case: '重新提交公示',
}

function buildAlbumGateBanner(detail = {}) {
  const lines = []
  if (detail.compliancePendingHint) {
    lines.push(detail.compliancePendingHint)
  }
  if (detail.complianceRejectReason) {
    lines.push(`门店留档未通过合规审查：${detail.complianceRejectReason}`)
  }
  if (detail.awaitingUserConfirm && detail.userConfirmHint) {
    lines.push(detail.userConfirmHint)
  } else if (detail.contentFrozen && detail.userConfirmHint && !detail.gateBRejectHint) {
    lines.push(detail.userConfirmHint)
  }
  if (detail.gateBRejectHint) {
    lines.push(detail.gateBRejectHint)
    if (detail.gateBRejectReason && detail.gateBRejectReason !== detail.gateBRejectHint) {
      lines.push(`说明：${detail.gateBRejectReason}`)
    }
  }
  return lines.filter(Boolean).join('\n')
}

function buildGateActionButtons(detail = {}) {
  const actions = Array.isArray(detail.gateBUserActions) ? detail.gateBUserActions : []
  return actions
    .filter((key) => GATE_ACTION_LABEL[key])
    .map((key) => ({
      key,
      label: GATE_ACTION_LABEL[key],
    }))
}

async function runGateUserAction(page, actionKey, detail = {}) {
  const albumId = detail.albumId || page.data.albumId || page.actionAlbumId
  if (!albumId) return

  if (actionKey === 'edit_review') {
    wx.navigateTo({
      url: `/pages/album/engage/index?albumId=${albumId}&albumTitle=${encodeURIComponent(detail.serviceName || '')}`,
    })
    return
  }

  if (actionKey === 'edit_authorization' && typeof page.onOpenAuthorize === 'function') {
    page.onOpenAuthorize()
    return
  }

  if (actionKey === 'retry_desensitize' || actionKey === 'manual_desensitize') {
    try {
      wx.showLoading({ title: '加载中', mask: true })
      const preview = await prepareServiceAuthorizePreview(albumId)
      wx.hideLoading()
      const source = detail.desensitizePreviewSource || 'service'
      wx.navigateTo({
        url: `/pages/desensitize/preview/index?taskId=${encodeURIComponent(preview.taskId || '')}&albumId=${albumId}&source=${source}&fromPreMask=1`,
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
    }
    return
  }

  if (actionKey === 'resubmit_public_case') {
    try {
      wx.showLoading({ title: '提交中', mask: true })
      await submitServicePublicCaseReview({ albumId })
      wx.hideLoading()
      wx.showToast({ title: '已重新提交审核', icon: 'success' })
      if (typeof page.loadContext === 'function') {
        await page.loadContext()
      } else if (typeof page.loadDetail === 'function') {
        await page.loadDetail()
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '提交失败', icon: 'none' })
    }
  }
}

module.exports = {
  GATE_ACTION_LABEL,
  buildAlbumGateBanner,
  buildGateActionButtons,
  runGateUserAction,
}
