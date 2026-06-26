(function () {
  var path = location.pathname
  if (path === '/store' || path === '/store/') {
    location.replace('/store/index.html')
    return
  }

  var COPY = {
    displayDisclaimer:
      '本页内容由商家自行发布或经车主授权展示，仅供参考。实际方案与费用请与门店线下确认。',
    geoDisclaimer:
      '页面内容用于展示维修服务信息、门店信息和脱敏案例，不构成线上报价或维修承诺。实际维修方案、费用、配件、质保和售后由用户与门店线下确认。',
    price: '实际费用以门店检测结果为准，以下价格为参考区间。',
    casePrice:
      '车主授权公示的案例展示当时方案报价；其余案例价格为系统参考区间，实际费用以门店检测为准。',
    caseCompliance:
      '公开展示仅使用脱敏图片，不含车牌、手机号等隐私信息。',
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

  var STATUS_TEXT = {
    open: '营业中',
    closed: '休息中',
    holiday: '节假日休息',
    suspended: '暂停预约',
    offline: '暂不可预约',
  }

  var LIST_LIMIT = 6

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
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

  function storePagePath(storeId) {
    return '/store/' + encodeURIComponent(storeId) + '.html'
  }

  function storeCasesPagePath(storeId) {
    return '/store/' + encodeURIComponent(storeId) + '/cases'
  }

  function casePagePath(caseItem) {
    if (caseItem && typeof caseItem === 'object') {
      if (caseItem.slug) return '/case/' + encodeURIComponent(caseItem.slug) + '.html'
      return '/case/view.html?id=' + encodeURIComponent(caseItem.id)
    }
    return '/case/view.html?id=' + encodeURIComponent(caseItem)
  }

  function servicePagePath(serviceId) {
    return '/service/' + encodeURIComponent(serviceId) + '.html'
  }

  function resolveStoreId() {
    if (window.__STORE_ID__) return String(window.__STORE_ID__).trim()
    var pathMatch = location.pathname.match(/\/store\/([^/]+)\.html$/)
    if (pathMatch && pathMatch[1] !== 'view' && pathMatch[1] !== 'index') {
      return decodeURIComponent(pathMatch[1]).trim()
    }
    var params = new URLSearchParams(location.search)
    var fromQuery = params.get('id') || params.get('storeId') || ''
    return String(fromQuery).trim()
  }

  function maybeRedirectToCanonical(storeId) {
    if (!storeId) return false
    if (/\/store\/view\.html$/i.test(location.pathname)) {
      var target = storePagePath(storeId)
      var qs = location.search.replace(/^\?/, '')
      var hash = location.hash || ''
      location.replace(target + (qs ? '?' + qs : '') + hash)
      return true
    }
    return false
  }

  function isFixtureFallbackAllowed() {
    var host = String(location.hostname || '').toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1') return true
    if (window.__H5_ALLOW_FIXTURES__ === true) return true
    return false
  }

  function extractCity(store) {
    if (store.city) return String(store.city)
    var addr = store.address || ''
    var m = String(addr).match(/([\u4e00-\u9fa5]{2,4}市)/)
    if (m) return m[1]
    var intro = store.aiSummary || store.intro || ''
    var m2 = String(intro).match(/([\u4e00-\u9fa5]{2,4}市)/)
    return m2 ? m2[1] : ''
  }

  function buildStoreHeadTags(store) {
    var tags = [{ cls: 'h5-tag--audited', text: '已审核' }]
    var qualification = (store.qualificationTags || [])[0]
    if (qualification) {
      tags.push({ cls: 'h5-tag--info', text: qualification })
    }
    if (store.supportsAlbum) {
      tags.push({ cls: 'h5-tag--info', text: '支持服务相册' })
    }
    return tags.slice(0, 3)
  }

  function buildInfoRows(store) {
    var rows = [
      { label: '地址', value: store.address || '—' },
      { label: '营业时间', value: store.businessHours || '—' },
    ]
    if (store.contactName) {
      rows.push({ label: '联系人', value: store.contactName })
    }
    if (store.specialties && store.specialties.length) {
      rows.push({ label: '擅长项目', value: store.specialties.join('、') })
    }
    if (store.vehicleSpecialties && store.vehicleSpecialties.length) {
      rows.push({ label: '擅长车型', value: store.vehicleSpecialties.join('、') })
    }
    return rows
  }

  function buildCertRows(certifications) {
    return (certifications || []).map(function (item) {
      return { label: item.label, value: item.text || '—' }
    })
  }

  function buildTransparencyText(store, serviceCount) {
    if (store.transparency && store.transparency.summary) {
      return store.transparency.summary
    }
    var parts = []
    if (store.caseCount > 0) {
      parts.push('该门店已公开 ' + store.caseCount + ' 个维修案例')
    }
    if (store.score >= 10) {
      parts.push('透明度评分 ' + Math.round(Number(store.score)) + ' 分')
    }
    if (serviceCount > 0) {
      parts.push('已上架 ' + serviceCount + ' 个可预约服务')
    }
    if (!parts.length) return '该门店正在完善辙见资料。'
    return parts.join('，') + '。'
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

    if (mode === 'accident') {
      return {
        priceText: '预约到店检测后报价',
        note: '事故车维修无法仅凭线上信息准确报价，请预约到店检测后确认方案。',
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
        note: '实际费用以门店检测结果为准。',
      }
    }
    if (data.minAmount != null && data.maxAmount != null) {
      return {
        priceText: '参考区间 ' + currency + data.minAmount + ' - ' + currency + data.maxAmount,
        note: '实际费用以门店检测结果为准。',
      }
    }
    return {
      priceText: stripPriceSuffix(data.priceText || '到店检测后报价'),
      note: '实际费用以门店检测结果为准。',
    }
  }

  function buildPageTitle(store) {
    var city = extractCity(store)
    var specialty = (store.specialties && store.specialties[0]) || '汽车维修保养'
    var cityPart = city ? city.replace(/市$/, '') : ''
    return store.name + '_' + cityPart + specialty + '汽车维修保养门店 · 辙见'
  }

  function buildPageDescription(store) {
    var city = extractCity(store)
    var region = store.address || ''
    var services = (store.specialties || []).slice(0, 4).join('、') || '汽车维修保养'
    return (
      store.name +
      '位于' +
      (city || region || '') +
      '，提供' +
      services +
      '等汽车维修保养服务，可查看真实维修案例、透明度指标、门店环境和预约入口。'
    )
  }

  function setShareMeta(store) {
    var desc = buildPageDescription(store)
    var title = buildPageTitle(store)
    var canonical = location.origin + storePagePath(store.id)
    document.title = title
    ensureMeta('name', 'description', desc)
    ensureMeta('property', 'og:title', title)
    ensureMeta('property', 'og:description', desc)
    if (store.coverImage) ensureMeta('property', 'og:image', store.coverImage)
    ensureLink('canonical', canonical)

    var schema = {
      '@context': 'https://schema.org',
      '@type': 'AutoRepair',
      name: store.name,
      url: canonical,
      image: store.coverImage || undefined,
      address: store.address || undefined,
    }
    if (store.phone) schema.telephone = store.phone
    ensureJsonLd('store-schema', schema)
    if (store.faq && store.faq.length) {
      ensureJsonLd('store-faq-schema', {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: store.faq.map(function (item) {
          return {
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          }
        }),
      })
    }
    if (window.zhejianSeo) {
      window.zhejianSeo.applyBreadcrumbSchema(
        [
          { label: '辙见', href: '/' },
          { label: '公开门店', href: '/store/' },
          { label: store.name },
        ],
        'store-breadcrumb'
      )
    }
  }

  function setNoIndex() {
    ensureMeta('name', 'robots', 'noindex,nofollow')
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
      '<div class="h5-folio-panel"><h2 class="h5-folio-section-title">' +
      escapeHtml(title || '门店信息') +
      '</h2><table class="h5-table">' +
      body +
      '</table></div>'
    )
  }

  function renderTransparencyPanel(store, serviceCount) {
    var transparency = store.transparency || {}
    var metrics = []
    if (transparency.caseCount > 0) {
      metrics.push({ num: String(transparency.caseCount), label: '公开案例' })
    }
    if (transparency.albumCompleteRate > 0) {
      metrics.push({ num: transparency.albumCompleteRate + '%', label: '相册完整率' })
    }
    if (transparency.score > 0) {
      metrics.push({ num: String(transparency.score), label: '透明度评分' })
    }
    if (transparency.serviceCount > 0 || serviceCount > 0) {
      metrics.push({
        num: String(transparency.serviceCount || serviceCount),
        label: '可预约服务',
      })
    }
    var grid =
      metrics.length > 0
        ? '<div class="h5-metric-grid">' +
          metrics
            .map(function (cell) {
              return (
                '<div class="h5-metric-cell"><span class="h5-metric-num">' +
                escapeHtml(cell.num) +
                '</span><span class="h5-metric-label">' +
                escapeHtml(cell.label) +
                '</span></div>'
              )
            })
            .join('') +
          '</div>'
        : ''
    return (
      '<div class="h5-folio-panel" id="store-transparency"><h2 class="h5-folio-section-title">透明度指标</h2>' +
      grid +
      '<p class="h5-transparency">' +
      escapeHtml(buildTransparencyText(store, serviceCount)) +
      '</p></div>'
    )
  }

  function renderCertSection(store, certRows) {
    if (!certRows.length && !(store.certWall && store.certWall.length)) return ''
    var table = ''
    if (certRows.length) {
      var body = certRows
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
      table = '<table class="h5-table">' + body + '</table>'
    }
    var wall = ''
    if (store.certWall && store.certWall.length) {
      wall =
        '<div class="h5-cert-wall">' +
        store.certWall
          .map(function (item) {
            return (
              '<div class="h5-cert-wall-item"><img class="h5-cert-wall-img" src="' +
              escapeHtml(item.imageUrl) +
              '" alt="' +
              escapeHtml(item.label) +
              '" loading="lazy" /><div class="h5-cert-wall-caption">' +
              escapeHtml(item.label) +
              ' · ' +
              escapeHtml(item.text || '已认证') +
              '</div></div>'
            )
          })
          .join('') +
        '</div>'
    }
    return (
      '<div class="h5-folio-panel" id="store-trust"><h2 class="h5-folio-section-title">门店资质</h2>' +
      table +
      wall +
      '</div>'
    )
  }

  function renderStaff(staffPublic) {
    if (!staffPublic || !staffPublic.length) return ''
    var items = staffPublic
      .map(function (member) {
        var creds = (member.credentials || [])
          .map(function (cred) {
            return '<li class="h5-staff-cred">' + escapeHtml(cred) + '</li>'
          })
          .join('')
        return (
          '<div class="h5-staff-item"><div class="h5-staff-name">' +
          escapeHtml(member.name) +
          '</div><div class="h5-staff-role">' +
          escapeHtml(member.role || '员工') +
          '</div>' +
          (creds ? '<ul class="h5-staff-creds">' + creds + '</ul>' : '') +
          '</div>'
        )
      })
      .join('')
    return (
      '<div class="h5-folio-panel" id="store-staff"><h2 class="h5-folio-section-title">员工资质</h2><div class="h5-staff-list">' +
      items +
      '</div></div>'
    )
  }

  function renderStoreFaq(faq) {
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
    return (
      '<div class="h5-folio-panel h5-topic-faq" id="store-faq"><h2 class="h5-folio-section-title">常见问题</h2>' +
      items +
      '</div>'
    )
  }

  function renderSpecialties(list) {
    if (!list || !list.length) return ''
    var items = list
      .map(function (name) {
        return '<li class="h5-specialty-item">' + escapeHtml(name) + '</li>'
      })
      .join('')
    return (
      '<div class="h5-folio-panel"><h2 class="h5-folio-section-title">擅长项目</h2>' +
      '<ul class="h5-specialty-list">' +
      items +
      '</ul></div>'
    )
  }

  function renderStoreContact(store) {
    var parts = []
    if (store.address) {
      parts.push(
        '<span class="h5-store-contact__addr">' + escapeHtml(store.address) + '</span>'
      )
    }
    if (store.phone) {
      parts.push(
        '<a class="h5-store-contact__phone" href="tel:' +
          escapeHtml(store.phone) +
          '">' +
          escapeHtml(store.phone) +
          '</a>'
      )
    }
    if (!parts.length) return ''
    return '<p class="h5-store-contact">' + parts.join('') + '</p>'
  }

  function renderServices(services, storeId, bookingEnabled) {
    var section =
      '<div class="h5-folio-panel" id="store-services"><h2 class="h5-folio-section-title">服务方案</h2>' +
      '<p class="h5-compliance">' +
      escapeHtml(COPY.price) +
      '</p>'
    if (!services || !services.length) {
      return section + '<div class="h5-empty-block">暂无可预约服务</div></div>'
    }
    var cards = services
      .map(function (svc) {
        if (window.zhejianH5Ui && window.zhejianH5Ui.renderServiceListItem) {
          return window.zhejianH5Ui.renderServiceListItem(svc, {
            href: servicePagePath(svc.id),
            bookingEnabled: bookingEnabled,
            extraAttrs: ' data-service-id="' + escapeHtml(svc.id) + '"',
          })
        }
        var price = buildPriceDisplay(svc)
        return (
          '<a class="h5-media-list-item" href="' +
          servicePagePath(svc.id) +
          '" data-service-id="' +
          escapeHtml(svc.id) +
          '">' +
          '<div class="h5-media-list-thumb h5-media-list-thumb--placeholder">服务</div>' +
          '<div class="h5-media-list-body">' +
          '<div class="h5-media-list-title">' +
          escapeHtml(svc.name) +
          '</div>' +
          (svc.summary
            ? '<div class="h5-media-list-summary">' + escapeHtml(svc.summary) + '</div>'
            : '') +
          '<div class="h5-media-list-meta">' +
          escapeHtml(stripPriceSuffix(price.priceText)) +
          '</div></div></a>'
        )
      })
      .join('')
    return section + '<div class="h5-media-list">' + cards + '</div></div>'
  }

  function renderCases(cases, store) {
    var storeId = store && store.id ? store.id : ''
    var totalCount = store && store.caseCount ? store.caseCount : (cases || []).length
    var caseNote = COPY.casePrice + ' ' + COPY.caseCompliance
    var section =
      '<div class="h5-folio-panel" id="store-cases"><h2 class="h5-folio-section-title">真实维修案例</h2>' +
      '<p class="h5-compliance">' +
      escapeHtml(caseNote) +
      '</p>'
    if (!cases || !cases.length) {
      return section + '<div class="h5-empty-block">该门店暂无公开案例</div></div>'
    }
    var cards = cases
      .map(function (item) {
        if (window.zhejianH5Ui && window.zhejianH5Ui.renderCaseListItem) {
          return window.zhejianH5Ui.renderCaseListItem(item, {
            href: casePagePath(item),
            extraAttrs: ' data-case-id="' + escapeHtml(item.id) + '"',
          })
        }
        var cover = pickCaseCover(item)
        var price = buildPriceDisplay(item)
        var coverHtml = cover
          ? '<img class="h5-media-list-thumb" src="' +
            escapeHtml(cover) +
            '" alt="脱敏案例封面" loading="lazy" />'
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
    var moreLink =
      storeId && totalCount > (cases || []).length
        ? '<p class="h5-home-more"><a class="h5-link" href="' +
          storeCasesPagePath(storeId) +
          '">查看全部 ' +
          totalCount +
          ' 个案例 ›</a></p>'
        : storeId && totalCount > LIST_LIMIT
          ? '<p class="h5-home-more"><a class="h5-link" href="' +
            storeCasesPagePath(storeId) +
            '">查看全部案例 ›</a></p>'
          : ''
    return section + '<div class="h5-media-list">' + cards + '</div>' + moreLink + '</div>'
  }

  function renderEnvironment(images) {
    if (!images || !images.length) return ''
    var imgs = images
      .map(function (url, idx) {
        return (
          '<img class="h5-env-img" src="' +
          escapeHtml(url) +
          '" alt="门店环境图' +
          (idx + 1) +
          '" loading="lazy" />'
        )
      })
      .join('')
    return (
      '<div class="h5-folio-panel"><h2 class="h5-folio-section-title">门店环境</h2>' +
      '<div class="h5-env-grid">' +
      imgs +
      '</div></div>'
    )
  }

  function miniprogramPath(page, storeId, extra) {
    extra = extra || {}
    var q =
      'source=h5&page_type=store&store_id=' +
      encodeURIComponent(storeId) +
      '&utm_source=h5'
    if (extra.serviceId) q += '&service_item_id=' + encodeURIComponent(extra.serviceId)
    if (extra.caseId) q += '&case_id=' + encodeURIComponent(extra.caseId)
    return '/pages/' + page + '?' + q
  }

  function bindStoreInteractions(store, bookingEnabled) {
    var storeId = store.id

    document.querySelectorAll('.h5-media-list-item[data-service-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        var serviceId = el.getAttribute('data-service-id') || ''
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_store_service_click', {
            storeId: storeId,
            serviceId: serviceId,
          })
        }
      })
    })

    document.querySelectorAll('.h5-media-list-item[data-case-id], .h5-store-case-card[data-case-id]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        var caseId = el.getAttribute('data-case-id') || ''
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_store_case_click', {
            storeId: storeId,
            caseId: caseId,
          })
        }
      })
    })

    var openWeappBtn = document.getElementById('h5-open-weapp-btn')
    if (openWeappBtn) {
      openWeappBtn.addEventListener('click', function () {
        trackOpenWeapp(storeId)
        openWeapp(miniprogramPath('store/detail/index', storeId))
      })
    }

    var bookBtn = document.getElementById('h5-book-btn')
    if (bookBtn) {
      bookBtn.addEventListener('click', function () {
        if (!bookingEnabled) {
          alert('门店当前暂停预约，请稍后再试或直接电话联系。')
          return
        }
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_store_consult_click', { storeId: storeId })
        }
        if (store.phone) {
          window.location.href = 'tel:' + store.phone
        } else {
          alert('暂无门店电话，请稍后再试。')
        }
      })
    }

    var callBtn = document.getElementById('h5-call-btn')
    if (callBtn) {
      callBtn.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_call_click', { storeId: storeId })
        }
        if (store.phone) {
          window.location.href = 'tel:' + store.phone
        } else {
          alert('暂无门店电话，请稍后再试。')
        }
      })
    }

    var navBtn = document.getElementById('h5-nav-btn')
    if (navBtn) {
      navBtn.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_navigation_click', { storeId: storeId })
        }
        if (store.latitude != null && store.longitude != null) {
          var lat = store.latitude
          var lng = store.longitude
          var name = encodeURIComponent(store.name || '门店')
          var addr = encodeURIComponent(store.address || '')
          window.location.href =
            'https://uri.amap.com/marker?position=' +
            lng +
            ',' +
            lat +
            '&name=' +
            name +
            '&content=' +
            addr
        } else {
          alert('暂无导航坐标')
        }
      })
    }
  }

  function trackOpenWeapp(storeId) {
    if (window.zhejianTrack) {
      window.zhejianTrack.track('h5_open_weapp_click', {
        storeId: storeId,
        page_type: 'store',
      })
    }
  }

  function openWeapp(path) {
    alert('请打开微信小程序继续。路径：' + path)
  }

  function renderStore(store, services, cases) {
    var bookingEnabled = store.status !== 'suspended' && store.status !== 'offline'
    var statusText = STATUS_TEXT[store.status] || store.status || ''
    var headTags = buildStoreHeadTags(store)
    var certRows = buildCertRows(store.certifications)

    setShareMeta(store)

    var heroHtml = store.coverImage
      ? '<div class="h5-store-hero"><img class="h5-store-hero-img" src="' +
        escapeHtml(store.coverImage) +
        '" alt="' +
        escapeHtml(store.name) +
        '门头" loading="eager" /></div>'
      : ''

    var suspendedNotice =
      store.status === 'suspended'
        ? '<div class="h5-store-notice h5-store-notice--warn">门店当前暂停预约，页面信息仅供浏览。</div>'
        : ''

    var html =
      '<div class="h5-page">' +
      '<nav class="h5-breadcrumb"><a href="/">辙见</a> › <a href="/store/">公开门店</a> › ' +
      escapeHtml(store.name) +
      '</nav>' +
      '<header class="h5-header">' +
      '<div class="h5-brand">辙见服务平台 · 门店公开主页</div>' +
      '<h1 class="h5-title">' +
      escapeHtml(store.name) +
      '</h1>' +
      '<div class="h5-tags">' +
      renderTags(headTags) +
      '</div>' +
      '<p class="h5-store-status">' +
      escapeHtml(statusText) +
      (store.caseCount ? ' · 公开案例 ' + store.caseCount : '') +
      '</p>' +
      renderStoreContact(store) +
      renderDisclaimerBlock() +
      suspendedNotice +
      '</header>' +
      heroHtml +
      '<div class="h5-top-actions">' +
      '<button type="button" class="h5-btn h5-btn--secondary" id="h5-open-weapp-btn">打开小程序</button>' +
      (bookingEnabled
        ? '<button type="button" class="h5-btn" id="h5-book-top-btn">预约该门店</button>'
        : '') +
      '</div>'

    if (store.aiSummary || store.intro) {
      html +=
        '<div class="h5-folio-summary">' +
        escapeHtml(store.aiSummary || store.intro) +
        '</div>'
    }

    html += renderKeyInfo(buildInfoRows(store), '门店信息')
    html += renderCertSection(store, certRows)
    html += renderStaff(store.staffPublic)
    html += renderTransparencyPanel(store, (services || []).length)
    html += renderSpecialties(store.specialties)
    html += renderServices(services, store.id, bookingEnabled)
    html += renderCases(cases, store)
    html += renderEnvironment(store.environmentImages)
    html += renderStoreFaq(store.faq)

    html += '<div class="h5-body-spacer"></div></div>'

    html +=
      '<footer class="h5-footer">' +
      '<div class="h5-footer-inner h5-footer-inner--triple">' +
      '<button type="button" class="h5-btn h5-btn--secondary" id="h5-call-btn">电话</button>' +
      '<button type="button" class="h5-btn h5-btn--secondary" id="h5-nav-btn">导航</button>' +
      '<button type="button" class="h5-btn" id="h5-book-btn">' +
      (bookingEnabled ? '留言预约' : '暂停预约') +
      '</button>' +
      '</div></footer>'

    var app = document.getElementById('app')
    if (app) app.innerHTML = html

    if (window.zhejianH5Ui && window.zhejianH5Ui.bindDisclaimerToggles) {
      window.zhejianH5Ui.bindDisclaimerToggles()
    }

    var bookTop = document.getElementById('h5-book-top-btn')
    if (bookTop) {
      bookTop.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_store_consult_click', { storeId: store.id })
        }
        if (store.phone) {
          window.location.href = 'tel:' + store.phone
        } else {
          alert('暂无门店电话，请稍后再试。')
        }
      })
    }

    bindStoreInteractions(store, bookingEnabled)

    if (window.zhejianTrack) {
      window.zhejianTrack.trackStoreView({
        id: store.id,
        name: store.name,
        city: extractCity(store),
      })
      window.zhejianTrack.bindScrollDepth({ storeId: store.id })
    }
  }

  function renderError(message, storeId, noIndex) {
    document.title = '门店不可用 · 辙见'
    if (noIndex) setNoIndex()
    var app = document.getElementById('app')
    if (app) {
      app.innerHTML =
        '<div class="h5-error">' +
        '<h1>无法加载门店</h1>' +
        '<p>' +
        escapeHtml(message) +
        '</p>' +
        (storeId
          ? '<p class="h5-error-id">门店 ID：' + escapeHtml(storeId) + '</p>'
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

  function loadMerchant(storeId) {
    var apiUrl =
      window.__STORE_API__ ||
      '/api/v1/user/merchants/' + encodeURIComponent(storeId)
    return fetchJson(apiUrl).then(function (result) {
      if (!result.ok || result.body.code !== 0 || !result.body.data) {
        var err = new Error('门店不存在或未公开')
        err.httpStatus = result.status
        err.apiCode = result.body && result.body.code
        throw err
      }
      return result.body.data
    })
  }

  function loadServices(storeId) {
    return fetchJson(
      '/api/v1/user/services?storeId=' + encodeURIComponent(storeId)
    )
      .then(function (result) {
        if (!result.ok || result.body.code !== 0) return []
        return result.body.data.list || []
      })
      .catch(function () {
        return []
      })
  }

  function loadCases(storeId) {
    return fetchJson(
      '/api/v1/user/cases?storeId=' +
        encodeURIComponent(storeId) +
        '&limit=' +
        LIST_LIMIT
    )
      .then(function (result) {
        if (!result.ok || result.body.code !== 0) return []
        return result.body.data.list || []
      })
      .catch(function () {
        return []
      })
  }

  function loadFixture(storeId) {
    return fetch('/fixtures/store_' + encodeURIComponent(storeId) + '.json')
      .then(function (res) {
        if (!res.ok) throw new Error('fixture missing')
        return res.json()
      })
      .then(function (data) {
        return {
          store: data,
          services: data.services || [],
          cases: data.cases || [],
        }
      })
  }

  function resolveLoadErrorMessage(err) {
    if (err && err.message === 'missing store id') return '门店 ID 无效，请检查链接是否完整'
    if (err && (err.httpStatus === 404 || err.httpStatus === 410 || err.apiCode === 100004)) {
      return '门店不存在或未公开展示'
    }
    if (err && err.name === 'TypeError') return '网络异常，请稍后重试'
    return '门店不存在、未公开或资料未就绪'
  }

  function loadStore(storeId) {
    if (!storeId) {
      renderError('门店 ID 无效，请检查链接是否完整', '', true)
      return
    }

    loadMerchant(storeId)
      .then(function (store) {
        return Promise.all([loadServices(storeId), loadCases(storeId)]).then(function (parts) {
          renderStore(store, parts[0], parts[1])
        })
      })
      .catch(function (apiErr) {
        if (!isFixtureFallbackAllowed()) throw apiErr
        console.info('[h5-store] API 失败，本地 fallback fixtures', storeId)
        return loadFixture(storeId).then(function (payload) {
          renderStore(payload.store, payload.services, payload.cases)
        })
      })
      .catch(function (err) {
        var noIndex =
          err &&
          (err.httpStatus === 404 || err.httpStatus === 410 || err.apiCode === 100004)
        renderError(resolveLoadErrorMessage(err), storeId, noIndex)
      })
  }

  var storeId = resolveStoreId()
  if (!maybeRedirectToCanonical(storeId)) {
    loadStore(storeId)
  }
})()
