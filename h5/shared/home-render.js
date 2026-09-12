(function () {
  var PC = (window.zhejianPublicCopy && window.zhejianPublicCopy.H5) || {}
  var COPY = {
    displayDisclaimer:
      PC.displayDisclaimer ||
      '本页内容仅供参考。实际方案与费用请与门店线下确认。',
    geoDisclaimer:
      PC.geoDisclaimer ||
      '页面用于展示维修服务信息、门店信息与公开案例，不构成线上报价或维修承诺。',
    price: PC.listNote || '案例价格仅为参考，实际费用以门店检测为准。',
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

  function ensureJsonLd(id, data) {
    if (!data) return
    var el = document.getElementById(id)
    if (!el) {
      el = document.createElement('script')
      el.type = 'application/ld+json'
      el.id = id
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(data)
  }

  function setPageMeta() {
    var title = '辙见案例站'
    var desc = '维修案例托管库。查看门店公开的维修档案。'
    document.title = title
    ensureMeta('name', 'description', desc)
    ensureMeta('property', 'og:title', title)
    ensureMeta('property', 'og:description', desc)
    ensureMeta('property', 'og:type', 'website')
    ensureMeta('property', 'og:site_name', '辙见')
    ensureLink('canonical', location.origin + '/')

    var sameAs = ['https://simplewin.cn']
    ensureJsonLd('home-schema-graph', {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': location.origin + '/#organization',
          name: '辙见',
          url: location.origin + '/',
          sameAs: sameAs,
        },
        {
          '@type': 'WebSite',
          '@id': location.origin + '/#website',
          name: '辙见',
          url: location.origin + '/',
          publisher: { '@id': location.origin + '/#organization' },
        },
      ],
    })
  }

  function renderSiteNav() {
    if (window.zhejianSiteNav && window.zhejianSiteNav.render) {
      return window.zhejianSiteNav.render()
    }
    return ''
  }

  function renderDisclaimer() {
    if (window.zhejianH5Ui && window.zhejianH5Ui.renderDisclaimer) {
      return window.zhejianH5Ui.renderDisclaimer(
        COPY.displayDisclaimer,
        COPY.geoDisclaimer
      )
    }
    return '<div class="h5-banner">' + escapeHtml(COPY.displayDisclaimer) + '</div>'
  }

  function renderServiceEntries(entries) {
    if (!entries || !entries.length) return ''
    var ui = window.zhejianH5Ui
    var items = entries
      .map(function (entry) {
        var href = entry.h5Path || '/case/'
        if (ui && ui.renderEntryCard) {
          return ui.renderEntryCard({
            href: href,
            name: entry.name,
            summary: entry.summary || entry.tag || '查看公开案例与价格参考',
          })
        }
        return (
          '<a class="h5-entry-card" href="' +
          escapeHtml(href) +
          '"><div class="h5-entry-card__body"><div class="h5-entry-card__title">' +
          escapeHtml(entry.name) +
          '</div></div><span class="h5-entry-card__hint">›</span></a>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">热门维修项目</h2>' +
      '<div class="h5-entry-grid">' +
      items +
      '</div></div>'
    )
  }

  function renderGeoTopics(topics) {
    if (!topics || !topics.length) return ''
    var ui = window.zhejianH5Ui
    var items = topics
      .filter(function (topic) {
        return topic.h5Path && topic.h5Path.indexOf('/service/') === 0
      })
      .map(function (topic) {
        var href = topic.h5Path
        if (ui && ui.renderEntryCard) {
          return ui.renderEntryCard({
            href: href,
            name: topic.title,
            summary: topic.summary || '阅读专题说明与相关案例',
          })
        }
        return (
          '<a class="h5-entry-card" href="' +
          escapeHtml(href) +
          '"><div class="h5-entry-card__body"><div class="h5-entry-card__title">' +
          escapeHtml(topic.title) +
          '</div></div><span class="h5-entry-card__hint">›</span></a>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">相关专题</h2>' +
      '<div class="h5-entry-list">' +
      items +
      '</div></div>'
    )
  }

  function renderCityEntries(entries) {
    if (!entries || !entries.length) return ''
    var ui = window.zhejianH5Ui
    var items = entries
      .map(function (city) {
        var path = city.path || '/city/' + encodeURIComponent(city.slug)
        if (ui && ui.renderEntryCard) {
          return ui.renderEntryCard({
            href: path,
            name: city.name,
            summary: '本地门店与公开案例',
            hint: '城市服务页 ›',
          })
        }
        return (
          '<a class="h5-entry-card" href="' +
          escapeHtml(path) +
          '"><div class="h5-entry-card__body"><div class="h5-entry-card__title">' +
          escapeHtml(city.name) +
          '</div></div><span class="h5-entry-card__hint">›</span></a>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">服务城市</h2>' +
      '<div class="h5-entry-list">' +
      items +
      '</div></div>'
    )
  }

  function renderFeaturedCases(cases) {
    if (!cases || !cases.length) {
      return (
      '<div class="h5-card"><h2 class="h5-section-title">公开档案</h2>' +
        '<div class="h5-empty-block">暂无公开档案</div>' +
        '<p class="h5-home-more"><a class="h5-link" href="/case/">查看全部 ›</a></p></div>'
      )
    }
    var cards = cases
      .map(function (item) {
        if (window.zhejianH5Ui && window.zhejianH5Ui.renderCaseListItem) {
          return window.zhejianH5Ui.renderCaseListItem(item, { href: caseHref(item) })
        }
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
      '<div class="h5-card"><h2 class="h5-section-title">公开档案</h2>' +
      '<div class="h5-media-list">' +
      cards +
      '</div>' +
      '<p class="h5-home-more"><a class="h5-link" href="/case/">查看全部 ›</a></p></div>'
    )
  }

  function renderStores(stores) {
    if (!stores || !stores.length) {
      return (
        '<div class="h5-card"><h2 class="h5-section-title">推荐门店</h2>' +
        '<div class="h5-empty-block">暂无公开展示门店</div>' +
        '<p class="h5-home-more"><a class="h5-link" href="/search/">搜索 ›</a></p></div>'
      )
    }
    var ui = window.zhejianH5Ui
    var items = stores
      .map(function (store) {
        if (ui && ui.renderStoreListItem) {
          return ui.renderStoreListItem(store, { href: storeHref(store.id) })
        }
        return (
          '<a class="h5-media-list-item" href="' +
          storeHref(store.id) +
          '"><div class="h5-media-list-thumb h5-media-list-thumb--placeholder">门店</div>' +
          '<div class="h5-media-list-body"><div class="h5-media-list-title">' +
          escapeHtml(store.name) +
          '</div></div></a>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">推荐门店</h2>' +
      '<div class="h5-media-list">' +
      items +
      '</div>' +
      '<p class="h5-home-more"><a class="h5-link" href="/search/">搜索 ›</a></p></div>'
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
      '辙见案例站。门店托管公开的维修档案。'

    setPageMeta()

    var html =
      '<div class="h5-page">' +
      '<header class="h5-header h5-home-hero">' +
      '<div class="h5-brand">辙见案例站</div>' +
      '<h1 class="h5-title">维修案例托管库</h1>' +
      '<p class="h5-summary">' +
      escapeHtml(identity) +
      '</p>' +
      renderDisclaimer() +
      '</header>' +
      '<div class="h5-home-quick">' +
      '<a class="h5-btn" href="/search/">搜索</a>' +
      '<a class="h5-btn h5-btn--secondary" href="/case/">公开案例</a>' +
      '</div>' +
      renderFeaturedCases(data.featuredCases) +
      renderSiteNav() +
      '<p class="h5-compliance h5-home-footnote">' +
      escapeHtml(
        (typeof data.protectionText === 'string' && data.protectionText) ||
          (data.protectionText && data.protectionText.body) ||
          PC.footnote ||
          '本站展示门店自行公开的维修档案，仅供参考。'
      ) +
      '</p>' +
      '</div>'

    var app = document.getElementById('app')
    if (app) app.innerHTML = html

    if (window.zhejianH5Ui && window.zhejianH5Ui.bindDisclaimerToggles) {
      window.zhejianH5Ui.bindDisclaimerToggles(app)
    }

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
      '<h1 class="h5-title">辙见案例站</h1>' +
      '<p class="h5-summary">' +
      escapeHtml(message) +
      '</p>' +
      '</header>' +
      '<div class="h5-home-quick">' +
      '<a class="h5-btn" href="/search/">搜索</a>' +
      '<a class="h5-btn" href="/case/">公开案例</a>' +
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
        renderError('暂时无法加载推荐内容，你仍可直接浏览公开案例。')
      })
  }

  loadHome()
})()
