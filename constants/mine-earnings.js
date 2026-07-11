/**
 * 用户公示激励 · Phase 2 预留（单页工具台弱提示 + 明细页占位）
 * 合规：小程序内可展示激励规则；分享卡片/链接不得带收益诱导（12_我的 §3.1 · 设计体系 §9）
 */

const EARNINGS_STATUS = {
  COMING_SOON: 'coming_soon',
  ACTIVE: 'active',
}

const { COMPLIANCE_COPY } = require('./compliance-copy')

const EARNINGS_COMPLIANCE = COMPLIANCE_COPY.publicCaseIncentive

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
  totalText: '',
  monthText: '',
  pendingText: '',
  publicCaseCount: 0,
  summaryHint: '授权公示脱敏案例后，平台按规则与实际浏览、到店效果核算激励',
  guestHint: '登录后查看公示激励说明',
}

function buildMineEarningsPreview(options = {}) {
  const loggedIn = Boolean(options.loggedIn)
  if (!loggedIn) {
    return {
      ...EARNINGS_PREVIEW_PLACEHOLDER,
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
