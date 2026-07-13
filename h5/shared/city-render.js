(function () {
  var PC = (window.zhejianPublicCopy && window.zhejianPublicCopy.H5) || {}
  var COPY = {
    displayDisclaimer:
      PC.displayDisclaimer ||
      '本页内容仅供参考。实际方案与费用请与门店线下确认。',
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

  function parseCitySlug() {
    var match = location.pathname.match(/\/city\/([a-z0-9-]+)\/?$/i)
    return match ? decodeURIComponent(match[1]).toLowerCase() : ''
  }

  function caseHref(item) {
    if (item.slug) return '/case/' + encodeURIComponent(item.slug) + '.html'
    return '/case/view.html?id=' + encodeURIComponent(item.id)
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

  function injectJsonLd(data) {
    var el = document.getElementById('h5-city-jsonld')
    if (!el) {
      el = document.createElement('script')
      el.type = 'application/ld+json'
      el.id = 'h5-city-jsonld'
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(data)
  }

  function setPageMeta(data) {
    var cityName = (data.city && data.city.name) || '杭州'
    var seo = data.seo || {}
    var title = seo.title || cityName + '汽车维修保养 · 辙见'
    var desc =
      seo.description ||
      '查看' +
        cityName +
        '汽车维修保养门店、真实维修案例与透明度说明。公开案例经审核，价格仅供参考。'
    var canonical = location.origin + (seo.canonicalPath || location.pathname.replace(/\/$/, ''))
    var robots = seo.robots || 'index,follow'

    document.title = title
    ensureMeta('name', 'description', desc)
    ensureMeta('name', 'robots', robots)
    ensureMeta('property', 'og:title', title)
    ensureMeta('property', 'og:description', desc)
    ensureMeta('property', 'og:type', 'website')
    ensureMeta('property', 'og:site_name', '辙见')
    ensureMeta('property', 'og:url', canonical)
    ensureLink('canonical', canonical)

    if (window.zhejianSeo) {
      window.zhejianSeo.applyBreadcrumbSchema(
        [
          { label: '辙见', href: '/' },
          { label: cityName, href: seo.canonicalPath || location.pathname.replace(/\/$/, '') },
        ],
        'city-breadcrumb'
      )
    }

    if (data.faq && data.faq.length) {
      injectJsonLd({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebPage',
            name: title,
            description: desc,
            url: canonical,
          },
          {
            '@type': 'FAQPage',
            mainEntity: data.faq.map(function (item) {
              return {
                '@type': 'Question',
                name: item.q,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: item.a,
                },
              }
            }),
          },
        ],
      })
    }
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

  function renderServiceEntries(entries, cityName) {
    if (!entries || !entries.length) return ''
    var ui = window.zhejianH5Ui
    var items = entries
      .map(function (entry) {
        var href = entry.h5Path || '/case/'
        var name = cityName + entry.name
        if (ui && ui.renderEntryCard) {
          return ui.renderEntryCard({
            href: href,
            name: name,
            summary: entry.summary || entry.tag || '查看公开案例与价格参考',
          })
        }
        return (
          '<a class="h5-entry-card" href="' +
          escapeHtml(href) +
          '"><div class="h5-entry-card__body"><div class="h5-entry-card__title">' +
          escapeHtml(name) +
          '</div></div><span class="h5-entry-card__hint">›</span></a>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">' +
      escapeHtml(cityName) +
      '热门维修项目</h2>' +
      '<div class="h5-entry-grid">' +
      items +
      '</div></div>'
    )
  }

  function renderFeaturedCases(cases, cityName) {
    if (!cases || !cases.length) {
      return (
        '<div class="h5-card"><h2 class="h5-section-title">' +
        escapeHtml(cityName) +
        '最新维修案例</h2>' +
        '<div class="h5-empty-block">当前城市的公开案例正在补充中，可先查看相关服务或预约门店咨询。</div>' +
        '<p class="h5-home-more"><a class="h5-link" href="/case/">查看全部案例 ›</a></p></div>'
      )
    }
    var cards = cases
      .map(function (item) {
        if (window.zhejianH5Ui && window.zhejianH5Ui.renderCaseListItem) {
          return window.zhejianH5Ui.renderCaseListItem(item, {
            href: caseHref(item),
            extraAttrs: ' data-case-id="' + escapeHtml(item.id) + '"',
          })
        }
        var title = item.title || item.serviceName || '公开案例'
        var meta = [item.city, item.serviceName, item.storeName].filter(Boolean).join(' · ')
        return (
          '<a class="h5-case-list-item" href="' +
          caseHref(item) +
          '" data-case-id="' +
          escapeHtml(item.id) +
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
      '<div class="h5-card"><h2 class="h5-section-title">' +
      escapeHtml(cityName) +
      '最新维修案例</h2>' +
      '<p class="h5-compliance">' +
      escapeHtml(
        '公开案例经审核。' +
          ((cases[0] && cases[0].priceNotice) || '案例价格仅为参考区间，实际费用以门店检测为准。')
      ) +
      '</p>' +
      '<div class="h5-media-list">' +
      cards +
      '</div>' +
      '<p class="h5-home-more"><a class="h5-link" href="/case/">查看全部案例 ›</a></p></div>'
    )
  }

  function renderStores(stores, cityName) {
    if (!stores || !stores.length) {
      return (
        '<div class="h5-card"><h2 class="h5-section-title">' +
        escapeHtml(cityName) +
        '推荐门店</h2>' +
        '<div class="h5-empty-block">暂无公开展示门店</div>' +
        '<p class="h5-home-more"><a class="h5-link" href="/store/">查看全部门店 ›</a></p></div>'
      )
    }
    var ui = window.zhejianH5Ui
    var items = stores
      .map(function (store) {
        if (ui && ui.renderStoreListItem) {
          return ui.renderStoreListItem(store, {
            href: storeHref(store.id),
            extraAttrs: ' data-store-id="' + escapeHtml(store.id) + '"',
          })
        }
        return (
          '<a class="h5-media-list-item" href="' +
          storeHref(store.id) +
          '" data-store-id="' +
          escapeHtml(store.id) +
          '"><div class="h5-media-list-thumb h5-media-list-thumb--placeholder">门店</div>' +
          '<div class="h5-media-list-body"><div class="h5-media-list-title">' +
          escapeHtml(store.name) +
          '</div></div></a>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">' +
      escapeHtml(cityName) +
      '推荐门店</h2>' +
      '<div class="h5-media-list">' +
      items +
      '</div>' +
      '<p class="h5-home-more"><a class="h5-link" href="/store/">查看全部门店 ›</a></p></div>'
    )
  }

  function renderStats(stats, cityName) {
    if (!stats) return ''
    var parts = []
    if (stats.caseCount > 0) parts.push('公开案例 ' + stats.caseCount + ' 条')
    if (stats.storeCount > 0) parts.push('可展示门店 ' + stats.storeCount + ' 家')
    if (!parts.length) return ''
    return (
      '<div class="h5-card"><h2 class="h5-section-title">' +
      escapeHtml(cityName) +
      '透明度摘要</h2>' +
      '<p class="h5-summary">' +
      escapeHtml(
        '平台收录' +
          cityName +
          '本地维修门店与已审核公开案例。' +
          parts.join('，') +
          '。不含交易评价，数据来自公开留档与审核信息。'
      ) +
      '</p></div>'
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
      '<div class="h5-card"><h2 class="h5-section-title">常见维修问题</h2>' +
      '<div class="h5-entry-list">' +
      items +
      '</div></div>'
    )
  }

  function renderFaq(faq) {
    if (!faq || !faq.length) return ''
    var items = faq
      .map(function (item) {
        return (
          '<div class="h5-faq-item">' +
          '<div class="h5-faq-q">' +
          escapeHtml(item.q) +
          '</div>' +
          '<div class="h5-faq-a">' +
          escapeHtml(item.a) +
          '</div></div>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">常见问题</h2>' +
      items +
      '</div>'
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

  function buildWeappPath(citySlug) {
    return (
      'pages/index/index?source=h5&page_type=city&city_slug=' +
      encodeURIComponent(citySlug || 'hangzhou')
    )
  }

  function bindInteractions(data) {
    var citySlug = (data.city && data.city.slug) || 'hangzhou'
    var cityName = (data.city && data.city.name) || '杭州'

    document.querySelectorAll('[data-case-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_city_case_click', {
            caseId: el.getAttribute('data-case-id') || '',
            city: cityName,
            citySlug: citySlug,
          })
        }
      })
    })

    document.querySelectorAll('[data-store-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_city_store_click', {
            storeId: el.getAttribute('data-store-id') || '',
            city: cityName,
            citySlug: citySlug,
          })
        }
      })
    })

    var weappBtn = document.getElementById('h5-open-weapp-btn')
    if (weappBtn) {
      weappBtn.addEventListener('click', function () {
        var path = buildWeappPath(citySlug)
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_open_weapp_click', {
            pageType: 'city',
            city: cityName,
            citySlug: citySlug,
          })
        }
        alert('请打开微信小程序继续。路径：' + path)
      })
    }

    if (window.zhejianTrack && window.zhejianTrack.bindScrollDepth) {
      window.zhejianTrack.bindScrollDepth({
        pageType: 'city',
        city: cityName,
        citySlug: citySlug,
      })
    }
  }

  function renderCity(data) {
    var cityName = (data.city && data.city.name) || '杭州'
    var citySlug = (data.city && data.city.slug) || 'hangzhou'
    var summary =
      '平台收录' +
      cityName +
      '本地可提供汽车维修保养服务的维修门店，并展示已审核的真实维修案例。用户可查看参考价格、维修流程、门店信息和透明度指标后，通过小程序预约到店服务。'

    setPageMeta(data)

    var html =
      '<div class="h5-page">' +
      (window.zhejianSeo
        ? window.zhejianSeo.renderBreadcrumbHtml([
            { label: '辙见', href: '/' },
            { label: cityName },
          ])
        : '') +
      '<header class="h5-header h5-home-hero">' +
      '<div class="h5-brand"><a class="h5-link" href="/">辙见服务平台</a> · ' +
      escapeHtml(cityName) +
      '</div>' +
      '<h1 class="h5-title">' +
      escapeHtml(cityName) +
      '透明汽车维修服务平台</h1>' +
      '<p class="h5-summary">' +
      escapeHtml(summary) +
      '</p>' +
      renderDisclaimer() +
      '</header>' +
      '<div class="h5-home-quick">' +
      '<a class="h5-btn" href="/case/">浏览公开案例</a>' +
      '<button type="button" class="h5-btn h5-btn--secondary" id="h5-open-weapp-btn">打开小程序预约</button>' +
      '</div>' +
      renderServiceEntries(data.serviceEntries, cityName) +
      renderStats(data.stats, cityName) +
      renderFeaturedCases(data.featuredCases, cityName) +
      renderStores(data.recommendedMerchants, cityName) +
      renderGeoTopics(data.geoTopics) +
      renderIntro((data.platformIntro && data.platformIntro.points) || []) +
      renderFaq(data.faq) +
      renderSiteNav() +
      '<p class="h5-compliance h5-home-footnote">' +
      escapeHtml(
        (typeof data.protectionText === 'string' && data.protectionText) ||
          (data.protectionText && data.protectionText.body) ||
          '公开内容经审核，不构成平台对维修质量或价格的担保。'
      ) +
      '</p>' +
      '</div>'

    var app = document.getElementById('app')
    if (app) app.innerHTML = html
    if (window.zhejianH5Ui && window.zhejianH5Ui.bindDisclaimerToggles) {
      window.zhejianH5Ui.bindDisclaimerToggles(app)
    }
    bindInteractions(data)

    if (window.zhejianTrack) {
      window.zhejianTrack.trackPageView('h5_city_view', {
        pageType: 'city',
        city: cityName,
        citySlug: citySlug,
      })
    }
  }

  function renderNotFound(message) {
    document.title = '城市未找到 · 辙见'
    ensureMeta('name', 'robots', 'noindex,nofollow')
    var app = document.getElementById('app')
    if (!app) return
    app.innerHTML =
      '<div class="h5-page">' +
      '<header class="h5-header">' +
      '<h1 class="h5-title">城市页不存在</h1>' +
      '<p class="h5-summary">' +
      escapeHtml(message || '该城市暂未开通或页面不存在。') +
      '</p>' +
      '</header>' +
      '<div class="h5-home-quick">' +
      '<a class="h5-btn" href="/">返回平台首页</a>' +
      '<a class="h5-btn h5-btn--secondary" href="/city/hangzhou">杭州城市页</a>' +
      '</div></div>'
  }

  function renderError(message) {
    var app = document.getElementById('app')
    if (!app) return
    app.innerHTML =
      '<div class="h5-page">' +
      '<header class="h5-header">' +
      '<h1 class="h5-title">暂时无法加载</h1>' +
      '<p class="h5-summary">' +
      escapeHtml(message) +
      '</p>' +
      '</header>' +
      '<div class="h5-home-quick">' +
      '<a class="h5-btn" href="/case/">浏览公开案例</a>' +
      '<a class="h5-btn h5-btn--secondary" href="/store/">浏览公开门店</a>' +
      '</div></div>'
  }

  function loadCity() {
    var slug = parseCitySlug()
    if (!slug) {
      renderNotFound('请从正确的城市链接访问，例如 /city/hangzhou')
      return
    }

    fetch('/api/v1/public/h5/cities/' + encodeURIComponent(slug))
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, status: res.status, body: body }
        })
      })
      .then(function (result) {
        if (result.status === 404) {
          renderNotFound(result.body.message || '城市不存在或未开通')
          return
        }
        if (!result.ok || result.body.code !== 0 || !result.body.data) {
          throw new Error(result.body.message || '城市页数据加载失败')
        }
        renderCity(result.body.data)
      })
      .catch(function () {
        renderError('暂时无法加载城市推荐内容，你仍可直接浏览案例与门店列表。')
      })
  }

  loadCity()
})()
