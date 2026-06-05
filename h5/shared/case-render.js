(function () {
  var TAG_MAP = {
    authorized: { text: '已授权', cls: 'h5-tag--order' },
    named: { text: '实名授权', cls: 'h5-tag--order' },
    anonymous: { text: '匿名授权', cls: 'h5-tag--desensitized' },
    desensitized: { text: '已脱敏', cls: 'h5-tag--desensitized' },
    audited: { text: '已审核', cls: 'h5-tag--audited' },
  }

  function isDesensitizedUrl(url) {
    if (!url) return false
    var value = String(url)
    if (value.indexOf('mock://desensitized/') === 0) return true
    if (value.indexOf('/files/uploads/desensitized/') !== -1) return true
    if (value.indexOf('/media/files/uploads/desensitized/') !== -1) return true
    return false
  }

  function pickNodeDesensitizedImages(node) {
    var urls = []
    ;(node.imagesDesensitized || []).forEach(function (img) {
      if (isDesensitizedUrl(img)) urls.push(img)
    })
    ;(node.images || []).forEach(function (img) {
      if (isDesensitizedUrl(img)) urls.push(img)
    })
    return urls
  }

  function pickCaseCover(data) {
    if (data.coverImageDesensitized && isDesensitizedUrl(data.coverImageDesensitized)) {
      return data.coverImageDesensitized
    }
    if (data.coverImage && isDesensitizedUrl(data.coverImage)) {
      return data.coverImage
    }
    for (var i = 0; i < (data.nodes || []).length; i += 1) {
      var imgs = pickNodeDesensitizedImages(data.nodes[i])
      if (imgs.length) return imgs[0]
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

  function setShareMeta(data) {
    var desc =
      data.aiSummary ||
      data.summary ||
      '本页为已脱敏公开案例，不含车牌、手机号等隐私信息。'
    var cover = pickCaseCover(data)
    ensureMeta('name', 'description', desc)
    ensureMeta('property', 'og:title', (data.title || '公开案例') + ' · 辙见')
    ensureMeta('property', 'og:description', desc)
    if (cover) ensureMeta('property', 'og:image', cover)
  }

  function sanitizeCaseForDisplay(data) {
    var next = Object.assign({}, data)
    next.nodes = (data.nodes || []).map(function (node) {
      return Object.assign({}, node, {
        images: pickNodeDesensitizedImages(node),
        imagesDesensitized: pickNodeDesensitizedImages(node),
      })
    })
    var cover = pickCaseCover(next)
    next.coverImage = cover
    next.coverImageDesensitized = cover
    return next
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function resolveCaseId() {
    if (window.__CASE_ID__) return String(window.__CASE_ID__).trim()
    var params = new URLSearchParams(location.search)
    var fromQuery = params.get('id') || params.get('caseId') || ''
    if (fromQuery) return String(fromQuery).trim()
    var match = location.pathname.match(/\/([^/]+)\.html$/)
    if (!match) return ''
    var base = match[1]
    if (base === 'view' || base === 'index') return ''
    return base
  }

  function isFixtureFallbackAllowed() {
    var host = String(location.hostname || '').toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1') return true
    if (window.__H5_ALLOW_FIXTURES__ === true) return true
    return false
  }

  function renderTags(data) {
    var tier = data.authorizationTier
    var html = ''
    if (tier === 'anonymous') {
      html += '<span class="h5-tag h5-tag--desensitized">匿名授权</span>'
    } else if (tier === 'named') {
      html += '<span class="h5-tag h5-tag--order">实名授权</span>'
    } else if (tier === 'private') {
      html += '<span class="h5-tag h5-tag--audited">门店留档</span>'
    } else {
      html += '<span class="h5-tag h5-tag--order">已授权</span>'
    }
    html += '<span class="h5-tag h5-tag--desensitized">已脱敏</span>'
    html += '<span class="h5-tag h5-tag--audited">已审核</span>'
    return html
  }

  function renderKeyInfo(rows) {
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
      '<div class="h5-card"><h2 class="h5-section-title">关键信息</h2><table class="h5-table">' +
      body +
      '</table></div>'
    )
  }

  function renderNodeImage(node) {
    var desensitized = pickNodeDesensitizedImages(node)
    if (desensitized.length) {
      return (
        '<img class="h5-node-img" src="' +
        escapeHtml(desensitized[0]) +
        '" alt="脱敏维修过程图片" loading="lazy" />'
      )
    }
    return '<div class="h5-placeholder-img">脱敏图片暂未就绪</div>'
  }

  function renderNodes(nodes) {
    if (!nodes || !nodes.length) return ''
    var items = nodes
      .map(function (node) {
        return (
          '<div class="h5-node">' +
          '<div class="h5-node-title">' +
          escapeHtml(node.title) +
          '</div>' +
          renderNodeImage(node) +
          (node.note
            ? '<div class="h5-node-note">' + escapeHtml(node.note) + '</div>'
            : '') +
          '</div>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">维修过程</h2>' +
      '<p class="h5-compliance">公开展示仅使用脱敏图片，不含车牌、手机号等隐私信息。</p>' +
      items +
      '</div>'
    )
  }

  function shouldShowStorePublicly(data) {
    return data.authorizationTier !== 'anonymous'
  }

  function renderStoreSection(data) {
    if (!shouldShowStorePublicly(data)) {
      var cityHint = data.city ? '（' + data.city + '）' : ''
      return (
        '<div class="h5-card"><h2 class="h5-section-title">联系门店</h2>' +
        '<p class="h5-compliance">本案例为匿名授权公示，不展示门店名称。</p>' +
        '<p class="h5-compliance">可通过下方电话或留言联系服务门店' +
        escapeHtml(cityHint) +
        '</p></div>'
      )
    }
    return (
      '<div class="h5-card">' +
      '<h2 class="h5-section-title">关联门店</h2>' +
      '<p>' +
      escapeHtml(data.storeName) +
      '</p>' +
      '<p class="h5-compliance">' +
      escapeHtml(data.city || '') +
      '</p>' +
      '<p class="h5-link">查看门店详情 ›</p>' +
      '</div>'
    )
  }

  function renderPriceFactors(factors) {
    if (!factors || !factors.length) return ''
    var items = factors
      .map(function (item) {
        return '<p class="h5-bullet">· ' + escapeHtml(item) + '</p>'
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">影响价格的因素</h2>' +
      items +
      '</div>'
    )
  }

  function renderFaq(faq) {
    if (!faq || !faq.length) return ''
    var items = faq
      .map(function (item) {
        return (
          '<div class="h5-faq-item"><p class="h5-faq-q">' +
          escapeHtml(item.q) +
          '</p><p class="h5-faq-a">' +
          escapeHtml(item.a) +
          '</p></div>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">常见问题</h2>' +
      items +
      '</div>'
    )
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
        sectionTitle: '价格说明',
        priceText: '预约到店检测后报价',
        disclaimer: '事故车维修无法仅凭线上信息准确报价，请预约到店检测后确认方案。',
        compliance: '本案例不构成线上报价承诺。',
      }
    }
    if (fixedAmount != null && (mode === 'fixed' || isAuthorized)) {
      return {
        sectionTitle: '方案报价',
        priceText: currency + fixedAmount,
        disclaimer: '',
        compliance: '本案例为车主授权公示，价格为当时方案报价，不构成线上报价承诺。',
      }
    }
    if (mode === 'consult') {
      return {
        sectionTitle: '价格说明',
        priceText: '到店检测后报价',
        disclaimer: '实际费用以门店检测结果为准。',
        compliance: '本案例价格仅为参考，不构成线上报价承诺。',
      }
    }
    if (data.minAmount != null && data.maxAmount != null) {
      return {
        sectionTitle: '价格说明',
        priceText: '参考区间 ' + currency + data.minAmount + ' - ' + currency + data.maxAmount,
        disclaimer: '实际费用以门店检测结果为准。',
        compliance: '本案例价格仅为参考区间，不构成线上报价承诺。',
      }
    }
    return {
      sectionTitle: '价格说明',
      priceText: stripPriceSuffix(data.priceText || '到店检测后报价'),
      disclaimer: '实际费用以门店检测结果为准。',
      compliance: '本案例价格仅为参考区间，不构成线上报价承诺。',
    }
  }

  function renderPriceSection(data) {
    var display = buildPriceDisplay(data)
    display.priceText = stripPriceSuffix(display.priceText)
    var disclaimerHtml = display.disclaimer
      ? '<span class="h5-price-note">' + escapeHtml(display.disclaimer) + '</span>'
      : ''
    return (
      '<div class="h5-card">' +
      '<h2 class="h5-section-title">' +
      escapeHtml(display.sectionTitle) +
      '</h2>' +
      '<div class="h5-price">' +
      escapeHtml(display.priceText) +
      '</div>' +
      disclaimerHtml +
      '<p class="h5-compliance">' +
      escapeHtml(display.compliance) +
      '</p>' +
      '</div>'
    )
  }

  function renderCase(data) {
    var safeData = sanitizeCaseForDisplay(data)
    setShareMeta(safeData)
    document.title = safeData.title + ' · 辙见'

    var html =
      '<div class="h5-page">' +
      '<header class="h5-header">' +
      '<div class="h5-brand">辙见服务平台 · 公开案例</div>' +
      '<h1 class="h5-title">' +
      escapeHtml(safeData.title) +
      '</h1>' +
      '<div class="h5-tags">' +
      renderTags(safeData) +
      '</div>' +
      '<div class="h5-banner">本页内容为已脱敏公开案例，不含车牌、手机号等隐私信息。分享链接仅展示审核通过内容。</div>' +
      '</header>' +
      (safeData.aiSummary
        ? '<p class="h5-summary">' + escapeHtml(safeData.aiSummary) + '</p>'
        : '') +
      renderKeyInfo(safeData.keyInfo) +
      renderPriceSection(safeData)

    if (safeData.faultDesc) {
      html +=
        '<div class="h5-card"><h2 class="h5-section-title">故障表现</h2><p>' +
        escapeHtml(safeData.faultDesc) +
        '</p></div>'
    }
    if (safeData.inspectResult) {
      html +=
        '<div class="h5-card"><h2 class="h5-section-title">检查结果</h2><p>' +
        escapeHtml(safeData.inspectResult) +
        '</p></div>'
    }
    if (safeData.repairPlan) {
      html +=
        '<div class="h5-card"><h2 class="h5-section-title">维修方案</h2><p>' +
        escapeHtml(safeData.repairPlan) +
        '</p></div>'
    }

    html += renderNodes(safeData.nodes)

    html += renderPriceFactors(safeData.priceFactors)
    html += renderStoreSection(safeData)
    html += renderFaq(safeData.faq)

    html +=
      '<div class="h5-body-spacer"></div>' +
      '</div>' +
      '<footer class="h5-footer">' +
      '<div class="h5-footer-inner h5-footer-inner--dual">' +
      '<button type="button" class="h5-btn h5-btn--secondary" id="h5-call-btn">电话咨询</button>' +
      '<button type="button" class="h5-btn" id="h5-message-btn">留言</button>' +
      '</div>' +
      '</footer>'

    var app = document.getElementById('app')
    if (app) app.innerHTML = html

    if (window.zhejianTrack) {
      window.zhejianTrack.trackCaseView(safeData)
      window.zhejianTrack.bindScrollDepth(safeData.id || '')
    }

    var callBtn = document.getElementById('h5-call-btn')
    if (callBtn) {
      callBtn.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_call_click', {
            caseId: safeData.id || '',
            storeId: safeData.storeId || '',
          })
        }
        var phone = safeData.storePhone || ''
        if (phone) {
          window.location.href = 'tel:' + phone
        } else {
          alert('暂无门店电话')
        }
      })
    }

    var msgBtn = document.getElementById('h5-message-btn')
    if (msgBtn) {
      msgBtn.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_consult_click', {
            caseId: safeData.id || '',
            storeId: safeData.storeId || '',
          })
        }
        var path =
          '/pages/consult/submit/index?storeId=' +
          encodeURIComponent(safeData.storeId || '') +
          '&caseId=' +
          encodeURIComponent(safeData.id || '') +
          '&sourcePage=h5'
        alert('请打开微信小程序留言咨询。路径：' + path)
      })
    }
  }

  function renderError(message, caseId) {
    document.title = '案例不可用 · 辙见'
    var app = document.getElementById('app')
    if (app) {
      app.innerHTML =
        '<div class="h5-error">' +
        '<h1>无法加载案例</h1>' +
        '<p>' +
        escapeHtml(message) +
        '</p>' +
        (caseId
          ? '<p class="h5-error-id">案例 ID：' + escapeHtml(caseId) + '</p>'
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

  function loadFromApi(caseId) {
    var apiUrl =
      window.__CASE_API__ ||
      '/api/v1/user/cases/' + encodeURIComponent(caseId)
    return fetch(apiUrl)
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, status: res.status, body: body }
        })
      })
      .then(function (result) {
        if (!result.ok || result.body.code !== 0 || !result.body.data) {
          var err = new Error('案例不存在或未公开')
          err.httpStatus = result.status
          err.apiCode = result.body && result.body.code
          throw err
        }
        renderCase(result.body.data)
      })
  }

  function loadFixture(caseId) {
    if (!caseId) {
      return Promise.reject(new Error('missing case id'))
    }
    return fetch('/fixtures/' + encodeURIComponent(caseId) + '.json')
      .then(function (res) {
        if (!res.ok) throw new Error('fixture missing')
        return res.json()
      })
      .then(renderCase)
  }

  function resolveLoadErrorMessage(err) {
    if (err && err.message === 'missing case id') return '案例 ID 无效，请检查链接是否完整'
    if (err && (err.httpStatus === 404 || err.apiCode === 100004)) {
      return '案例不存在或未公开展示'
    }
    if (err && err.name === 'TypeError') return '网络异常，请稍后重试'
    return '案例不存在、未公开或脱敏内容未就绪'
  }

  function loadCase(caseId) {
    if (!caseId) {
      renderError('案例 ID 无效，请检查链接是否完整', '')
      return
    }

    loadFromApi(caseId)
      .catch(function (apiErr) {
        if (!isFixtureFallbackAllowed()) {
          throw apiErr
        }
        console.info('[h5-case] API 失败，本地 fallback fixtures', caseId)
        return loadFixture(caseId)
      })
      .catch(function (err) {
        renderError(resolveLoadErrorMessage(err), caseId)
      })
  }

  loadCase(resolveCaseId())
})()
