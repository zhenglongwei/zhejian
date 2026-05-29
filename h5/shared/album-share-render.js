(function () {
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function resolveToken() {
    if (window.__SHARE_TOKEN__) return window.__SHARE_TOKEN__
    var params = new URLSearchParams(location.search)
    return params.get('token') || ''
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

  function renderNodes(nodes) {
    if (!nodes || !nodes.length) return ''
    var items = nodes
      .map(function (node) {
        var imgs = (node.images || [])
          .map(function (url) {
            return (
              '<img class="h5-node-img" src="' +
              escapeHtml(url) +
              '" alt="维修过程图片" loading="lazy" />'
            )
          })
          .join('')
        return (
          '<div class="h5-node">' +
          '<div class="h5-node-title">' +
          escapeHtml(node.title) +
          '</div>' +
          (imgs || '<div class="h5-placeholder-img">暂无图片</div>') +
          (node.note
            ? '<div class="h5-node-note">' + escapeHtml(node.note) + '</div>'
            : '') +
          '</div>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">过程记录</h2>' + items + '</div>'
    )
  }

  function renderAlbumShare(data) {
    document.title = (data.serviceName || '服务相册') + ' · 辙见'
    var modeLabel = data.shareMode === 'original' ? '原图分享' : '脱敏分享'
    var rows = [
      { label: '服务项目', value: data.serviceName || '—' },
      { label: '门店', value: (data.store && data.store.name) || '—' },
      { label: '车辆', value: data.vehicleDisplay || '—' },
      { label: '分享方式', value: modeLabel },
    ]
    var html =
      '<div class="h5-page">' +
      '<header class="h5-header">' +
      '<div class="h5-brand">辙见 · 车主分享的服务相册</div>' +
      '<h1 class="h5-title">' +
      escapeHtml(data.serviceName || '服务相册') +
      '</h1>' +
      '<div class="h5-banner">' +
      escapeHtml(data.disclaimer || '私人分享内容，不代表平台公示案例。') +
      '</div>' +
      '</header>' +
      renderKeyInfo(rows) +
      renderNodes(data.nodes) +
      (data.storeNote
        ? '<div class="h5-card"><p class="h5-compliance">' +
          escapeHtml(data.storeNote) +
          '</p></div>'
        : '') +
      '<p class="h5-compliance">本页由车主主动分享，未自动进入辙见平台案例库。</p>' +
      '</div>'
    var app = document.getElementById('app')
    if (app) app.innerHTML = html
  }

  function renderError(message) {
    document.title = '分享不可用 · 辙见'
    var app = document.getElementById('app')
    if (app) {
      app.innerHTML =
        '<div class="h5-error"><h1>无法查看分享内容</h1><p>' +
        escapeHtml(message) +
        '</p></div>'
    }
  }

  function loadSharedAlbum(token) {
    var apiUrl =
      window.__SHARE_API__ ||
      '/api/v1/user/shared-albums/' + encodeURIComponent(token)
    return fetch(apiUrl)
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body }
        })
      })
      .then(function (result) {
        if (!result.ok || result.body.code !== 0 || !result.body.data) {
          throw new Error('分享链接无效或已失效')
        }
        renderAlbumShare(result.body.data)
      })
  }

  function loadShare(token) {
    if (!token) {
      renderError('分享链接无效')
      return
    }
    loadSharedAlbum(token).catch(function () {
      renderError('分享链接无效、已失效或相册暂不可查看')
    })
  }

  loadShare(resolveToken())
})()
