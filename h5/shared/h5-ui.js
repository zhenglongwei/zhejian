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
    var cover = pickListCover(item)
    var thumb = cover
      ? '<img class="h5-media-list-thumb" src="' +
        escapeHtml(cover) +
        '" alt="脱敏案例封面" loading="lazy" />'
      : '<div class="h5-media-list-thumb h5-media-list-thumb--placeholder">案例</div>'
    var title = item.title || item.serviceName || '公开案例'
    var priceLine = stripPriceSuffix(buildPriceDisplay(item).priceText)
    var metaParts = []
    if (priceLine) metaParts.push(priceLine)
    if (item.publishedAt) metaParts.push(item.publishedAt)
    if (item.storeName) metaParts.push(item.storeName)
    else if (item.city) metaParts.push(item.city)
    var summary = item.summary || item.aiSummary || ''
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
    renderServiceListItem: renderServiceListItem,
  }
})(typeof window !== 'undefined' ? window : globalThis)
