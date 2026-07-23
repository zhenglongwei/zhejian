/**
 * 车主分享邀请话术（仅语言激励）
 * 真源：docs/04_维修过程相册/15_公域知识包与相册教练规则引擎.md §13
 * 对外避免「授权公示」等压迫短句；主文案走荣誉 + 控制权。
 */

/** 亲切单句鼓励；按相册稳定随机取一句 */
const ENCOURAGE_LINES = [
  '恭喜您的爱车满血复活！我们为您整理了一份脱敏避坑指南。是否愿意作为「透明维修体验官」，分享给同城车友，帮助更多人避开修车陷阱？',
  '这份脱敏后的维修记录，说不定能帮到下一位同款车主。愿意当一回「避坑体验官」，把它分享出去吗？',
  '修车过程留得清楚，本身就是最好的口碑。欢迎成为透明维修体验官，让同城车友少走弯路。',
  '谢谢您一路跟进服务相册。若方便，诚邀您以透明维修体验官的身份，把这份脱敏案例分享给需要的人。',
  '您的案例很有参考价值。成为避坑体验官，分享给同城车友，帮助更多人避开修车陷阱。',
  '修好了就更值得被看见。邀请您做透明维修体验官，把脱敏后的过程分享出去，帮帮后来的车友。',
]

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
  '我已核对脱敏效果，同意以体验官身份将门店脱敏案例说明与精选过程图供同城车友参考（不含金额与完整工单）；我可随时下架。'

const AUTH_ACTION_LABEL = '分享脱敏报告'
const AUTH_SHEET_TITLE = '分享脱敏案例'
const AUTH_CONFIRM_TEXT = '愿意分享这份脱敏报告'
const AUTH_REJECT_TEXT = '暂时先不分享'
const SHARE_COLUMN_PUBLISH_LABEL = '分享脱敏案例给同城车友'
const PREVIEW_LABEL = '预览脱敏案例'
const FEEDBACK_LABEL = '评价与反馈'

function hashSeed(input) {
  const text = String(input || '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 2147483647
  }
  return Math.abs(hash)
}

function pickEncourageLine(seed = '') {
  const index = hashSeed(seed || 'zhejian') % ENCOURAGE_LINES.length
  return ENCOURAGE_LINES[index]
}

function pickExperienceOfficerTitle(seed = '') {
  const index = hashSeed(seed) % EXPERIENCE_OFFICER_TITLES.length
  return EXPERIENCE_OFFICER_TITLES[index]
}

/**
 * 有车型/项目时生成带情绪价值的邀请句（仍无金额）
 */
function buildGuidePitch(options = {}) {
  const seed = options.seed || options.albumId || 'zhejian'
  const officerTitle = pickExperienceOfficerTitle(seed)
  const vehicle = String(options.vehicleLabel || options.vehicle || '').trim()
  const project = String(options.serviceName || options.project || '').trim()
  if (vehicle || project) {
    const label = [vehicle, project].filter(Boolean).join(' · ')
    return `恭喜您的爱车满血复活！我们为您整理了一份《${label}避坑指南》。是否愿意作为「${officerTitle}」，将这份脱敏报告分享给同城车友，帮助更多人避开修车陷阱？`
  }
  return pickEncourageLine(seed)
}

/**
 * @returns {{
 *   officerTitle: string,
 *   pitch: string,
 *   controlLine: string,
 *   sheetTitle: string,
 *   confirmText: string,
 *   rejectText: string,
 *   actionLabel: string,
 *   previewLabel: string,
 *   feedbackLabel: string,
 *   consentCheckbox: string,
 * }}
 */
function buildPublishInviteCopy(options = {}) {
  const seed = options.seed || options.albumId || options.vehicleLabel || 'zhejian'
  const officerTitle = pickExperienceOfficerTitle(seed)
  const pitch = buildGuidePitch({ ...options, seed })

  return {
    officerTitle,
    guideTitle: '',
    pitch,
    benefitLine: '',
    controlLine: CONTROL_LINE,
    disclaimer: '',
    sheetTitle: AUTH_SHEET_TITLE,
    confirmText: AUTH_CONFIRM_TEXT,
    rejectText: AUTH_REJECT_TEXT,
    actionLabel: AUTH_ACTION_LABEL,
    previewLabel: PREVIEW_LABEL,
    feedbackLabel: FEEDBACK_LABEL,
    consentCheckbox: CONSENT_CHECKBOX,
  }
}

/** 是否仍可用「邀请公示」话术（未上公开站） */
function canShowPublishInvite(detail = {}) {
  const status = detail.publicCaseStatus || 'private'
  if (status === 'public_approved' || status === 'pending_review') return false
  if (detail.status && detail.status !== 'completed' && detail.status !== 'published') {
    return false
  }
  return true
}

/** 已过审公示：展示朋友圈 / 好友 / 自媒体 */
function isPublicShareReady(detail = {}) {
  return (detail.publicCaseStatus || '') === 'public_approved'
}

module.exports = {
  ENCOURAGE_LINES,
  EXPERIENCE_OFFICER_TITLES,
  CONTROL_LINE,
  CONSENT_CHECKBOX,
  AUTH_ACTION_LABEL,
  AUTH_SHEET_TITLE,
  AUTH_CONFIRM_TEXT,
  AUTH_REJECT_TEXT,
  SHARE_COLUMN_PUBLISH_LABEL,
  PREVIEW_LABEL,
  FEEDBACK_LABEL,
  pickEncourageLine,
  pickExperienceOfficerTitle,
  buildGuidePitch,
  buildPublishInviteCopy,
  canShowPublishInvite,
  isPublicShareReady,
}
