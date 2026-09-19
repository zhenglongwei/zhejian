;(function () {
  function parseTopicSlug() {
    var match = location.pathname.match(/\/topic\/([a-z0-9-]+)\/?$/i)
    if (match) return decodeURIComponent(match[1]).trim()
    return ''
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function showNotFound(message) {
    document.title = '专题不存在 · 辙见'
    var app = document.getElementById('app')
    if (!app) return
    app.innerHTML =
      '<div class="h5-page"><header class="h5-header"><h1 class="h5-title">未找到该专题</h1>' +
      '<p class="h5-summary">' +
      escapeHtml(message || '请从案例页或首页进入。') +
      '</p></header>' +
      '<div class="h5-home-quick"><a class="h5-btn" href="/">返回首页</a>' +
      '<a class="h5-btn h5-btn--secondary" href="/case/" style="margin-left:8px">浏览公开案例</a></div>' +
      renderFooter() +
      '</div>'
  }

  function renderFooter() {
    if (window.zhejianSiteNav && window.zhejianSiteNav.render) {
      return window.zhejianSiteNav.render()
    }
    return ''
  }

  function caseHref(item) {
    if (item && item.slug) return '/case/' + encodeURIComponent(item.slug) + '.html'
    return '/case/view.html?id=' + encodeURIComponent((item && item.id) || '')
  }

  function renderFaq(faq) {
    var rows = (faq || []).filter(function (row) {
      return row && row.q && row.a
    })
    if (!rows.length) return ''
    var items = rows
      .map(function (row) {
        var sources = (row.sourceCases || []).filter(function (item) {
          return item && (item.slug || item.id)
        })
        var sourceHtml = ''
        if (sources.length) {
          sourceHtml =
            '<div class="h5-faq-sources">' +
            sources
              .map(function (item) {
                return (
                  '<a class="h5-faq-source" href="' +
                  escapeHtml(caseHref(item)) +
                  '">' +
                  escapeHtml(item.title || '公开档案') +
                  '</a>'
                )
              })
              .join('') +
            '</div>'
        }
        return (
          '<div class="h5-faq-item"><div class="h5-faq-q">' +
          escapeHtml(row.q) +
          '</div><div class="h5-faq-a">' +
          escapeHtml(row.a) +
          '</div>' +
          sourceHtml +
          '</div>'
        )
      })
      .join('')
    return (
      '<div class="h5-card" id="topic-faq"><h2 class="h5-section-title">常见问法</h2>' +
      items +
      '</div>'
    )
  }

  function renderEvidenceNotes(notes) {
    var rows = (notes || []).filter(Boolean)
    if (!rows.length) return ''
    return (
      '<div class="h5-card" id="topic-evidence">' +
      '<ul class="h5-evidence-notes">' +
      rows
        .map(function (line) {
          return '<li>' + escapeHtml(line) + '</li>'
        })
        .join('') +
      '</ul></div>'
    )
  }

  function renderCaseList(cases) {
    if (!cases || !cases.length) {
      return '<div class="h5-empty-block" id="topic-case-list">暂无符合筛选的公开案例。</div>'
    }
    var ui = window.zhejianH5Ui
    var cards = cases
      .map(function (item) {
        if (ui && ui.renderCaseListItem) {
          return ui.renderCaseListItem(item, { href: caseHref(item) })
        }
        return (
          '<a class="h5-media-list-item" href="' +
          escapeHtml(caseHref(item)) +
          '"><div class="h5-media-list-body"><div class="h5-media-list-title">' +
          escapeHtml(item.title || item.serviceName || '公开案例') +
          '</div></div></a>'
        )
      })
      .join('')
    return '<div class="h5-media-list" id="topic-case-list">' + cards + '</div>'
  }

  function sortCases(list, mode) {
    var rows = (list || []).slice()
    if (mode === 'newest') {
      rows.sort(function (a, b) {
        return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''))
      })
    } else if (mode === 'cases') {
      rows.sort(function (a, b) {
        return (b.viewCount || 0) - (a.viewCount || 0)
      })
    }
    return rows
  }

  function applyState(allCases, selected, sortValue) {
    var fs = window.zhejianFilterSort
    var filtered = (allCases || []).filter(function (row) {
      return !fs || fs.matchFilters(row, selected)
    })
    return sortCases(filtered, sortValue)
  }

  function setPageMeta(data) {
    var topic = data.topic || {}
    var seo = data.seo || {}
    document.title = seo.title || topic.title || '专题 · 辙见'
    if (window.zhejianSeo && window.zhejianSeo.applyBasicMeta) {
      window.zhejianSeo.applyBasicMeta({
        title: document.title,
        description: seo.description || topic.aiSummary || topic.summary || '',
        canonicalPath: seo.canonicalPath || '/topic/' + topic.slug,
        robots: seo.robots || 'index,follow',
      })
    }
  }

  function renderPage(data) {
    var topic = data.topic || {}
    var allCases = data.relatedCases || []
    var selected = { city: '', vehicle: '', age: '', distance: '' }
    var sortValue = 'recommend'
    var sorts = data.sortOptions && data.sortOptions.length
      ? data.sortOptions
      : [
          { value: 'recommend', label: '综合推荐' },
          { value: 'newest', label: '最新发布' },
          { value: 'cases', label: '浏览较多' },
        ]
    var fs = window.zhejianFilterSort
    var filters = fs ? fs.defaultFiltersFromCases(allCases) : []
    var summary = topic.aiSummary || topic.summary || ''

    function paint() {
      var visible = applyState(allCases, selected, sortValue)
      var listHost = document.getElementById('topic-case-list')
      if (listHost) {
        var wrap = document.createElement('div')
        wrap.innerHTML = renderCaseList(visible)
        var next = wrap.firstChild
        if (next) listHost.replaceWith(next)
      }
      var barHost = document.getElementById('topic-toolbar')
      if (barHost && fs) {
        var barWrap = document.createElement('div')
        barWrap.innerHTML = fs.render({
          id: 'topic-toolbar',
          filters: filters,
          sorts: sorts,
          selected: selected,
          sortValue: sortValue,
        })
        var nextBar = barWrap.firstChild
        if (nextBar) {
          barHost.replaceWith(nextBar)
          fs.bind(document.getElementById('topic-toolbar'), {
            onFilter: function (key, value) {
              selected[key] = value
              paint()
            },
            onSort: function (value) {
              sortValue = value || 'recommend'
              paint()
            },
          })
        }
      }
    }

    var app = document.getElementById('app')
    if (!app) return
    setPageMeta(data)
    app.innerHTML =
      '<div class="h5-page">' +
      (window.zhejianSeo
        ? window.zhejianSeo.renderBreadcrumbHtml([
            { label: '辙见', href: '/' },
            { label: '公开案例', href: '/case/' },
            { label: topic.displayName || topic.title || '专题' },
          ])
        : '') +
      '<header class="h5-header h5-topic-header">' +
      '<h1 class="h5-title">' +
      escapeHtml(topic.displayName || topic.title || '专题') +
      '</h1>' +
      (summary ? '<p class="h5-summary">' + escapeHtml(summary) + '</p>' : '') +
      '</header>' +
      renderFaq(data.faq) +
      renderEvidenceNotes(data.evidenceNotes) +
      (fs
        ? fs.render({
            id: 'topic-toolbar',
            filters: filters,
            sorts: sorts,
            selected: selected,
            sortValue: sortValue,
          })
        : '') +
      renderCaseList(applyState(allCases, selected, sortValue)) +
      renderFooter() +
      '</div>'

    if (fs) {
      fs.bind(document.getElementById('topic-toolbar'), {
        onFilter: function (key, value) {
          selected[key] = value
          paint()
        },
        onSort: function (value) {
          sortValue = value || 'recommend'
          paint()
        },
      })
    }
  }

  function boot() {
    var slug = parseTopicSlug()
    if (!slug) {
      showNotFound('链接无效')
      return
    }
    fetch('/api/v1/public/h5/topics/' + encodeURIComponent(slug))
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body }
        })
      })
      .then(function (result) {
        if (!result.ok || !result.body || !result.body.data || !result.body.data.topic) {
          showNotFound((result.body && result.body.message) || '未找到该专题')
          return
        }
        renderPage(result.body.data)
      })
      .catch(function () {
        showNotFound('暂时无法打开专题')
      })
  }

  boot()
})()
