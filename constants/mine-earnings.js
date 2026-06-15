/**
 * 用户分享收益 · Phase 2 预留（我的页入口 + 收益浏览占位）
 * 合规：规则内说明，禁止「分享领钱」「好评返现」类外显诱导（设计体系 §9）
 */

const EARNINGS_STATUS = {
  COMING_SOON: 'coming_soon',
  ACTIVE: 'active',
}

const EARNINGS_COMPLIANCE =
  '分享收益按平台规则与实际浏览、到店等效果结算，审核通过后发放；非好评返现、非分享领现。'

const EARNINGS_RULE_STEPS = [
  {
    key: 'authorize',
    title: '授权公开案例',
    desc: '在相册尾页或「我的公开授权」中，将脱敏后的维修案例申请公示。',
  },
  {
    key: 'exposure',
    title: '案例获得浏览',
    desc: '公开案例可在 H5、搜一搜与 AI 引用等渠道被其他用户浏览，带来到店线索。',
  },
  {
    key: 'settle',
    title: '按效果结算收益',
    desc: '平台按实际效果与规则核算，收益明细将在此展示（功能筹备中）。',
  },
]

const EARNINGS_PREVIEW_PLACEHOLDER = {
  status: EARNINGS_STATUS.COMING_SOON,
  statusLabel: '筹备中',
  totalText: '—',
  monthText: '—',
  pendingText: '—',
  publicCaseCount: 0,
  summaryHint: '授权公示案例后，按实际浏览与到店效果结算',
  guestHint: '登录后查看分享收益',
}

function buildMineEarningsPreview(options = {}) {
  const loggedIn = Boolean(options.loggedIn)
  if (!loggedIn) {
    return {
      ...EARNINGS_PREVIEW_PLACEHOLDER,
      totalText: '—',
      summaryHint: EARNINGS_PREVIEW_PLACEHOLDER.guestHint,
    }
  }
  return {
    ...EARNINGS_PREVIEW_PLACEHOLDER,
    ...(options.preview || {}),
  }
}

function buildEarningsHeroKpis(preview = {}) {
  const base = preview.totalText != null ? preview : EARNINGS_PREVIEW_PLACEHOLDER
  return [
    { key: 'total', label: '累计收益（元）', value: base.totalText || '—', tone: 'warning' },
    { key: 'month', label: '本月预估（元）', value: base.monthText || '—', tone: 'primary' },
    { key: 'pending', label: '待结算（元）', value: base.pendingText || '—', tone: 'success' },
  ]
}

module.exports = {
  EARNINGS_STATUS,
  EARNINGS_COMPLIANCE,
  EARNINGS_RULE_STEPS,
  EARNINGS_PREVIEW_PLACEHOLDER,
  buildMineEarningsPreview,
  buildEarningsHeroKpis,
}
