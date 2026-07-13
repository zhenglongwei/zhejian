(function () {
  function parseTopicSlug() {
    var match = location.pathname.match(/\/topic\/([a-z0-9-]+)\/?$/i)
    if (match) return decodeURIComponent(match[1]).trim()
    return ''
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function showNotFound(message) {
    document.title = '页面已迁移 · 辙见'
    var app = document.getElementById('app')
    if (!app) return
    app.innerHTML =
      '<div class="h5-page"><header class="h5-header"><h1 class="h5-title">页面已迁移</h1>' +
      '<p class="h5-summary">' +
      escapeHtml(message || '该专题已合并至服务项目页。') +
      '</p></header>' +
      '<div class="h5-home-quick"><a class="h5-btn" href="/">返回首页</a>' +
      '<a class="h5-btn h5-btn--secondary" href="/service/brake-pad-replacement.html" style="margin-left:8px">浏览服务项目</a></div></div>'
  }

  function redirectToService() {
    var slug = parseTopicSlug()
    if (!slug) {
      showNotFound('链接无效')
      return
    }

    fetch('/api/v1/public/h5/topic-redirect/' + encodeURIComponent(slug))
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body }
        })
      })
      .then(function (result) {
        var locationPath = result.body && result.body.data && result.body.data.location
        if (result.ok && locationPath) {
          window.location.replace(locationPath)
          return
        }
        showNotFound((result.body && result.body.message) || '未找到对应服务项目')
      })
      .catch(function () {
        showNotFound('暂时无法跳转，请从首页进入服务项目')
      })
  }

  redirectToService()
})()
