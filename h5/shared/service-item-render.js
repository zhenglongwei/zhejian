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

  function getServiceOffers(data) {
    if (data.serviceOffers && data.serviceOffers.length) return data.serviceOffers.slice()
    return (data.recommendedStores || []).map(function (store) {
      return {
        servicePlanId: store.servicePlanId,
        servicePlanName: store.servicePlanName || '',
        planPath: store.planPath || (store.servicePlanId ? servicePlanPath(store.servicePlanId) : storePagePath(store.id)),
        storeId: store.id,
        storeName: store.name,
        storePath: storePagePath(store.id),
        address: store.address || '',
        priceText: buildStorePriceText(store),
        sortPrice: store.minAmount != null ? store.minAmount : store.amount,
        caseCount: store.caseCount || 0,
        transparencyScore: store.score || 0,
        distanceKm: store.distanceKm,
      }
    })
  }

  function sortOffers(offers, mode) {
    var list = offers.slice()
    if (mode === 'price') {
      list.sort(function (a, b) {
        var pa = a.sortPrice == null ? Number.POSITIVE_INFINITY : Number(a.sortPrice)
        var pb = b.sortPrice == null ? Number.POSITIVE_INFINITY : Number(b.sortPrice)
        return pa - pb
      })
    } else if (mode === 'cases') {
      list.sort(function (a, b) {
        return (b.caseCount || 0) - (a.caseCount || 0)
      })
    } else if (mode === 'transparency') {
      list.sort(function (a, b) {
        return (b.transparencyScore || 0) - (a.transparencyScore || 0)
      })
    } else if (mode === 'distance') {
      list.sort(function (a, b) {
        var da = a.distanceKm == null ? Number.POSITIVE_INFINITY : Number(a.distanceKm)
        var db = b.distanceKm == null ? Number.POSITIVE_INFINITY : Number(b.distanceKm)
        return da - db
      })
    } else {
      list.sort(function (a, b) {
        var caseDiff = (b.caseCount || 0) - (a.caseCount || 0)
        if (caseDiff) return caseDiff
        var scoreDiff = (b.transparencyScore || 0) - (a.transparencyScore || 0)
        if (scoreDiff) return scoreDiff
        var pa = a.sortPrice == null ? Number.POSITIVE_INFINITY : Number(a.sortPrice)
        var pb = b.sortPrice == null ? Number.POSITIVE_INFINITY : Number(b.sortPrice)
        return pa - pb
      })
    }
    return list
  }

  function renderOfferMetrics(offer) {
    var bits = []
    bits.push('方案价 ' + (offer.priceText || '到店确认'))
    bits.push('本店案例 ' + (offer.caseCount || 0) + ' 条')
    if (offer.transparencyScore > 0) bits.push('透明度 ' + offer.transparencyScore)
    if (offer.distanceKm != null) bits.push('约 ' + offer.distanceKm + ' km')
    return bits.join(' · ')
  }

  function renderServiceOfferList(offers, item, sortOptions, activeSort) {
    var options = sortOptions && sortOptions.length
      ? sortOptions
      : [
          { value: 'recommend', label: '综合推荐' },
          { value: 'price', label: '价格优先' },
          { value: 'cases', label: '案例更多' },
          { value: 'transparency', label: '透明度更高' },
          { value: 'distance', label: '距离更近' },
        ]
    var sortBar =
      '<div class="h5-offer-sort" id="service-offer-sort" style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0">' +
      options
        .map(function (opt) {
          var active = opt.value === activeSort
          return (
            '<button type="button" class="h5-btn h5-btn--secondary' +
            (active ? ' is-active' : '') +
            '" data-sort="' +
            escapeHtml(opt.value) +
            '"' +
            (active ? ' aria-current="true" style="font-weight:600"' : '') +
            '>' +
            escapeHtml(opt.label) +
            '</button>'
          )
        })
        .join('') +
      '</div>'

    if (!offers || !offers.length) {
      return (
        '<div class="h5-card" id="service-offers">' +
        '<h2 class="h5-section-title">' +
        escapeHtml(item.name) +
        '服务列表</h2>' +
        sortBar +
        '<div class="h5-empty-block">暂无门店上架该服务，请稍后再查看。</div></div>'
      )
    }

    var cards = offers
      .map(function (offer) {
        var href = offer.planPath || servicePlanPath(offer.servicePlanId)
        var title =
          (offer.servicePlanName ? offer.servicePlanName + ' · ' : '') + (offer.storeName || '门店服务')
        return (
          '<a class="h5-media-list-item h5-service-offer" href="' +
          escapeHtml(href) +
          '" data-store-id="' +
          escapeHtml(offer.storeId || '') +
          '" data-plan-id="' +
          escapeHtml(offer.servicePlanId || '') +
          '">' +
          '<div class="h5-media-list-body">' +
          '<div class="h5-media-list-title">' +
          escapeHtml(title) +
          '</div>' +
          '<div class="h5-media-list-meta">' +
          escapeHtml(offer.address || '') +
          '</div>' +
          '<div class="h5-media-list-meta">' +
          escapeHtml(renderOfferMetrics(offer)) +
          '</div>' +
          '<div class="h5-compliance">案例仅含该店本服务公开留档 · 点击查看服务详情</div>' +
          '</div><span class="h5-entry-card__hint">›</span></a>'
        )
      })
      .join('')

    return (
      '<div class="h5-card" id="service-offers">' +
      '<h2 class="h5-section-title">' +
      escapeHtml(item.name) +
      '服务列表</h2>' +
      '<p class="h5-compliance">以下每项是一家门店的真实服务方案，可按价格、案例数、透明度、距离挑选；进入后只看该店案例。</p>' +
      sortBar +
      '<div class="h5-media-list" id="service-offer-list">' +
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

  function renderRelatedTopics(topics) {
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
          '</div>' +
          (topic.summary
            ? '<div class="h5-entry-card__summary">' + escapeHtml(topic.summary) + '</div>'
            : '') +
          '</div><span class="h5-entry-card__hint">›</span></a>'
        )
      })
      .join('')
    if (!items) return ''
    return (
      '<section class="h5-card" id="service-related-topics">' +
      '<h2 class="h5-section-title">相关专题</h2>' +
      '<div class="h5-entry-list">' +
      items +
      '</div></section>'
    )
  }

  function renderReferencePrice(price, item) {
    if (!price || price.sampleSize < 1) return ''
    var compliance =
      item.priceMode === 'accident' || price.mode === 'accident' ? COPY.accident : COPY.price
    var rangeText = ''
    if (price.min != null && price.max != null) {
      rangeText =
        price.min === price.max
          ? '价格：¥' + price.min
          : '价格区间：¥' + price.min + '–¥' + price.max
    } else if (price.text) {
      rangeText = String(price.text)
    }
    var avgLine =
      price.average != null ? '<p class="h5-price">案例均价：¥' + price.average + '</p>' : ''
    return (
      '<div class="h5-card"><h2 class="h5-section-title">价格参考</h2>' +
      (rangeText ? '<p class="h5-price">' + escapeHtml(rangeText) + '</p>' : '') +
      avgLine +
      (price.note ? '<p class="h5-price-note">' + escapeHtml(price.note) + '</p>' : '') +
      '<p class="h5-compliance">' +
      escapeHtml(compliance) +
      '</p></div>'
    )
  }

  function bindInteractions(data) {
    var item = data.item || {}
    var offers = getServiceOffers(data)
    var activeSort = 'recommend'

    function paintOfferList(mode) {
      activeSort = mode || 'recommend'
      var sorted = sortOffers(offers, activeSort)
      var host = document.getElementById('service-offers')
      if (!host) return
      var next = document.createElement('div')
      next.innerHTML = renderServiceOfferList(sorted, item, data.sortOptions, activeSort)
      var replacement = next.firstChild
      if (replacement) host.replaceWith(replacement)
      bindSortButtons()
      bindOfferClicks()
    }

    function bindSortButtons() {
      document.querySelectorAll('#service-offer-sort [data-sort]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          paintOfferList(btn.getAttribute('data-sort') || 'recommend')
        })
      })
    }

    function bindOfferClicks() {
      document.querySelectorAll('[data-plan-id]').forEach(function (el) {
        el.addEventListener('click', function () {
          if (window.zhejianTrack) {
            window.zhejianTrack.track(
              'h5_service_offer_click',
              geoTrackParams(item, {
                storeId: el.getAttribute('data-store-id') || '',
                planId: el.getAttribute('data-plan-id') || '',
              })
            )
          }
        })
      })
    }

    bindSortButtons()
    bindOfferClicks()

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
      ? '<p class="h5-compliance">当前按「' +
        escapeHtml(item.cityFilter) +
        '」筛选服务列表；去掉城市参数可看全国。</p>'
      : ''
    var offers = sortOffers(getServiceOffers(data), 'recommend')

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
      '</h1>' +
      (answerText
        ? '<div class="h5-topic-answer">' + escapeHtml(answerText) + '</div>'
        : '<p class="h5-summary">对比各门店该服务的方案价、本店案例数与透明度，再进入详情。</p>') +
      renderTrustMeta(data) +
      cityNote +
      '</header>' +
      '<div class="h5-home-quick h5-topic-cta">' +
      '<a class="h5-btn" href="#service-offers">查看服务列表</a>' +
      '<button type="button" class="h5-btn h5-btn--secondary" id="h5-open-weapp-btn">打开小程序预约</button>' +
      '</div>' +
      renderReferencePrice(data.referencePrice, item) +
      renderServiceOfferList(offers, item, data.sortOptions, 'recommend') +
      renderRelatedTopics(data.relatedTopics) +
      renderRelated(data.relatedServices) +
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
        storeCount: (data.stats && data.stats.storeCount) || 0,
        offerCount: offers.length,
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

  function appendGeoQuery(url) {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) {
        resolve(url)
        return
      }
      var done = false
      var timer = setTimeout(function () {
        if (done) return
        done = true
        resolve(url)
      }, 1200)
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          if (done) return
          done = true
          clearTimeout(timer)
          var lat = pos.coords.latitude
          var lng = pos.coords.longitude
          var join = url.indexOf('?') >= 0 ? '&' : '?'
          resolve(url + join + 'lat=' + encodeURIComponent(lat) + '&lng=' + encodeURIComponent(lng))
        },
        function () {
          if (done) return
          done = true
          clearTimeout(timer)
          resolve(url)
        },
        { timeout: 1000, maximumAge: 600000 }
      )
    })
  }

  function tryLoadServiceItem(slug) {
    if (!slug || looksLikePlanId(slug)) return Promise.resolve(false)

    var city = String(new URLSearchParams(location.search).get('city') || '').trim()
    var apiUrl =
      '/api/v1/public/h5/service-items/' +
      encodeURIComponent(slug) +
      (city ? '?city=' + encodeURIComponent(city) : '')

    return appendGeoQuery(apiUrl)
      .then(function (url) {
        return fetch(url)
      })
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
