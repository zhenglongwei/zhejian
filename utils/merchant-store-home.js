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

module.exports = {
  buildStoreHomeModel,
  countPublicAlbums,
  monthViewTotal,
  serviceNames,
}
