/** 商家 SaaS 套餐 · 对齐 docs/01_…/09_招商方案和收费策略.md */

const MERCHANT_PLAN = {
  FREE: 'free',
  INDEX_99: 'index_99',
  /** @deprecated 已停售；存量商家仍享公域收录权益 */
  OPTIMIZE_299: 'optimize_299',
}

const MERCHANT_PLAN_LABELS = {
  [MERCHANT_PLAN.FREE]: '免费版',
  [MERCHANT_PLAN.INDEX_99]: '标准版',
  [MERCHANT_PLAN.OPTIMIZE_299]: '标准版',
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
  [MERCHANT_PLAN.FREE]: '免费版',
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
const STANDARD_TRIAL_DAYS = 180

const PLAN_CATALOG = [
  {
    plan: MERCHANT_PLAN.FREE,
    name: MERCHANT_PLAN_LABELS[MERCHANT_PLAN.FREE],
    priceCents: 0,
    priceLabel: '0 元 / 永久',
    highlights: [
      '服务相册全功能永久免费',
      '车主扫码查看与微信内分享',
      '工单数据永久留存',
    ],
    publicIndex: false,
  },
  {
    plan: MERCHANT_PLAN.INDEX_99,
    name: MERCHANT_PLAN_LABELS[MERCHANT_PLAN.INDEX_99],
    priceCents: MERCHANT_PLAN_PRICE_CENTS[MERCHANT_PLAN.INDEX_99],
    priceLabel: '99 元 / 年',
    trialLabel: '首购免费试用 6 个月',
    highlights: [
      '授权案例生成公域 H5 并进入 sitemap',
      '支持搜索引擎与大模型抓取收录',
      '门店 H5 页公域可检索',
      '含免费版全部功能',
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
