/**
 * 单页工具台（pages/mine/index）文案与待办聚合 · UI-ALB-F
 * 真源：12_我的页面 §3.1 · 11_工具相册UI线框 §1
 */

const MINE_TOOL_HERO_SUBTITLE = '查看门店为你创建的汽车维修档案'

const MINE_GUEST_TOOL_HINT =
  '门店创建相册后，请用微信「扫一扫」打开门店码或分享链接；登录后可在此翻阅汽车维修档案。'

/** 已登录无相册：空态标题与主 CTA（使用说明见设置 → 关于辙见） */
const MINE_ALBUM_EMPTY_TITLE = '暂无相册'

const MINE_ALBUM_EMPTY_ACTION = '查看支持相册的商家 →'

const MINE_ALBUM_SECTION_TITLE = '我的服务相册'

const MINE_TODO_SECTION_TITLE = '待处理'

const MINE_SHARE_INCENTIVE_TITLE = '公示激励'

/**
 * 工具台首屏「公示激励」弱条开关（真源：12_我的 §3.1.3）
 * false：不下发（含筹备中态）；业务就绪后改为 true 即可恢复
 */
const MINE_SHARE_INCENTIVE_ENABLED = false

const MINE_SHARE_INCENTIVE_COMPLIANCE =
  '按平台规则与实际浏览、到店效果结算；分享卡片不含收益诱导文案。'

/** 未登录公域冷启动底部出口 */
const MINE_H5_OUTLET_TEXT = '看公开维修档案 → 打开公开案例站'

function summarizeAuthorizationTodos(authList = [], badges = {}) {
  const pendingAuth =
    Number(String(badges.albumPendingAuth || '').replace(/\+/g, '')) || 0
  const pendingOwnerReview =
    Number(String(badges.albumPendingOwnerReview || '').replace(/\+/g, '')) || 0
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
    pendingOwnerReview,
    hasRecords: (authList || []).length > 0,
  }
}

function buildMineTodoSummary(badges = {}, authSummary = null) {
  const summary = authSummary || summarizeAuthorizationTodos([], badges)
  const items = []

  if (summary.pendingOwnerReview > 0) {
    items.push({
      key: 'pendingOwnerReview',
      label: `${summary.pendingOwnerReview} 本待评价`,
      action: 'albumPendingOwnerReview',
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
  MINE_ALBUM_EMPTY_TITLE,
  MINE_ALBUM_EMPTY_ACTION,
  MINE_ALBUM_SECTION_TITLE,
  MINE_TODO_SECTION_TITLE,
  MINE_SHARE_INCENTIVE_TITLE,
  MINE_SHARE_INCENTIVE_ENABLED,
  MINE_SHARE_INCENTIVE_COMPLIANCE,
  MINE_H5_OUTLET_TEXT,
  summarizeAuthorizationTodos,
  buildMineTodoSummary,
}
