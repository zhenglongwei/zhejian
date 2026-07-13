(function () {
  var PC = (window.zhejianPublicCopy && window.zhejianPublicCopy.H5) || {}
  var COPY = {
    casePrice:
      PC.casePrice ||
      '车主授权公示的案例展示当时方案报价；其余案例价格为系统参考区间，实际费用以门店检测为准。',
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function parseStoreId() {
    if (window.__STORE_ID__) return String(window.__STORE_ID__).trim()
    var match = location.pathname.match(/\/store\/([^/]+)\/cases\/?$/i)
    if (match && match[1] !== 'view' && match[1] !== 'index' && match[1] !== 'cases') {
      return decodeURIComponent(match[1]).trim()
    }
    var params = new URLSearchParams(location.search)
    return String(params.get('storeId') || params.get('id') || '').trim()
  }

  function parsePage() {
    var params = new URLSearchParams(location.search)
    var page = parseInt(String(params.get('page') || '1'), 10)
    return page > 0 ? page : 1
  }

  function parseServiceName() {
    return String(new URLSearchParams(location.search).get('serviceName') || '').trim()
  }

  function storePagePath(storeId) {
    return '/store/' + encodeURIComponent(storeId) + '.html'
  }

  function storeCasesPagePath(storeId, opts) {
    opts = opts || {}
    var qs = []
    if (opts.page && opts.page > 1) qs.push('page=' + encodeURIComponent(String(opts.page)))
    if (opts.serviceName) qs.push('serviceName=' + encodeURIComponent(opts.serviceName))
    var base = '/store/' + encodeURIComponent(storeId) + '/cases'
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

  function isDesensitizedUrl(url) {
    if (!url) return false
    var value = String(url)
    if (value.indexOf('mock://desensitized/') === 0) return true
    if (value.indexOf('/files/uploads/desensitized/') !== -1) return true
    if (value.indexOf('/media/files/uploads/desensitized/') !== -1) return true
    return false
  }

  function pickCaseCover(data) {
    if (data.coverImageDesensitized && isDesensitizedUrl(data.coverImageDesensitized)) {
      return data.coverImageDesensitized
    }
    if (data.coverImage && isDesensitizedUrl(data.coverImage)) {
      return data.coverImage
    }
    return ''
  }

  function resolveFixedAmount(data) {
    if (data.amount != null && data.amount !== '') {
      var amount = Number(data.amount)
      if (Number.isFinite(amount)) return amount
    }
    var min = data.minAmount != null ? Number(data.minAmount) : null
    var max = data.maxAmount != null ? Number(data.maxAmount) : null
    if (min != null && max != null && min === max) return min
    if (data.priceMode === 'fixed' && data.planAmount != null && data.planAmount !== '') {
      var plan = Number(data.planAmount)
      if (Number.isFinite(plan)) return plan
    }
    return null
  }

  function stripPriceSuffix(text) {
    return String(text || '')
      .replace(/\s*起\s*$/u, '')
      .trim()
  }

  function buildPriceDisplay(data) {
    var mode = data.priceMode || 'range'
    var currency = '¥'
    var fixedAmount = resolveFixedAmount(data)
    var isAuthorized =
      data.authorizationTier === 'named' || data.authorizationTier === 'anonymous'

    if (mode === 'accident') return { priceText: '预约到店检测后报价' }
    if (fixedAmount != null && (mode === 'fixed' || isAuthorized)) {
      return { priceText: currency + fixedAmount }
    }
    if (mode === 'consult') return { priceText: '到店检测后报价' }
    if (data.minAmount != null && data.maxAmount != null) {
      return {
        priceText:
          '参考区间 ' + currency + data.minAmount + ' - ' + currency + data.maxAmount,
      }
    }
    return { priceText: stripPriceSuffix(data.priceText || '到店检测后报价') }
  }

  function setPageMeta(data) {
    var seo = data.seo || {}
    var store = data.store || {}
    var crumbs = [
      { label: '辙见', href: '/' },
      { label: '公开门店', href: '/store/' },
      { label: store.name || '门店', href: store.id ? storePagePath(store.id) : '' },
      { label: '维修案例' },
    ]
    if (window.zhejianSeo) {
      window.zhejianSeo.applyPageSeo({
        title: seo.title || '门店维修案例 · 辙见',
        description: seo.description || '查看门店公开维修案例。',
        canonicalPath: seo.canonicalPath || location.pathname,
        robots: seo.robots || 'index,follow',
        prevPath: seo.prevPath,
        nextPath: seo.nextPath,
      })
      window.zhejianSeo.applyBreadcrumbSchema(crumbs, 'store-cases-breadcrumb')
      return
    }
    var title = seo.title || '门店维修案例 · 辙见'
    var desc = seo.description || '查看门店公开维修案例。'
    var canonical = location.origin + (seo.canonicalPath || location.pathname)
    document.title = title
    ensureMeta('name', 'description', desc)
    ensureMeta('name', 'robots', seo.robots || 'index,follow')
    ensureMeta('property', 'og:title', title)
    ensureMeta('property', 'og:description', desc)
    ensureMeta('property', 'og:url', canonical)
    ensureLink('canonical', canonical)
  }

  function renderFilters(storeId, filters) {
    if (!filters || !filters.serviceNames || !filters.serviceNames.length) return ''
    var active = filters.activeServiceName || ''
    var chips = [
      '<a class="h5-filter-chip' +
        (active ? '' : ' h5-filter-chip--active') +
        '" href="' +
        storeCasesPagePath(storeId, { page: 1 }) +
        '">全部</a>',
    ]
    filters.serviceNames.forEach(function (name) {
      chips.push(
        '<a class="h5-filter-chip' +
          (active === name ? ' h5-filter-chip--active' : '') +
          '" href="' +
          storeCasesPagePath(storeId, { page: 1, serviceName: name }) +
          '">' +
          escapeHtml(name) +
          '</a>'
      )
    })
    return (
      '<div class="h5-card"><h2 class="h5-section-title">按服务项目筛选</h2>' +
      '<div class="h5-filter-row">' +
      chips.join('') +
      '</div></div>'
    )
  }

  function renderCaseCards(cases) {
    if (!cases || !cases.length) {
      return '<div class="h5-card"><div class="h5-empty-block">该门店暂无符合条件的公开案例</div></div>'
    }
    var cards = cases
      .map(function (item) {
        if (window.zhejianH5Ui && window.zhejianH5Ui.renderCaseListItem) {
          return window.zhejianH5Ui.renderCaseListItem(item, {
            href: casePagePath(item),
            extraAttrs:
              ' data-case-id="' + escapeHtml(item.id) + '"',
          })
        }
        var cover = pickCaseCover(item)
        var price = buildPriceDisplay(item)
        var coverHtml = cover
          ? '<img class="h5-media-list-thumb" src="' +
            escapeHtml(cover) +
            '" alt="案例封面" loading="lazy" />'
          : '<div class="h5-media-list-thumb h5-media-list-thumb--placeholder">案例</div>'
        return (
          '<a class="h5-media-list-item" href="' +
          casePagePath(item) +
          '" data-case-id="' +
          escapeHtml(item.id) +
          '">' +
          coverHtml +
          '<div class="h5-media-list-body">' +
          '<div class="h5-media-list-title">' +
          escapeHtml(item.title || item.serviceName || '公开案例') +
          '</div>' +
          '<div class="h5-media-list-meta">' +
          escapeHtml(stripPriceSuffix(price.priceText)) +
          '</div></div></a>'
        )
      })
      .join('')
    return '<div class="h5-media-list">' + cards + '</div>'
  }

  function renderPagination(storeId, pagination, filters) {
    if (!pagination || pagination.totalPages <= 1) return ''
    var activeService = (filters && filters.activeServiceName) || ''
    var page = pagination.page || 1
    var parts = []
    if (page > 1) {
      parts.push(
        '<a class="h5-btn h5-btn--secondary h5-pagination-btn" href="' +
          storeCasesPagePath(storeId, {
            page: page - 1,
            serviceName: activeService,
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
          storeCasesPagePath(storeId, {
            page: page + 1,
            serviceName: activeService,
          }) +
          '">下一页</a>'
      )
    }
    return '<div class="h5-pagination">' + parts.join('') + '</div>'
  }

  function bindInteractions(store) {
    document.querySelectorAll('.h5-media-list-item[data-case-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_store_case_click', {
            storeId: store.id,
            caseId: el.getAttribute('data-case-id') || '',
            pageType: 'store_cases',
          })
        }
      })
    })
  }

  function renderSiteNav() {
    if (window.zhejianSiteNav && window.zhejianSiteNav.render) {
      return window.zhejianSiteNav.render()
    }
    return ''
  }

  function renderPage(data) {
    var store = data.store
    var pagination = data.pagination || {}
    setPageMeta(data)

    var html =
      '<div class="h5-page">' +
      (window.zhejianSeo
        ? window.zhejianSeo.renderBreadcrumbHtml([
            { label: '辙见', href: '/' },
            { label: '公开门店', href: '/store/' },
            { label: store.name, href: storePagePath(store.id) },
            { label: '维修案例' },
          ])
        : '<nav class="h5-breadcrumb"><a href="/">辙见</a> › <a href="/store/">公开门店</a> › <a href="' +
          storePagePath(store.id) +
          '">' +
          escapeHtml(store.name) +
          '</a> › 维修案例</nav>') +
      '<header class="h5-header">' +
      '<div class="h5-brand">辙见服务平台 · 门店案例集</div>' +
      '<h1 class="h5-title">' +
      escapeHtml(store.name) +
      ' · 公开维修案例</h1>' +
      '<p class="h5-summary">' +
      escapeHtml(
        '以下为' +
          store.name +
          '已审核的公开维修案例' +
          (pagination.total ? '（共 ' + pagination.total + ' 条）' : '') +
          '。价格仅为参考，实际费用以门店检测为准。'
      ) +
      '</p>' +
      (window.zhejianH5Ui && window.zhejianH5Ui.renderDisclaimer
        ? window.zhejianH5Ui.renderDisclaimer(
            COPY.casePrice,
            ''
          )
        : '<div class="h5-banner">' +
          escapeHtml(COPY.casePrice) +
          '</div>') +
      '</header>' +
      '<div class="h5-home-quick">' +
      '<a class="h5-btn" href="' +
      storePagePath(store.id) +
      '">返回门店主页</a>' +
      '<a class="h5-btn h5-btn--secondary" href="/case/">全部公开案例</a>' +
      '</div>' +
      renderFilters(store.id, data.filters) +
      '<div class="h5-card"><h2 class="h5-section-title">案例列表</h2>' +
      renderCaseCards(data.cases) +
      '</div>' +
      renderPagination(store.id, pagination, data.filters) +
      renderSiteNav() +
      '<p class="h5-compliance h5-home-footnote">公开内容经审核，不构成平台对维修质量或价格的担保。</p>' +
      '</div>'

    var app = document.getElementById('app')
    if (app) app.innerHTML = html
    if (window.zhejianH5Ui && window.zhejianH5Ui.bindDisclaimerToggles) {
      window.zhejianH5Ui.bindDisclaimerToggles(app)
    }
    bindInteractions(store)

    if (window.zhejianTrack) {
      window.zhejianTrack.trackPageView('h5_store_cases_view', {
        pageType: 'store_cases',
        storeId: store.id,
        storeName: store.name,
        caseCount: pagination.total || 0,
      })
      if (window.zhejianTrack.bindScrollDepth) {
        window.zhejianTrack.bindScrollDepth({
          pageType: 'store_cases',
          storeId: store.id,
        })
      }
    }
  }

  function renderNotFound(message) {
    document.title = '门店案例未找到 · 辙见'
    ensureMeta('name', 'robots', 'noindex,nofollow')
    var app = document.getElementById('app')
    if (!app) return
    app.innerHTML =
      '<div class="h5-page">' +
      '<header class="h5-header">' +
      '<h1 class="h5-title">页面不存在</h1>' +
      '<p class="h5-summary">' +
      escapeHtml(message || '门店不存在或未公开展示。') +
      '</p>' +
      '</header>' +
      '<div class="h5-home-quick">' +
      '<a class="h5-btn" href="/store/">浏览公开门店</a>' +
      '<a class="h5-btn h5-btn--secondary" href="/case/">浏览公开案例</a>' +
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
      '<a class="h5-btn" href="/store/">浏览公开门店</a>' +
      '</div></div>'
  }

  function loadStoreCases() {
    var storeId = parseStoreId()
    if (!storeId) {
      renderNotFound('门店 ID 无效，请检查链接是否完整')
      return
    }

    var page = parsePage()
    var serviceName = parseServiceName()
    var qs = ['page=' + encodeURIComponent(String(page))]
    if (serviceName) qs.push('serviceName=' + encodeURIComponent(serviceName))

    fetch('/api/v1/public/h5/stores/' + encodeURIComponent(storeId) + '/cases?' + qs.join('&'))
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, status: res.status, body: body }
        })
      })
      .then(function (result) {
        if (result.status === 404 || result.status === 410) {
          renderNotFound(result.body.message || '门店不存在或未公开展示')
          return
        }
        if (!result.ok || result.body.code !== 0 || !result.body.data) {
          throw new Error(result.body.message || '加载失败')
        }
        renderPage(result.body.data)
      })
      .catch(function () {
        renderError('暂时无法加载门店案例列表，请稍后重试。')
      })
  }

  loadStoreCases()
})()
