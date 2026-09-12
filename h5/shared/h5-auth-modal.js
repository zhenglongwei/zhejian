/**
 * 登录弹层：正文不放表单；点星标 / 顶栏登录时打开，成功后立刻关掉。
 */
(function (global) {
  var pendingSuccess = null
  var codeTimer = 0
  var modal = null

  var STAR_SVG =
    '<svg class="gh-star-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"></path></svg>'

  function $(id) {
    return modal && modal.querySelector('#' + id)
  }

  function ensureDom() {
    if (modal) return modal
    modal = document.createElement('div')
    modal.className = 'gh-modal'
    modal.id = 'gh-auth-modal'
    modal.setAttribute('aria-hidden', 'true')
    modal.innerHTML =
      '<div class="gh-modal-backdrop" data-close="1"></div>' +
      '<div class="gh-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="gh-auth-title">' +
      '<button type="button" class="gh-modal-close" data-close="1" aria-label="关闭">×</button>' +
      '<h2 id="gh-auth-title">登录辙见</h2>' +
      '<p class="gh-modal-sub" id="gh-auth-sub">与小程序同一手机号</p>' +
      '<input class="gh-field" id="gh-phone" type="tel" maxlength="11" placeholder="手机号" autocomplete="tel" />' +
      '<div class="gh-code-row">' +
      '<input class="gh-field" id="gh-code" type="text" maxlength="6" placeholder="验证码" inputmode="numeric" autocomplete="one-time-code" />' +
      '<button type="button" class="gh-btn" id="gh-btn-code">获取验证码</button>' +
      '</div>' +
      '<p class="gh-modal-hint" id="gh-auth-hint" hidden></p>' +
      '<p class="gh-modal-err" id="gh-auth-err" hidden></p>' +
      '<button type="button" class="gh-btn gh-btn--primary" id="gh-btn-login">登录</button>' +
      '</div>'
    document.body.appendChild(modal)

    modal.addEventListener('click', function (e) {
      if (e.target && e.target.getAttribute('data-close')) close()
    })
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) close()
    })
    $('gh-btn-code').addEventListener('click', sendCode)
    $('gh-btn-login').addEventListener('click', submitLogin)
    $('gh-code').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitLogin()
    })
    $('gh-phone').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') sendCode()
    })
    return modal
  }

  function showErr(msg) {
    var el = $('gh-auth-err')
    if (!el) return
    el.hidden = !msg
    el.textContent = msg || ''
  }

  function showHint(msg) {
    var el = $('gh-auth-hint')
    if (!el) return
    el.hidden = !msg
    el.textContent = msg || ''
  }

  function resetCodeBtn() {
    if (codeTimer) {
      global.clearInterval(codeTimer)
      codeTimer = 0
    }
    var btn = $('gh-btn-code')
    if (btn) {
      btn.disabled = false
      btn.textContent = '获取验证码'
    }
  }

  function resetForm() {
    showErr('')
    showHint('')
    resetCodeBtn()
    var phone = $('gh-phone')
    var code = $('gh-code')
    if (phone) phone.value = ''
    if (code) code.value = ''
  }

  function open(options) {
    options = options || {}
    ensureDom()
    pendingSuccess = typeof options.onSuccess === 'function' ? options.onSuccess : null
    var sub = $('gh-auth-sub')
    if (sub) sub.textContent = options.reason || '与小程序同一手机号'
    resetForm()
    modal.classList.add('is-open')
    modal.setAttribute('aria-hidden', 'false')
    document.body.style.overflow = 'hidden'
    global.setTimeout(function () {
      var phone = $('gh-phone')
      if (phone) phone.focus()
    }, 20)
  }

  function close() {
    if (!modal) return
    modal.classList.remove('is-open')
    modal.setAttribute('aria-hidden', 'true')
    document.body.style.overflow = ''
    pendingSuccess = null
    resetForm()
  }

  function sendCode() {
    var auth = global.zhejianH5Auth
    if (!auth) return
    var phone = ($('gh-phone') && $('gh-phone').value.trim()) || ''
    var btn = $('gh-btn-code')
    showErr('')
    showHint('')
    btn.disabled = true
    auth
      .sendLoginCode(phone)
      .then(function (data) {
        var hint = (data && data.loginHint) || ''
        showHint(hint)
        var match = hint.match(/验证码\s+(\d+)/)
        if (match && $('gh-code')) $('gh-code').value = match[1]
        var sec = (data && data.resendAfterSec) || 60
        btn.textContent = sec + ' 秒'
        codeTimer = global.setInterval(function () {
          sec -= 1
          if (sec <= 0) {
            resetCodeBtn()
            return
          }
          btn.textContent = sec + ' 秒'
        }, 1000)
      })
      .catch(function (e) {
        btn.disabled = false
        showErr(e.message || '验证码发送失败')
      })
  }

  function submitLogin() {
    var auth = global.zhejianH5Auth
    if (!auth) return
    var phone = ($('gh-phone') && $('gh-phone').value.trim()) || ''
    var code = ($('gh-code') && $('gh-code').value.trim()) || ''
    var btn = $('gh-btn-login')
    showErr('')
    btn.disabled = true
    auth
      .loginWithCode(phone, code)
      .then(function (session) {
        var cb = pendingSuccess
        close()
        if (typeof cb === 'function') cb(session)
      })
      .catch(function (e) {
        showErr(e.message || '登录失败')
      })
      .then(function () {
        btn.disabled = false
      })
  }

  function requireLogin(onSuccess, reason) {
    var auth = global.zhejianH5Auth
    if (auth && auth.readSession && auth.readSession()) {
      if (typeof onSuccess === 'function') onSuccess(auth.readSession())
      return
    }
    open({ onSuccess: onSuccess, reason: reason })
  }

  global.zhejianH5AuthModal = {
    open: open,
    close: close,
    requireLogin: requireLogin,
    STAR_SVG: STAR_SVG,
  }
})(window)
