/**
 * 登录弹层：正文不放表单；点星标 / 顶栏登录时打开，成功后立刻关掉。
 *
 * 2026-09-25 改口径：账号主键是 userId（由微信 openid 确定），手机号只是联系方式。
 * 号码会被运营商回收，新号主人凭手机号就能登进原主人账号，所以已绑微信的账号在 web
 * 不再放行手机号登录——主入口改成微信扫码（小程序码 + 轮询），手机号表单收起保留给
 * 没绑微信的账号；换号丢下的旧账号走「找回旧账号」验证旧号后迁移资产。
 */
(function (global) {
  var pendingSuccess = null
  var codeTimer = 0
  var pollTimer = 0
  var currentTicket = ''
  var modal = null

  var STAR_SVG =
    '<svg class="gh-star-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"></path></svg>'

  var WX_PANE =
    '<div id="gh-pane-wx">' +
    '<div class="gh-qr-box">' +
    '<img class="gh-qr-img" id="gh-qr-img" alt="微信扫码登录" />' +
    '<div class="gh-qr-mask" id="gh-qr-mask" hidden><span id="gh-qr-mask-text">二维码已过期</span>' +
    '<button type="button" class="gh-link-btn" id="gh-btn-refresh-qr">刷新</button></div>' +
    '</div>' +
    '<p class="gh-modal-hint">用微信扫码，在小程序里点「确认登录」</p>' +
    '<div class="gh-switch-row"><button type="button" class="gh-link-btn" id="gh-btn-switch-phone">用手机号登录</button></div>' +
    '</div>'

  var PHONE_PANE =
    '<div id="gh-pane-phone" hidden>' +
    '<input class="gh-field" id="gh-phone" type="tel" maxlength="11" placeholder="手机号" autocomplete="tel" />' +
    '<div class="gh-code-row">' +
    '<input class="gh-field" id="gh-code" type="text" maxlength="6" placeholder="验证码" inputmode="numeric" autocomplete="one-time-code" />' +
    '<button type="button" class="gh-btn" id="gh-btn-code">获取验证码</button>' +
    '</div>' +
    '<button type="button" class="gh-btn gh-btn--primary" id="gh-btn-login">登录</button>' +
    '<div class="gh-switch-row">' +
    '<button type="button" class="gh-link-btn" id="gh-btn-switch-wx">用微信扫码登录</button>' +
    '<button type="button" class="gh-link-btn" id="gh-btn-open-recover">换号了？找回旧账号</button>' +
    '</div>' +
    '</div>'

  var RECOVER_PANE =
    '<div id="gh-pane-recover" hidden>' +
    '<p class="gh-modal-hint">输入旧手机号，验证后旧账号的案例、相册会迁到当前账号。</p>' +
    '<input class="gh-field" id="gh-old-phone" type="tel" maxlength="11" placeholder="旧手机号" autocomplete="tel" />' +
    '<div class="gh-code-row">' +
    '<input class="gh-field" id="gh-old-code" type="text" maxlength="6" placeholder="验证码" inputmode="numeric" autocomplete="one-time-code" />' +
    '<button type="button" class="gh-btn" id="gh-btn-old-code">获取验证码</button>' +
    '</div>' +
    '<button type="button" class="gh-btn gh-btn--primary" id="gh-btn-recover">确认迁移</button>' +
    '<div class="gh-switch-row"><button type="button" class="gh-link-btn" id="gh-btn-back-phone">返回</button></div>' +
    '</div>'

  var BIND_PANE =
    '<div id="gh-pane-bind" hidden>' +
    '<p class="gh-modal-hint">绑定微信后换手机号也不丢账号（当前账号的资产会并到微信账号）。</p>' +
    '<div class="gh-qr-box">' +
    '<img class="gh-qr-img" id="gh-bind-img" alt="绑定微信" />' +
    '<div class="gh-qr-mask" id="gh-bind-mask" hidden><span>二维码已过期</span>' +
    '<button type="button" class="gh-link-btn" id="gh-btn-refresh-bind">刷新</button></div>' +
    '</div>' +
    '<div class="gh-switch-row"><button type="button" class="gh-link-btn" id="gh-btn-skip-bind">以后再说</button></div>' +
    '</div>'

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
      '<p class="gh-modal-sub" id="gh-auth-sub">与小程序同一账号</p>' +
      WX_PANE +
      PHONE_PANE +
      RECOVER_PANE +
      BIND_PANE +
      '<p class="gh-modal-hint" id="gh-auth-hint" hidden></p>' +
      '<p class="gh-modal-err" id="gh-auth-err" hidden></p>' +
      '</div>'
    document.body.appendChild(modal)

    modal.addEventListener('click', function (e) {
      if (e.target && e.target.getAttribute('data-close')) close()
    })
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) close()
    })
    bind('gh-btn-code', sendCode)
    bind('gh-btn-login', submitLogin)
    bind('gh-code', 'keydown', function (e) {
      if (e.key === 'Enter') submitLogin()
    })
    bind('gh-phone', 'keydown', function (e) {
      if (e.key === 'Enter') sendCode()
    })
    bind('gh-btn-switch-phone', function () {
      stopPolling()
      setPane('phone')
    })
    bind('gh-btn-switch-wx', function () {
      setPane('wx')
      startQr('login', { imgId: 'gh-qr-img', maskId: 'gh-qr-mask' })
    })
    bind('gh-btn-refresh-qr', function () {
      startQr('login', { imgId: 'gh-qr-img', maskId: 'gh-qr-mask' })
    })
    bind('gh-btn-open-recover', openRecover)
    bind('gh-btn-back-phone', function () {
      setPane('phone')
    })
    bind('gh-btn-old-code', sendOldCode)
    bind('gh-btn-recover', submitRecover)
    bind('gh-btn-refresh-bind', function () {
      startQr('bind', { imgId: 'gh-bind-img', maskId: 'gh-bind-mask', reloadOnConfirm: true })
    })
    bind('gh-btn-skip-bind', function () {
      finish(global.zhejianH5Auth && global.zhejianH5Auth.readSession())
    })
    return modal
  }

  function bind(id, event, handler) {
    var el = $(id)
    if (!el) return
    if (typeof event === 'function') {
      el.addEventListener('click', event)
      return
    }
    el.addEventListener(event, handler)
  }

  function setPane(name) {
    var panes = { wx: 'gh-pane-wx', phone: 'gh-pane-phone', recover: 'gh-pane-recover', bind: 'gh-pane-bind' }
    Object.keys(panes).forEach(function (key) {
      var el = $(panes[key])
      if (el) el.hidden = key !== name
    })
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
    var oldBtn = $('gh-btn-old-code')
    if (oldBtn) {
      oldBtn.disabled = false
      oldBtn.textContent = '获取验证码'
    }
  }

  function resetForm() {
    showErr('')
    showHint('')
    resetCodeBtn()
    var phone = $('gh-phone')
    var code = $('gh-code')
    var oldPhone = $('gh-old-phone')
    var oldCode = $('gh-old-code')
    if (phone) phone.value = ''
    if (code) code.value = ''
    if (oldPhone) oldPhone.value = ''
    if (oldCode) oldCode.value = ''
  }

  function open(options) {
    options = options || {}
    ensureDom()
    pendingSuccess = typeof options.onSuccess === 'function' ? options.onSuccess : null
    var sub = $('gh-auth-sub')
    if (sub) sub.textContent = options.reason || '与小程序同一账号'
    resetForm()
    modal.classList.add('is-open')
    modal.setAttribute('aria-hidden', 'false')
    document.body.style.overflow = 'hidden'
    setPane('wx')
    startQr('login', { imgId: 'gh-qr-img', maskId: 'gh-qr-mask' })
  }

  function close() {
    stopPolling()
    if (!modal) return
    modal.classList.remove('is-open')
    modal.setAttribute('aria-hidden', 'true')
    document.body.style.overflow = ''
    pendingSuccess = null
    resetForm()
    setPane('wx')
  }

  function finish(session) {
    var cb = pendingSuccess
    close()
    if (typeof cb === 'function') cb(session)
  }

  function stopPolling() {
    if (pollTimer) {
      global.clearInterval(pollTimer)
      pollTimer = 0
    }
    currentTicket = ''
  }

  function setQrMask(imgId, maskId, text) {
    var mask = $(maskId)
    var img = $(imgId)
    if (mask) {
      mask.hidden = !text
      var label = mask.querySelector('span')
      if (label && text) label.textContent = text
    }
    if (img) img.style.opacity = text ? '0.3' : '1'
  }

  /** 取码 + 起轮询。扫码不可用时（微信没配）退回手机号表单，不给死路 */
  function startQr(action, opts) {
    var auth = global.zhejianH5Auth
    if (!auth) return
    stopPolling()
    showErr('')
    setQrMask(opts.imgId, opts.maskId, '正在生成…')
    auth
      .createWxCode(action)
      .then(function (data) {
        currentTicket = data.ticket || ''
        var img = $(opts.imgId)
        if (img) img.src = data.codeImage || ''
        setQrMask(opts.imgId, opts.maskId, '')
        pollTimer = global.setInterval(function () {
          pollOnce(opts)
        }, 2000)
      })
      .catch(function (e) {
        setQrMask(opts.imgId, opts.maskId, '')
        if (action === 'login') {
          setPane('phone')
          showHint('扫码登录暂时不可用，可用手机号登录')
          return
        }
        showErr(e.message || '二维码获取失败')
      })
  }

  function pollOnce(opts) {
    var auth = global.zhejianH5Auth
    if (!auth || !currentTicket) return
    auth
      .pollWxCode(currentTicket)
      .then(function (res) {
        if (res && res.status === 'confirmed' && res.session) {
          stopPolling()
          auth.saveSession(res.session)
          if (opts.reloadOnConfirm) {
            // 绑定后账号换了（旧账号作废），页面上的缓存数据全部失效
            global.location.reload()
            return
          }
          finish(res.session)
          return
        }
        if (res && res.status === 'expired') {
          stopPolling()
          setQrMask(opts.imgId, opts.maskId, '二维码已过期')
        }
      })
      .catch(function () {
        // 轮询失败不打扰用户，下一轮继续
      })
  }

  function sendCode() {
    var auth = global.zhejianH5Auth
    if (!auth) return
    sendCodeTo('gh-phone', auth.sendLoginCode.bind(auth))
  }

  function sendOldCode() {
    var auth = global.zhejianH5Auth
    if (!auth) return
    sendCodeTo('gh-old-phone', auth.sendLoginCode.bind(auth))
  }

  function sendCodeTo(phoneId, request) {
    var phone = ($(phoneId) && $(phoneId).value.trim()) || ''
    var btn = $(phoneId === 'gh-old-phone' ? 'gh-btn-old-code' : 'gh-btn-code')
    showErr('')
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      showErr('手机号先填对（11 位）')
      return
    }
    btn.disabled = true
    request(phone)
      .then(function (data) {
        var hint = (data && data.loginHint) || ''
        showHint(hint)
        var match = hint.match(/验证码\s+(\d+)/)
        var codeEl = $(phoneId === 'gh-old-phone' ? 'gh-old-code' : 'gh-code')
        if (match && codeEl) codeEl.value = match[1]
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
        btn.disabled = false
        // 已绑微信的账号：号码回收后新号主人不能凭手机号进来，改走扫码
        if (session && session.needBindWechat) {
          setPane('bind')
          startQr('bind', { imgId: 'gh-bind-img', maskId: 'gh-bind-mask', reloadOnConfirm: true })
          return
        }
        finish(session)
      })
      .catch(function (e) {
        btn.disabled = false
        if (e && e.status === 403) {
          setPane('wx')
          startQr('login', { imgId: 'gh-qr-img', maskId: 'gh-qr-mask' })
          showErr(e.message || '这个账号已绑定微信，请用微信扫码登录')
          return
        }
        showErr(e.message || '登录失败')
      })
  }

  function openRecover() {
    var auth = global.zhejianH5Auth
    if (!auth || !auth.readSession || !auth.readSession()) {
      showErr('请先登录，再找回旧账号')
      return
    }
    showErr('')
    setPane('recover')
  }

  function submitRecover() {
    var auth = global.zhejianH5Auth
    if (!auth) return
    var phone = ($('gh-old-phone') && $('gh-old-phone').value.trim()) || ''
    var code = ($('gh-old-code') && $('gh-old-code').value.trim()) || ''
    var btn = $('gh-btn-recover')
    showErr('')
    btn.disabled = true
    auth
      .recoverOldAccount(phone, code)
      .then(function (session) {
        btn.disabled = false
        // 迁移后当前账号内容变了，刷新页面最省事也最不容易留脏数据
        global.location.reload()
      })
      .catch(function (e) {
        btn.disabled = false
        showErr(e.message || '迁移失败')
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
