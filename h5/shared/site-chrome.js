/**
 * 全站顶栏：深色条。未登录显示「登录」；已登录为头像菜单（案例库 / 退出）。
 */
(function (global) {
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function closeMenus() {
    var menu = document.getElementById('gh-user-menu')
    if (menu) menu.hidden = true
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
      '<div class="gh-user-wrap">' +
      '<button type="button" class="gh-user-menu-btn" id="gh-user-menu-btn" aria-haspopup="true" aria-expanded="false">' +
      img +
      '<span class="gh-user-menu-name">' +
      escapeHtml(name) +
      '</span></button>' +
      '<div class="gh-menu" id="gh-user-menu" hidden>' +
      '<a class="gh-topbar-link" href="/library/">我的</a>' +
      '<button type="button" id="gh-logout">退出</button>' +
      '</div></div>'
    )
  }

  function currentSearchQuery() {
    if (location.pathname.indexOf('/search') !== 0) return ''
    try {
      return new URLSearchParams(location.search).get('q') || ''
    } catch (e) {
      return ''
    }
  }

  function isCaseNavOn() {
    return location.pathname.indexOf('/case') === 0
  }

  function barHtml() {
    var q = escapeHtml(currentSearchQuery())
    var caseOn = isCaseNavOn() ? ' is-on' : ''
    return (
      '<header class="gh-topbar" id="gh-topbar">' +
      '<div class="gh-topbar-row">' +
      '<div class="gh-topbar-left">' +
      '<a class="gh-logo" href="/">辙见</a>' +
      '<a class="gh-topbar-link' +
      caseOn +
      '" href="/case/">公开案例</a>' +
      '</div>' +
      '<form class="gh-topbar-search" id="gh-topbar-search" action="/search/" method="get" role="search">' +
      '<input class="gh-topbar-input" id="gh-topbar-q" type="search" name="q" maxlength="30" placeholder="搜索档案、门店或服务" value="' +
      q +
      '" autocomplete="off" />' +
      '</form>' +
      '<div class="gh-topbar-right" id="gh-topbar-right">' +
      renderRight() +
      '</div></div></header>'
    )
  }

  function bind() {
    var signin = document.getElementById('gh-topbar-signin')
    if (signin) {
      signin.addEventListener('click', function () {
        if (global.zhejianH5AuthModal) global.zhejianH5AuthModal.open()
      })
    }
    var btn = document.getElementById('gh-user-menu-btn')
    var menu = document.getElementById('gh-user-menu')
    if (btn && menu) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation()
        var open = menu.hidden
        menu.hidden = !open
        btn.setAttribute('aria-expanded', open ? 'true' : 'false')
      })
    }
    var logout = document.getElementById('gh-logout')
    if (logout) {
      logout.addEventListener('click', function () {
        if (global.zhejianH5Auth) global.zhejianH5Auth.clearSession()
        closeMenus()
        if (location.pathname.indexOf('/library') === 0) {
          location.reload()
        }
      })
    }
    var search = document.getElementById('gh-topbar-search')
    var input = document.getElementById('gh-topbar-q')
    if (input) {
      input.addEventListener('focus', function () {
        if (location.pathname.indexOf('/search') !== 0 && !String(input.value || '').trim()) {
          location.href = '/search/'
        }
      })
    }
    if (search) {
      search.addEventListener('submit', function (e) {
        var keyword = String(input && input.value ? input.value : '').trim()
        if (!keyword) {
          e.preventDefault()
          location.href = '/search/'
        }
      })
    }
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
  document.addEventListener('click', closeMenus)
  global.addEventListener('zhejian-auth-change', refresh)

  global.zhejianSiteChrome = { mount: mount, refresh: refresh }
})(window)
