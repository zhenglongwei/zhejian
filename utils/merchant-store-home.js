const { scoreBasicProfile, certSummary } = require('./merchant-basic-profile')

function serviceNames(profile = {}) {
  return (profile.services || [])
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      return String((item && (item.name || item.label || item.serviceName)) || '').trim()
    })
    .filter(Boolean)
}

function clip(text, max) {
  const value = String(text || '').trim()
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function buildStoreHomeModel(profile = {}, options = {}) {
  const trust = profile.publisherTrust || {}
  const verified = trust.authStatus === 'verified' || profile.authStatus === 'verified'
  const basic = scoreBasicProfile(profile)
  const names = serviceNames(profile)
  const cert = certSummary(profile)
  const intro = String(profile.intro || '').trim()
  return {
    storeName: profile.storeName || '门店',
    logoText: String(profile.storeName || '店').trim().slice(0, 2) || '店',
    address: String(profile.address || '').trim(),
    verified,
    authLabel: verified ? '已认证' : trust.authStatusLabel || '未认证',
    percent: basic.score,
    missingCount: basic.missingCount,
    missingLine: basic.missingLine,
    complete: basic.complete,
    introValue: clip(intro, 22) || basic.missingLine || '待补充',
    introDone: basic.complete,
    serviceValue: names.length ? clip(names.join(' · '), 22) : '服务方案',
    serviceDone: names.length > 0,
    techValue: cert.value,
    techDone: cert.done,
    publicCaseCount: Number(options.publicCaseCount) || 0,
    monthViewCount: Number(options.monthViewCount) || 0,
  }
}

function countPublicAlbums(list = []) {
  return (list || []).filter((item) => {
    if (!item) return false
    if (item.hubCard && item.hubCard.publicOnSite) return true
    return Boolean(String(item.hostedSiteUrl || '').trim())
  }).length
}

function monthViewTotal(summary = {}) {
  return (Number(summary.storeViewCount) || 0) + (Number(summary.caseViewCount) || 0)
}

const PHOTO_GAP_KEYS = {
  facade: true,
  workshop: true,
  reception: true,
}

function storeAuthStatus(profile = {}) {
  const trust = profile.publisherTrust || {}
  if (trust.authStatus === 'verified' || profile.authStatus === 'verified') return 'verified'
  return String(trust.authStatus || profile.authStatus || 'none')
}

/**
 * 本店商家查看详情、且认证尚未通过时，缺项短句。
 * 已认证返回空，车主侧不要用这份结果。
 */
function buildOwnerStoreDetailGaps(profile) {
  const empty = { active: false, notes: {}, photoNotes: [] }
  if (!profile || storeAuthStatus(profile) === 'verified') return empty
  const basic = scoreBasicProfile(profile)
  const notes = {}
  const photoNotes = []
  ;(basic.gaps || []).forEach((item) => {
    if (!item || !item.note) return
    if (PHOTO_GAP_KEYS[item.key]) photoNotes.push(item.note)
    else notes[item.key] = item.note
  })
  if (!serviceNames(profile).length) notes.services = '还没填擅长服务'
  if (!certSummary(profile).done) notes.cert = '还没上传资质'
  const active = photoNotes.length > 0 || Object.keys(notes).length > 0
  return { active, notes, photoNotes }
}

module.exports = {
  buildStoreHomeModel,
  buildOwnerStoreDetailGaps,
  countPublicAlbums,
  monthViewTotal,
  serviceNames,
}
