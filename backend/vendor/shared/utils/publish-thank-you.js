/**
 * 车主分享邀请话术（仅语言激励：荣誉 / 体验官 / 控制权）
 * 对外避免「授权公示」「发布到公开网站」等敏感短句。
 * 物质答谢不在产品内配置，由运营指导门店线下处理。
 */

const EXPERIENCE_OFFICER_TITLES = [
  '透明维修体验官',
  '同城避坑体验官',
  '透明车间体验官',
  '修车避坑体验官',
  '车主互助体验官',
  '透明修车观察员',
]

const CONTROL_LINE =
  '我们承诺：案例仅用于技术科普，绝不泄露您的任何隐私。您可随时在「我的服务相册」点击下架，公开站将尽快删除相关内容（第三方缓存清除可能有延迟）。'

const CONSENT_CHECKBOX =
  '我已核对脱敏效果，同意将本次维修记录在隐去个人信息后供同城车友参考；我可随时下架。'

const AUTH_ACTION_LABEL = '分享脱敏报告'
const AUTH_SHEET_TITLE = '邀请你成为透明维修体验官'
const AUTH_CONFIRM_TEXT = '愿意分享这份脱敏报告'
const AUTH_REJECT_TEXT = '暂时先不分享'
const SHARE_COLUMN_PUBLISH_LABEL = '分享脱敏案例给同城车友'

function hashSeed(input) {
  const text = String(input || '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 2147483647
  }
  return Math.abs(hash)
}

function pickExperienceOfficerTitle(seed = '') {
  const index = hashSeed(seed) % EXPERIENCE_OFFICER_TITLES.length
  return EXPERIENCE_OFFICER_TITLES[index]
}

function resolveGuideTopic(vehicleLabel, serviceName) {
  const vehicle = String(vehicleLabel || '').trim() || '爱车'
  const service = String(serviceName || '').trim()
  if (service) return `${vehicle}${service}避坑指南`
  return `${vehicle}透明维修避坑指南`
}

/**
 * @returns {{
 *   officerTitle: string,
 *   guideTitle: string,
 *   pitch: string,
 *   controlLine: string,
 *   sheetTitle: string,
 *   confirmText: string,
 *   rejectText: string,
 *   actionLabel: string,
 *   consentCheckbox: string,
 * }}
 */
function buildPublishInviteCopy(options = {}) {
  const officerTitle = pickExperienceOfficerTitle(
    options.seed || options.albumId || options.vehicleLabel || 'zhejian'
  )
  const guideTitle = resolveGuideTopic(options.vehicleLabel, options.serviceName)
  const honorLine = `恭喜您的爱车满血复活！我们为您生成了一份《${guideTitle}》。是否愿意作为「${officerTitle}」，将这份脱敏报告分享给同城车友，帮助更多人避开修车陷阱？`
  const classicLine =
    '您的爱车维修案例非常经典！是否愿意将此案例隐去所有个人信息后，作为「透明车间标准案例」展示？'
  const pitch = `${honorLine}\n\n${classicLine}`

  return {
    officerTitle,
    guideTitle,
    pitch,
    benefitLine: '',
    controlLine: CONTROL_LINE,
    disclaimer: '',
    sheetTitle: `邀请你成为${officerTitle}`,
    confirmText: AUTH_CONFIRM_TEXT,
    rejectText: AUTH_REJECT_TEXT,
    actionLabel: AUTH_ACTION_LABEL,
    consentCheckbox: CONSENT_CHECKBOX,
  }
}

module.exports = {
  EXPERIENCE_OFFICER_TITLES,
  CONTROL_LINE,
  CONSENT_CHECKBOX,
  AUTH_ACTION_LABEL,
  AUTH_SHEET_TITLE,
  AUTH_CONFIRM_TEXT,
  AUTH_REJECT_TEXT,
  SHARE_COLUMN_PUBLISH_LABEL,
  pickExperienceOfficerTitle,
  buildPublishInviteCopy,
}
