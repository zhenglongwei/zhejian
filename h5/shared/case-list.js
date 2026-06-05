(function () {
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function caseHref(id) {
    return 'view.html?id=' + encodeURIComponent(id)
  }

  function renderEmpty(message) {
    document.title = '公开案例 · 辙见'
    var app = document.getElementById('app')
    if (!app) return
    app.innerHTML =
      '<div class="h5-page">' +
      '<header class="h5-header">' +
      '<div class="h5-brand">辙见服务平台 · 公开案例</div>' +
      '<h1 class="h5-title">公开案例</h1>' +
      '<p class="h5-summary">展示已审核、已脱敏的维修案例；价格仅为参考。</p>' +
      '</header>' +
      '<div class="h5-card h5-case-list-empty">' +
      '<p>' +
      escapeHtml(message) +
      '</p>' +
      '</div></div>'
  }

  function renderError(message) {
    renderEmpty(message + '（请稍后重试）')
  }

  function renderList(list) {
    document.title = '公开案例 · 辙见'
    var items = list
      .map(function (item) {
        var title = item.title || item.serviceName || '公开案例'
        var meta = [item.city, item.storeName, item.serviceName].filter(Boolean).join(' · ')
        return (
          '<a class="h5-case-list-item" href="' +
          caseHref(item.id) +
          '">' +
          '<div class="h5-case-list-title">' +
          escapeHtml(title) +
          '</div>' +
          (meta
            ? '<div class="h5-case-list-meta">' + escapeHtml(meta) + '</div>'
            : '') +
          '</a>'
        )
      })
      .join('')

    var app = document.getElementById('app')
    if (!app) return
    app.innerHTML =
      '<div class="h5-page">' +
      '<header class="h5-header">' +
      '<div class="h5-brand">辙见服务平台 · 公开案例</div>' +
      '<h1 class="h5-title">公开案例</h1>' +
      '<p class="h5-summary">以下为已审核、已脱敏公示案例，数据来自平台数据库。</p>' +
      '<div class="h5-banner">本页仅展示有效门店的公开案例；价格仅为参考，实际费用以门店检测为准。</div>' +
      '</header>' +
      '<div class="h5-case-list">' +
      items +
      '</div></div>'

    if (window.zhejianTrack) {
      window.zhejianTrack.trackPageView('h5_page_view', { pageType: 'case_list' })
    }
  }

  function loadCases() {
    fetch('/api/v1/user/cases?limit=50')
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body }
        })
      })
      .then(function (result) {
        if (!result.ok || result.body.code !== 0) {
          throw new Error('列表加载失败')
        }
        var list = result.body.data?.list || result.body.data || []
        if (!list.length) {
          renderEmpty('暂无已公示的公开案例。请先在小程序完成案例审核通过。')
          return
        }
        renderList(list)
      })
      .catch(function () {
        renderError('无法加载案例列表')
      })
  }

  loadCases()
})()
