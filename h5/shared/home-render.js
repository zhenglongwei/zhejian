(function () {
  var COPY = {
    displayDisclaimer:
      '本页内容由商家自行发布或经车主授权展示，仅供参考。实际方案与费用请与门店线下确认。',
    geoDisclaimer:
      '页面内容用于展示维修服务信息、门店信息和脱敏案例，不构成线上报价或维修承诺。实际维修方案、费用、配件、质保和售后由用户与门店线下确认。',
    price: '案例价格仅为参考区间，实际费用以门店检测为准。',
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function caseHref(item) {
    if (typeof item === 'object' && item) {
      if (item.slug) return '/case/' + encodeURIComponent(item.slug) + '.html'
      return '/case/view.html?id=' + encodeURIComponent(item.id)
    }
    return '/case/view.html?id=' + encodeURIComponent(item)
  }

  function storeHref(id) {
    return '/store/' + encodeURIComponent(id) + '.html'
  }

  function ensureMeta(attrName, key, content) {
    if (!content) return
    var selector = 'meta[' + attrName + '="' + key + '"]'
    var el = document.querySelector(selector)
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute(attrName, key)
      document.head.appendChild(el)
    }
    el.setAttribute('content', content)
  }

  function ensureLink(rel, href) {
    if (!href) return
    var el = document.querySelector('link[rel="' + rel + '"]')
    if (!el) {
      el = document.createElement('link')
      el.setAttribute('rel', rel)
      document.head.appendChild(el)
    }
    el.setAttribute('href', href)
  }

  function setPageMeta() {
    var title = '辙见 · 透明汽车维修服务平台'
    var desc =
      '辙见提供透明汽车维修信息与咨询预约工具。查看真实脱敏维修案例，浏览可信门店，了解维修过程与价格参考。'
    document.title = title
    ensureMeta('name', 'description', desc)
    ensureMeta('property', 'og:title', title)
    ensureMeta('property', 'og:description', desc)
    ensureMeta('property', 'og:type', 'website')
    ensureMeta('property', 'og:site_name', '辙见')
    ensureLink('canonical', location.origin + '/')
  }

  function renderCityEntries(entries) {
    if (!entries || !entries.length) return ''
    var items = entries
      .map(function (city) {
        var path = city.path || '/city/' + encodeURIComponent(city.slug)
        return (
          '<a class="h5-city-entry-item" href="' +
          escapeHtml(path) +
          '">' +
          '<span class="h5-city-entry-name">' +
          escapeHtml(city.name) +
          '</span>' +
          '<span class="h5-city-entry-hint">城市服务页 ›</span>' +
          '</a>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">服务城市</h2>' +
      '<div class="h5-city-entry-list">' +
      items +
      '</div></div>'
    )
  }

  function renderFeaturedCases(cases) {
    if (!cases || !cases.length) {
      return (
        '<div class="h5-card"><h2 class="h5-section-title">精选案例</h2>' +
        '<div class="h5-empty-block">暂无公开案例</div>' +
        '<p class="h5-home-more"><a class="h5-link" href="/case/">查看全部案例 ›</a></p></div>'
      )
    }
    var cards = cases
      .map(function (item) {
        var title = item.title || item.serviceName || '公开案例'
        var meta = [item.city, item.serviceName].filter(Boolean).join(' · ')
        return (
          '<a class="h5-case-list-item" href="' +
          caseHref(item) +
          '">' +
          '<div class="h5-case-list-title">' +
          escapeHtml(title) +
          '</div>' +
          (meta
            ? '<div class="h5-case-list-meta">' + escapeHtml(meta) + '</div>'
            : '') +
          '</a>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">精选案例</h2>' +
      '<p class="h5-compliance">' +
      escapeHtml(COPY.price) +
      '</p>' +
      '<div class="h5-case-list">' +
      cards +
      '</div>' +
      '<p class="h5-home-more"><a class="h5-link" href="/case/">查看全部案例 ›</a></p></div>'
    )
  }

  function renderStores(stores) {
    if (!stores || !stores.length) {
      return (
        '<div class="h5-card"><h2 class="h5-section-title">推荐门店</h2>' +
        '<div class="h5-empty-block">暂无公开展示门店</div>' +
        '<p class="h5-home-more"><a class="h5-link" href="/store/">查看全部门店 ›</a></p></div>'
      )
    }
    var items = stores
      .map(function (store) {
        var meta = [store.address, store.businessHours].filter(Boolean).join(' · ')
        var stats = []
        if (store.caseCount > 0) stats.push('公开案例 ' + store.caseCount)
        return (
          '<a class="h5-case-list-item" href="' +
          storeHref(store.id) +
          '">' +
          '<div class="h5-case-list-title">' +
          escapeHtml(store.name) +
          '</div>' +
          (meta
            ? '<div class="h5-case-list-meta">' + escapeHtml(meta) + '</div>'
            : '') +
          (stats.length
            ? '<div class="h5-case-list-meta">' + escapeHtml(stats.join(' · ')) + '</div>'
            : '') +
          '</a>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">推荐门店</h2>' +
      '<div class="h5-case-list">' +
      items +
      '</div>' +
      '<p class="h5-home-more"><a class="h5-link" href="/store/">查看全部门店 ›</a></p></div>'
    )
  }

  function renderIntro(points) {
    if (!points || !points.length) return ''
    var lis = points
      .map(function (text) {
        return '<li>' + escapeHtml(text) + '</li>'
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">为什么选择辙见</h2><ul class="h5-home-intro">' +
      lis +
      '</ul></div>'
    )
  }

  function renderHome(data) {
    var identity =
      (typeof data.platformIdentity === 'string' && data.platformIdentity) ||
      (data.platformIdentity && data.platformIdentity.subtitle) ||
      '查看真实维修案例，预约本地可信维修门店。维修过程看得见，每次维修有档案。'

    setPageMeta()

    var html =
      '<div class="h5-page">' +
      '<header class="h5-header h5-home-hero">' +
      '<div class="h5-brand">辙见服务平台</div>' +
      '<h1 class="h5-title">透明汽车维修服务平台</h1>' +
      '<p class="h5-summary">' +
      escapeHtml(identity) +
      '</p>' +
      '<div class="h5-banner">' +
      escapeHtml(COPY.displayDisclaimer) +
      '</div>' +
      '<div class="h5-banner">' +
      escapeHtml(COPY.geoDisclaimer) +
      '</div>' +
      '</header>' +
      '<div class="h5-home-quick">' +
      '<a class="h5-btn" href="/case/">浏览公开案例</a>' +
      '<a class="h5-btn h5-btn--secondary" href="/store/">浏览公开门店</a>' +
      '</div>' +
      renderCityEntries(data.cityEntries) +
      renderFeaturedCases(data.featuredCases) +
      renderStores(data.recommendedMerchants) +
      renderIntro((data.platformIntro && data.platformIntro.points) || []) +
      '<p class="h5-compliance h5-home-footnote">' +
      escapeHtml(
        (typeof data.protectionText === 'string' && data.protectionText) ||
          (data.protectionText && data.protectionText.body) ||
          '公开内容经审核与脱敏处理，不构成平台对维修质量或价格的担保。'
      ) +
      '</p>' +
      '</div>'

    var app = document.getElementById('app')
    if (app) app.innerHTML = html

    if (window.zhejianTrack) {
      window.zhejianTrack.trackPageView('h5_page_view', {
        pageType: 'home',
      })
    }
  }

  function renderError(message) {
    setPageMeta()
    var app = document.getElementById('app')
    if (!app) return
    app.innerHTML =
      '<div class="h5-page">' +
      '<header class="h5-header">' +
      '<h1 class="h5-title">辙见 · 公开内容</h1>' +
      '<p class="h5-summary">' +
      escapeHtml(message) +
      '</p>' +
      '</header>' +
      '<div class="h5-home-quick">' +
      '<a class="h5-btn" href="/case/">浏览公开案例</a>' +
      '<a class="h5-btn h5-btn--secondary" href="/store/">浏览公开门店</a>' +
      '</div></div>'
    if (window.zhejianTrack) {
      window.zhejianTrack.trackPageView('h5_page_view', { pageType: 'home' })
    }
  }

  function loadHome() {
    fetch('/api/v1/user/home')
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body }
        })
      })
      .then(function (result) {
        if (!result.ok || result.body.code !== 0 || !result.body.data) {
          throw new Error('首页数据加载失败')
        }
        renderHome(result.body.data)
      })
      .catch(function () {
        renderError('暂时无法加载推荐内容，你仍可直接浏览案例与门店列表。')
      })
  }

  loadHome()
})()
