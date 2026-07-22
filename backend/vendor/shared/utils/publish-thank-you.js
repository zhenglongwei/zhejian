/**
 * 门店答谢 + 车主发布邀请话术（福利 / 荣誉 / 控制权）
 * 对外避免「授权公示」「发布到公开网站」等敏感短句。
 */

const EXPERIENCE_OFFICER_TITLES = [
  '透明维修体验官',
  '同城避坑体验官',
  '透明车间体验官',
  '修车避坑体验官',
  '车主互助体验官',
  '透明修车观察员',
]

const EMPTY_PUBLISH_THANK_YOU = {
  enabled: false,
  discountYuan: 0,
  giftText: '',
  warrantyExtraDays: 0,
  benefitText: '',
}

const EMPTY_ALBUM_THANK_YOU = {
  mode: 'inherit',
  ...EMPTY_PUBLISH_THANK_YOU,
}

const CONTROL_LINE =
  '我们承诺：案例仅用于技术科普，绝不泄露您的任何隐私。您可随时在「我的服务相册」点击下架，公开站将尽快删除相关内容（第三方缓存清除可能有延迟）。'

const CONSENT_CHECKBOX =
  '我已核对脱敏效果，同意将本次维修记录在隐去个人信息后供同城车友参考；我可随时下架。'

const AUTH_ACTION_LABEL = '分享脱敏报告'
const AUTH_SHEET_TITLE = '邀请你成为透明维修体验官'
const AUTH_CONFIRM_TEXT = '愿意分享这份脱敏报告'
const AUTH_REJECT_TEXT = '暂时先不分享'
const SHARE_COLUMN_PUBLISH_LABEL = '分享脱敏案例给同城车友'

function clampInt(value, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function normalizePublishThankYou(raw = {}) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const giftText = String(src.giftText || src.gift || '').trim().slice(0, 40)
  const benefitText = String(src.benefitText || src.customBenefitText || '')
    .trim()
    .slice(0, 120)
  const discountYuan = clampInt(src.discountYuan != null ? src.discountYuan : src.discount, 0, 9999)
  const warrantyExtraDays = clampInt(
    src.warrantyExtraDays != null ? src.warrantyExtraDays : src.warrantyDays,
    0,
    3650
  )
  const enabled =
    src.enabled === true ||
    (src.enabled !== false &&
      (discountYuan > 0 || warrantyExtraDays > 0 || Boolean(giftText) || Boolean(benefitText)))
  return {
    enabled: Boolean(enabled),
    discountYuan,
    giftText,
    warrantyExtraDays,
    benefitText,
  }
}

function normalizeAlbumPublishThankYou(raw = {}) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const modeRaw = String(src.mode || 'inherit').trim()
  const mode = ['inherit', 'custom', 'off'].includes(modeRaw) ? modeRaw : 'inherit'
  const base = normalizePublishThankYou(src)
  if (mode === 'off') {
    return { mode: 'off', ...EMPTY_PUBLISH_THANK_YOU }
  }
  if (mode === 'inherit') {
    return { mode: 'inherit', ...EMPTY_PUBLISH_THANK_YOU }
  }
  return { mode: 'custom', ...base }
}

function resolvePublishThankYou(storeThankYou, albumThankYou) {
  const store = normalizePublishThankYou(storeThankYou)
  const album = normalizeAlbumPublishThankYou(albumThankYou)
  if (album.mode === 'off') {
    return { ...EMPTY_PUBLISH_THANK_YOU, source: 'off' }
  }
  if (album.mode === 'custom') {
    return { ...album, mode: undefined, source: 'album' }
  }
  return { ...store, source: store.enabled ? 'store' : 'none' }
}

function buildBenefitSentence(thankYou = {}) {
  const cfg = normalizePublishThankYou(thankYou)
  if (!cfg.enabled) return ''
  if (cfg.benefitText) return cfg.benefitText
  const parts = []
  if (cfg.discountYuan > 0) parts.push(`本次维修立减${cfg.discountYuan}元`)
  if (cfg.giftText) parts.push(`赠送${cfg.giftText}`)
  if (cfg.warrantyExtraDays > 0) {
    parts.push(`并为您延长本次维修项目${cfg.warrantyExtraDays}天质保`)
  }
  if (!parts.length) return ''
  if (parts.length === 1) return `答谢成功后，${parts[0]}。`
  if (parts.length === 2) return `答谢成功后，${parts[0]}，${parts[1]}。`
  return `答谢成功后，${parts[0]}（或${parts[1]}），${parts[2]}。`
}

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
 *   benefitLine: string,
 *   controlLine: string,
 *   thankYou: object,
 *   disclaimer: string,
 * }}
 */
function buildPublishInviteCopy(options = {}) {
  const officerTitle = pickExperienceOfficerTitle(
    options.seed || options.albumId || options.vehicleLabel || 'zhejian'
  )
  const guideTitle = resolveGuideTopic(options.vehicleLabel, options.serviceName)
  const thankYou = resolvePublishThankYou(options.storeThankYou, options.albumThankYou)
  const benefitLine = buildBenefitSentence(thankYou)
  const classicLine = benefitLine
    ? `您的爱车维修案例非常经典！是否愿意将此案例隐去所有个人信息后，作为「透明车间标准案例」展示？${benefitLine}`
    : `您的爱车维修案例非常经典！是否愿意将此案例隐去所有个人信息后，作为「透明车间标准案例」展示？`

  const honorLine = `恭喜您的爱车满血复活！我们为您生成了一份《${guideTitle}》。是否愿意作为「${officerTitle}」，将这份脱敏报告分享给同城车友，帮助更多人避开修车陷阱？`

  const pitch = `${honorLine}\n\n${classicLine}`
  const disclaimer = thankYou.enabled ? '本店线下兑现。' : ''

  return {
    officerTitle,
    guideTitle,
    pitch,
    benefitLine,
    controlLine: CONTROL_LINE,
    thankYou,
    disclaimer,
    sheetTitle: `邀请你成为${officerTitle}`,
    confirmText: AUTH_CONFIRM_TEXT,
    rejectText: AUTH_REJECT_TEXT,
    actionLabel: AUTH_ACTION_LABEL,
    consentCheckbox: CONSENT_CHECKBOX,
  }
}

module.exports = {
  EXPERIENCE_OFFICER_TITLES,
  EMPTY_PUBLISH_THANK_YOU,
  EMPTY_ALBUM_THANK_YOU,
  CONTROL_LINE,
  CONSENT_CHECKBOX,
  AUTH_ACTION_LABEL,
  AUTH_SHEET_TITLE,
  AUTH_CONFIRM_TEXT,
  AUTH_REJECT_TEXT,
  SHARE_COLUMN_PUBLISH_LABEL,
  normalizePublishThankYou,
  normalizeAlbumPublishThankYou,
  resolvePublishThankYou,
  buildBenefitSentence,
  pickExperienceOfficerTitle,
  buildPublishInviteCopy,
}
