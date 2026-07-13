(function () {
  var PC = (window.zhejianPublicCopy && window.zhejianPublicCopy.H5) || {}
  var COPY = {
    geoDisclaimer:
      PC.geoDisclaimer ||
      '页面用于展示维修服务信息、门店信息与公开案例，不构成线上报价或维修承诺。',
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function storeHref(id) {
    return '/store/' + encodeURIComponent(id) + '.html'
  }

  function applyListSeo() {
    if (!window.zhejianSeo) return
    window.zhejianSeo.applyPageSeo({
      title: '公开门店 · 辙见',
      description: '浏览已入驻、可公开展示的汽车维修保养门店，进入门店主页查看服务方案与真实案例。',
      canonicalPath: '/store/',
      robots: 'index,follow',
    })
    window.zhejianSeo.applyBreadcrumbSchema(
      [
        { label: '辙见', href: '/' },
        { label: '公开门店' },
      ],
      'store-list-breadcrumb'
    )
  }

  function renderBreadcrumb() {
    if (window.zhejianSeo) {
      return window.zhejianSeo.renderBreadcrumbHtml([
        { label: '辙见', href: '/' },
        { label: '公开门店' },
      ])
    }
    return '<nav class="h5-breadcrumb"><a href="/">辙见</a> › 公开门店</nav>'
  }

  function renderShell(title, bodyHtml) {
    applyListSeo()
    document.title = title
    var app = document.getElementById('app')
    if (!app) return
    app.innerHTML =
      '<div class="h5-page">' +
      renderBreadcrumb() +
      '<header class="h5-header">' +
      '<div class="h5-brand">辙见服务平台 · 公开门店</div>' +
      '<h1 class="h5-title">公开门店</h1>' +
      '<p class="h5-summary">浏览已入驻、可公开展示的汽车维修保养门店，进入门店主页查看服务方案与真实案例。</p>' +
      (window.zhejianH5Ui && window.zhejianH5Ui.renderDisclaimer
        ? window.zhejianH5Ui.renderDisclaimer(COPY.geoDisclaimer, '')
        : '<div class="h5-banner">' + escapeHtml(COPY.geoDisclaimer) + '</div>') +
      '</header>' +
      bodyHtml +
      '</div>'
    if (window.zhejianH5Ui && window.zhejianH5Ui.bindDisclaimerToggles) {
      window.zhejianH5Ui.bindDisclaimerToggles(app)
    }
  }

  function renderEmpty(message) {
    renderShell(
      '公开门店 · 辙见',
      '<div class="h5-card h5-case-list-empty"><p>' + escapeHtml(message) + '</p></div>'
    )
    trackListView()
  }

  function renderError(message) {
    renderEmpty(message + '（请稍后重试）')
  }

  function renderTags(store) {
    var tags = ['已审核']
    var q = (store.qualificationTags || [])[0]
    if (q) tags.push(q)
    if (store.supportsAlbum) tags.push('支持服务相册')
    return tags
      .slice(0, 3)
      .map(function (text) {
        return '<span class="h5-store-list-tag">' + escapeHtml(text) + '</span>'
      })
      .join('')
  }

  function renderList(list) {
    var items = list
      .map(function (store) {
        var cover = store.coverImage
          ? '<img class="h5-store-list-cover" src="' +
            escapeHtml(store.coverImage) +
            '" alt="' +
            escapeHtml(store.name) +
            '门头" loading="lazy" />'
          : '<div class="h5-store-list-cover h5-store-list-cover--placeholder">门店</div>'
        var specialties = (store.specialties || []).slice(0, 3).join(' · ')
        var meta = [store.address, store.businessHours].filter(Boolean).join(' · ')
        var stats = []
        if (store.caseCount > 0) stats.push('公开案例 ' + store.caseCount)
        if (store.score >= 10) stats.push('透明度 ' + Math.round(store.score) + ' 分')
        return (
          '<a class="h5-store-list-item" href="' +
          storeHref(store.id) +
          '">' +
          cover +
          '<div class="h5-store-list-body">' +
          '<div class="h5-store-list-title">' +
          escapeHtml(store.name) +
          '</div>' +
          '<div class="h5-store-list-tags">' +
          renderTags(store) +
          '</div>' +
          (meta ? '<div class="h5-store-list-meta">' + escapeHtml(meta) + '</div>' : '') +
          (specialties
            ? '<div class="h5-store-list-meta">擅长：' + escapeHtml(specialties) + '</div>'
            : '') +
          (stats.length
            ? '<div class="h5-store-list-stats">' + escapeHtml(stats.join(' · ')) + '</div>'
            : '') +
          '<div class="h5-store-list-link">查看门店主页 ›</div>' +
          '</div></a>'
        )
      })
      .join('')

    renderShell('公开门店 · 辙见', '<div class="h5-store-list">' + items + '</div>')
    trackListView()
  }

  function trackListView() {
    if (window.zhejianTrack) {
      window.zhejianTrack.trackPageView('h5_page_view', { pageType: 'store_list' })
    }
  }

  function loadStores() {
    fetch('/api/v1/user/merchants?limit=50')
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body }
        })
      })
      .then(function (result) {
        if (!result.ok || result.body.code !== 0) {
          throw new Error('列表加载失败')
        }
        var list = result.body.data?.list || result.body.data || []
        if (!list.length) {
          renderEmpty('暂无公开展示的门店。')
          return
        }
        renderList(list)
      })
      .catch(function () {
        renderError('无法加载门店列表')
      })
  }

  loadStores()
})()
