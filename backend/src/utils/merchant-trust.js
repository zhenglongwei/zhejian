/**
 * 商家软信任：认证态、资料完整度、公开身份标签
 * 口径：docs/03_商家端/01_商家入驻PRD.md V2.1
 */

const ACCOUNT_TYPE = {
  MERCHANT: 'merchant',
  PERSONAL: 'personal',
}

const AUTH_STATUS = {
  NONE: 'none',
  PENDING: 'pending',
  VERIFIED: 'verified',
  FAILED: 'failed',
}

const COMPLETENESS = {
  BASIC: 'basic',
  ENRICHED: 'enriched',
  COMPLETE: 'complete',
}

const AUTH_STATUS_LABEL = {
  [AUTH_STATUS.NONE]: '未认证',
  [AUTH_STATUS.PENDING]: '认证中',
  [AUTH_STATUS.VERIFIED]: '已认证',
  [AUTH_STATUS.FAILED]: '校验未通过',
}

const COMPLETENESS_LABEL = {
  [COMPLETENESS.BASIC]: '基础',
  [COMPLETENESS.ENRICHED]: '较全',
  [COMPLETENESS.COMPLETE]: '完善',
}

const ACCOUNT_TYPE_LABEL = {
  [ACCOUNT_TYPE.MERCHANT]: '商家',
  [ACCOUNT_TYPE.PERSONAL]: '个人',
}

function readPhotos(store) {
  const raw = store?.photosJson
  if (!raw || typeof raw !== 'object') return {}
  return raw
}

function scoreProfileCompleteness(merchant, store) {
  let score = 0
  const photos = readPhotos(store)
  const workshop = Array.isArray(photos.workshopUrls) ? photos.workshopUrls.filter(Boolean) : []
  if (String(store?.name || '').trim() && String(store.name).trim() !== '我的门店') score += 1
  if (String(store?.address || '').trim()) score += 1
  if (Number.isFinite(Number(store?.latitude)) && Number.isFinite(Number(store?.longitude))) score += 1
  if (String(store?.businessHours || '').trim()) score += 1
  if (String(store?.phone || merchant?.contactPhone || '').trim()) score += 1
  if (String(photos.facadeUrl || '').trim()) score += 2
  if (workshop.length) score += 2
  const cap = store?.capabilityJson && typeof store.capabilityJson === 'object' ? store.capabilityJson : {}
  const techs = Array.isArray(cap.technicians) ? cap.technicians : []
  if (techs.length) score += 1
  const brandAuth = Array.isArray(photos.brandAuthItems) ? photos.brandAuthItems : []
  if (brandAuth.length || String(photos.brandAuthUrl || '').trim()) score += 1

  if (score >= 9) return COMPLETENESS.COMPLETE
  if (score >= 5) return COMPLETENESS.ENRICHED
  return COMPLETENESS.BASIC
}

/**
 * 必要自动校验：执照图 + 法人证图 + 主体名或信用代码至少一项有值
 */
function evaluateAuthSubmission({
  licensePhotoUrl = '',
  legalIdPhotoUrl = '',
  legalName = '',
  creditCode = '',
} = {}) {
  const hasLicense = Boolean(String(licensePhotoUrl || '').trim())
  const hasId = Boolean(String(legalIdPhotoUrl || '').trim())
  const hasIdentity = Boolean(String(legalName || '').trim() || String(creditCode || '').trim())
  if (!hasLicense || !hasId) {
    return { authStatus: AUTH_STATUS.FAILED, reason: '请上传营业执照与法人身份证照片' }
  }
  if (!hasIdentity) {
    return { authStatus: AUTH_STATUS.PENDING, reason: '证件已传，请补全主体名称或信用代码' }
  }
  return { authStatus: AUTH_STATUS.VERIFIED, reason: '' }
}

function buildPublisherTrustBadge(merchant = {}, store = null) {
  const accountType = String(merchant.accountType || ACCOUNT_TYPE.MERCHANT)
  const authStatus = String(merchant.authStatus || AUTH_STATUS.NONE)
  const completeness =
    String(merchant.profileCompleteness || '').trim() ||
    scoreProfileCompleteness(merchant, store || (merchant.stores && merchant.stores[0]) || null)
  const accountLabel = ACCOUNT_TYPE_LABEL[accountType] || ACCOUNT_TYPE_LABEL[ACCOUNT_TYPE.MERCHANT]
  const authLabel = AUTH_STATUS_LABEL[authStatus] || AUTH_STATUS_LABEL[AUTH_STATUS.NONE]
  const completeLabel = COMPLETENESS_LABEL[completeness] || COMPLETENESS_LABEL[COMPLETENESS.BASIC]
  return {
    accountType,
    accountTypeLabel: accountLabel,
    authStatus,
    authStatusLabel: authLabel,
    profileCompleteness: completeness,
    profileCompletenessLabel: completeLabel,
    /** 公开展示短句，禁止「已审核」 */
    displayLine: `${accountLabel} · ${authLabel} · 资料${completeLabel}`,
    tags: [accountLabel, authLabel, `资料${completeLabel}`],
  }
}

module.exports = {
  ACCOUNT_TYPE,
  AUTH_STATUS,
  COMPLETENESS,
  AUTH_STATUS_LABEL,
  COMPLETENESS_LABEL,
  ACCOUNT_TYPE_LABEL,
  scoreProfileCompleteness,
  evaluateAuthSubmission,
  buildPublisherTrustBadge,
}
