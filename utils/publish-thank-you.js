/**
 * 车主分享邀请话术（仅语言激励）
 * 真源：docs/04_维修过程相册/15_公域知识包与相册教练规则引擎.md §13
 * 对外避免「授权公示」等压迫短句；主文案走荣誉 + 控制权。
 */

/** 亲切单句鼓励；按相册稳定随机取一句（少字，不重复称号） */
const ENCOURAGE_LINES = [
  '这份脱敏避坑指南已整理好，诚邀您分享给同城车友，帮更多人少踩坑。',
  '这份脱敏后的维修记录，说不定能帮到下一位同款车主，愿意分享出去吗？',
  '修车过程留得清楚，本身就是最好的口碑。欢迎把脱敏案例分享给同城车友。',
  '谢谢您一路跟进服务相册。若方便，把这份脱敏案例分享给需要的人吧。',
  '您的案例很有参考价值。分享给同城车友，帮助更多人避开修车陷阱。',
  '修好了就更值得被看见。把脱敏后的过程分享出去，帮帮后来的车友。',
]

const EXPERIENCE_OFFICER_TITLES = [
  '透明维修体验官',
  '同城避坑体验官',
  '透明车间体验官',
  '修车避坑体验官',
  '车主互助体验官',
  '透明修车观察员',
]

/** 邀请页 / 授权区短提示（完整承诺见法律专页） */
const CONTROL_LINE =
  '仅用于技术科普，不泄露隐私。不合适可在「我的服务相册」从店页撤下。'

/** 已发布可分享态短提示 */
const PUBLISHED_TIP =
  '打码说明已在店页。发给微信不会多露隐私；不合适随时能撤。'

/** 审核中短提示 */
const PENDING_TIP = '脱敏案例审核中，通过后即可分享给同城车友。'

/** 未上网时点「分享」：只鼓励发微信，不引导去发布网站 */
const PRIVATE_SHARE_TIP =
  '发给微信是这本维修相册，不是店里的上网文案。已经放到店页的，也可在「我的服务相册」撤下来。'

const PUBLISHED_SHARE_LINES = [
  '感谢以体验官身份公开这份脱敏案例。发给微信好友或朋友圈，帮同城车友少踩坑。',
  '案例已整理好。转给需要的人，说不定能帮到下一位同款车主。',
  '修好了更值得被看见。分享给好友或朋友圈，帮帮后来的车友。',
]

const PENDING_SHARE_LINES = [
  '案例正在加急审核，通过后即可分享给同城车友。',
  '审核很快完成。通过后欢迎把脱敏案例发给需要的人。',
]

const CONSENT_CHECKBOX =
  '本人已阅读并知晓《公开案例与隐私说明》，同意将该案例分享给同城车友参考。'

const AUTH_ACTION_LABEL = '分享脱敏报告'
const AUTH_SHEET_TITLE = '分享脱敏案例'
const AUTH_CONFIRM_TEXT = '愿意分享这份脱敏报告'
const AUTH_REJECT_TEXT = '暂时先不分享'
const SHARE_COLUMN_PUBLISH_LABEL = '分享脱敏案例给同城车友'
const PREVIEW_LABEL = '预览脱敏案例'
/** @deprecated 兼容旧引用；未评态请用 FEEDBACK_LABEL_PENDING */
const FEEDBACK_LABEL = '评价与反馈'
const FEEDBACK_LABEL_PENDING = '评价'
const FEEDBACK_LABEL_DONE = '查看评价'
const REVIEW_DOCK_LABEL = '评价'
const REVIEW_NUDGE_TEXT = '还差一步：去评价'

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

function pickPublishedShareLine(seed = '') {
  const index = hashSeed(`${seed || 'zhejian'}:published`) % PUBLISHED_SHARE_LINES.length
  return PUBLISHED_SHARE_LINES[index]
}

function pickPendingShareLine(seed = '') {
  const index = hashSeed(`${seed || 'zhejian'}:pending`) % PENDING_SHARE_LINES.length
  return PENDING_SHARE_LINES[index]
}

function pickExperienceOfficerTitle(seed = '') {
  const index = hashSeed(seed) % EXPERIENCE_OFFICER_TITLES.length
  return EXPERIENCE_OFFICER_TITLES[index]
}

/**
 * 有车型/项目时生成带情绪价值的邀请句（仍无金额；不重复称号）
 */
function buildGuidePitch(options = {}) {
  const seed = options.seed || options.albumId || 'zhejian'
  const vehicle = String(options.vehicleLabel || options.vehicle || '').trim()
  const project = String(options.serviceName || options.project || '').trim()
  if (vehicle || project) {
    const label = [vehicle, project].filter(Boolean).join(' · ')
    return `我们为您整理了《${label}避坑指南》，诚邀您分享给同城车友，帮更多人少踩坑。`
  }
  return pickEncourageLine(seed)
}

function buildPublishedSharePitch(options = {}) {
  const seed = options.seed || options.albumId || 'zhejian'
  const vehicle = String(options.vehicleLabel || options.vehicle || '').trim()
  const project = String(options.serviceName || options.project || '').trim()
  if (vehicle || project) {
    const label = [vehicle, project].filter(Boolean).join(' · ')
    return `《${label}避坑指南》已在公开站。发给微信好友或朋友圈，帮同城车友少踩坑。`
  }
  return pickPublishedShareLine(seed)
}

/** 未上网时的私人分享话术（不引导去发布网站） */
function buildPrivateSharePitch(options = {}) {
  const seed = options.seed || options.albumId || 'zhejian'
  const vehicle = String(options.vehicleLabel || options.vehicle || '').trim()
  const project = String(options.serviceName || options.project || '').trim()
  if (vehicle || project) {
    const label = [vehicle, project].filter(Boolean).join(' · ')
    return `《${label}》维修记录已整理好。发给微信好友或朋友圈，帮同城车友少踩坑。`
  }
  return pickEncourageLine(seed)
}

/**
 * @returns {{
 *   officerTitle: string,
 *   pitch: string,
 *   controlLine: string,
 *   publishedPitch: string,
 *   publishedTip: string,
 *   pendingPitch: string,
 *   pendingTip: string,
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
    publishedPitch: buildPublishedSharePitch({ ...options, seed }),
    publishedTip: PUBLISHED_TIP,
    privatePitch: buildPrivateSharePitch({ ...options, seed }),
    privateTip: PRIVATE_SHARE_TIP,
    pendingPitch: pickPendingShareLine(seed),
    pendingTip: PENDING_TIP,
    benefitLine: '',
    controlLine: CONTROL_LINE,
    disclaimer: '',
    sheetTitle: AUTH_SHEET_TITLE,
    confirmText: AUTH_CONFIRM_TEXT,
    rejectText: AUTH_REJECT_TEXT,
    actionLabel: AUTH_ACTION_LABEL,
    previewLabel: PREVIEW_LABEL,
    feedbackLabel: FEEDBACK_LABEL_PENDING,
    consentCheckbox: CONSENT_CHECKBOX,
  }
}

/** 是否仍可用「邀请公示」话术（未上公开站，且已达公开质量门槛） */
function canShowPublishInvite(detail = {}) {
  const status = detail.publicCaseStatus || 'private'
  if (status === 'public_approved' || status === 'pending_review') return false
  if (detail.status && detail.status !== 'completed' && detail.status !== 'published') {
    return false
  }
  if (
    detail.canAuthorizePublicCase === false ||
    detail.publicCaseScorePass === false ||
    detail.publicCaseQualityReady === false
  ) {
    return false
  }
  return true
}

/** 已过审公示：展示朋友圈 / 好友 / 自媒体 */
function isPublicShareReady(detail = {}) {
  return (detail.publicCaseStatus || '') === 'public_approved'
}

/**
 * owner-share 页模式（体验官鼓励页，只发微信）：
 * - published：已上网
 * - pending：公开站审核中
 * - private：未上网（含原可发布态；不在此页引导发布）
 */
function resolveOwnerShareMode(detail = {}) {
  if (isPublicShareReady(detail)) return 'published'
  if ((detail.publicCaseStatus || '') === 'pending_review') return 'pending'
  return 'private'
}

module.exports = {
  ENCOURAGE_LINES,
  EXPERIENCE_OFFICER_TITLES,
  CONTROL_LINE,
  PUBLISHED_TIP,
  PENDING_TIP,
  PRIVATE_SHARE_TIP,
  PUBLISHED_SHARE_LINES,
  PENDING_SHARE_LINES,
  CONSENT_CHECKBOX,
  AUTH_ACTION_LABEL,
  AUTH_SHEET_TITLE,
  AUTH_CONFIRM_TEXT,
  AUTH_REJECT_TEXT,
  SHARE_COLUMN_PUBLISH_LABEL,
  PREVIEW_LABEL,
  FEEDBACK_LABEL,
  FEEDBACK_LABEL_PENDING,
  FEEDBACK_LABEL_DONE,
  REVIEW_DOCK_LABEL,
  REVIEW_NUDGE_TEXT,
  hashSeed,
  pickEncourageLine,
  pickPublishedShareLine,
  pickPendingShareLine,
  pickExperienceOfficerTitle,
  buildGuidePitch,
  buildPublishedSharePitch,
  buildPrivateSharePitch,
  buildPublishInviteCopy,
  canShowPublishInvite,
  isPublicShareReady,
  resolveOwnerShareMode,
}
