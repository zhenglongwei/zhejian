/**
 * H5 公开站展示文案 · 脱敏/授权告知在小程序完成，公开页仅展示内容
 */
(function (global) {
  if (global.zhejianPublicCopy) return
  var H5 = {
    displayDisclaimer: '本页内容仅供参考。实际方案与费用请与门店线下确认。',
    geoDisclaimer:
      '页面用于展示维修服务信息、门店信息与公开案例，不构成线上报价或维修承诺。实际方案、费用、质保与售后由用户与门店线下确认。',
    casePrice:
      '车主授权公示的案例展示当时方案报价；其余案例价格为系统参考区间，实际费用以门店检测为准。',
    price:
      '页面价格为参考范围，实际费用会因车型、配件品牌、损伤程度和门店检测结果不同而变化。',
    footnote:
      '页面内容为维修信息展示，不构成线上报价或维修承诺。实际方案与费用以门店线下确认为准。',
    listNote: '案例价格仅为参考，实际费用以门店检测为准。',
    caseCoverAlt: '案例封面',
    imagePlaceholder: '图片暂未就绪',
    caseLoadError: '案例不存在、未公开或内容未就绪',
  }

  function sanitizeVehicleLabel(text) {
    return String(text || '')
      .replace(/\s*[（(]\s*已脱敏\s*[）)]\s*/gu, '')
      .replace(/\s*已脱敏\s*/gu, '')
      .trim()
  }

  function stripPublicBoilerplate(text) {
    return String(text || '')
      .trim()
      .replace(/^该案例经车主授权[，,]?/u, '')
      .replace(/^该案例经车主匿名授权[，,]?/u, '')
      .replace(/^该案例为/u, '')
      .replace(/^本案例为/u, '')
      .replace(/图片已脱敏[^。]*。?/gu, '')
      .replace(/图片已进行[^。]*脱敏[^。]*。?/gu, '')
      .replace(/相关图片已脱敏[^。]*。?/gu, '')
      .replace(/过程图片已脱敏[^。]*。?/gu, '')
      .replace(/相关图片均已脱敏[^。]*。?/gu, '')
      .replace(/并通过平台审核[。.]?/gu, '')
      .replace(/并经平台脱敏审核[。.]?/gu, '')
      .replace(/经脱敏与审核后公开[。.]?/gu, '')
      .replace(/含脱敏过程图片[^。]*。?/gu, '')
      .replace(/公开展示仅使用脱敏图片[^。]*。?/gu, '')
      .replace(/公开内容经审核与脱敏处理/gu, '公开内容经审核')
      .replace(/脱敏过程图片/gu, '过程图片')
      .replace(/真实脱敏维修案例/gu, '真实维修案例')
      .replace(/已审核[、,]?已脱敏/gu, '已审核')
      .replace(/已脱敏[、,]?已审核/gu, '已审核')
      .replace(/，+/g, '，')
      .replace(/^，+|，+$/g, '')
      .trim()
  }

  global.zhejianPublicCopy = {
    H5: H5,
    sanitizeVehicleLabel: sanitizeVehicleLabel,
    stripPublicBoilerplate: stripPublicBoilerplate,
  }
})(typeof window !== 'undefined' ? window : globalThis)

(function (global) {
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
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
    if (data.priceMode === 'fixed' && data.planAmount != null && data.planAmount !== '') {
      var plan = Number(data.planAmount)
      if (Number.isFinite(plan)) return plan
    }
    return null
  }

  function buildPriceDisplay(data) {
    data = data || {}
    var mode = data.priceMode || 'range'
    var currency = '¥'
    var fixedAmount = resolveFixedAmount(data)
    var isAuthorized =
      data.authorizationTier === 'named' || data.authorizationTier === 'anonymous'

    if (mode === 'accident') {
      return { priceText: '预约到店检测后报价' }
    }
    if (fixedAmount != null && (mode === 'fixed' || isAuthorized)) {
      return { priceText: currency + fixedAmount }
    }
    if (mode === 'consult') {
      return { priceText: '到店检测后报价' }
    }
    if (data.minAmount != null && data.maxAmount != null) {
      return {
        priceText: '参考区间 ' + currency + data.minAmount + ' - ' + currency + data.maxAmount,
      }
    }
    return { priceText: stripPriceSuffix(data.priceText || '到店检测后报价') }
  }

  function caseHref(item) {
    if (item && item.slug) return '/case/' + encodeURIComponent(item.slug) + '.html'
    return '/case/view.html?id=' + encodeURIComponent(item.id || '')
  }

  function pickListCover(item) {
    return (
      (item && (item.coverImageDesensitized || item.coverImage)) || ''
    )
  }

  function renderDisclaimer(primary, secondary) {
    primary = String(primary || '').trim()
    secondary = String(secondary || '').trim()
    if (!primary && !secondary) return ''
    if (!secondary || primary === secondary) {
      return (
        '<div class="h5-disclaimer h5-disclaimer--single">' +
        '<p class="h5-disclaimer__primary">' +
        escapeHtml(primary || secondary) +
        '</p></div>'
      )
    }
    return (
      '<div class="h5-disclaimer" data-h5-disclaimer>' +
      '<p class="h5-disclaimer__primary">' +
      escapeHtml(primary) +
      '</p>' +
      '<div class="h5-disclaimer__more" hidden>' +
      '<p>' +
      escapeHtml(secondary) +
      '</p></div>' +
      '<button type="button" class="h5-disclaimer__toggle" data-h5-disclaimer-toggle aria-expanded="false">展开说明</button>' +
      '</div>'
    )
  }

  function bindDisclaimerToggles(root) {
    var scope = root || document
    scope.querySelectorAll('[data-h5-disclaimer-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var block = btn.closest('[data-h5-disclaimer]')
        if (!block) return
        var more = block.querySelector('.h5-disclaimer__more')
        if (!more) return
        var expanded = btn.getAttribute('aria-expanded') === 'true'
        if (expanded) {
          more.setAttribute('hidden', 'hidden')
          btn.setAttribute('aria-expanded', 'false')
          btn.textContent = '展开说明'
        } else {
          more.removeAttribute('hidden')
          btn.setAttribute('aria-expanded', 'true')
          btn.textContent = '收起说明'
        }
      })
    })
  }

  function renderCaseListItem(item, options) {
    options = options || {}
    var pc = global.zhejianPublicCopy || {}
    var strip = pc.stripPublicBoilerplate || function (v) {
      return String(v || '')
    }
    var coverAlt = (pc.H5 && pc.H5.caseCoverAlt) || '案例封面'
    var cover = pickListCover(item)
    var thumb = cover
      ? '<img class="h5-media-list-thumb" src="' +
        escapeHtml(cover) +
        '" alt="' +
        escapeHtml(coverAlt) +
        '" loading="lazy" />'
      : '<div class="h5-media-list-thumb h5-media-list-thumb--placeholder">案例</div>'
    var title = strip(item.title || item.serviceName || '公开案例')
    var priceLine = stripPriceSuffix(buildPriceDisplay(item).priceText)
    var metaParts = []
    if (priceLine) metaParts.push(priceLine)
    if (item.publishedAt) metaParts.push(item.publishedAt)
    if (item.storeName) metaParts.push(item.storeName)
    else if (item.city) metaParts.push(item.city)
    var summary = strip(item.summary || item.aiSummary || '')
    if (summary.length > 72) summary = summary.slice(0, 72) + '…'
    var href = options.href || caseHref(item)
    var className = options.className || 'h5-media-list-item'
    var extraAttrs = options.extraAttrs || ''
    return (
      '<a class="' +
      className +
      '" href="' +
      escapeHtml(href) +
      '"' +
      extraAttrs +
      '>' +
      thumb +
      '<div class="h5-media-list-body">' +
      '<div class="h5-media-list-title">' +
      escapeHtml(title) +
      '</div>' +
      (summary
        ? '<div class="h5-media-list-summary">' + escapeHtml(summary) + '</div>'
        : '') +
      (metaParts.length
        ? '<div class="h5-media-list-meta">' + escapeHtml(metaParts.join(' · ')) + '</div>'
        : '') +
      '</div></a>'
    )
  }

  function renderEntryCard(options) {
    options = options || {}
    var href = options.href || '#'
    var name = options.name || ''
    var summary = options.summary || ''
    var hint = options.hint || '›'
    var className = options.className || 'h5-entry-card'
    var extraAttrs = options.extraAttrs || ''
    return (
      '<a class="' +
      className +
      '" href="' +
      escapeHtml(href) +
      '"' +
      extraAttrs +
      '>' +
      '<div class="h5-entry-card__body">' +
      '<div class="h5-entry-card__title">' +
      escapeHtml(name) +
      '</div>' +
      (summary
        ? '<div class="h5-entry-card__summary">' + escapeHtml(summary) + '</div>'
        : '') +
      '</div>' +
      '<span class="h5-entry-card__hint" aria-hidden="true">' +
      escapeHtml(hint) +
      '</span></a>'
    )
  }

  function renderStoreListItem(store, options) {
    options = options || {}
    var cover = (store && store.coverImage) || ''
    var thumb = cover
      ? '<img class="h5-media-list-thumb" src="' +
        escapeHtml(cover) +
        '" alt="' +
        escapeHtml(store.name || '门店') +
        '门头" loading="lazy" />'
      : '<div class="h5-media-list-thumb h5-media-list-thumb--placeholder">门店</div>'
    var metaParts = []
    if (store.address) metaParts.push(store.address)
    if (store.businessHours) metaParts.push(store.businessHours)
    if (store.caseCount > 0) metaParts.push('公开案例 ' + store.caseCount)
    if (store.score >= 10) metaParts.push('透明度 ' + Math.round(store.score) + ' 分')
    var href =
      options.href || '/store/' + encodeURIComponent(store.id || '') + '.html'
    var className = options.className || 'h5-media-list-item'
    var extraAttrs = options.extraAttrs || ''
    return (
      '<a class="' +
      className +
      '" href="' +
      escapeHtml(href) +
      '"' +
      extraAttrs +
      '>' +
      thumb +
      '<div class="h5-media-list-body">' +
      '<div class="h5-media-list-title">' +
      escapeHtml(store.name || '门店') +
      '</div>' +
      (metaParts.length
        ? '<div class="h5-media-list-meta">' + escapeHtml(metaParts.join(' · ')) + '</div>'
        : '') +
      '</div></a>'
    )
  }

  function renderServiceListItem(item, options) {
    options = options || {}
    var cover = (item && (item.coverImage || item.thumbImage)) || ''
    var thumb = cover
      ? '<img class="h5-media-list-thumb" src="' +
        escapeHtml(cover) +
        '" alt="' +
        escapeHtml(item.name || '服务') +
        '" loading="lazy" />'
      : '<div class="h5-media-list-thumb h5-media-list-thumb--placeholder">服务</div>'
    var title = item.name || '服务方案'
    var summary = item.summary || ''
    if (summary.length > 72) summary = summary.slice(0, 72) + '…'
    var priceLine = stripPriceSuffix(buildPriceDisplay(item).priceText)
    var metaParts = []
    if (priceLine) metaParts.push(priceLine)
    if (options.bookingEnabled === false) metaParts.push('暂停预约')
    var href =
      options.href ||
      '/service/' + encodeURIComponent(item.id || '') + '.html'
    var className = options.className || 'h5-media-list-item'
    var extraAttrs = options.extraAttrs || ''
    return (
      '<a class="' +
      className +
      '" href="' +
      escapeHtml(href) +
      '"' +
      extraAttrs +
      '>' +
      thumb +
      '<div class="h5-media-list-body">' +
      '<div class="h5-media-list-title">' +
      escapeHtml(title) +
      '</div>' +
      (summary
        ? '<div class="h5-media-list-summary">' + escapeHtml(summary) + '</div>'
        : '') +
      (metaParts.length
        ? '<div class="h5-media-list-meta">' + escapeHtml(metaParts.join(' · ')) + '</div>'
        : '') +
      '</div></a>'
    )
  }

  global.zhejianH5Ui = {
    escapeHtml: escapeHtml,
    stripPriceSuffix: stripPriceSuffix,
    buildPriceDisplay: buildPriceDisplay,
    caseHref: caseHref,
    pickListCover: pickListCover,
    renderDisclaimer: renderDisclaimer,
    bindDisclaimerToggles: bindDisclaimerToggles,
    renderCaseListItem: renderCaseListItem,
    renderEntryCard: renderEntryCard,
    renderStoreListItem: renderStoreListItem,
    renderServiceListItem: renderServiceListItem,
  }
})(typeof window !== 'undefined' ? window : globalThis)
