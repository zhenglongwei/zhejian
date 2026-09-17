;(function (global) {
  var SERVICE_LINKS = [
    { name: '小保养', path: '/service/car-maintenance.html' },
    { name: '刹车片更换', path: '/service/brake-pad-replacement.html' },
    { name: '电瓶更换', path: '/service/battery-replacement.html' },
    { name: '钣喷修复', path: '/service/body-paint-repair.html' },
    { name: '事故车维修', path: '/service/accident-repair.html' },
  ]

  var CITY_LINKS = [{ name: '杭州', path: '/city/hangzhou' }]
  var FOOTER_NOTE = '本页内容仅供参考。实际方案与费用请与门店线下确认。'

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function render(options) {
    options = options || {}
    return (
      '<footer class="h5-site-footer" aria-label="网站备案与说明">' +
      (global.zhejianSiteBeian
        ? global.zhejianSiteBeian.render({ className: 'h5-site-beian--in-nav' })
        : '') +
      '<p class="h5-site-footer__note">' +
      escapeHtml(FOOTER_NOTE) +
      '</p>' +
      (options.extraHtml || '') +
      '</footer>'
    )
  }

  global.zhejianSiteNav = {
    render: render,
    SERVICE_LINKS: SERVICE_LINKS,
    CITY_LINKS: CITY_LINKS,
  }
})(typeof window !== 'undefined' ? window : globalThis)
