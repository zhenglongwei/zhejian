/**
 * 商家套餐说明（选套餐页 + 套餐与工具权益页共用）
 * 当前仅一档：标准版 480 元/年；新开通含 90 天免费试用
 */

const PLAN_SELECT_HERO = {
  title: '标准版说明',
  subtitle: '透明成交与合规留证工具，与现有开单软件一起用。',
}

/** 套餐摘要 */
const PLAN_SELECT_SUMMARY = {
  name: '标准版',
  priceLabel: '480 元 / 年',
  trialLabel: '新开通含 90 天免费试用',
}

/**
 * 功能与限制对照表
 * @type {{ item: string, value: string }[]}
 */
const PLAN_SELECT_ROWS = [
  { item: '服务相册（过程记录）', value: '可用' },
  { item: '分享相册', value: '可用' },
  { item: 'GEO公域曝光', value: '赠送' },
  { item: 'GEO数据看板', value: '赠送' },
]

const PLAN_SELECT_FOOTER =
  '试用结束后可在「套餐与工具权益」续费；支付以届时页面为准。到期不会自动扣款。'

const PLAN_SELECT_CTA = '开始 90 天试用并进入工作台'

/** 工作台 · 套餐与工具权益页 */
const SUBSCRIPTION_COPY = {
  sectionTitle: '标准版说明',
  agreementLink: '查看《套餐与工具服务协议》',
  trialCta: '开始 90 天免费试用',
  payCta: '支付开通标准版 ¥480/年',
  renewCta: '支付续费一年',
  trialConfirmTitle: '确认免费试用',
  trialConfirmLines: [
    '0 元开始标准版 90 天免费试用。',
    '试用结束后需手动支付 480 元/年续费。',
    '不会自动扣款。',
  ],
}

module.exports = {
  PLAN_SELECT_HERO,
  PLAN_SELECT_SUMMARY,
  PLAN_SELECT_ROWS,
  PLAN_SELECT_FOOTER,
  PLAN_SELECT_CTA,
  SUBSCRIPTION_COPY,
}
