/**
 * 辙见案例站自有端登录（与小程序同一套 JWT / 手机号账号）
 */
(function (global) {
  var STORAGE_KEY = 'zhejian.web.session'
  var apiBase = function () {
    return String(global.ZHEJIAN_API_BASE || '').replace(/\/$/, '')
  }

  function readSession() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      var parsed = JSON.parse(raw)
      if (!parsed || !parsed.token) return null
      return parsed
    } catch (e) {
      return null
    }
  }

  function emitAuthChange() {
    try {
      global.dispatchEvent(new CustomEvent('zhejian-auth-change'))
    } catch (e) {}
  }

  function saveSession(session) {
    if (!global.localStorage) return
    if (!session || !session.token) {
      global.localStorage.removeItem(STORAGE_KEY)
      emitAuthChange()
      return
    }
    global.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        token: session.token,
        user: session.user || null,
        roles: session.roles || [],
        merchant: session.merchant || null,
        savedAt: Date.now(),
      })
    )
    emitAuthChange()
  }

  function displayName(session) {
    var current = session || readSession()
    if (!current) return ''
    var user = current.user || {}
    return user.nickname || user.phoneDisplay || '辙见账号'
  }

  function avatarUrl(session) {
    var current = session || readSession()
    return (current && current.user && current.user.avatarUrl) || ''
  }

  function clearSession() {
    saveSession(null)
  }

  function authHeader() {
    var session = readSession()
    return session && session.token ? { Authorization: 'Bearer ' + session.token } : {}
  }

  function parseJson(res) {
    return res.json().then(function (body) {
      if (!res.ok) {
        var err = new Error((body && body.message) || '请求失败')
        err.status = res.status
        err.body = body
        throw err
      }
      return body.data != null ? body.data : body
    })
  }

  function sendLoginCode(phone) {
    return fetch(apiBase() + '/api/v1/public/web-auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ phone: phone }),
    }).then(parseJson)
  }

  function loginWithCode(phone, code) {
    return fetch(apiBase() + '/api/v1/public/web-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ phone: phone, code: code }),
    }).then(parseJson).then(function (session) {
      saveSession(session)
      return session
    })
  }

  function isMerchant(session) {
    var current = session || readSession()
    if (!current) return false
    if (current.merchant && current.merchant.merchantId) return true
    return Array.isArray(current.roles) && current.roles.indexOf('merchant') >= 0
  }

  global.zhejianH5Auth = {
    STORAGE_KEY: STORAGE_KEY,
    readSession: readSession,
    saveSession: saveSession,
    clearSession: clearSession,
    authHeader: authHeader,
    sendLoginCode: sendLoginCode,
    loginWithCode: loginWithCode,
    isMerchant: isMerchant,
    displayName: displayName,
    avatarUrl: avatarUrl,
  }
})(window)
