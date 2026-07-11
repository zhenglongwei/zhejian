(function (global) {
  var SERVICE_LINKS = [
    { name: '小保养', path: '/service/car-maintenance.html' },
    { name: '刹车片更换', path: '/service/brake-pad-replacement.html' },
    { name: '电瓶更换', path: '/service/battery-replacement.html' },
    { name: '钣喷修复', path: '/service/body-paint-repair.html' },
    { name: '事故车维修', path: '/service/accident-repair.html' },
  ]

  var CITY_LINKS = [{ name: '杭州', path: '/city/hangzhou' }]

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function renderLinkList(title, links) {
    if (!links || !links.length) return ''
    var items = links
      .map(function (link) {
        return (
          '<a class="h5-site-nav-link" href="' +
          escapeHtml(link.path) +
          '">' +
          escapeHtml(link.name) +
          '</a>'
        )
      })
      .join('')
    return (
      '<div class="h5-site-nav-group"><div class="h5-site-nav-label">' +
      escapeHtml(title) +
      '</div><div class="h5-site-nav-links">' +
      items +
      '</div></div>'
    )
  }

  function render(options) {
    options = options || {}
    var coreLinks = [
      { name: '平台首页', path: '/' },
      { name: '全站搜索', path: '/search/' },
      { name: '公开案例', path: '/case/' },
      { name: '公开门店', path: '/store/' },
    ]
    var core = coreLinks
      .map(function (link) {
        return (
          '<a class="h5-site-nav-core" href="' +
          escapeHtml(link.path) +
          '">' +
          escapeHtml(link.name) +
          '</a>'
        )
      })
      .join('')

    return (
      '<nav class="h5-site-nav" aria-label="站内导航">' +
      '<h2 class="h5-site-nav__title">探索更多内容</h2>' +
      '<div class="h5-site-nav-core-row">' +
      core +
      '</div>' +
      renderLinkList('服务城市', CITY_LINKS) +
      renderLinkList('维修项目', SERVICE_LINKS) +
      '<div class="h5-site-nav-legal">' +
      '<a class="h5-site-nav-link" href="/privacy/">隐私政策</a>' +
      '<a class="h5-site-nav-link" href="/terms/">用户协议</a>' +
      '</div>' +
      (options.extraHtml || '') +
      '</nav>'
    )
  }

  global.zhejianSiteNav = {
    render: render,
    SERVICE_LINKS: SERVICE_LINKS,
    CITY_LINKS: CITY_LINKS,
  }
})(typeof window !== 'undefined' ? window : globalThis)
