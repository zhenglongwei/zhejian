/**
 * 全站顶栏：左辙见 / 公开案例 / 门店；右登录或头像。
 */
(function (global) {
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function renderRight() {
    var auth = global.zhejianH5Auth
    var session = auth && auth.readSession ? auth.readSession() : null
    if (!session) {
      return '<button type="button" class="gh-header-signin" id="gh-topbar-signin">登录</button>'
    }
    var name = auth.displayName(session)
    var avatar = auth.avatarUrl(session)
    var img = avatar
      ? '<img class="gh-avatar" src="' + escapeHtml(avatar) + '" alt="" width="28" height="28" />'
      : '<span class="gh-avatar is-letter" aria-hidden="true">' +
        escapeHtml(String(name || '辙').slice(0, 1)) +
        '</span>'
    return (
      '<a class="gh-header-user" href="/library/" title="我的案例库">' +
      img +
      '<span>' +
      escapeHtml(name) +
      '</span></a>'
    )
  }

  function barHtml() {
    return (
      '<header class="gh-topbar" id="gh-topbar">' +
      '<div class="gh-topbar-left">' +
      '<a class="gh-logo" href="/">辙见</a>' +
      '<a class="gh-topbar-link gh-topbar-link--hide-sm" href="/case/">公开案例</a>' +
      '<a class="gh-topbar-link gh-topbar-link--hide-sm" href="/store/">门店</a>' +
      '</div>' +
      '<div class="gh-topbar-right" id="gh-topbar-right">' +
      renderRight() +
      '</div></header>'
    )
  }

  function bind() {
    var btn = document.getElementById('gh-topbar-signin')
    if (!btn) return
    btn.addEventListener('click', function () {
      if (global.zhejianH5AuthModal) global.zhejianH5AuthModal.open()
    })
  }

  function mount() {
    if (document.getElementById('gh-topbar')) {
      refresh()
      return
    }
    var wrap = document.createElement('div')
    wrap.innerHTML = barHtml()
    document.body.insertBefore(wrap.firstChild, document.body.firstChild)
    bind()
  }

  function refresh() {
    var right = document.getElementById('gh-topbar-right')
    if (!right) {
      mount()
      return
    }
    right.innerHTML = renderRight()
    bind()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount)
  } else {
    mount()
  }
  global.addEventListener('zhejian-auth-change', refresh)

  global.zhejianSiteChrome = { mount: mount, refresh: refresh }
})(window)
