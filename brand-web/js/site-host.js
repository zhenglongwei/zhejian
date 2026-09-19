;(function (global) {
  var CASE_SITE = 'https://zhejian.simplewin.cn'
  var CASE_SITE_LEGACY = 'https://geo.simplewin.cn'

  function withSlash(url) {
    return String(url || '').replace(/\/?$/, '/')
  }

  function fallbackMiniprogramCode() {
    document.querySelectorAll('img[alt="辙见小程序码"]').forEach(function (img) {
      img.addEventListener('error', function onErr() {
        img.removeEventListener('error', onErr)
        if (String(img.src || '').indexOf(CASE_SITE_LEGACY) >= 0) {
          img.remove()
          return
        }
        img.src = CASE_SITE_LEGACY + '/api/v1/public/h5/miniprogram-code'
      })
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fallbackMiniprogramCode)
  } else {
    fallbackMiniprogramCode()
  }

  global.zhejianSiteHost = {
    CASE_SITE: CASE_SITE,
    CASE_SITE_LEGACY: CASE_SITE_LEGACY,
    caseSiteSlash: withSlash(CASE_SITE),
    publicApi: CASE_SITE + '/api/v1/public',
    miniprogramCode: CASE_SITE + '/api/v1/public/h5/miniprogram-code',
    fetchPublicPath: function (path, options) {
      var opts = options || {}
      var primary = CASE_SITE + path
      var legacy = CASE_SITE_LEGACY + path
      return fetch(primary, opts).then(function (res) {
        if (res && res.ok) return res
        return fetch(legacy, opts)
      }).catch(function () {
        return fetch(legacy, opts)
      })
    },
  }
})(typeof window !== 'undefined' ? window : globalThis)
