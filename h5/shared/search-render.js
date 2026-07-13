(function () {
  var HISTORY_KEY = 'h5_search_history_v1'
  var HISTORY_MAX = 10
  var KEYWORD_MAX = 30
  var PAGE_SIZE = 20

  var TABS = [
    { key: 'all', label: '全部' },
    { key: 'service', label: '服务' },
    { key: 'merchant', label: '门店' },
    { key: 'case', label: '案例' },
  ]

  var TYPE_LABEL = {
    service: '服务',
    merchant: '门店',
    case: '案例',
    geo: '专题',
  }

  var PRICE_MODE_LABEL = {
    fixed: '一口价',
    range: '参考区间',
    consult: '到店检测',
    accident: '事故车',
  }

  var state = {
    keyword: '',
    tab: 'all',
    page: 1,
    status: 'idle',
    config: null,
    results: null,
    suggest: [],
    suggestVisible: false,
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function readParams() {
    var params = new URLSearchParams(location.search)
    return {
      keyword: String(params.get('q') || params.get('keyword') || '').trim().slice(0, KEYWORD_MAX),
      tab: params.get('tab') || 'all',
    }
  }

  function buildSearchUrl(keyword, tab) {
    var params = new URLSearchParams()
    if (keyword) params.set('q', keyword)
    if (tab && tab !== 'all') params.set('tab', tab)
    var qs = params.toString()
    return '/search/' + (qs ? '?' + qs : '')
  }

  function replaceUrl(keyword, tab) {
    var next = buildSearchUrl(keyword, tab)
    if (location.pathname + location.search !== next) {
      history.replaceState(null, '', next)
    }
  }

  function loadHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY)
      var list = raw ? JSON.parse(raw) : []
      return Array.isArray(list) ? list.filter(Boolean).slice(0, HISTORY_MAX) : []
    } catch (e) {
      return []
    }
  }

  function saveHistory(keyword) {
    var k = String(keyword || '').trim()
    if (!k) return
    var list = loadHistory().filter(function (item) {
      return item !== k
    })
    list.unshift(k)
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)))
    } catch (e) {
      /* ignore */
    }
  }

  function clearHistory() {
    try {
      localStorage.removeItem(HISTORY_KEY)
    } catch (e) {
      /* ignore */
    }
  }

  function caseHref(item) {
    if (item && item.slug) return '/case/' + encodeURIComponent(item.slug) + '.html'
    return '/case/view.html?id=' + encodeURIComponent(item.id)
  }

  function storeHref(id) {
    return '/store/' + encodeURIComponent(id) + '.html'
  }

  function serviceHref(id) {
    return '/service/' + encodeURIComponent(id) + '.html'
  }

  function geoHref(item) {
    if (item.h5Path && item.h5Path.indexOf('/service/') === 0) return item.h5Path
    return ''
  }

  function formatServicePrice(item) {
    if (!item) return ''
    if (item.priceMode === 'fixed' && item.amount != null) return '¥' + item.amount
    if (item.priceMode === 'range' && (item.minAmount != null || item.maxAmount != null)) {
      return '¥' + (item.minAmount || '') + '–' + (item.maxAmount || '')
    }
    return PRICE_MODE_LABEL[item.priceMode] || ''
  }

  function applySeo(keyword) {
    if (!window.zhejianSeo) return
    if (keyword) {
      window.zhejianSeo.applyPageSeo({
        title: '搜索「' + keyword + '」· 辙见',
        description: '在辙见内容站搜索公开案例、门店、服务与维修专题。',
        canonicalPath: '/search/',
        robots: 'noindex,follow',
      })
    } else {
      window.zhejianSeo.applyPageSeo({
        title: '搜索 · 辙见',
        description: '在辙见内容站搜索公开案例、门店、服务与维修专题。',
        canonicalPath: '/search/',
        robots: 'index,follow',
      })
    }
    window.zhejianSeo.applyBreadcrumbSchema(
      [
        { label: '辙见', href: '/' },
        { label: '搜索' },
      ],
      'search-breadcrumb'
    )
  }

  function renderBreadcrumb() {
    if (window.zhejianSeo) {
      return window.zhejianSeo.renderBreadcrumbHtml([
        { label: '辙见', href: '/' },
        { label: '搜索' },
      ])
    }
    return ''
  }

  function renderSiteNav() {
    if (window.zhejianSiteNav && window.zhejianSiteNav.render) {
      return window.zhejianSiteNav.render()
    }
    return ''
  }

  function renderChips(items, className) {
    if (!items || !items.length) return ''
    return items
      .map(function (text) {
        return (
          '<button type="button" class="' +
          className +
          '" data-keyword="' +
          escapeHtml(text) +
          '">' +
          escapeHtml(text) +
          '</button>'
        )
      })
      .join('')
  }

  function renderHistory() {
    var history = loadHistory()
    if (!history.length) return ''
    return (
      '<div class="h5-card">' +
      '<div class="h5-search-history-head">' +
      '<h2 class="h5-section-title">最近搜索</h2>' +
      '<button type="button" class="h5-search-clear" data-action="clear-history">清空</button>' +
      '</div>' +
      '<div class="h5-search-chips">' +
      renderChips(history, 'h5-search-chip') +
      '</div></div>'
    )
  }

  function renderHotwords(hotwords) {
    if (!hotwords || !hotwords.length) return ''
    return (
      '<div class="h5-card">' +
      '<h2 class="h5-section-title">热门搜索</h2>' +
      '<div class="h5-search-chips">' +
      renderChips(hotwords, 'h5-search-chip') +
      '</div></div>'
    )
  }

  function renderSuggest() {
    if (!state.suggestVisible || !state.suggest.length) return ''
    var items = state.suggest
      .map(function (item) {
        return (
          '<button type="button" class="h5-search-suggest-item" data-suggest-keyword="' +
          escapeHtml(item.keyword) +
          '">' +
          escapeHtml(item.keyword) +
          '<span class="h5-search-suggest-type">' +
          escapeHtml(item.typeLabel || TYPE_LABEL[item.type] || '') +
          '</span></button>'
        )
      })
      .join('')
    return '<div class="h5-search-suggest">' + items + '</div>'
  }

  function searchTagClass(type) {
    if (type === '服务') return 'h5-tag--reference'
    if (type === '案例') return 'h5-tag--audited'
    return 'h5-tag--info'
  }

  function renderTypedMediaItem(options) {
    options = options || {}
    var thumb =
      options.thumbHtml ||
      '<div class="h5-media-list-thumb h5-media-list-thumb--placeholder">' +
        escapeHtml(options.placeholder || options.type || '内容') +
        '</div>'
    var tag = options.type
      ? '<span class="h5-tag ' +
        searchTagClass(options.type) +
        ' h5-search-result-tag">' +
        escapeHtml(options.type) +
        '</span>'
      : ''
    return (
      '<a class="h5-media-list-item h5-search-result-item" href="' +
      escapeHtml(options.href || '#') +
      '">' +
      thumb +
      '<div class="h5-media-list-body">' +
      tag +
      '<div class="h5-media-list-title">' +
      escapeHtml(options.title || '') +
      '</div>' +
      (options.summary
        ? '<div class="h5-media-list-summary">' + escapeHtml(options.summary) + '</div>'
        : '') +
      (options.meta
        ? '<div class="h5-media-list-meta">' + escapeHtml(options.meta) + '</div>'
        : '') +
      '</div></a>'
    )
  }

  function renderSectionHeader(title, count) {
    return (
      '<div class="h5-search-section-title">' +
      '<h2 class="h5-section-title">' +
      escapeHtml(title) +
      '</h2>' +
      (count != null
        ? '<span class="h5-search-count">' + count + ' 条</span>'
        : '') +
      '</div>'
    )
  }

  function renderGeoList(geoPages) {
    if (!geoPages || !geoPages.length) return ''
    var ui = window.zhejianH5Ui
    var items = geoPages
      .filter(function (item) {
        return geoHref(item)
      })
      .map(function (item) {
        if (ui && ui.renderEntryCard) {
          return ui.renderEntryCard({
            href: geoHref(item),
            name: item.title,
            summary: item.summary || '阅读专题说明与相关案例',
          })
        }
        return renderTypedMediaItem({
          href: geoHref(item),
          type: '专题',
          title: item.title,
          summary: item.summary || '',
          placeholder: '专题',
        })
      })
      .join('')
    return (
      '<div class="h5-search-section">' +
      renderSectionHeader('维修专题', geoPages.length) +
      '<div class="h5-entry-list">' +
      items +
      '</div></div>'
    )
  }

  function renderServiceList(services) {
    if (!services || !services.length) return ''
    var ui = window.zhejianH5Ui
    var items = services
      .map(function (item) {
        if (ui && ui.renderServiceListItem) {
          var html = ui.renderServiceListItem(item, { href: serviceHref(item.id) })
          return html.replace(
            '<div class="h5-media-list-body">',
            '<div class="h5-media-list-body"><span class="h5-tag h5-tag--reference h5-search-result-tag">服务</span>'
          )
        }
        var meta = [item.storeName, formatServicePrice(item), item.categoryName]
          .filter(Boolean)
          .join(' · ')
        return renderTypedMediaItem({
          href: serviceHref(item.id),
          type: '服务',
          title: item.name,
          summary: item.summary || '',
          meta: meta,
          placeholder: '服务',
        })
      })
      .join('')
    return (
      '<div class="h5-search-section">' +
      renderSectionHeader('服务', services.length) +
      '<div class="h5-media-list">' +
      items +
      '</div></div>'
    )
  }

  function renderMerchantList(merchants) {
    if (!merchants || !merchants.length) return ''
    var ui = window.zhejianH5Ui
    var items = merchants
      .map(function (item) {
        if (ui && ui.renderStoreListItem) {
          var html = ui.renderStoreListItem(item, { href: storeHref(item.id) })
          return html.replace(
            '<div class="h5-media-list-body">',
            '<div class="h5-media-list-body"><span class="h5-tag h5-tag--info h5-search-result-tag">门店</span>'
          )
        }
        var meta = [item.address, item.caseCount ? '公开案例 ' + item.caseCount : '']
          .filter(Boolean)
          .join(' · ')
        return renderTypedMediaItem({
          href: storeHref(item.id),
          type: '门店',
          title: item.name,
          meta: meta,
          placeholder: '门店',
        })
      })
      .join('')
    return (
      '<div class="h5-search-section">' +
      renderSectionHeader('门店', merchants.length) +
      '<div class="h5-media-list">' +
      items +
      '</div></div>'
    )
  }

  function renderCaseList(cases) {
    if (!cases || !cases.length) return ''
    var items = cases
      .map(function (item) {
        if (window.zhejianH5Ui && window.zhejianH5Ui.renderCaseListItem) {
          var html = window.zhejianH5Ui.renderCaseListItem(item, { href: caseHref(item) })
          return html.replace(
            '<div class="h5-media-list-body">',
            '<div class="h5-media-list-body"><span class="h5-tag h5-tag--audited h5-search-result-tag">案例</span>'
          )
        }
        var meta = [item.city, item.storeName, item.serviceName].filter(Boolean).join(' · ')
        return renderTypedMediaItem({
          href: caseHref(item),
          type: '案例',
          title: item.title || item.serviceName || '公开案例',
          summary: item.summary || item.aiSummary || '',
          meta: meta,
          placeholder: '案例',
        })
      })
      .join('')
    return (
      '<div class="h5-search-section">' +
      renderSectionHeader('案例', cases.length) +
      '<div class="h5-media-list">' +
      items +
      '</div></div>'
    )
  }

  function renderTabs(activeTab, counts) {
    counts = counts || {}
    return TABS.map(function (tab) {
      var count = 0
      if (tab.key === 'all') {
        count =
          (counts.service || 0) + (counts.merchant || 0) + (counts.case || 0) + (counts.geo || 0)
      } else if (tab.key === 'service') count = counts.service || 0
      else if (tab.key === 'merchant') count = counts.merchant || 0
      else if (tab.key === 'case') count = counts.case || 0
      var label = tab.label + (count ? ' ' + count : '')
      return (
        '<button type="button" class="h5-search-tab' +
        (activeTab === tab.key ? ' h5-search-tab--active' : '') +
        '" data-tab="' +
        tab.key +
        '">' +
        escapeHtml(label) +
        '</button>'
      )
    }).join('')
  }

  function renderResults(data) {
    if (!data) return ''
    var counts = data.counts || {}
    var sections = ''

    if (state.tab === 'all') {
      sections += renderGeoList(data.geoPages)
      sections += renderServiceList(data.services)
      sections += renderMerchantList(data.merchants)
      sections += renderCaseList(data.cases)
    } else if (state.tab === 'service') {
      sections += renderServiceList(data.list && data.list.length ? data.list : data.services)
    } else if (state.tab === 'merchant') {
      sections += renderMerchantList(data.list && data.list.length ? data.list : data.merchants)
    } else if (state.tab === 'case') {
      sections += renderCaseList(data.list && data.list.length ? data.list : data.cases)
    }

    if (!sections) {
      sections =
        '<div class="h5-search-empty">' +
        '<p>未找到与「' +
        escapeHtml(state.keyword) +
        '」相关的内容</p>' +
        '<p class="h5-search-hint">试试更短的关键词，或浏览<a class="h5-link" href="/case/">公开案例</a>、<a class="h5-link" href="/store/">公开门店</a></p>' +
        '</div>'
    }

    var more = ''
    if (data.hasMore && state.tab !== 'all') {
      more =
        '<div class="h5-search-more">' +
        '<button type="button" class="h5-search-more-btn" data-action="load-more">加载更多</button>' +
        '</div>'
    }

    return (
      '<div class="h5-card">' +
      '<div class="h5-search-tabs">' +
      renderTabs(state.tab, counts) +
      '</div>' +
      sections +
      more +
      '<p class="h5-compliance">公开内容经审核，价格仅为参考，不构成平台对维修质量或价格的担保。</p>' +
      '</div>'
    )
  }

  function renderShell(bodyHtml) {
    applySeo(state.keyword)
    var app = document.getElementById('app')
    if (!app) return
    app.innerHTML =
      '<div class="h5-page">' +
      renderBreadcrumb() +
      '<header class="h5-header">' +
      '<div class="h5-brand">辙见内容站</div>' +
      '<h1 class="h5-title">搜索</h1>' +
      '<p class="h5-summary">搜索公开案例、门店、服务与维修专题（小程序内不提供全站搜索）。</p>' +
      '</header>' +
      '<form class="h5-search-form" id="h5-search-form">' +
      '<input class="h5-search-input" id="h5-search-input" name="q" maxlength="' +
      KEYWORD_MAX +
      '" placeholder="搜索服务、门店、故障或案例" value="' +
      escapeHtml(state.keyword) +
      '" autocomplete="off" />' +
      '<button type="submit" class="h5-search-submit">搜索</button>' +
      '</form>' +
      renderSuggest() +
      bodyHtml +
      renderSiteNav() +
      '</div>'
    bindEvents()
  }

  var suggestTimer = null
  function queueSuggest(keyword) {
    clearTimeout(suggestTimer)
    suggestTimer = setTimeout(function () {
      fetchSuggest(keyword)
    }, 200)
  }

  function refreshSuggestOnly() {
    var form = document.getElementById('h5-search-form')
    if (!form) return
    var existing = document.querySelector('.h5-search-suggest')
    var html = renderSuggest()
    if (existing) {
      if (html) existing.outerHTML = html
      else existing.parentNode.removeChild(existing)
    } else if (html) {
      form.insertAdjacentHTML('afterend', html)
    }
  }

  var eventsBound = false
  function bindEvents() {
    if (!eventsBound) {
      eventsBound = true
      var app = document.getElementById('app')
      if (app) {
        app.addEventListener('click', function (e) {
          var target = e.target
          if (!target) return

          if (target.id === 'h5-search-input') return

          var suggestItem = target.closest('.h5-search-suggest-item')
          if (suggestItem) {
            submitSearch(suggestItem.getAttribute('data-suggest-keyword') || '')
            return
          }

          if (target.closest('.h5-search-suggest')) return

          if (state.suggestVisible) {
            state.suggestVisible = false
            refreshSuggestOnly()
          }

          var chip = target.closest('.h5-search-chip')
          if (chip) {
            submitSearch(chip.getAttribute('data-keyword') || '')
            return
          }

          var tabBtn = target.closest('.h5-search-tab')
          if (tabBtn) {
            var tab = tabBtn.getAttribute('data-tab') || 'all'
            if (tab !== state.tab) {
              state.tab = tab
              state.page = 1
              replaceUrl(state.keyword, state.tab)
              fetchResults(false)
            }
            return
          }

          if (target.closest('[data-action="clear-history"]')) {
            clearHistory()
            renderIdle()
            return
          }

          if (target.closest('[data-action="load-more"]')) {
            state.page += 1
            fetchResults(true)
          }
        })
      }

      document.addEventListener(
        'submit',
        function (e) {
          var form = e.target
          if (!form || form.id !== 'h5-search-form') return
          e.preventDefault()
          var input = document.getElementById('h5-search-input')
          submitSearch(input ? input.value : '')
        },
        true
      )

      document.addEventListener(
        'input',
        function (e) {
          if (e.target && e.target.id === 'h5-search-input') {
            queueSuggest(e.target.value)
          }
        },
        true
      )

      document.addEventListener(
        'focusin',
        function (e) {
          if (e.target && e.target.id === 'h5-search-input' && state.suggest.length) {
            state.suggestVisible = true
            refreshSuggestOnly()
          }
        },
        true
      )
    }
  }

  function fetchSuggest(keyword) {
    var k = String(keyword || '').trim()
    if (!k) {
      state.suggest = []
      state.suggestVisible = false
      refreshSuggestOnly()
      return
    }
    fetch('/api/v1/public/h5/search/suggest?keyword=' + encodeURIComponent(k))
      .then(function (res) {
        return res.json()
      })
      .then(function (body) {
        if (body.code !== 0) throw new Error('suggest failed')
        state.suggest = body.data || []
        state.suggestVisible = state.suggest.length > 0
        refreshSuggestOnly()
      })
      .catch(function () {
        state.suggest = []
        state.suggestVisible = false
        refreshSuggestOnly()
      })
  }

  function submitSearch(keyword) {
    var k = String(keyword || '').trim().slice(0, KEYWORD_MAX)
    state.keyword = k
    state.tab = 'all'
    state.page = 1
    state.suggest = []
    state.suggestVisible = false
    replaceUrl(k, state.tab)
    if (k) saveHistory(k)
    if (window.zhejianTrack) {
      window.zhejianTrack.track('h5_search_submit', {
        keyword: k,
        pageType: 'search',
      })
    }
    fetchResults(false)
  }

  function fetchResults(append) {
    if (!state.keyword) {
      renderIdle()
      return
    }

    if (!append) {
      renderShell('<div class="h5-search-loading">搜索中…</div>')
    }

    var url =
      '/api/v1/public/h5/search?keyword=' +
      encodeURIComponent(state.keyword) +
      '&tab=' +
      encodeURIComponent(state.tab) +
      '&page=' +
      state.page +
      '&pageSize=' +
      PAGE_SIZE

    fetch(url)
      .then(function (res) {
        return res.json()
      })
      .then(function (body) {
        if (body.code !== 0 || !body.data) throw new Error('search failed')
        if (append && state.results && state.tab !== 'all') {
          var prevList = state.results.list || []
          var nextList = body.data.list || []
          body.data.list = prevList.concat(nextList)
        }
        state.results = body.data
        state.status = 'ready'
        renderShell(renderResults(state.results))
        if (window.zhejianTrack) {
          window.zhejianTrack.trackPageView('h5_page_view', {
            pageType: 'search_result',
            keyword: state.keyword,
            tab: state.tab,
          })
        }
      })
      .catch(function () {
        renderShell(
          '<div class="h5-card h5-search-empty"><p>搜索暂时不可用，请稍后重试。</p><p class="h5-search-hint"><a class="h5-link" href="/case/">浏览公开案例</a></p></div>'
        )
      })
  }

  function renderIdle() {
    state.status = 'idle'
    state.results = null
    var hotwords = (state.config && state.config.hotwords) || []
    renderShell(renderHistory() + renderHotwords(hotwords))
  }

  function loadConfig() {
    fetch('/api/v1/public/h5/search/config')
      .then(function (res) {
        return res.json()
      })
      .then(function (body) {
        if (body.code !== 0) throw new Error('config failed')
        state.config = body.data || {}
        bootstrap()
      })
      .catch(function () {
        state.config = { hotwords: [] }
        bootstrap()
      })
  }

  function bootstrap() {
    var params = readParams()
    state.keyword = params.keyword
    state.tab = TABS.some(function (t) {
      return t.key === params.tab
    })
      ? params.tab
      : 'all'
    if (state.keyword) {
      fetchResults(false)
    } else {
      renderIdle()
    }
  }

  loadConfig()
})()
