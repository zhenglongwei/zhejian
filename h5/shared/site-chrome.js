/**
 * 全站顶栏：深色条。未登录显示「登录」；已登录为头像菜单（案例库 / 退出）。
 * 搜索：当前页联想，点条目或提交才进入 /search/?q=
 */
(function (global) {
  var KEYWORD_MAX = 30
  var suggestTimer = null
  var suggestSeq = 0

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

  function hideSuggest() {
    var panel = document.getElementById('gh-topbar-suggest')
    if (!panel) return
    panel.hidden = true
    panel.innerHTML = ''
  }

  function searchHref(keyword) {
    var k = String(keyword || '').trim().slice(0, KEYWORD_MAX)
    if (!k) return ''
    return '/search/?q=' + encodeURIComponent(k)
  }

  function goSearch(keyword) {
    var href = searchHref(keyword)
    if (!href) return
    location.href = href
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
      '<input class="gh-topbar-input" id="gh-topbar-q" type="search" name="q" maxlength="' +
      KEYWORD_MAX +
      '" placeholder="搜索档案、门店或服务" value="' +
      q +
      '" autocomplete="off" aria-autocomplete="list" aria-controls="gh-topbar-suggest" />' +
      '<div class="gh-topbar-suggest" id="gh-topbar-suggest" hidden role="listbox"></div>' +
      '</form>' +
      '<div class="gh-topbar-right" id="gh-topbar-right">' +
      renderRight() +
      '</div></div></header>'
    )
  }

  function renderSuggest(items) {
    var panel = document.getElementById('gh-topbar-suggest')
    if (!panel) return
    if (!items || !items.length) {
      hideSuggest()
      return
    }
    panel.innerHTML = items
      .map(function (item) {
        var keyword = String((item && item.keyword) || '').trim()
        if (!keyword) return ''
        var type = String((item && (item.typeLabel || item.type)) || '').trim()
        return (
          '<button type="button" class="gh-topbar-suggest-item" role="option" data-keyword="' +
          escapeHtml(keyword) +
          '">' +
          escapeHtml(keyword) +
          (type ? '<span class="gh-topbar-suggest-type">' + escapeHtml(type) + '</span>' : '') +
          '</button>'
        )
      })
      .filter(Boolean)
      .join('')
    panel.hidden = !panel.innerHTML
  }

  function fetchSuggest(keyword) {
    var k = String(keyword || '').trim().slice(0, KEYWORD_MAX)
    if (!k) {
      hideSuggest()
      return
    }
    var seq = (suggestSeq += 1)
    fetch('/api/v1/public/h5/search/suggest?keyword=' + encodeURIComponent(k))
      .then(function (res) {
        return res.json()
      })
      .then(function (body) {
        if (seq !== suggestSeq) return
        if (!body || body.code !== 0) {
          hideSuggest()
          return
        }
        renderSuggest(body.data || [])
      })
      .catch(function () {
        if (seq !== suggestSeq) return
        hideSuggest()
      })
  }

  function queueSuggest(keyword) {
    clearTimeout(suggestTimer)
    suggestTimer = setTimeout(function () {
      fetchSuggest(keyword)
    }, 200)
  }

  function bindAuth() {
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
  }

  function bindSearch() {
    var search = document.getElementById('gh-topbar-search')
    var input = document.getElementById('gh-topbar-q')
    var panel = document.getElementById('gh-topbar-suggest')
    if (!search || search.getAttribute('data-bound') === '1') return
    search.setAttribute('data-bound', '1')

    if (input) {
      input.addEventListener('input', function () {
        queueSuggest(input.value)
      })
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') hideSuggest()
      })
    }

    if (panel) {
      panel.addEventListener('mousedown', function (e) {
        e.preventDefault()
      })
      panel.addEventListener('click', function (e) {
        var item = e.target && e.target.closest ? e.target.closest('[data-keyword]') : null
        if (!item) return
        e.preventDefault()
        goSearch(item.getAttribute('data-keyword') || '')
      })
    }

    search.addEventListener('submit', function (e) {
      var keyword = String(input && input.value ? input.value : '').trim()
      if (!keyword) {
        e.preventDefault()
        hideSuggest()
        return
      }
      e.preventDefault()
      goSearch(keyword)
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
    bindAuth()
    bindSearch()
  }

  function refresh() {
    var right = document.getElementById('gh-topbar-right')
    if (!right) {
      mount()
      return
    }
    right.innerHTML = renderRight()
    bindAuth()
    bindSearch()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount)
  } else {
    mount()
  }
  document.addEventListener('click', function (e) {
    closeMenus()
    var search = document.getElementById('gh-topbar-search')
    if (search && e.target && search.contains(e.target)) return
    hideSuggest()
  })
  global.addEventListener('zhejian-auth-change', refresh)

  global.zhejianSiteChrome = { mount: mount, refresh: refresh }
})(window)
