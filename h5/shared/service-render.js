(function () {
  var COPY = {
    displayDisclaimer:
      '本页内容由商家自行发布或经车主授权展示，仅供参考。实际方案与费用请与门店线下确认。',
    geoDisclaimer:
      '页面内容用于展示维修服务信息、门店信息和脱敏案例，不构成线上报价或维修承诺。实际维修方案、费用、配件、质保和售后由用户与门店线下确认。',
    price: '实际费用以门店检测结果为准，以下价格为参考区间。',
    accident: '事故车维修无法仅凭线上信息准确报价。请预约门店到店检测后确认维修方案。',
    casePrice:
      '车主授权公示的案例展示当时方案报价；其余案例价格为系统参考区间，实际费用以门店检测为准。',
    caseCompliance:
      '公开展示仅使用脱敏图片，不含车牌、手机号等隐私信息。',
  }

  var PRICE_MODE_LABEL = {
    fixed: '一口价',
    range: '参考区间',
    consult: '到店检测',
    accident: '事故车',
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

  function buildPriceDisplay(data) {
    var mode = data.priceMode || 'range'
    var currency = '¥'
    var fixedAmount = resolveFixedAmount(data)
    var isAuthorized =
      data.authorizationTier === 'named' || data.authorizationTier === 'anonymous'

    if (mode === 'accident') {
      return {
        priceText: '预约到店检测后报价',
        note: COPY.accident,
      }
    }
    if (fixedAmount != null && (mode === 'fixed' || isAuthorized)) {
      return {
        priceText: currency + fixedAmount,
        note: '',
      }
    }
    if (mode === 'consult') {
      return {
        priceText: '到店检测后报价',
        note: COPY.price,
      }
    }
    if (data.minAmount != null && data.maxAmount != null) {
      return {
        priceText:
          '参考区间 ' + currency + data.minAmount + ' - ' + currency + data.maxAmount,
        note: COPY.price,
      }
    }
    return {
      priceText: stripPriceSuffix(data.priceText || '到店检测后报价'),
      note: COPY.price,
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
    var mode = service.priceMode || 'range'
    var modeLabel = PRICE_MODE_LABEL[mode] || '参考价'
    var variant = mode === 'fixed' ? 'h5-tag--order' : mode === 'accident' ? 'h5-tag--history' : 'h5-tag--reference'
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
    return [
      { label: '服务分类', value: service.categoryName || '—' },
      { label: '提供门店', value: service.storeName || '—' },
      { label: '费用确认', value: '到店检测后由门店报价' },
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
        return '<li>· ' + escapeHtml(item) + '</li>'
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

  function renderCases(cases, serviceId, storeId) {
    var section =
      '<div class="h5-card"><h2 class="h5-section-title">类似案例</h2>' +
      '<p class="h5-compliance">' +
      escapeHtml(COPY.casePrice) +
      '</p>' +
      '<p class="h5-compliance">' +
      escapeHtml(COPY.caseCompliance) +
      '</p>'
    if (!cases || !cases.length) {
      return section + '<div class="h5-empty-block">暂无类似案例</div></div>'
    }
    var cards = cases
      .map(function (item) {
        var cover = pickCaseCover(item)
        var price = buildPriceDisplay(item)
        var coverHtml = cover
          ? '<img class="h5-node-img" src="' +
            escapeHtml(cover) +
            '" alt="脱敏案例封面" loading="lazy" />'
          : '<div class="h5-placeholder-img">脱敏封面暂未就绪</div>'
        return (
          '<a class="h5-store-case-card" href="' +
          casePagePath(item.id) +
          '" data-case-id="' +
          escapeHtml(item.id) +
          '">' +
          coverHtml +
          '<h3 class="h5-store-case-card-title">' +
          escapeHtml(item.title || item.serviceName || '公开案例') +
          '</h3>' +
          '<p class="h5-store-case-card-meta">' +
          escapeHtml(item.serviceName || '') +
          '</p>' +
          '<p class="h5-service-card-price">' +
          escapeHtml(stripPriceSuffix(price.priceText)) +
          '</p>' +
          '</a>'
        )
      })
      .join('')
    return section + '<div class="h5-store-case-list">' + cards + '</div></div>'
  }

  function renderStoreCard(store) {
    if (!store || !store.id) return ''
    return (
      '<div class="h5-card"><h2 class="h5-section-title">提供门店</h2>' +
      '<a class="h5-store-link-card" href="' +
      storePagePath(store.id) +
      '" id="h5-store-link" data-store-id="' +
      escapeHtml(store.id) +
      '">' +
      '<h3 class="h5-store-link-title">' +
      escapeHtml(store.name) +
      '</h3>' +
      '<p class="h5-store-link-meta">' +
      escapeHtml(store.address || '') +
      '</p>' +
      (store.businessHours
        ? '<p class="h5-store-link-meta">营业时间：' + escapeHtml(store.businessHours) + '</p>'
        : '') +
      '<p class="h5-store-link-action">查看门店主页 ›</p>' +
      '</a></div>'
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
    if (price.priceText && service.priceMode !== 'accident') {
      schema.offers = {
        '@type': 'Offer',
        priceCurrency: 'CNY',
        description: price.priceText + '（参考价，非最终成交价）',
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

  function miniprogramServicePath(serviceId, storeId) {
    return (
      '/pages/service/detail/index?id=' +
      encodeURIComponent(serviceId) +
      '&source=h5&utm_source=h5&page_type=service' +
      (storeId ? '&store_id=' + encodeURIComponent(storeId) : '')
    )
  }

  function miniprogramConsultPath(serviceId, storeId) {
    return (
      '/pages/consult/submit/index?serviceId=' +
      encodeURIComponent(serviceId) +
      '&storeId=' +
      encodeURIComponent(storeId || '') +
      '&sourcePage=service&source=h5&utm_source=h5'
    )
  }

  function openWeapp(path) {
    alert('请打开微信小程序继续。路径：' + path)
  }

  function bindServiceInteractions(service, store, bookingEnabled) {
    var serviceId = service.id
    var storeId = service.storeId || (store && store.id) || ''

    document.querySelectorAll('.h5-store-case-card[data-case-id]').forEach(function (el) {
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

    var openWeappBtn = document.getElementById('h5-open-weapp-btn')
    if (openWeappBtn) {
      openWeappBtn.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_open_weapp_click', {
            page_type: 'service',
            serviceId: serviceId,
            storeId: storeId,
          })
        }
        openWeapp(miniprogramServicePath(serviceId, storeId))
      })
    }

    var consultBtn = document.getElementById('h5-consult-btn')
    if (consultBtn) {
      consultBtn.addEventListener('click', function () {
        if (!bookingEnabled) return
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_consult_click', {
            serviceId: serviceId,
            storeId: storeId,
          })
        }
        var phone = (store && store.phone) || ''
        if (phone) {
          window.location.href = 'tel:' + phone
        } else {
          alert('暂无门店电话，请稍后再试。')
        }
      })
    }

    var callBtn = document.getElementById('h5-call-btn')
    if (callBtn) {
      callBtn.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_call_click', {
            serviceId: serviceId,
            storeId: storeId,
          })
        }
        var phone = (store && store.phone) || ''
        if (phone) {
          window.location.href = 'tel:' + phone
        } else {
          alert('暂无门店电话，请稍后再试。')
        }
      })
    }
  }

  function renderService(service, store, cases) {
    var bookingEnabled = isBookingEnabled(service, store)
    var headTags = buildHeadTags(service)
    var price = buildPriceDisplay(service)
    var appointment = buildAppointmentSection(service)
    var isAccident = service.priceMode === 'accident'

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
      '<div class="h5-brand">辙见服务平台 · 服务详情</div>' +
      '<h1 class="h5-title">' +
      escapeHtml(service.name) +
      '</h1>' +
      '<div class="h5-tags">' +
      renderTags(headTags) +
      '</div>' +
      (service.storeName
        ? '<p class="h5-service-status">' + escapeHtml(service.storeName) + '</p>'
        : '') +
      '<div class="h5-banner">' +
      escapeHtml(COPY.displayDisclaimer) +
      '</div>' +
      '<div class="h5-banner">' +
      escapeHtml(COPY.geoDisclaimer) +
      '</div>' +
      pausedNotice +
      '</header>' +
      heroHtml +
      '<div class="h5-top-actions">' +
      '<button type="button" class="h5-btn h5-btn--secondary" id="h5-open-weapp-btn">打开小程序</button>' +
      (bookingEnabled
        ? '<button type="button" class="h5-btn" id="h5-consult-top-btn">留言咨询</button>'
        : '') +
      '</div>'

    html +=
      '<div class="h5-card"><h2 class="h5-section-title">参考价格</h2>' +
      '<p class="h5-price">' +
      escapeHtml(stripPriceSuffix(price.priceText)) +
      '</p>' +
      (price.note ? '<p class="h5-price-note">' + escapeHtml(price.note) + '</p>' : '') +
      '<p class="h5-compliance">' +
      escapeHtml(COPY.price) +
      '</p>' +
      (isAccident ? '<p class="h5-compliance">' + escapeHtml(COPY.accident) + '</p>' : '') +
      '</div>'

    if (service.summary) {
      html += '<p class="h5-summary">' + escapeHtml(service.summary) + '</p>'
    }

    html += renderKeyInfo(buildKeyInfoRows(service), '服务信息')

    if (service.detail) {
      html +=
        '<div class="h5-card"><h2 class="h5-section-title">服务说明</h2>' +
        '<p class="h5-service-detail-text">' +
        escapeHtml(service.detail) +
        '</p></div>'
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
      '<div class="h5-footer-inner h5-footer-inner--triple">' +
      '<button type="button" class="h5-btn h5-btn--secondary" id="h5-call-btn">电话</button>' +
      '<button type="button" class="h5-btn h5-btn--secondary" id="h5-open-weapp-btn-footer">打开小程序</button>' +
      '<button type="button" class="h5-btn" id="h5-consult-btn"' +
      (bookingEnabled ? '' : ' disabled') +
      '>留言咨询</button>' +
      '</div></footer>'

    var app = document.getElementById('app')
    if (app) app.innerHTML = html

    var consultTop = document.getElementById('h5-consult-top-btn')
    if (consultTop) {
      consultTop.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_consult_click', {
            serviceId: service.id,
            storeId: service.storeId,
          })
        }
        var phone = (store && store.phone) || ''
        if (phone) {
          window.location.href = 'tel:' + phone
        } else {
          alert('暂无门店电话，请稍后再试。')
        }
      })
    }

    var openWeappFooter = document.getElementById('h5-open-weapp-btn-footer')
    if (openWeappFooter) {
      openWeappFooter.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_open_weapp_click', {
            page_type: 'service',
            serviceId: service.id,
            storeId: service.storeId,
          })
        }
        openWeapp(miniprogramServicePath(service.id, service.storeId))
      })
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
