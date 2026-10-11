const CHECKS = [
  {
    key: 'intro',
    label: '门店介绍',
    done(profile) {
      return Boolean(String(profile.intro || '').trim())
    },
  },
  {
    key: 'services',
    label: '擅长服务',
    done(profile) {
      return serviceNames(profile).length > 0
    },
  },
  {
    key: 'tech',
    label: '技师资质',
    done(profile) {
      return (profile.technicians || []).some((item) => String(item && item.name || '').trim())
    },
  },
  {
    key: 'address',
    label: '地址',
    done(profile) {
      return Boolean(String(profile.address || '').trim())
    },
  },
  {
    key: 'hours',
    label: '营业时间',
    done(profile) {
      return Boolean(String(profile.businessHours || '').trim())
    },
  },
  {
    key: 'facade',
    label: '门头照片',
    done(profile) {
      const photos = profile.photos || {}
      return Boolean(String(photos.facadeUrl || '').trim())
    },
  },
]

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
  const filled = CHECKS.filter((item) => item.done(profile))
  const missing = CHECKS.filter((item) => !item.done(profile))
  const percent = Math.round((filled.length / CHECKS.length) * 100)
  const names = serviceNames(profile)
  const techCount = (profile.technicians || []).filter((item) => String(item && item.name || '').trim()).length
  const intro = String(profile.intro || '').trim()
  return {
    storeName: profile.storeName || '门店',
    logoText: String(profile.storeName || '店').trim().slice(0, 2) || '店',
    address: String(profile.address || '').trim(),
    verified,
    authLabel: verified ? '已认证' : trust.authStatusLabel || '未认证',
    percent,
    missingCount: missing.length,
    missingLine: missing.length ? `还缺${missing.map((item) => item.label).slice(0, 3).join('、')}` : '',
    complete: missing.length === 0,
    introValue: clip(intro, 22) || '待补充',
    introDone: Boolean(intro),
    serviceValue: names.length ? clip(names.join(' · '), 22) : '服务方案',
    serviceDone: names.length > 0,
    techValue: techCount ? `${techCount} 位技师` : '待补充',
    techDone: techCount > 0,
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
  CHECKS,
  buildStoreHomeModel,
  countPublicAlbums,
  monthViewTotal,
  serviceNames,
}
