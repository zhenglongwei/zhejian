(function () {
  var PC = (window.zhejianPublicCopy && window.zhejianPublicCopy.H5) || {}
  var COPY = {
    displayDisclaimer:
      PC.displayDisclaimer ||
      '本页内容仅供参考。实际方案与费用请与门店线下确认。',
    geoDisclaimer:
      PC.geoDisclaimer ||
      '页面用于展示维修服务信息、门店信息与公开案例，不构成线上报价或维修承诺。',
    casePrice:
      PC.casePrice ||
      '车主授权公示的案例展示当时方案报价；其余案例价格为系统参考区间，实际费用以门店检测为准。',
    price:
      PC.price ||
      '页面价格为参考范围，实际费用会因车型、配件品牌、损伤程度和门店检测结果不同而变化。',
    accident:
      '事故车维修无法仅凭线上信息准确报价，需到店检测或拆检后确认方案和费用。',
    footnote:
      PC.footnote ||
      '页面内容为维修信息展示，不构成线上报价或维修承诺。实际方案与费用以门店线下确认为准。',
  }

  function renderDisclaimerBlock() {
    if (window.zhejianH5Ui && window.zhejianH5Ui.renderDisclaimer) {
      return window.zhejianH5Ui.renderDisclaimer(COPY.displayDisclaimer, COPY.geoDisclaimer)
    }
    return (
      '<div class="h5-disclaimer" data-h5-disclaimer>' +
      '<p class="h5-disclaimer__primary">' +
      escapeHtml(COPY.displayDisclaimer) +
      '</p>' +
      '<div class="h5-disclaimer__more" hidden><p>' +
      escapeHtml(COPY.geoDisclaimer) +
      '</p></div>' +
      '<button type="button" class="h5-disclaimer__toggle" data-h5-disclaimer-toggle aria-expanded="false">展开说明</button>' +
      '</div>'
    )
  }

  function formatTrustDate(iso) {
    if (!iso) return ''
    var d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    )
  }

  function renderTrustMeta(data) {
    var geo = data.geo || {}
    var stats = data.stats || {}
    var aggregate = data.aggregateStats || {}
    var parts = []
    var updated = formatTrustDate(geo.updatedAt)
    if (updated) parts.push('内容更新：' + updated)
    if (stats.caseCount > 0) parts.push('公开案例 ' + stats.caseCount + ' 条')
    if (aggregate.windowLabel && aggregate.sampleSize > 0) {
      parts.push(aggregate.windowLabel + ' 统计样本 ' + aggregate.sampleSize + ' 例')
    }
    if (aggregate.price && aggregate.price.text) {
      parts.push(aggregate.price.text)
    }
    if (!parts.length) return ''
    return '<p class="h5-topic-trust">' + escapeHtml(parts.join(' · ')) + '</p>'
  }

  function geoTrackParams(item, extra) {
    return Object.assign(
      {
        serviceSlug: item.slug || '',
        serviceItemId: item.serviceItemId || '',
        pageType: 'service_item',
        channel: 'geo',
        utm_medium: 'geo',
      },
      extra || {}
    )
  }
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function parseSlug() {
    var match = location.pathname.match(/\/service\/([^/]+)\.html$/i)
    if (!match || match[1] === 'view' || match[1] === 'index') return ''
    return decodeURIComponent(match[1]).trim()
  }

  function looksLikePlanId(id) {
    return /^svc_|^plan_/.test(String(id || ''))
  }

  function storePagePath(storeId) {
    return '/store/' + encodeURIComponent(storeId) + '.html'
  }

  function servicePlanPath(planId) {
    return '/service/' + encodeURIComponent(planId) + '.html'
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
    var el = document.getElementById('h5-service-item-jsonld')
    if (!el) {
      el = document.createElement('script')
      el.type = 'application/ld+json'
      el.id = 'h5-service-item-jsonld'
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(data)
  }

  function setPageMeta(data) {
    var seo = data.seo || {}
    var item = data.item || {}
    var geo = data.geo || {}
    var title = seo.title || item.name + ' · 辙见'
    var desc = seo.description || item.aiSummary || item.summary || ''
    var canonical = location.origin + (seo.canonicalPath || location.pathname)
    document.title = title
    ensureMeta('name', 'description', desc)
    ensureMeta('name', 'robots', seo.robots || 'index,follow')
    ensureMeta('property', 'og:title', title)
    ensureMeta('property', 'og:description', desc)
    ensureMeta('property', 'og:url', canonical)
    ensureLink('canonical', canonical)

    var webPage = {
      '@type': 'WebPage',
      name: title,
      description: desc,
      url: canonical,
    }
    if (geo.updatedAt) webPage.dateModified = geo.updatedAt
    if (geo.publishedAt) webPage.datePublished = geo.publishedAt

    if (data.schemaGraph) {
      injectJsonLd(data.schemaGraph)
    } else {
    var graph = [
      webPage,
      {
        '@type': 'Service',
        name: item.name,
        description: item.aiSummary || item.summary,
        url: canonical,
      },
    ]
    if (data.faq && data.faq.length) {
      var visibleFaq = data.faq.filter(function (entry) {
        return entry && entry.q && entry.a
      })
      if (visibleFaq.length) {
        graph.push({
          '@type': 'FAQPage',
          mainEntity: visibleFaq.map(function (entry) {
            return {
              '@type': 'Question',
              name: entry.q,
              acceptedAnswer: { '@type': 'Answer', text: entry.a },
            }
          }),
        })
      }
    }
    injectJsonLd({ '@context': 'https://schema.org', '@graph': graph })
    }
    if (window.zhejianSeo) {
      window.zhejianSeo.applyBreadcrumbSchema(
        [
          { label: '辙见', href: '/' },
          { label: '服务项目', href: '/service/car-maintenance.html' },
          { label: item.name || '服务项目' },
        ],
        'service-item-breadcrumb'
      )
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
      '</h2><ul class="h5-bullet-list">' +
      lis +
      '</ul></div>'
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

  function buildStorePriceText(store) {
    if (store.priceMode === 'accident') return '到店检测后报价'
    if (store.amount != null) return '¥' + store.amount + ' 起'
    if (store.minAmount != null && store.maxAmount != null) {
      return '¥' + store.minAmount + '–¥' + store.maxAmount
    }
    return '到店检测后报价'
  }

  function renderCases(cases, item, stats) {
    var caseNote = COPY.casePrice
    var section =
      '<div class="h5-card"><h2 class="h5-section-title">真实维修案例</h2>' +
      '<p class="h5-compliance">' +
      escapeHtml(caseNote) +
      '</p>'
    if (!cases || !cases.length) {
      return (
        section +
        '<div class="h5-empty-block">该服务项目暂无公开案例，可先查看推荐门店并预约咨询。</div></div>'
      )
    }
    var total = (stats && stats.caseCount) || cases.length
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
            escapeHtml((item.name || '') + '案例封面') +
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
    var moreLink =
      total > cases.length
        ? '<p class="h5-home-more"><a class="h5-link" href="/service/' +
          encodeURIComponent(item.slug) +
          '/cases">查看全部 ' +
          total +
          ' 个案例 ›</a></p>'
        : ''
    return section + '<div class="h5-media-list">' + cards + '</div>' + moreLink + '</div>'
  }

  function renderStores(stores) {
    if (!stores || !stores.length) {
      return (
        '<div class="h5-card"><h2 class="h5-section-title">推荐门店</h2>' +
        '<div class="h5-empty-block">暂无门店上架该服务项目，请稍后再查看。</div></div>'
      )
    }
    var cards = stores
      .map(function (store) {
        var href = store.servicePlanId
          ? servicePlanPath(store.servicePlanId)
          : storePagePath(store.id)
        var cover = store.coverImage || ''
        var thumb = cover
          ? '<img class="h5-media-list-thumb" src="' +
            escapeHtml(cover) +
            '" alt="' +
            escapeHtml(store.name) +
            '" loading="lazy" />'
          : '<div class="h5-media-list-thumb h5-media-list-thumb--placeholder">门店</div>'
        var meta = [
          store.address,
          '参考 ' + buildStorePriceText(store),
          store.caseCount ? '案例 ' + store.caseCount : '',
        ]
          .filter(Boolean)
          .join(' · ')
        return (
          '<a class="h5-media-list-item" href="' +
          href +
          '" data-store-id="' +
          escapeHtml(store.id) +
          '">' +
          thumb +
          '<div class="h5-media-list-body">' +
          '<div class="h5-media-list-title">' +
          escapeHtml(store.name) +
          '</div>' +
          '<div class="h5-media-list-meta">' +
          escapeHtml(meta) +
          '</div></div></a>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">推荐门店</h2>' +
      '<div class="h5-media-list">' +
      cards +
      '</div></div>'
    )
  }

  function renderRelated(related) {
    if (!related || !related.length) return ''
    var items = related
      .map(function (entry) {
        return (
          '<a class="h5-city-service-item" href="' +
          escapeHtml(entry.path) +
          '"><span class="h5-city-service-name">' +
          escapeHtml(entry.name) +
          '</span></a>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">相关服务</h2>' +
      '<div class="h5-city-service-grid">' +
      items +
      '</div></div>'
    )
  }

  function renderSiteNav() {
    if (window.zhejianSiteNav && window.zhejianSiteNav.render) {
      return window.zhejianSiteNav.render()
    }
    return ''
  }

  function renderArticleBody(text) {
    if (!text || !String(text).trim()) return ''
    var paragraphs = String(text)
      .split(/\n{2,}/)
      .map(function (block) {
        return String(block || '').trim()
      })
      .filter(Boolean)
      .map(function (block) {
        return (
          '<p class="h5-article-p">' +
          escapeHtml(block).replace(/\n/g, '<br/>') +
          '</p>'
        )
      })
      .join('')
    return (
      '<section class="h5-card h5-topic-article" id="service-article">' +
      '<h2 class="h5-section-title">专题正文</h2>' +
      '<div class="h5-article-body">' +
      paragraphs +
      '</div></section>'
    )
  }

  function renderFaq(faq) {
    if (!faq || !faq.length) return ''
    var items = faq
      .filter(function (entry) {
        return entry && entry.q && entry.a
      })
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
    if (!items) return ''
    return (
      '<section class="h5-card h5-topic-faq" id="service-faq">' +
      '<h2 class="h5-section-title">常见问题</h2>' +
      items +
      '</section>'
    )
  }

  function renderFaqLinks(faqLinks) {
    if (!faqLinks || !faqLinks.length) return ''
    var items = faqLinks
      .map(function (entry) {
        var href = String(entry.url || '').replace(/"/g, '&quot;')
        return (
          '<a class="h5-faq-link" href="' +
          href +
          '" target="_blank" rel="noopener noreferrer">' +
          '<span class="h5-faq-link__title">' +
          escapeHtml(entry.title) +
          '</span>' +
          '<span class="h5-faq-link__hint">公众号文章</span>' +
          '</a>'
        )
      })
      .join('')
    return (
      '<div class="h5-card" id="service-faq-links">' +
      '<h2 class="h5-section-title">延伸阅读</h2>' +
      '<div class="h5-faq-links">' +
      items +
      '</div></div>'
    )
  }

  function renderReferencePrice(price, item) {
    if (!price || !price.text) return ''
    var compliance =
      item.priceMode === 'accident' || price.mode === 'accident' ? COPY.accident : COPY.price
    return (
      '<div class="h5-card"><h2 class="h5-section-title">参考价格</h2>' +
      '<p class="h5-price">' +
      escapeHtml(price.text) +
      '</p>' +
      (price.note ? '<p class="h5-price-note">' + escapeHtml(price.note) + '</p>' : '') +
      '<p class="h5-compliance">' +
      escapeHtml(compliance) +
      '</p></div>'
    )
  }

  function renderEvidenceSection(data, item) {
    var caseCount = (data.featuredCases || []).length
    var storeCount = (data.recommendedStores || []).length
    var summaryText =
      '相关证据（' +
      caseCount +
      ' 条案例' +
      (storeCount ? ' · ' + storeCount + ' 家门店' : '') +
      '）'
    return (
      '<details class="h5-topic-evidence">' +
      '<summary class="h5-topic-evidence__summary">' +
      escapeHtml(summaryText) +
      '</summary>' +
      '<div class="h5-topic-evidence__body">' +
      renderCases(data.featuredCases, item, data.stats) +
      renderStores(data.recommendedStores) +
      '</div></details>'
    )
  }

  function renderSupplementSection(data, item) {
    var html = ''
    html += renderBulletSection('什么情况需要做', item.scenarios)
    html += renderBulletSection('维修流程', item.process)
    html += renderBulletSection('价格影响因素', item.priceFactors)
    if (!html) return ''
    return (
      '<details class="h5-topic-supplement"><summary class="h5-topic-evidence__summary">服务说明</summary><div class="h5-topic-evidence__body">' +
      html +
      '</div></details>'
    )
  }

  function bindInteractions(data) {
    var item = data.item || {}
    document.querySelectorAll('[data-case-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track(
            'h5_service_case_click',
            geoTrackParams(item, {
              caseId: el.getAttribute('data-case-id') || '',
            })
          )
        }
      })
    })
    document.querySelectorAll('[data-store-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track(
            'h5_service_store_click',
            geoTrackParams(item, {
              storeId: el.getAttribute('data-store-id') || '',
            })
          )
        }
      })
    })
    var weappBtn = document.getElementById('h5-open-weapp-btn')
    if (weappBtn) {
      weappBtn.addEventListener('click', function () {
        var path =
          'pages/index/index?source=h5&page_type=service&service_slug=' +
          encodeURIComponent(item.slug || '') +
          '&service_item_id=' +
          encodeURIComponent(item.serviceItemId || '') +
          '&utm_medium=geo&utm_source=h5'
        if (window.zhejianTrack) {
          window.zhejianTrack.track(
            'h5_open_weapp_click',
            geoTrackParams(item, { cta: 'weapp_booking' })
          )
        }
        alert('请打开微信小程序继续。路径：/' + path)
      })
    }
  }

  function renderPage(data) {
    var item = data.item
    setPageMeta(data)

    var answerText = item.aiSummary || item.summary || ''
    var cityNote = item.cityFilter
      ? '<p class="h5-compliance">当前展示与「' +
        escapeHtml(item.cityFilter) +
        '」相关的案例与门店，全国内容请去掉筛选条件访问。</p>'
      : ''

    var html =
      '<div class="h5-page">' +
      (window.zhejianSeo
        ? window.zhejianSeo.renderBreadcrumbHtml([
            { label: '辙见', href: '/' },
            { label: '服务项目', href: '/service/car-maintenance.html' },
            { label: item.name },
          ])
        : '<nav class="h5-breadcrumb"><a href="/">辙见</a> › 服务项目 › ' +
          escapeHtml(item.name) +
          '</nav>') +
      '<header class="h5-header h5-topic-header">' +
      '<h1 class="h5-title">' +
      escapeHtml(item.name) +
      '案例、流程与价格参考</h1>' +
      (answerText
        ? '<div class="h5-topic-answer">' + escapeHtml(answerText) + '</div>'
        : '') +
      renderTrustMeta(data) +
      cityNote +
      '</header>' +
      '<div class="h5-home-quick h5-topic-cta">' +
      '<a class="h5-btn h5-btn--secondary" href="/service/' +
      encodeURIComponent(item.slug) +
      '/cases' +
      (item.cityFilter ? '?city=' + encodeURIComponent(item.cityFilter) : '') +
      '">浏览公开案例</a>' +
      '<button type="button" class="h5-btn" id="h5-open-weapp-btn">打开小程序预约</button>' +
      '</div>' +
      renderArticleBody(data.articleBody) +
      renderFaq(data.faq) +
      renderReferencePrice(data.referencePrice, item) +
      renderSupplementSection(data, item) +
      renderEvidenceSection(data, item) +
      renderRelated(data.relatedServices) +
      renderFaqLinks(data.faqLinks) +
      renderSiteNav() +
      renderDisclaimerBlock() +
      '</div>'

    var app = document.getElementById('app')
    if (app) app.innerHTML = html
    if (window.zhejianH5Ui && window.zhejianH5Ui.bindDisclaimerToggles) {
      window.zhejianH5Ui.bindDisclaimerToggles(app)
    }
    bindInteractions(data)

    if (window.zhejianTrack) {
      var trackPayload = geoTrackParams(item, {
        serviceName: item.name,
        caseCount: (data.stats && data.stats.caseCount) || 0,
        geoPageId: (data.geo && data.geo.id) || '',
        geoSlug: (data.geo && data.geo.slug) || item.slug || '',
      })
      window.zhejianTrack.track('h5_geo_topic_view', trackPayload, { channel: 'geo' })
      window.zhejianTrack.trackServiceView(
        Object.assign({}, trackPayload, {
          serviceId: item.serviceItemId,
          name: item.name,
        })
      )
      if (window.zhejianTrack.bindScrollDepth) {
        window.zhejianTrack.bindScrollDepth(trackPayload)
      }
    }
  }

  function tryLoadServiceItem(slug) {
    if (!slug || looksLikePlanId(slug)) return Promise.resolve(false)

    var city = String(new URLSearchParams(location.search).get('city') || '').trim()
    var apiUrl =
      '/api/v1/public/h5/service-items/' +
      encodeURIComponent(slug) +
      (city ? '?city=' + encodeURIComponent(city) : '')

    return fetch(apiUrl)
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, status: res.status, body: body }
        })
      })
      .then(function (result) {
        if (result.status === 404) return false
        if (!result.ok || result.body.code !== 0 || !result.body.data) return false
        window.__H5_SERVICE_ITEM_HANDLED__ = true
        renderPage(result.body.data)
        return true
      })
      .catch(function () {
        return false
      })
  }

  window.zhejianServiceItemBootstrap = function (slug) {
    return tryLoadServiceItem(slug || parseSlug())
  }

  var slug = parseSlug()
  if (slug && !looksLikePlanId(slug)) {
    window.__H5_SERVICE_ITEM_BOOTSTRAP__ = tryLoadServiceItem(slug)
  } else {
    window.__H5_SERVICE_ITEM_BOOTSTRAP__ = Promise.resolve(false)
  }
})()
