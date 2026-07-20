/**
 * 审核通过后 · 套餐选择页文案
 * 对齐 docs/01_…/10_商业模式产品需求调整.md · 验证期公示免费 + 专业版 480
 */

const PLAN_SELECT_HERO = {
  title: '选择使用方式',
  subtitle:
    '辙见是透明成交与合规留证的专用工具，和现有开单/收银软件一起用。' +
    '公开案例由车主发布，基础收录不另收费。',
}

const PLAN_SELECT_POSITIONING =
  '不做竞价排名、不抽佣；付费不买综合排序，也不承诺一定有多少咨询或到店。' +
  '验证期样板店可先免费试用工具；正式扣费以过线后开通支付为准。'

const PLAN_SELECT_OPTIONS = [
  {
    id: 'free',
    name: '体验版',
    priceLabel: '0 元',
    priceNote: '验证期可先使用；正式后将有月额度限制',
    recommended: false,
    bullets: [
      '创建服务相册，车主扫码查看过程',
      '私域分享相册与报告',
      '车主可「发布到公开网站」（须审核）；基础收录不另收费',
    ],
    cta: '先用体验版',
  },
  {
    id: 'tool_480',
    name: '专业版',
    priceLabel: '480 元 / 年',
    priceNote: '低门槛覆盖成本；工具费不是平台主收入预期',
    recommended: true,
    bullets: [
      '含体验版能力，更高额度 / 不限量使用（正式开通后）',
      '面向留证与确认等专业能力（按产品节奏上线）',
      '公开与基础收录同样不另收费',
      '验证期：可先标记意向并免费试用，过线后再支付',
    ],
    cta: '选专业版（验证期先试用）',
  },
]

const PLAN_SELECT_FOOTER =
  '选定后可进入工作台。之后可在「套餐与工具权益」查看说明；支付通道按产品节奏开放。'

module.exports = {
  PLAN_SELECT_HERO,
  PLAN_SELECT_POSITIONING,
  PLAN_SELECT_OPTIONS,
  PLAN_SELECT_FOOTER,
}
