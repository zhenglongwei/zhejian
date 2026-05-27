(function () {
  var TAG_MAP = {
    authorized: { text: '已授权', cls: 'h5-tag--order' },
    named: { text: '实名授权', cls: 'h5-tag--order' },
    anonymous: { text: '匿名授权', cls: 'h5-tag--desensitized' },
    desensitized: { text: '已脱敏', cls: 'h5-tag--desensitized' },
    audited: { text: '已审核', cls: 'h5-tag--audited' },
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

  function renderTags(data) {
    var tier = data.authorizationTier
    var html = ''
    if (tier === 'anonymous') {
      html += '<span class="h5-tag h5-tag--desensitized">匿名授权</span>'
    } else if (tier === 'named') {
      html += '<span class="h5-tag h5-tag--order">实名授权</span>'
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

  function shouldShowStorePublicly(data) {
    return data.authorizationTier !== 'anonymous'
  }

  function renderStoreSection(data) {
    if (!shouldShowStorePublicly(data)) {
      var cityHint = data.city ? '（' + data.city + '）' : ''
      return (
        '<div class="h5-card"><h2 class="h5-section-title">联系门店</h2>' +
        '<p class="h5-compliance">本案例为匿名授权公开，不展示门店名称。</p>' +
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

  function renderPriceSection(data, priceText) {
    return (
      '<div class="h5-card">' +
      '<h2 class="h5-section-title">价格说明</h2>' +
      '<div class="h5-price">' +
      escapeHtml(priceText) +
      '</div>' +
      '<span class="h5-price-note">实际费用以门店检测结果为准。</span>' +
      '<p class="h5-compliance">本案例价格仅为参考区间，不构成线上报价承诺。</p>' +
      '</div>'
    )
  }

  function renderCase(data) {
    document.title = data.title + ' · 辙见'
    var priceText =
      data.priceText ||
      (data.minAmount != null && data.maxAmount != null
        ? '¥' + data.minAmount + ' - ¥' + data.maxAmount
        : '到店检测后报价')

    var html =
      '<div class="h5-page">' +
      '<header class="h5-header">' +
      '<div class="h5-brand">辙见服务平台 · 公开案例</div>' +
      '<h1 class="h5-title">' +
      escapeHtml(data.title) +
      '</h1>' +
      '<div class="h5-tags">' +
      renderTags(data) +
      '</div>' +
      '<div class="h5-banner">本页内容为已脱敏公开案例，不含车牌、手机号等隐私信息。分享链接仅展示审核通过内容。</div>' +
      '</header>' +
      (data.aiSummary
        ? '<p class="h5-summary">' + escapeHtml(data.aiSummary) + '</p>'
        : '') +
      renderKeyInfo(data.keyInfo) +
      renderPriceSection(data, priceText)

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

    html += renderPriceFactors(data.priceFactors)
    html += renderStoreSection(data)
    html += renderFaq(data.faq)

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

    var callBtn = document.getElementById('h5-call-btn')
    if (callBtn) {
      callBtn.addEventListener('click', function () {
        var phone = data.storePhone || ''
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
        var path =
          '/pages/consult/submit/index?storeId=' +
          encodeURIComponent(data.storeId || '') +
          '&caseId=' +
          encodeURIComponent(data.id || '') +
          '&sourcePage=h5'
        alert('静态骨架演示：正式环境将跳转微信小程序留言页。路径：' + path)
      })
    }
  }

  function renderError(message) {
    document.title = '案例不可用 · 辙见'
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
