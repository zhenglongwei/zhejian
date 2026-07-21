/**
 * 审核通过后 · 套餐说明页
 * 当前仅一档：标准版 480 元/年；新店含 90 天免费试用
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
  { item: '服务相册（过程记录、车主扫码查看）', value: '可用' },
  { item: '私域分享相册 / 报告', value: '可用' },
  { item: '车主「发布到公开网站」', value: '可用（须审核）' },
  { item: '公开案例基础收录', value: '不另收费' },
  { item: '咨询线索工作台', value: '可用' },
  { item: '相册用量', value: '试用期内不限；正式开通后按年费权益' },
  { item: '费用', value: '试用 90 天免费，之后 480 元/年' },
  { item: '不包含', value: '竞价排名、订单量保证、交易抽佣' },
]

const PLAN_SELECT_FOOTER =
  '确认后进入工作台。试用结束后可在「套餐与工具权益」续费；支付以届时页面为准。'

const PLAN_SELECT_CTA = '开始 90 天试用并进入工作台'

module.exports = {
  PLAN_SELECT_HERO,
  PLAN_SELECT_SUMMARY,
  PLAN_SELECT_ROWS,
  PLAN_SELECT_FOOTER,
  PLAN_SELECT_CTA,
}
