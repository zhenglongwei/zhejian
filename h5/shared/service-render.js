(function () {
  var PC = (window.zhejianPublicCopy && window.zhejianPublicCopy.H5) || {}
  var COPY = {
    displayDisclaimer:
      PC.displayDisclaimer ||
      '本页内容仅供参考。实际方案与费用请与门店线下确认。',
    geoDisclaimer:
      PC.geoDisclaimer ||
      '页面用于展示维修服务信息、门店信息与公开案例，不构成线上报价或维修承诺。',
  accident: '到店检测后确定。',
  price: '到店检测后确定。',
  casePrice:
      PC.casePrice ||
      '车主授权公示的案例展示当时方案报价；其余案例价格为系统参考区间，实际费用以门店检测为准。',
  }

  function renderDisclaimerBlock() {
    if (window.zhejianH5Ui && window.zhejianH5Ui.renderDisclaimer) {
      return window.zhejianH5Ui.renderDisclaimer(
        COPY.displayDisclaimer,
        COPY.geoDisclaimer
      )
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

  var PRICE_MODE_LABEL = {
    fixed: '一口价',
    range: '到店检测后确定',
    consult: '到店检测后确定',
    accident: '到店检测后确定',
  }

  var COMPLEXITY_LABEL = {
    L1: '简单检测与养护',
    L2: '常规维修',
    L3: '专项维修',
    L4: '复杂维修/事故车',
  }

  var LIST_LIMIT = 6

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
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
    var selector = 'link[rel="' + rel + '"]'
    var el = document.querySelector(selector)
    if (!el) {
      el = document.createElement('link')
      el.setAttribute('rel', rel)
      document.head.appendChild(el)
    }
    el.setAttribute('href', href)
  }

  function ensureJsonLd(id, data) {
    var selector = 'script[type="application/ld+json"]#' + id
    var el = document.querySelector(selector)
    if (!el) {
      el = document.createElement('script')
      el.type = 'application/ld+json'
      el.id = id
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(data)
  }

  function servicePagePath(serviceId) {
    return '/service/' + encodeURIComponent(serviceId) + '.html'
  }

  function storePagePath(storeId) {
    return '/store/' + encodeURIComponent(storeId) + '.html'
  }

  function casePagePath(caseId) {
    return '/case/view.html?id=' + encodeURIComponent(caseId)
  }

  function resolveServiceId() {
    if (window.__SERVICE_ID__) return String(window.__SERVICE_ID__).trim()
    var pathMatch = location.pathname.match(/\/service\/([^/]+)\.html$/)
    if (pathMatch && pathMatch[1] !== 'view' && pathMatch[1] !== 'index') {
      return decodeURIComponent(pathMatch[1]).trim()
    }
    var params = new URLSearchParams(location.search)
    var fromQuery = params.get('id') || params.get('serviceId') || ''
    return String(fromQuery).trim()
  }

  function maybeRedirectToCanonical(serviceId) {
    if (!serviceId) return false
    if (/\/service\/view\.html$/i.test(location.pathname)) {
      var target = servicePagePath(serviceId)
      var qs = location.search.replace(/^\?/, '')
      var hash = location.hash || ''
      location.replace(target + (qs ? '?' + qs : '') + hash)
      return true
    }
    return false
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

  function stripPriceSuffix(text) {
    return String(text || '')
      .replace(/\s*起\s*$/u, '')
      .trim()
  }

  function resolveFixedAmount(data) {
    if (data.amount != null && data.amount !== '') {
      var amount = Number(data.amount)
      if (Number.isFinite(amount)) return amount
    }
    var min = data.minAmount != null ? Number(data.minAmount) : null
    var max = data.maxAmount != null ? Number(data.maxAmount) : null
    if (min != null && max != null && min === max) return min
    return null
  }

  function normalizePriceMode(mode) {
    if (mode === 'fixed') return 'fixed'
    return 'consult'
  }

  function resolveReferenceAmount(data) {
    if (data.amount != null && data.amount !== '') {
      var amount = Number(data.amount)
      if (Number.isFinite(amount)) return amount
    }
    var min = data.minAmount != null ? Number(data.minAmount) : NaN
    if (Number.isFinite(min)) return min
    var max = data.maxAmount != null ? Number(data.maxAmount) : NaN
    if (Number.isFinite(max)) return max
    return null
  }

  function buildPriceDisplay(data) {
    var mode = normalizePriceMode(data.priceMode || 'consult')
    var currency = '¥'
    var fixedAmount = resolveFixedAmount(data)
    var isAuthorized =
      data.authorizationTier === 'named' || data.authorizationTier === 'anonymous'

    if (fixedAmount != null && (mode === 'fixed' || isAuthorized)) {
      return {
        priceText: currency + fixedAmount,
        note: '',
      }
    }
    if (mode === 'consult') {
      var ref = resolveReferenceAmount(data)
      if (ref != null) {
        return {
          priceText: '参考价 ' + currency + ref,
          note: '到店检测后确定',
        }
      }
      return {
        priceText: '到店检测后确定',
        note: '',
      }
    }
    return {
      priceText: stripPriceSuffix(data.priceText || '到店检测后确定'),
      note: '',
    }
  }

  function extractCity(store, service) {
    if (store && store.city) return String(store.city)
    var addr = (store && store.address) || ''
    var m = String(addr).match(/([\u4e00-\u9fa5]{2,4}市)/)
    if (m) return m[1]
    var intro = (store && (store.aiSummary || store.intro)) || service.summary || ''
    var m2 = String(intro).match(/([\u4e00-\u9fa5]{2,4}市)/)
    return m2 ? m2[1] : ''
  }

  function buildHeadTags(service) {
    var tags = []
    if (service.categoryName) {
      tags.push({ cls: 'h5-tag--info', text: service.categoryName })
    }
    var mode = normalizePriceMode(service.priceMode || 'consult')
    var modeLabel = PRICE_MODE_LABEL[mode] || '到店检测后确定'
    var variant = mode === 'fixed' ? 'h5-tag--order' : 'h5-tag--reference'
    tags.push({ cls: variant, text: modeLabel })
    return tags.slice(0, 3)
  }

  function renderTags(tags) {
    return tags
      .map(function (tag) {
        return (
          '<span class="h5-tag ' +
          escapeHtml(tag.cls) +
          '">' +
          escapeHtml(tag.text) +
          '</span>'
        )
      })
      .join('')
  }

  function buildKeyInfoRows(service) {
    var complexity =
      COMPLEXITY_LABEL[service.complexityLevel] ||
      COMPLEXITY_LABEL.L2 ||
      '常规维修'
    var mode = normalizePriceMode(service.priceMode || 'consult')
    return [
      { label: '服务分类', value: service.categoryName || '—' },
      { label: '提供门店', value: service.storeName || '—' },
      {
        label: '费用确认',
        value: mode === 'fixed' ? '一口价' : '到店检测后确定',
      },
      { label: '服务类型', value: complexity },
    ]
  }

  function normalizeStringArray(value) {
    if (!Array.isArray(value)) return []
    return value
      .map(function (s) {
        return String(s || '').trim()
      })
      .filter(Boolean)
  }

  function normalizeAppointmentJson(raw) {
    var src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    return {
      slotNote: String(src.slotNote || '').trim(),
      advanceRequired: Boolean(src.advanceRequired),
      advanceNote: String(src.advanceNote || '').trim(),
      holidayNote: String(src.holidayNote || '').trim(),
      consultGuide: String(src.consultGuide || '').trim(),
      applicableVehicles: normalizeStringArray(src.applicableVehicles),
    }
  }

  function buildAppointmentSection(service) {
    var accept = service.acceptAppointment !== false
    var json = normalizeAppointmentJson(service.appointmentJson)
    var rows = []

    if (!accept) {
      rows.push({ label: '咨询/预约', value: '当前暂不接受线上咨询/预约' })
      return { hasContent: true, rows: rows, consultGuide: '' }
    }

    if (json.slotNote) rows.push({ label: '可预约时段', value: json.slotNote })
    if (json.advanceRequired) {
      rows.push({
        label: '提前预约',
        value: json.advanceNote || '需提前预约后再到店',
      })
    }
    if (json.holidayNote) rows.push({ label: '节假日说明', value: json.holidayNote })

    return {
      hasContent: rows.length > 0 || Boolean(json.consultGuide),
      rows: rows,
      consultGuide: json.consultGuide,
    }
  }

  function renderKeyInfo(rows, title) {
    if (!rows || !rows.length) return ''
    var body = rows
      .map(function (row) {
        return (
          '<tr><th>' +
          escapeHtml(row.label) +
          '</th><td>' +
          escapeHtml(row.value) +
          '</td></tr>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">' +
      escapeHtml(title || '服务信息') +
      '</h2><table class="h5-table">' +
      body +
      '</table></div>'
    )
  }

  function renderBulletSection(title, items, footer) {
    if (!items || !items.length) return ''
    var lis = items
      .map(function (item) {
        return '<li>' + escapeHtml(item) + '</li>'
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">' +
      escapeHtml(title) +
      '</h2><ul class="h5-bullet-list">' +
      lis +
      '</ul>' +
      (footer
        ? '<p class="h5-compliance">' + escapeHtml(footer) + '</p>'
        : '') +
      '</div>'
    )
  }

  function splitDetailToBullets(text) {
    return String(text || '')
      .split(/\r?\n+/)
      .map(function (line) {
        return line.replace(/^[\s·•\-–—]+/, '').trim()
      })
      .filter(Boolean)
  }

  function renderDetailSection(detail) {
    if (!detail) return ''
    var items = splitDetailToBullets(detail)
    if (!items.length) return ''
    return renderBulletSection('服务说明', items)
  }

  function renderCases(cases, serviceId, storeId) {
    var caseNote = COPY.casePrice
    var section =
      '<div class="h5-card"><h2 class="h5-section-title">类似案例</h2>' +
      '<p class="h5-compliance">' +
      escapeHtml(caseNote) +
      '</p>'
    if (!cases || !cases.length) {
      return section + '<div class="h5-empty-block">暂无类似案例</div></div>'
    }
    var cards = cases
      .map(function (item) {
        if (window.zhejianH5Ui && window.zhejianH5Ui.renderCaseListItem) {
          return window.zhejianH5Ui.renderCaseListItem(item, {
            href:
              item.slug
                ? '/case/' + encodeURIComponent(item.slug) + '.html'
                : casePagePath(item.id),
            extraAttrs: ' data-case-id="' + escapeHtml(item.id) + '"',
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
          casePagePath(item.id) +
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
    return section + '<div class="h5-media-list">' + cards + '</div></div>'
  }

  function renderStoreCard(store) {
    if (!store || !store.id) return ''
    var cover = store.coverImage || ''
    var thumb = cover
      ? '<img class="h5-media-list-thumb" src="' +
        escapeHtml(cover) +
        '" alt="' +
        escapeHtml(store.name) +
        '门头" loading="lazy" />'
      : '<div class="h5-media-list-thumb h5-media-list-thumb--placeholder">门店</div>'
    var metaParts = [store.address, store.businessHours].filter(Boolean)
    return (
      '<div class="h5-card"><h2 class="h5-section-title">提供门店</h2>' +
      '<div class="h5-media-list">' +
      '<a class="h5-media-list-item" href="' +
      storePagePath(store.id) +
      '" id="h5-store-link" data-store-id="' +
      escapeHtml(store.id) +
      '">' +
      thumb +
      '<div class="h5-media-list-body">' +
      '<div class="h5-media-list-title">' +
      escapeHtml(store.name) +
      '</div>' +
      (metaParts.length
        ? '<div class="h5-media-list-meta">' + escapeHtml(metaParts.join(' · ')) + '</div>'
        : '') +
      '<div class="h5-media-list-summary">查看门店主页 ›</div>' +
      '</div></a></div></div>'
    )
  }

  function buildPageTitle(service, store) {
    var city = extractCity(store, service)
    var cityPart = city ? city.replace(/市$/, '') : ''
    var storeName = service.storeName || (store && store.name) || ''
    return (
      service.name +
      (storeName ? '_' + storeName : '') +
      (cityPart ? '_' + cityPart + '汽车维修服务' : '') +
      ' · 辙见'
    )
  }

  function buildPageDescription(service) {
    var summary = service.summary || service.detail || ''
    var clipped = summary.length > 100 ? summary.slice(0, 100) + '…' : summary
    return (
      (clipped || service.name + '服务详情') +
      '。价格仅供参考，实际费用以门店检测为准。'
    )
  }

  function setShareMeta(service, store) {
    var title = buildPageTitle(service, store)
    var desc = buildPageDescription(service)
    var canonical = location.origin + servicePagePath(service.id)
    document.title = title
    ensureMeta('name', 'description', desc)
    ensureMeta('property', 'og:title', title)
    ensureMeta('property', 'og:description', desc)
    if (service.coverUrl) ensureMeta('property', 'og:image', service.coverUrl)
    ensureLink('canonical', canonical)

    var price = buildPriceDisplay(service)
    var schema = {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: service.name,
      description: service.summary || service.detail || desc,
      url: canonical,
      provider: {
        '@type': 'AutoRepair',
        name: service.storeName || (store && store.name) || '',
        url: store && store.id ? location.origin + storePagePath(store.id) : undefined,
        address: store && store.address ? store.address : undefined,
        telephone: store && store.phone ? store.phone : undefined,
      },
    }
    if (price.priceText && normalizePriceMode(service.priceMode) === 'fixed') {
      schema.offers = {
        '@type': 'Offer',
        priceCurrency: 'CNY',
        description: price.priceText,
      }
    } else if (price.priceText && price.note) {
      schema.offers = {
        '@type': 'Offer',
        priceCurrency: 'CNY',
        description: price.priceText + '（到店检测后确定）',
      }
    }
    ensureJsonLd('service-schema', schema)
    if (window.zhejianSeo) {
      var storeHref =
        store && store.id ? '/store/' + encodeURIComponent(store.id) + '.html' : ''
      window.zhejianSeo.applyBreadcrumbSchema(
        [
          { label: '辙见', href: '/' },
          { label: '公开门店', href: '/store/' },
          store && store.name
            ? { label: store.name, href: storeHref }
            : { label: '门店' },
          { label: service.name || '服务方案' },
        ],
        'service-plan-breadcrumb'
      )
    }
  }

  function setNoIndex() {
    ensureMeta('name', 'robots', 'noindex,nofollow')
  }

  function isBookingEnabled(service, store) {
    if (service.status !== 'published') return false
    if (service.acceptAppointment === false) return false
    if (!store) return true
    return store.status !== 'suspended' && store.status !== 'offline'
  }

  function bindServiceInteractions(service, store, bookingEnabled) {
    var serviceId = service.id
    var storeId = service.storeId || (store && store.id) || ''

    document.querySelectorAll('.h5-media-list-item[data-case-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_service_case_click', {
            serviceId: serviceId,
            caseId: el.getAttribute('data-case-id') || '',
            storeId: storeId,
          })
        }
      })
    })

    var storeLink = document.getElementById('h5-store-link')
    if (storeLink) {
      storeLink.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_service_store_click', {
            serviceId: serviceId,
            storeId: storeId,
          })
        }
      })
    }

    ;['h5-consult-top-btn', 'h5-call-btn'].forEach(function (id) {
      var el = document.getElementById(id)
      if (!el) return
      el.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track(id === 'h5-call-btn' ? 'h5_call_click' : 'h5_consult_click', {
            serviceId: serviceId,
            storeId: storeId,
          })
        }
      })
    })
  }

  function renderService(service, store, cases) {
    var bookingEnabled = isBookingEnabled(service, store)
    var headTags = buildHeadTags(service)
    var price = buildPriceDisplay(service)
    var appointment = buildAppointmentSection(service)

    setShareMeta(service, store)

    var heroHtml = service.coverUrl
      ? '<div class="h5-service-hero"><img class="h5-service-hero-img" src="' +
        escapeHtml(service.coverUrl) +
        '" alt="' +
        escapeHtml(service.name) +
        '" loading="eager" /></div>'
      : ''

    var pausedNotice = !bookingEnabled
      ? '<div class="h5-store-notice h5-store-notice--warn">该服务当前暂不可提交咨询，你可以先浏览信息或电话联系门店。</div>'
      : ''

    var html =
      '<div class="h5-page">' +
      '<nav class="h5-breadcrumb"><a href="/">辙见</a> › 服务 › ' +
      escapeHtml(service.name) +
      '</nav>' +
      '<header class="h5-header">' +
      '<h1 class="h5-title">' +
      escapeHtml(service.name) +
      '</h1>' +
      '<div class="h5-tags">' +
      renderTags(headTags) +
      '</div>' +
      (service.storeName
        ? '<p class="h5-service-status">' + escapeHtml(service.storeName) + '</p>'
        : '') +
      renderDisclaimerBlock() +
      pausedNotice +
      '</header>' +
      heroHtml +
      ((store && store.phone)
        ? '<div class="h5-top-actions">' +
          '<a class="h5-btn" id="h5-consult-top-btn" href="tel:' +
          escapeHtml(store.phone) +
          '">电话咨询</a>' +
          '</div>'
        : '')

    html +=
      '<div class="h5-card"><h2 class="h5-section-title">价格</h2>' +
      '<p class="h5-price">' +
      escapeHtml(stripPriceSuffix(price.priceText)) +
      '</p>' +
      (price.note ? '<p class="h5-price-note">' + escapeHtml(price.note) + '</p>' : '') +
      '</div>'

    if (service.summary) {
      html += '<p class="h5-summary">' + escapeHtml(service.summary) + '</p>'
    }

    html += renderKeyInfo(buildKeyInfoRows(service), '服务信息')

    if (service.detail) {
      html += renderDetailSection(service.detail)
    }

    if (appointment.hasContent) {
      html += renderKeyInfo(appointment.rows, '咨询与预约说明')
      if (appointment.consultGuide) {
        html +=
          '<p class="h5-compliance">' + escapeHtml(appointment.consultGuide) + '</p>'
      }
    }

    html += renderBulletSection('服务包含', service.includedItems)
    html += renderBulletSection(
      '服务不包含',
      service.excludedItems,
      '如到店检测发现车辆情况与所选服务不符，门店会与你确认新的维修方案和费用。'
    )

    var appointmentMeta = normalizeAppointmentJson(service.appointmentJson)
    html += renderBulletSection('适用车型', appointmentMeta.applicableVehicles)

    if (service.priceFactors && service.priceFactors.length) {
      html += renderBulletSection('影响价格的因素', service.priceFactors)
    }

    html += renderCases(cases, service.id, service.storeId)
    html += renderStoreCard(store)
    html += '<div class="h5-body-spacer"></div></div>'

    html +=
      '<footer class="h5-footer">' +
      '<div class="h5-footer-inner h5-footer-inner--dual">' +
      ((store && store.phone)
        ? '<a class="h5-btn" id="h5-call-btn" href="tel:' +
          escapeHtml(store.phone) +
          '">电话咨询</a>'
        : '<span class="h5-compliance">门店电话暂未公示</span>') +
      (store && store.id
        ? '<a class="h5-btn h5-btn--secondary" href="/store/' +
          encodeURIComponent(store.id) +
          '.html">门店主页</a>'
        : '') +
      '</div></footer>'

    var app = document.getElementById('app')
    if (app) app.innerHTML = html

    if (window.zhejianH5Ui && window.zhejianH5Ui.bindDisclaimerToggles) {
      window.zhejianH5Ui.bindDisclaimerToggles()
    }

    bindServiceInteractions(service, store, bookingEnabled)

    if (window.zhejianTrack) {
      window.zhejianTrack.trackServiceView({
        id: service.id,
        serviceItemId: service.serviceItemId,
        storeId: service.storeId,
        storeName: service.storeName,
        name: service.name,
      })
      window.zhejianTrack.bindScrollDepth({
        serviceId: service.id,
        storeId: service.storeId,
      })
    }
  }

  function renderError(message, serviceId, noIndex) {
    document.title = '服务不可用 · 辙见'
    if (noIndex) setNoIndex()
    var app = document.getElementById('app')
    if (app) {
      app.innerHTML =
        '<div class="h5-error">' +
        '<h1>无法加载服务</h1>' +
        '<p>' +
        escapeHtml(message) +
        '</p>' +
        (serviceId
          ? '<p class="h5-error-id">服务 ID：' + escapeHtml(serviceId) + '</p>'
          : '') +
        '<button type="button" class="h5-btn h5-error-retry" id="h5-retry-btn">重试</button>' +
        '</div>'
      var retryBtn = document.getElementById('h5-retry-btn')
      if (retryBtn) {
        retryBtn.addEventListener('click', function () {
          location.reload()
        })
      }
    }
  }

  function fetchJson(url) {
    return fetch(url).then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, status: res.status, body: body }
      })
    })
  }

  function loadService(serviceId) {
    var apiUrl =
      window.__SERVICE_API__ ||
      '/api/v1/user/services/' + encodeURIComponent(serviceId)
    return fetchJson(apiUrl).then(function (result) {
      if (!result.ok || result.body.code !== 0 || !result.body.data) {
        var err = new Error('该服务已下架，请查看其他服务')
        err.httpStatus = result.status
        err.apiCode = result.body && result.body.code
        throw err
      }
      return result.body.data
    })
  }

  function loadMerchant(storeId) {
    if (!storeId) return Promise.resolve(null)
    return fetchJson('/api/v1/user/merchants/' + encodeURIComponent(storeId))
      .then(function (result) {
        if (!result.ok || result.body.code !== 0 || !result.body.data) return null
        return result.body.data
      })
      .catch(function () {
        return null
      })
  }

  function loadCases(service) {
    var qs =
      '?storeId=' +
      encodeURIComponent(service.storeId || '') +
      '&serviceItemId=' +
      encodeURIComponent(service.serviceItemId || '') +
      '&limit=' +
      LIST_LIMIT
    return fetchJson('/api/v1/user/cases' + qs)
      .then(function (result) {
        if (!result.ok || result.body.code !== 0) return []
        return result.body.data.list || []
      })
      .catch(function () {
        return []
      })
  }

  function resolveLoadErrorMessage(err) {
    if (err && err.message === 'missing service id') return '服务 ID 无效，请检查链接是否完整'
    if (err && (err.httpStatus === 404 || err.httpStatus === 410 || err.apiCode === 100004)) {
      return '该服务已下架或未公开展示'
    }
    if (err && err.name === 'TypeError') return '网络异常，请稍后重试'
    return '服务不存在、未公开或资料未就绪'
  }

  function loadPage(serviceId) {
    if (window.__H5_SERVICE_ITEM_HANDLED__) return

    if (!serviceId) {
      renderError('服务 ID 无效，请检查链接是否完整', '', true)
      return
    }

    loadService(serviceId)
      .then(function (service) {
        return Promise.all([
          loadMerchant(service.storeId),
          loadCases(service),
        ]).then(function (parts) {
          renderService(service, parts[0], parts[1])
        })
      })
      .catch(function (err) {
        var noIndex =
          err &&
          (err.httpStatus === 404 || err.httpStatus === 410 || err.apiCode === 100004)
        renderError(resolveLoadErrorMessage(err), serviceId, noIndex)
      })
  }

  var serviceId = resolveServiceId()
  var bootstrap = window.__H5_SERVICE_ITEM_BOOTSTRAP__ || Promise.resolve(false)
  bootstrap.then(function (handled) {
    if (handled) return
    if (!maybeRedirectToCanonical(serviceId)) loadPage(serviceId)
  })
})()
