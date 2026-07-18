/**
 * 单页工具台（pages/mine/index）文案与待办聚合 · UI-ALB-F
 * 真源：12_我的页面 §3.1 · 11_工具相册UI线框 §1
 */

const MINE_TOOL_HERO_SUBTITLE = '查看门店为你创建的汽车维修档案'

const MINE_GUEST_TOOL_HINT =
  '门店创建相册后，请用微信「扫一扫」打开门店码或分享链接；登录后可在此翻阅汽车维修档案。'

const MINE_ALBUM_EMPTY_HINT =
  '暂无服务相册。若门店已发码，请用微信扫一扫打开；创建后会出现在下方。'

const MINE_ALBUM_SECTION_TITLE = '我的服务相册'

const MINE_TODO_SECTION_TITLE = '待处理'

const MINE_SHARE_INCENTIVE_TITLE = '公示激励'

const MINE_SHARE_INCENTIVE_COMPLIANCE =
  '按平台规则与实际浏览、到店效果结算；分享卡片不含收益诱导文案。'

const MINE_H5_OUTLET_TEXT = '想了解公开维修案例？前往辙见内容站'

function summarizeAuthorizationTodos(authList = [], badges = {}) {
  const pendingAuth =
    Number(String(badges.albumPendingAuth || '').replace(/\+/g, '')) || 0
  let pendingReview = 0
  let auditRejected = 0

  ;(authList || []).forEach((item) => {
    const status = item.publicCaseStatus || ''
    if (status === 'pending_review') pendingReview += 1
    if (status === 'user_rejected' || item.reviewStatus === 'rejected') {
      auditRejected += 1
    }
  })

  return {
    pendingAuth,
    pendingReview,
    auditRejected,
    hasRecords: (authList || []).length > 0,
  }
}

function buildMineTodoSummary(badges = {}, authSummary = null) {
  const summary = authSummary || summarizeAuthorizationTodos([], badges)
  const items = []

  if (summary.pendingAuth > 0) {
    items.push({
      key: 'pendingAuth',
      label: `${summary.pendingAuth} 本待发布到公开网站`,
      action: 'albumPublishable',
    })
  }
  if (summary.pendingReview > 0) {
    items.push({
      key: 'pendingReview',
      label: `${summary.pendingReview} 本审核中`,
      action: 'albumPublished',
    })
  }
  if (summary.auditRejected > 0) {
    items.push({
      key: 'auditRejected',
      label: `${summary.auditRejected} 本审核未通过`,
      action: 'albumPublishable',
    })
  }
  if (summary.hasRecords && !items.length) {
    items.push({
      key: 'authorizeHub',
      label: '查看已公示相册',
      action: 'albumPublished',
    })
  }

  if (!items.length) return null
  return {
    headline: `${items.length} 项待你处理`,
    items,
  }
}

module.exports = {
  MINE_TOOL_HERO_SUBTITLE,
  MINE_GUEST_TOOL_HINT,
  MINE_ALBUM_EMPTY_HINT,
  MINE_ALBUM_SECTION_TITLE,
  MINE_TODO_SECTION_TITLE,
  MINE_SHARE_INCENTIVE_TITLE,
  MINE_SHARE_INCENTIVE_COMPLIANCE,
  MINE_H5_OUTLET_TEXT,
  summarizeAuthorizationTodos,
  buildMineTodoSummary,
}
