/** 商家 SaaS 套餐 · 对齐 docs/01_…/09_招商方案和收费策略.md */

const MERCHANT_PLAN = {
  FREE: 'free',
  INDEX_99: 'index_99',
  /** @deprecated 已停售；存量商家仍享公域收录权益 */
  OPTIMIZE_299: 'optimize_299',
}

const MERCHANT_PLAN_LABELS = {
  [MERCHANT_PLAN.FREE]: '试用期',
  [MERCHANT_PLAN.INDEX_99]: '标准版（过渡）',
  [MERCHANT_PLAN.OPTIMIZE_299]: '标准版（过渡）',
}

/** 工作台扉页方案档位 Tag（不绑定具体权益） */
const MERCHANT_PLAN_TIER = {
  BASIC: 'basic',
  STANDARD: 'standard',
}

const MERCHANT_PLAN_TIER_BY_PLAN = {
  [MERCHANT_PLAN.FREE]: MERCHANT_PLAN_TIER.BASIC,
  [MERCHANT_PLAN.INDEX_99]: MERCHANT_PLAN_TIER.STANDARD,
  [MERCHANT_PLAN.OPTIMIZE_299]: MERCHANT_PLAN_TIER.STANDARD,
}

const MERCHANT_PLAN_TAG_LABELS = {
  [MERCHANT_PLAN.FREE]: '试用期',
  [MERCHANT_PLAN.INDEX_99]: '标准版',
  [MERCHANT_PLAN.OPTIMIZE_299]: '标准版',
}

const MERCHANT_PLAN_TAG_TIERS = MERCHANT_PLAN_TIER_BY_PLAN

/** 年费标价（分） */
const MERCHANT_PLAN_PRICE_CENTS = {
  [MERCHANT_PLAN.FREE]: 0,
  [MERCHANT_PLAN.INDEX_99]: 9900,
  [MERCHANT_PLAN.OPTIMIZE_299]: 9900,
}

const MERCHANT_SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
}

const MERCHANT_PAYMENT_STATUS = {
  CREATED: 'created',
  PAYING: 'paying',
  PAID: 'paid',
  FAILED: 'failed',
  CLOSED: 'closed',
}

/** 具备公域收录权益的套餐（active 且未过期） */
const PUBLIC_INDEX_PLANS = new Set([MERCHANT_PLAN.INDEX_99, MERCHANT_PLAN.OPTIMIZE_299])

/** 可售套餐（工作台展示） */
const SELLABLE_PLANS = new Set([MERCHANT_PLAN.FREE, MERCHANT_PLAN.INDEX_99])

const SUBSCRIPTION_TERM_DAYS = 365

/** 标准版首购免费试用天数 */
const STANDARD_TRIAL_DAYS = 90

const PLAN_CATALOG = [
  {
    plan: MERCHANT_PLAN.FREE,
    name: MERCHANT_PLAN_LABELS[MERCHANT_PLAN.FREE],
    priceCents: 0,
    priceLabel: '试用期内免费',
    highlights: [
      '试用期内可用服务相册、车主查看与私域分享',
      '车主发布案例基础收录不另收费',
      '试用结束后按标准版年费续费',
    ],
    publicIndex: false,
  },
  {
    plan: MERCHANT_PLAN.INDEX_99,
    name: MERCHANT_PLAN_LABELS[MERCHANT_PLAN.INDEX_99],
    priceCents: MERCHANT_PLAN_PRICE_CENTS[MERCHANT_PLAN.INDEX_99],
    priceLabel: '目标 480 元 / 年（支付目录改造中）',
    trialLabel: '新开通含 90 天免费试用',
    highlights: [
      '标准版工具权益（历史套餐码兼容）',
      '公开与基础收录不另收费',
      '正式价与目录见过线后 BIZ-SUB（tool_480）',
    ],
    publicIndex: true,
  },
]

module.exports = {
  MERCHANT_PLAN,
  MERCHANT_PLAN_LABELS,
  MERCHANT_PLAN_TAG_LABELS,
  MERCHANT_PLAN_TAG_TIERS,
  MERCHANT_PLAN_TIER,
  MERCHANT_PLAN_TIER_BY_PLAN: MERCHANT_PLAN_TIER_BY_PLAN,
  MERCHANT_PLAN_PRICE_CENTS,
  MERCHANT_SUBSCRIPTION_STATUS,
  MERCHANT_PAYMENT_STATUS,
  PUBLIC_INDEX_PLANS,
  SELLABLE_PLANS,
  SUBSCRIPTION_TERM_DAYS,
  STANDARD_TRIAL_DAYS,
  PLAN_CATALOG,
}
