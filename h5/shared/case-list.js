(function () {
  var LIST_NOTE = '用户选择公开后可在此查看。现阶段参与公开的主要是修理厂商家。'
  var CATEGORIES = [
    { slug: '', name: '全部' },
    { slug: 'car-maintenance', name: '小保养' },
    { slug: 'brake-pad-replacement', name: '刹车片' },
    { slug: 'battery-replacement', name: '电瓶' },
    { slug: 'body-paint-repair', name: '钣喷' },
    { slug: 'accident-repair', name: '事故车' },
  ]

  function currentService() {
    try {
      return String(new URLSearchParams(location.search).get('service') || '').trim()
    } catch (e) {
      return ''
    }
  }

  function categoryHref(slug) {
    return slug ? '/case/?service=' + encodeURIComponent(slug) : '/case/'
  }

  function renderCategoryNav() {
    var current = currentService()
    var links = CATEGORIES.map(function (item) {
      var on = item.slug === current ? ' is-on' : ''
      return (
        '<a class="' +
        on +
        '" href="' +
        categoryHref(item.slug) +
        '">' +
        item.name +
        '</a>'
      )
    }).join('')
    return '<nav class="h5-cat-nav" aria-label="服务分类">' + links + '</nav>'
  }

  function renderBreadcrumb() {
    if (window.zhejianSeo) {
      return window.zhejianSeo.renderBreadcrumbHtml([
        { label: '辙见', href: '/' },
        { label: '公开案例' },
      ])
    }
    return ''
  }

  function applyListSeo() {
    if (!window.zhejianSeo) return
    var current = CATEGORIES.find(function (item) {
      return item.slug === currentService()
    })
    var name = current && current.slug ? current.name : '公开案例'
    window.zhejianSeo.applyPageSeo({
      title: (current && current.slug ? name + ' · ' : '') + '公开案例 · 辙见',
      description: '公开案例：用户选择公开后可在此查看。现阶段参与公开的主要是修理厂商家。',
      canonicalPath: categoryHref(currentService()),
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

  function pageShell(inner) {
    return (
      '<div class="h5-page h5-page--wide">' +
      renderBreadcrumb() +
      '<header class="h5-header">' +
      '<h1 class="h5-title">公开案例</h1>' +
      '<p class="h5-summary">公开案例：用户选择公开后可在此查看。现阶段参与公开的主要是修理厂商家。</p>' +
      '</header>' +
      renderCategoryNav() +
      inner +
      (window.zhejianSiteNav && window.zhejianSiteNav.render
        ? window.zhejianSiteNav.render()
        : window.zhejianSiteBeian
          ? window.zhejianSiteBeian.render()
          : '') +
      '</div>'
    )
  }

  function renderEmpty(message, extras) {
    applyListSeo()
    var app = document.getElementById('app')
    if (!app) return
    var safeMessage =
      window.zhejianH5Ui && window.zhejianH5Ui.escapeHtml
        ? window.zhejianH5Ui.escapeHtml(message)
        : message
    if (extras && extras.hosting && window.zhejianEmptyShelf && window.zhejianEmptyShelf.renderMerchantEmpty) {
      app.innerHTML =
        '<div class="h5-page h5-page--wide">' +
        window.zhejianEmptyShelf.renderMerchantEmpty() +
        (window.zhejianSiteNav && window.zhejianSiteNav.render
          ? window.zhejianSiteNav.render()
          : '') +
        '</div>'
      return
    }
    var hosting =
      extras && extras.hosting
        ? '<p class="h5-home-more"><a class="h5-link" href="https://simplewin.cn/zhejian.html">了解辙见 ›</a></p>'
        : ''
    app.innerHTML = pageShell(
      '<div class="h5-card h5-case-list-empty"><p>' + safeMessage + '</p>' + hosting + '</div>'
    )
  }

  function renderListItem(item) {
    if (window.zhejianH5Ui && window.zhejianH5Ui.renderCaseListItem) {
      return window.zhejianH5Ui.renderCaseListItem(item)
    }
    var title = item.serviceName || item.title || '公开案例'
    var meta = [item.city, item.storeName].filter(Boolean).join(' · ')
    var href =
      item.slug
        ? '/case/' + encodeURIComponent(item.slug) + '.html'
        : 'view.html?id=' + encodeURIComponent(item.id)
    return (
      '<a class="h5-media-list-item" href="' +
      href +
      '"><div class="h5-media-list-title">' +
      title +
      '</div>' +
      (meta ? '<div class="h5-media-list-meta">' + meta + '</div>' : '') +
      '</a>'
    )
  }

  function renderList(list) {
    applyListSeo()
    var items = list.map(renderListItem).join('')
    var app = document.getElementById('app')
    if (!app) return
    app.innerHTML = pageShell('<div class="h5-media-list h5-case-grid">' + items + '</div>')

    if (window.zhejianH5Ui && window.zhejianH5Ui.bindDisclaimerToggles) {
      window.zhejianH5Ui.bindDisclaimerToggles()
    }

    if (window.zhejianTrack) {
      window.zhejianTrack.trackPageView('h5_page_view', { pageType: 'case_list' })
    }
  }

  function loadCases() {
    var service = currentService()
    var url = '/api/v1/user/cases?limit=50'
    if (service) url += '&service=' + encodeURIComponent(service)
    fetch(url)
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
          if (service) {
            renderEmpty('这一类暂时还没有公开案例。你可以先浏览其他分类，或了解辙见怎么上传（微信搜「辙见」）。欢迎修理厂商家上传并选择公开。')
          } else {
            renderEmpty('暂无公开档案', { hosting: true })
          }
          return
        }
        renderList(list)
      })
      .catch(function () {
        renderEmpty('无法加载案例列表（请稍后重试）')
      })
  }

  loadCases()
})()
