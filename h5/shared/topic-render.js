(function () {
  var FOOTER_TEXT =
    '页面内容用于展示维修服务信息、门店信息和脱敏案例，不构成线上报价或维修承诺。实际维修方案、费用、配件、质保和售后由用户与门店线下确认。'
  var COPY = {
    casePrice:
      '车主授权公示的案例展示当时方案报价；其余案例价格为系统参考区间，实际费用以门店检测为准。',
    caseCompliance:
      '公开展示仅使用脱敏图片，不含车牌、手机号等隐私信息。',
    price: '页面价格为参考范围，实际费用会因车型、配件品牌、损伤程度和门店检测结果不同而变化。',
    accident: '事故车维修无法仅凭线上信息准确报价，需到店检测或拆检后确认方案和费用。',
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function parseTopicSlug() {
    var match = location.pathname.match(/\/topic\/([a-z0-9-]+)\/?$/i)
    if (match) return decodeURIComponent(match[1]).trim()
    var params = new URLSearchParams(location.search)
    return String(params.get('slug') || params.get('id') || '').trim()
  }

  function storePagePath(storeId) {
    return '/store/' + encodeURIComponent(storeId) + '.html'
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

  function injectJsonLd(data) {
    var el = document.getElementById('h5-topic-jsonld')
    if (!el) {
      el = document.createElement('script')
      el.type = 'application/ld+json'
      el.id = 'h5-topic-jsonld'
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(data)
  }

  function setPageMeta(data) {
    var seo = data.seo || {}
    var topic = data.topic || {}
    var title = seo.title || topic.title + ' · 辙见'
    var desc = seo.description || topic.summary || ''
    var canonical = location.origin + (seo.canonicalPath || location.pathname.replace(/\/$/, ''))
    document.title = title
    ensureMeta('name', 'description', desc)
    ensureMeta('name', 'robots', seo.robots || 'index,follow')
    ensureMeta('property', 'og:title', title)
    ensureMeta('property', 'og:description', desc)
    if (topic.coverImage) ensureMeta('property', 'og:image', topic.coverImage)
    ensureMeta('property', 'og:url', canonical)
    ensureLink('canonical', canonical)

    var graph = [
      { '@type': 'WebPage', name: title, description: desc, url: canonical },
      { '@type': 'Article', headline: topic.title, description: topic.summary, url: canonical },
    ]
    if (data.faq && data.faq.length) {
      graph.push({
        '@type': 'FAQPage',
        mainEntity: data.faq.map(function (item) {
          return {
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          }
        }),
      })
    }
    injectJsonLd({ '@context': 'https://schema.org', '@graph': graph })
    if (window.zhejianSeo) {
      var cityHref = topic.city === '杭州' ? '/city/hangzhou' : ''
      var crumbs = [{ label: '辙见', href: '/' }]
      if (cityHref) crumbs.push({ label: topic.city, href: cityHref })
      crumbs.push({ label: 'GEO 专题' })
      crumbs.push({ label: topic.title })
      window.zhejianSeo.applyBreadcrumbSchema(crumbs, 'topic-breadcrumb')
    }
  }

  function renderBulletSection(title, items) {
    if (!items || !items.length) return ''
    var lis = items
      .map(function (text) {
        return '<li>' + escapeHtml(text) + '</li>'
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">' +
      escapeHtml(title) +
      '</h2><ul class="h5-home-intro">' +
      lis +
      '</ul></div>'
    )
  }

  function renderKeyInfo(topic, stats) {
    var rows = [
      { label: '城市', value: topic.city || '—' },
      { label: '专题类型', value: topic.pageTypeLabel || '专题' },
      { label: '相关案例', value: String(stats.caseCount || 0) + ' 条' },
      { label: '相关门店', value: String(stats.storeCount || 0) + ' 家' },
      { label: '更新时间', value: topic.updatedAt || '—' },
    ]
    var html = rows
      .map(function (row) {
        return (
          '<div class="h5-key-row"><span class="h5-key-label">' +
          escapeHtml(row.label) +
          '</span><span class="h5-key-value">' +
          escapeHtml(row.value) +
          '</span></div>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">专题信息</h2><div class="h5-key-table">' +
      html +
      '</div></div>'
    )
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

  function renderCases(cases, topic) {
    var section =
      '<div class="h5-card"><h2 class="h5-section-title">相关案例</h2>' +
      '<p class="h5-compliance">' +
      escapeHtml(COPY.casePrice) +
      '</p>' +
      '<p class="h5-compliance">' +
      escapeHtml(COPY.caseCompliance) +
      '</p>'
    if (!cases || !cases.length) {
      return section + '<div class="h5-empty-block">暂无相关公开案例</div></div>'
    }
    var cards = cases
      .map(function (item) {
        var cover = pickCaseCover(item)
        var coverHtml = cover
          ? '<img class="h5-node-img" src="' +
            escapeHtml(cover) +
            '" alt="' +
            escapeHtml(topic.title + '脱敏案例') +
            '" loading="lazy" />'
          : '<div class="h5-placeholder-img">脱敏封面暂未就绪</div>'
        return (
          '<a class="h5-store-case-card" href="' +
          casePagePath(item) +
          '" data-case-id="' +
          escapeHtml(item.id) +
          '">' +
          coverHtml +
          '<h3 class="h5-store-case-card-title">' +
          escapeHtml(item.title || item.serviceName || '公开案例') +
          '</h3>' +
          '<p class="h5-store-case-card-meta">' +
          escapeHtml([item.city, item.storeName].filter(Boolean).join(' · ')) +
          '</p></a>'
        )
      })
      .join('')
    return section + '<div class="h5-store-case-list">' + cards + '</div></div>'
  }

  function renderStores(stores) {
    if (!stores || !stores.length) {
      return (
        '<div class="h5-card"><h2 class="h5-section-title">相关门店</h2>' +
        '<div class="h5-empty-block">暂无可展示门店</div></div>'
      )
    }
    var items = stores
      .map(function (store) {
        return (
          '<a class="h5-case-list-item" href="' +
          storePagePath(store.id) +
          '" data-store-id="' +
          escapeHtml(store.id) +
          '">' +
          '<div class="h5-case-list-title">' +
          escapeHtml(store.name) +
          '</div>' +
          '<div class="h5-case-list-meta">' +
          escapeHtml(
            [store.address, store.businessHours, store.caseCount ? '案例 ' + store.caseCount : '']
              .filter(Boolean)
              .join(' · ')
          ) +
          '</div></a>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">相关门店</h2>' +
      '<div class="h5-case-list">' +
      items +
      '</div></div>'
    )
  }

  function renderFaq(faq) {
    if (!faq || !faq.length) return ''
    var items = faq
      .map(function (item) {
        return (
          '<div class="h5-faq-item"><div class="h5-faq-q">' +
          escapeHtml(item.q) +
          '</div><div class="h5-faq-a">' +
          escapeHtml(item.a) +
          '</div></div>'
        )
      })
      .join('')
    return '<div class="h5-card"><h2 class="h5-section-title">常见问题</h2>' + items + '</div>'
  }

  function bindInteractions(data) {
    var topic = data.topic || {}
    document.querySelectorAll('[data-case-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_geo_case_click', {
            topicId: topic.id,
            topicSlug: topic.slug,
            caseId: el.getAttribute('data-case-id') || '',
          })
        }
      })
    })
    document.querySelectorAll('[data-store-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_geo_store_click', {
            topicId: topic.id,
            topicSlug: topic.slug,
            storeId: el.getAttribute('data-store-id') || '',
          })
        }
      })
    })

    var callBtn = document.getElementById('h5-call-btn')
    if (callBtn) {
      callBtn.addEventListener('click', function () {
        var phone = (data.primaryStore && data.primaryStore.phone) || ''
        if (phone) {
          location.href = 'tel:' + phone
        } else {
          alert('暂无门店电话，请打开小程序留言咨询。')
        }
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_consult_click', {
            topicId: topic.id,
            topicSlug: topic.slug,
            storeId: topic.primaryStoreId || '',
          })
        }
      })
    }

    var weappBtn = document.getElementById('h5-open-weapp-btn')
    if (weappBtn) {
      weappBtn.addEventListener('click', function () {
        var path = 'pages/mine/index'
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_open_weapp_click', {
            page_type: 'geo_topic',
            topicId: topic.id,
            topicSlug: topic.slug,
          })
        }
        alert('请打开微信小程序继续。路径：/' + path)
      })
    }
  }

  function renderSiteNav() {
    if (window.zhejianSiteNav && window.zhejianSiteNav.render) {
      return window.zhejianSiteNav.render()
    }
    return ''
  }

  function renderPage(data) {
    var topic = data.topic
    setPageMeta(data)

    var heroHtml = topic.coverImage
      ? '<div class="h5-store-hero"><img class="h5-store-hero-img" src="' +
        escapeHtml(topic.coverImage) +
        '" alt="' +
        escapeHtml(topic.title) +
        '" loading="eager" /></div>'
      : ''

    var html =
      '<div class="h5-page">' +
      (function () {
        var cityHref = topic.city === '杭州' ? '/city/hangzhou' : ''
        var crumbs = [{ label: '辙见', href: '/' }]
        if (cityHref) crumbs.push({ label: topic.city, href: cityHref })
        crumbs.push({ label: 'GEO 专题' })
        crumbs.push({ label: topic.title })
        return window.zhejianSeo
          ? window.zhejianSeo.renderBreadcrumbHtml(crumbs)
          : '<nav class="h5-breadcrumb"><a href="/">辙见</a> › GEO 专题 › ' +
              escapeHtml(topic.title) +
              '</nav>'
      })() +
      '<header class="h5-header">' +
      '<div class="h5-brand">辙见服务平台 · 本地专题</div>' +
      '<h1 class="h5-title">' +
      escapeHtml(topic.title) +
      '</h1>' +
      '<p class="h5-summary">' +
      escapeHtml(topic.summary) +
      '</p>' +
      '<div class="h5-banner">' +
      escapeHtml(FOOTER_TEXT) +
      '</div>' +
      '</header>' +
      heroHtml +
      '<div class="h5-home-quick">' +
      '<button type="button" class="h5-btn h5-btn--secondary" id="h5-call-btn">电话咨询</button>' +
      '<button type="button" class="h5-btn" id="h5-open-weapp-btn">留言咨询</button>' +
      '</div>' +
      renderKeyInfo(topic, data.stats || {}) +
      renderBulletSection('适用场景', data.scenarios) +
      renderBulletSection('影响价格的因素', data.priceFactors) +
      (topic.isAccidentTopic
        ? '<p class="h5-compliance">' + escapeHtml(COPY.accident) + '</p>'
        : '<p class="h5-compliance">' + escapeHtml(COPY.price) + '</p>') +
      renderCases(data.relatedCases, topic) +
      renderStores(data.relatedStores) +
      renderFaq(data.faq) +
      renderSiteNav() +
      '<p class="h5-compliance h5-home-footnote">' +
      escapeHtml(FOOTER_TEXT) +
      '</p>' +
      '</div>'

    var app = document.getElementById('app')
    if (app) app.innerHTML = html
    bindInteractions(data)

    if (window.zhejianTrack) {
      window.zhejianTrack.trackPageView('h5_geo_topic_view', {
        pageType: 'geo_topic',
        topicId: topic.id,
        topicSlug: topic.slug,
        city: topic.city,
      })
      if (window.zhejianTrack.bindScrollDepth) {
        window.zhejianTrack.bindScrollDepth({
          pageType: 'geo_topic',
          topicId: topic.id,
          topicSlug: topic.slug,
        })
      }
    }
  }

  function renderNotFound(message) {
    document.title = '专题未找到 · 辙见'
    ensureMeta('name', 'robots', 'noindex,nofollow')
    var app = document.getElementById('app')
    if (!app) return
    app.innerHTML =
      '<div class="h5-page"><header class="h5-header"><h1 class="h5-title">专题不存在</h1>' +
      '<p class="h5-summary">' +
      escapeHtml(message || '该 GEO 专题不存在或已下线。') +
      '</p></header>' +
      '<div class="h5-home-quick"><a class="h5-btn" href="/">返回首页</a></div></div>'
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

  function loadTopic() {
    var slug = parseTopicSlug()
    if (!slug) {
      renderNotFound('专题链接无效')
      return
    }

    fetch('/api/v1/public/h5/topics/' + encodeURIComponent(slug))
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, status: res.status, body: body }
        })
      })
      .then(function (result) {
        if (result.status === 404) {
          renderNotFound(result.body.message || '专题不存在或已下线')
          return
        }
        if (!result.ok || result.body.code !== 0 || !result.body.data) {
          throw new Error(result.body.message || '加载失败')
        }
        renderPage(result.body.data)
      })
      .catch(function () {
        renderError('暂时无法加载 GEO 专题，请稍后重试。')
      })
  }

  loadTopic()
})()
