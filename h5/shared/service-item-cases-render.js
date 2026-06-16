(function () {
  var COPY = {
    casePrice:
      '车主授权公示的案例展示当时方案报价；其余案例价格为系统参考区间，实际费用以门店检测为准。',
    caseCompliance:
      '公开展示仅使用脱敏图片，不含车牌、手机号等隐私信息。',
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function parseSlug() {
    var match = location.pathname.match(/\/service\/([^/]+)\/cases\/?$/i)
    if (!match || match[1] === 'view' || match[1] === 'index' || match[1] === 'cases') {
      return ''
    }
    return decodeURIComponent(match[1]).trim()
  }

  function parsePage() {
    var page = parseInt(String(new URLSearchParams(location.search).get('page') || '1'), 10)
    return page > 0 ? page : 1
  }

  function parseQueryParam(key) {
    return String(new URLSearchParams(location.search).get(key) || '').trim()
  }

  function serviceItemPagePath(slug) {
    return '/service/' + encodeURIComponent(slug) + '.html'
  }

  function serviceItemCasesPagePath(slug, opts) {
    opts = opts || {}
    var qs = []
    if (opts.page && opts.page > 1) qs.push('page=' + encodeURIComponent(String(opts.page)))
    if (opts.city) qs.push('city=' + encodeURIComponent(opts.city))
    if (opts.storeId) qs.push('storeId=' + encodeURIComponent(opts.storeId))
    var base = '/service/' + encodeURIComponent(slug) + '/cases'
    return qs.length ? base + '?' + qs.join('&') : base
  }

  function casePagePath(item) {
    if (item.slug) return '/case/' + encodeURIComponent(item.slug) + '.html'
    return '/case/view.html?id=' + encodeURIComponent(item.id)
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

  function setPageMeta(data) {
    var seo = data.seo || {}
    var item = data.item || {}
    var crumbs = [
      { label: '辙见', href: '/' },
      { label: '服务项目', href: '/service/car-maintenance.html' },
      { label: item.name || '服务项目', href: item.slug ? serviceItemPagePath(item.slug) : '' },
      { label: '维修案例' },
    ]
    if (window.zhejianSeo) {
      window.zhejianSeo.applyPageSeo({
        title: seo.title || (item.name ? item.name + '案例列表 · 辙见' : '案例列表 · 辙见'),
        description: seo.description || item.summary || '',
        canonicalPath: seo.canonicalPath || location.pathname,
        robots: seo.robots || 'index,follow',
        prevPath: seo.prevPath,
        nextPath: seo.nextPath,
      })
      window.zhejianSeo.applyBreadcrumbSchema(crumbs, 'service-item-cases-breadcrumb')
      return
    }
    var title = seo.title || item.name + '案例列表 · 辙见'
    var desc = seo.description || item.summary || ''
    var canonical = location.origin + (seo.canonicalPath || location.pathname)
    document.title = title
    ensureMeta('name', 'description', desc)
    ensureMeta('name', 'robots', seo.robots || 'index,follow')
    ensureMeta('property', 'og:title', title)
    ensureMeta('property', 'og:description', desc)
    ensureMeta('property', 'og:url', canonical)
    ensureLink('canonical', canonical)
  }

  function isDesensitizedUrl(url) {
    if (!url) return false
    var value = String(url)
    return (
      value.indexOf('mock://desensitized/') === 0 ||
      value.indexOf('/files/uploads/desensitized/') !== -1 ||
      value.indexOf('/media/files/uploads/desensitized/') !== -1
    )
  }

  function pickCaseCover(data) {
    if (data.coverImageDesensitized && isDesensitizedUrl(data.coverImageDesensitized)) {
      return data.coverImageDesensitized
    }
    if (data.coverImage && isDesensitizedUrl(data.coverImage)) return data.coverImage
    return ''
  }

  function renderFilters(slug, filters) {
    if (!filters) return ''
    var activeCity = filters.activeCity || ''
    var activeStoreId = filters.activeStoreId || ''
    var html = ''

    if (filters.cities && filters.cities.length) {
      var cityChips = [
        '<a class="h5-filter-chip' +
          (activeCity ? '' : ' h5-filter-chip--active') +
          '" href="' +
          serviceItemCasesPagePath(slug, { storeId: activeStoreId }) +
          '">全部城市</a>',
      ]
      filters.cities.forEach(function (city) {
        cityChips.push(
          '<a class="h5-filter-chip' +
            (activeCity === city ? ' h5-filter-chip--active' : '') +
            '" href="' +
            serviceItemCasesPagePath(slug, { city: city, storeId: activeStoreId }) +
            '">' +
            escapeHtml(city) +
            '</a>'
        )
      })
      html +=
        '<div class="h5-card"><h2 class="h5-section-title">按城市筛选</h2><div class="h5-filter-row">' +
        cityChips.join('') +
        '</div></div>'
    }

    if (filters.stores && filters.stores.length) {
      var storeChips = [
        '<a class="h5-filter-chip' +
          (activeStoreId ? '' : ' h5-filter-chip--active') +
          '" href="' +
          serviceItemCasesPagePath(slug, { city: activeCity }) +
          '">全部门店</a>',
      ]
      filters.stores.forEach(function (store) {
        storeChips.push(
          '<a class="h5-filter-chip' +
            (activeStoreId === store.id ? ' h5-filter-chip--active' : '') +
            '" href="' +
            serviceItemCasesPagePath(slug, { city: activeCity, storeId: store.id }) +
            '">' +
            escapeHtml(store.name) +
            '</a>'
        )
      })
      html +=
        '<div class="h5-card"><h2 class="h5-section-title">按门店筛选</h2><div class="h5-filter-row">' +
        storeChips.join('') +
        '</div></div>'
    }

    return html
  }

  function renderCaseCards(cases, item) {
    if (!cases || !cases.length) {
      return '<div class="h5-card"><div class="h5-empty-block">暂无符合条件的公开案例</div></div>'
    }
    var cards = cases
      .map(function (entry) {
        if (window.zhejianH5Ui && window.zhejianH5Ui.renderCaseListItem) {
          return window.zhejianH5Ui.renderCaseListItem(entry, {
            href: casePagePath(entry),
            extraAttrs: ' data-case-id="' + escapeHtml(entry.id) + '"',
          })
        }
        var cover = pickCaseCover(entry)
        var coverHtml = cover
          ? '<img class="h5-media-list-thumb" src="' +
            escapeHtml(cover) +
            '" alt="' +
            escapeHtml((item.name || '') + '脱敏案例封面') +
            '" loading="lazy" />'
          : '<div class="h5-media-list-thumb h5-media-list-thumb--placeholder">案例</div>'
        return (
          '<a class="h5-media-list-item" href="' +
          casePagePath(entry) +
          '" data-case-id="' +
          escapeHtml(entry.id) +
          '">' +
          coverHtml +
          '<div class="h5-media-list-body">' +
          '<div class="h5-media-list-title">' +
          escapeHtml(entry.title || entry.serviceName || '公开案例') +
          '</div>' +
          '<div class="h5-media-list-meta">' +
          escapeHtml([entry.city, entry.storeName].filter(Boolean).join(' · ')) +
          '</div></div></a>'
        )
      })
      .join('')
    return '<div class="h5-media-list">' + cards + '</div>'
  }

  function renderPagination(slug, pagination, filters) {
    if (!pagination || pagination.totalPages <= 1) return ''
    var page = pagination.page || 1
    var activeCity = (filters && filters.activeCity) || ''
    var activeStoreId = (filters && filters.activeStoreId) || ''
    var parts = []
    if (page > 1) {
      parts.push(
        '<a class="h5-btn h5-btn--secondary h5-pagination-btn" href="' +
          serviceItemCasesPagePath(slug, {
            page: page - 1,
            city: activeCity,
            storeId: activeStoreId,
          }) +
          '">上一页</a>'
      )
    }
    parts.push(
      '<span class="h5-pagination-info">第 ' +
        page +
        ' / ' +
        pagination.totalPages +
        ' 页 · 共 ' +
        pagination.total +
        ' 条</span>'
    )
    if (pagination.hasMore) {
      parts.push(
        '<a class="h5-btn h5-btn--secondary h5-pagination-btn" href="' +
          serviceItemCasesPagePath(slug, {
            page: page + 1,
            city: activeCity,
            storeId: activeStoreId,
          }) +
          '">下一页</a>'
      )
    }
    return '<div class="h5-pagination">' + parts.join('') + '</div>'
  }

  function renderSiteNav() {
    if (window.zhejianSiteNav && window.zhejianSiteNav.render) {
      return window.zhejianSiteNav.render()
    }
    return ''
  }

  function renderFaq(faq) {
    if (!faq || !faq.length) return ''
    var items = faq
      .map(function (entry) {
        return (
          '<div class="h5-faq-item"><div class="h5-faq-q">' +
          escapeHtml(entry.q) +
          '</div><div class="h5-faq-a">' +
          escapeHtml(entry.a) +
          '</div></div>'
        )
      })
      .join('')
    return '<div class="h5-card"><h2 class="h5-section-title">常见问题</h2>' + items + '</div>'
  }

  function bindInteractions(data) {
    var item = data.item || {}
    document.querySelectorAll('[data-case-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_service_case_click', {
            serviceSlug: item.slug,
            serviceItemId: item.serviceItemId,
            caseId: el.getAttribute('data-case-id') || '',
            pageType: 'service_item_cases',
          })
        }
      })
    })
  }

  function renderPage(data) {
    var item = data.item
    var pagination = data.pagination || {}
    setPageMeta(data)

    var html =
      '<div class="h5-page">' +
      (window.zhejianSeo
        ? window.zhejianSeo.renderBreadcrumbHtml([
            { label: '辙见', href: '/' },
            { label: '服务项目', href: '/service/car-maintenance.html' },
            { label: item.name, href: serviceItemPagePath(item.slug) },
            { label: '维修案例' },
          ])
        : '<nav class="h5-breadcrumb"><a href="/">辙见</a> › 服务项目 › <a href="' +
          serviceItemPagePath(item.slug) +
          '">' +
          escapeHtml(item.name) +
          '</a> › 维修案例</nav>') +
      '<header class="h5-header">' +
      '<div class="h5-brand">辙见服务平台 · 项目案例列表</div>' +
      '<h1 class="h5-title">' +
      escapeHtml(item.name) +
      ' · 公开维修案例</h1>' +
      '<p class="h5-summary">' +
      escapeHtml(
        (item.summary || '') +
          (pagination.total ? '（共 ' + pagination.total + ' 条已审核脱敏案例）' : '')
      ) +
      '</p>' +
      (window.zhejianH5Ui && window.zhejianH5Ui.renderDisclaimer
        ? window.zhejianH5Ui.renderDisclaimer(
            COPY.casePrice + ' ' + COPY.caseCompliance,
            ''
          )
        : '<div class="h5-banner">' + escapeHtml(COPY.casePrice) + '</div>') +
      '</header>' +
      '<div class="h5-home-quick">' +
      '<a class="h5-btn" href="' +
      serviceItemPagePath(item.slug) +
      '">返回服务项目页</a>' +
      '<a class="h5-btn h5-btn--secondary" href="/case/">全部公开案例</a>' +
      '</div>' +
      renderFilters(item.slug, data.filters) +
      '<div class="h5-card"><h2 class="h5-section-title">案例列表</h2>' +
      renderCaseCards(data.cases, item) +
      '</div>' +
      renderPagination(item.slug, pagination, data.filters) +
      renderFaq(data.faq) +
      renderSiteNav() +
      '<p class="h5-compliance h5-home-footnote">公开内容经审核与脱敏处理，不构成平台对维修质量或价格的担保。</p>' +
      '</div>'

    var app = document.getElementById('app')
    if (app) app.innerHTML = html
    if (window.zhejianH5Ui && window.zhejianH5Ui.bindDisclaimerToggles) {
      window.zhejianH5Ui.bindDisclaimerToggles(app)
    }
    bindInteractions(data)

    if (window.zhejianTrack) {
      window.zhejianTrack.track('h5_service_view', {
        pageType: 'service_item_cases',
        serviceSlug: item.slug,
        serviceItemId: item.serviceItemId,
        caseCount: pagination.total || 0,
      })
      if (window.zhejianTrack.bindScrollDepth) {
        window.zhejianTrack.bindScrollDepth({
          pageType: 'service_item_cases',
          serviceSlug: item.slug,
        })
      }
    }
  }

  function renderNotFound(message) {
    document.title = '服务项目案例未找到 · 辙见'
    ensureMeta('name', 'robots', 'noindex,nofollow')
    var app = document.getElementById('app')
    if (!app) return
    app.innerHTML =
      '<div class="h5-page"><header class="h5-header"><h1 class="h5-title">页面不存在</h1>' +
      '<p class="h5-summary">' +
      escapeHtml(message || '服务项目不存在或未开放。') +
      '</p></header>' +
      '<div class="h5-home-quick"><a class="h5-btn" href="/case/">浏览公开案例</a></div></div>'
  }

  function renderError(message) {
    var app = document.getElementById('app')
    if (!app) return
    app.innerHTML =
      '<div class="h5-page"><header class="h5-header"><h1 class="h5-title">暂时无法加载</h1>' +
      '<p class="h5-summary">' +
      escapeHtml(message) +
      '</p></header></div>'
  }

  function loadServiceItemCases() {
    var slug = parseSlug()
    if (!slug) {
      renderNotFound('服务项目链接无效')
      return
    }

    var qs = ['page=' + encodeURIComponent(String(parsePage()))]
    var city = parseQueryParam('city')
    var storeId = parseQueryParam('storeId')
    if (city) qs.push('city=' + encodeURIComponent(city))
    if (storeId) qs.push('storeId=' + encodeURIComponent(storeId))

    fetch('/api/v1/public/h5/service-items/' + encodeURIComponent(slug) + '/cases?' + qs.join('&'))
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, status: res.status, body: body }
        })
      })
      .then(function (result) {
        if (result.status === 404) {
          renderNotFound(result.body.message || '服务项目不存在或未开放')
          return
        }
        if (!result.ok || result.body.code !== 0 || !result.body.data) {
          throw new Error(result.body.message || '加载失败')
        }
        renderPage(result.body.data)
      })
      .catch(function () {
        renderError('暂时无法加载项目案例列表，请稍后重试。')
      })
  }

  loadServiceItemCases()
})()
