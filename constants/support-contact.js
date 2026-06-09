/**
 * 平台客服联系方式（运营可按实际配置）
 * 维修/报价/售后由门店线下承担；此处仅内容、隐私、账号类问题。
 */
const PLATFORM_SUPPORT_SCOPE =
  '维修、报价、收款与售后请直接联系门店。\n\n' +
  '平台客服受理：小程序使用、隐私与脱敏、授权公开、内容展示相关问题。\n\n' +
  '虚假或违规信息请在对应服务/门店/案例页点击「举报虚假信息」。'

/** 客服电话（留空则不展示「拨打」项） */
const PLATFORM_SUPPORT_PHONE = ''

/** 客服邮箱 */
const PLATFORM_SUPPORT_EMAIL = 'service@simplewin.cn'

/** 服务时段说明（展示在 ActionSheet 前可选补充） */
const PLATFORM_SUPPORT_HOURS = '工作日 9:00–18:00（节假日以实际安排为准）'

module.exports = {
  PLATFORM_SUPPORT_SCOPE,
  PLATFORM_SUPPORT_PHONE,
  PLATFORM_SUPPORT_EMAIL,
  PLATFORM_SUPPORT_HOURS,
}
