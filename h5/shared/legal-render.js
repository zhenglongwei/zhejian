(function (global) {
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function renderLegalPage(doc) {
    if (!doc) return '<p>文档加载失败</p>'
    var sections = doc.sections || []
    var html =
      '<article class="h5-legal">' +
      '<header class="h5-legal__head">' +
      '<h1 class="h5-legal__title">' +
      escapeHtml(doc.title) +
      '</h1>' +
      '<p class="h5-legal__meta">版本 ' +
      escapeHtml(doc.version || '') +
      ' · 更新 ' +
      escapeHtml(doc.updatedAt || '') +
      '</p></header>'
    sections.forEach(function (section) {
      html +=
        '<section class="h5-legal__section">' +
        '<h2 class="h5-legal__heading">' +
        escapeHtml(section.heading) +
        '</h2>' +
        '<div class="h5-legal__body">' +
        escapeHtml(section.body).replace(/\n/g, '<br>') +
        '</div></section>'
    })
    html += '</article>'
    return html
  }

  function mount(type) {
    var root = document.getElementById('app')
    if (!root) return
    fetch('/shared/legal-content.json')
      .then(function (res) {
        return res.json()
      })
      .then(function (data) {
        var doc = type === 'privacy' ? data.privacy : data.terms
        document.title = (doc && doc.title) || '辙见'
        root.innerHTML = renderLegalPage(doc)
        if (global.zhejianSiteNav) {
          root.insertAdjacentHTML(
            'beforeend',
            global.zhejianSiteNav.render({
              extraHtml:
                '<div class="h5-site-nav-legal">' +
                '<a class="h5-site-nav-link" href="/privacy/">隐私政策</a>' +
                '<a class="h5-site-nav-link" href="/terms/">用户协议</a>' +
                '</div>',
            })
          )
        }
      })
      .catch(function () {
        root.innerHTML = '<p class="h5-legal__error">协议内容加载失败，请稍后重试。</p>'
      })
  }

  global.zhejianLegalPage = {
    mount: mount,
    renderLegalPage: renderLegalPage,
  }
})(typeof window !== 'undefined' ? window : globalThis)
