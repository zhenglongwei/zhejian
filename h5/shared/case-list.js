(function () {
  var LIST_NOTE = '本页列出门店托管并公开的维修档案。'

  function renderBreadcrumb() {
    if (window.zhejianSeo) {
      return window.zhejianSeo.renderBreadcrumbHtml([
        { label: '辙见', href: '/' },
        { label: '公开案例' },
      ])
    }
    return ''
  }

  function renderDisclaimer() {
    if (window.zhejianH5Ui && window.zhejianH5Ui.renderDisclaimer) {
      return window.zhejianH5Ui.renderDisclaimer(LIST_NOTE, '')
    }
    return '<div class="h5-banner">' + LIST_NOTE + '</div>'
  }

  function applyListSeo() {
    if (!window.zhejianSeo) return
    window.zhejianSeo.applyPageSeo({
      title: '公开案例 · 辙见',
      description: '辙见公开案例 · 门店托管并公开的维修档案。',
      canonicalPath: '/case/',
      robots: 'index,follow',
    })
    window.zhejianSeo.applyBreadcrumbSchema(
      [
        { label: '辙见', href: '/' },
        { label: '公开案例' },
      ],
      'case-list-breadcrumb'
    )
  }

  function renderEmpty(message) {
    applyListSeo()
    var app = document.getElementById('app')
    if (!app) return
    var safeMessage =
      window.zhejianH5Ui && window.zhejianH5Ui.escapeHtml
        ? window.zhejianH5Ui.escapeHtml(message)
        : message
    app.innerHTML =
      '<div class="h5-page">' +
      renderBreadcrumb() +
      '<header class="h5-header">' +
      '<h1 class="h5-title">公开案例</h1>' +
      '<p class="h5-summary">门店托管并公开的维修档案。</p>' +
      '</header>' +
      '<div class="h5-card h5-case-list-empty"><p>' +
      safeMessage +
      '</p></div>' +
      (window.zhejianSiteBeian ? window.zhejianSiteBeian.render() : '') +
      '</div>'
  }

  function renderError(message) {
    renderEmpty(message + '（请稍后重试）')
  }

  function renderListItem(item) {
    if (window.zhejianH5Ui && window.zhejianH5Ui.renderCaseListItem) {
      return window.zhejianH5Ui.renderCaseListItem(item)
    }
    var title = item.title || item.serviceName || '公开案例'
    var meta = [item.city, item.storeName, item.serviceName].filter(Boolean).join(' · ')
    var href =
      item.slug
        ? '/case/' + encodeURIComponent(item.slug) + '.html'
        : 'view.html?id=' + encodeURIComponent(item.id)
    return (
      '<a class="h5-case-list-item" href="' +
      href +
      '"><div class="h5-case-list-title">' +
      title +
      '</div>' +
      (meta ? '<div class="h5-case-list-meta">' + meta + '</div>' : '') +
      '</a>'
    )
  }

  function renderList(list) {
    applyListSeo()
    var items = list.map(renderListItem).join('')

    var app = document.getElementById('app')
    if (!app) return
    app.innerHTML =
      '<div class="h5-page">' +
      renderBreadcrumb() +
      '<header class="h5-header">' +
      '<h1 class="h5-title">公开案例</h1>' +
      '<p class="h5-summary">门店托管并公开的维修档案。</p>' +
      renderDisclaimer() +
      '</header>' +
      '<div class="h5-media-list">' +
      items +
      '</div>' +
      (window.zhejianSiteBeian ? window.zhejianSiteBeian.render() : '') +
      '</div>'

    if (window.zhejianH5Ui && window.zhejianH5Ui.bindDisclaimerToggles) {
      window.zhejianH5Ui.bindDisclaimerToggles()
    }

    if (window.zhejianTrack) {
      window.zhejianTrack.trackPageView('h5_page_view', { pageType: 'case_list' })
    }
  }

  function loadCases() {
    fetch('/api/v1/user/cases?limit=50')
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
          renderEmpty('暂无公开档案。')
          return
        }
        renderList(list)
      })
      .catch(function () {
        renderError('无法加载案例列表')
      })
  }

  loadCases()
})()
