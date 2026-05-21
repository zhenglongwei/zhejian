(function () {
  var TAG_MAP = {
    desensitized: { text: '已脱敏', cls: 'h5-tag--desensitized' },
    audited: { text: '已审核', cls: 'h5-tag--audited' },
    order: { text: '平台订单案例', cls: 'h5-tag--order' },
    history: { text: '商家历史案例', cls: 'h5-tag--history' },
    reference: { text: '价格仅供参考', cls: 'h5-tag--reference' },
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function resolveCaseId() {
    if (window.__CASE_ID__) return window.__CASE_ID__
    var match = location.pathname.match(/\/([^/]+)\.html$/)
    return match ? match[1] : ''
  }

  function isHistoryCase(data) {
    return (
      data.source === 'merchant_history' ||
      data.sourceLabel === '商家历史案例'
    )
  }

  function renderTags(tags, sourceLabel, isHistory) {
    var html = ''
    if (isHistory) {
      html += '<span class="h5-tag h5-tag--history">商家历史案例</span>'
    } else if (sourceLabel) {
      html +=
        '<span class="h5-tag h5-tag--order">' + escapeHtml(sourceLabel) + '</span>'
    }
    ;(tags || []).forEach(function (key) {
      if (isHistory && key === 'history') return
      var tag = TAG_MAP[key]
      if (!tag) return
      if (tag.cls === 'h5-tag--order' && isHistory) return
      html +=
        '<span class="h5-tag ' +
        tag.cls +
        '">' +
        escapeHtml(tag.text) +
        '</span>'
    })
    if (isHistory) {
      html += '<span class="h5-tag h5-tag--reference">价格仅供参考</span>'
    }
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
    var desensitized = node.imagesDesensitized || []
    if (desensitized.length) {
      return (
        '<img class="h5-node-img" src="' +
        escapeHtml(desensitized[0]) +
        '" alt="脱敏维修过程图片" loading="lazy" />'
      )
    }
    return '<div class="h5-placeholder-img">脱敏图片 · 静态骨架占位</div>'
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

  function renderPriceSection(data, priceText, isHistory) {
    var priceNote = isHistory
      ? '价格仅供参考。本案例为商家历史案例，非平台订单案例。'
      : '实际费用以门店检测结果为准。'
    var compliance = isHistory
      ? '历史案例价格与图片仅供能力参考，不构成线上报价承诺。'
      : '价格信息来自真实订单履约记录，不构成线上报价承诺。'
    return (
      '<div class="h5-card">' +
      '<h2 class="h5-section-title">价格说明</h2>' +
      '<div class="h5-price">' +
      escapeHtml(priceText) +
      '</div>' +
      '<span class="h5-price-note">' +
      escapeHtml(priceNote) +
      '</span>' +
      '<p class="h5-compliance">' +
      escapeHtml(compliance) +
      '</p>' +
      (isHistory
        ? '<p class="h5-compliance">商家历史案例，非平台订单案例。</p>'
        : '') +
      '</div>'
    )
  }

  function renderCase(data) {
    document.title = data.title + ' · 透明维修'
    var isHistory = isHistoryCase(data)
    var priceText =
      data.priceText ||
      (data.minAmount != null && data.maxAmount != null
        ? '¥' + data.minAmount + ' - ¥' + data.maxAmount
        : '到店检测后报价')

    var html =
      '<div class="h5-page">' +
      '<header class="h5-header">' +
      '<div class="h5-brand">透明维修服务平台 · 公开案例</div>' +
      '<h1 class="h5-title">' +
      escapeHtml(data.title) +
      '</h1>' +
      '<div class="h5-tags">' +
      renderTags(data.tags, data.sourceLabel, isHistory) +
      '</div>' +
      '<div class="h5-banner">本页内容为已脱敏公开案例，不含车牌、手机号等隐私信息。分享链接仅展示审核通过内容。</div>' +
      '</header>' +
      (data.aiSummary
        ? '<p class="h5-summary">' + escapeHtml(data.aiSummary) + '</p>'
        : '') +
      renderKeyInfo(data.keyInfo) +
      renderPriceSection(data, priceText, isHistory)

    if (data.faultDesc) {
      html +=
        '<div class="h5-card"><h2 class="h5-section-title">故障表现</h2><p>' +
        escapeHtml(data.faultDesc) +
        '</p></div>'
    }
    if (data.inspectResult) {
      html +=
        '<div class="h5-card"><h2 class="h5-section-title">检查结果</h2><p>' +
        escapeHtml(data.inspectResult) +
        '</p></div>'
    }
    if (data.repairPlan) {
      html +=
        '<div class="h5-card"><h2 class="h5-section-title">维修方案</h2><p>' +
        escapeHtml(data.repairPlan) +
        '</p></div>'
    }

    html += renderNodes(data.nodes)

    html +=
      '<div class="h5-card">' +
      '<h2 class="h5-section-title">关联门店</h2>' +
      '<p>' +
      escapeHtml(data.storeName) +
      '</p>' +
      '<p class="h5-compliance">' +
      escapeHtml(data.city || '') +
      '</p>' +
      '</div>' +
      '<div class="h5-body-spacer"></div>' +
      '</div>' +
      '<footer class="h5-footer">' +
      '<div class="h5-footer-inner">' +
      '<button type="button" class="h5-btn" id="h5-book-btn">打开小程序 · 预约类似服务</button>' +
      '</div>' +
      '</footer>'

    var app = document.getElementById('app')
    if (app) app.innerHTML = html

    var btn = document.getElementById('h5-book-btn')
    if (btn) {
      btn.addEventListener('click', function () {
        alert(
          '静态骨架演示：正式环境将跳转微信小程序。路径：' +
            (data.miniProgramPath || '/pages/service/index')
        )
      })
    }
  }

  function renderError(message) {
    document.title = '案例不可用 · 透明维修'
    var app = document.getElementById('app')
    if (app) {
      app.innerHTML =
        '<div class="h5-error"><h1>无法加载案例</h1><p>' +
        escapeHtml(message) +
        '</p></div>'
    }
  }

  function loadFixture(caseId) {
    if (!caseId) {
      renderError('案例 ID 无效')
      return
    }
    fetch('../fixtures/' + caseId + '.json')
      .then(function (res) {
        if (!res.ok) throw new Error('案例不存在或未公开')
        return res.json()
      })
      .then(renderCase)
      .catch(function () {
        renderError('案例不存在、未公开或 fixture 未配置')
      })
  }

  loadFixture(resolveCaseId())
})()
