/**
 * 商家工具权益说明（权益页共用）
 * 收费页只写权益名称，不写释义。历史选套餐文案仍留在本文件，当前页不用。
 */

const PLAN_SELECT_HERO = {
  title: '工具权益说明',
  subtitle: '透明成交与合规留证工具，与现有开单软件一起用。',
}

const PLAN_SELECT_SUMMARY = {
  name: '免费使用',
  priceLabel: '当前免费',
  trialLabel: '入驻审核通过后即可使用全部工具能力',
}

/**
 * 功能对照表
 * @type {{ item: string, value: string }[]}
 */
const PLAN_SELECT_ROWS = [
  { item: '服务相册（过程记录）', value: '可用' },
  { item: '分享相册', value: '可用' },
  { item: 'GEO公域曝光', value: '可用' },
  { item: 'GEO数据看板', value: '可用' },
]

const PLAN_SELECT_FOOTER =
  '公开案例须车主主动发布并经审核；基础收录不另收费。不做竞价排名、不抽佣。'

const PLAN_SELECT_CTA = '进入工作台'

/** @deprecated 收费页已改为四档对照表，见 merchant-plan-catalog.js */
const SUBSCRIPTION_COPY = {
  agreementLink: '查看《商家工具服务协议》',
}

const SUBSCRIPTION_BENEFITS = []

module.exports = {
  PLAN_SELECT_HERO,
  PLAN_SELECT_SUMMARY,
  PLAN_SELECT_ROWS,
  PLAN_SELECT_FOOTER,
  PLAN_SELECT_CTA,
  SUBSCRIPTION_COPY,
  SUBSCRIPTION_BENEFITS,
}
