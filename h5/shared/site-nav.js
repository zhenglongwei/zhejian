;(function (global) {
  var SERVICE_LINKS = [
    { name: '小保养', path: '/topic/car-maintenance' },
    { name: '刹车片更换', path: '/topic/brake-pad-replacement' },
    { name: '电瓶更换', path: '/topic/battery-replacement' },
    { name: '钣喷修复', path: '/topic/body-paint-repair' },
    { name: '事故车维修', path: '/topic/accident-repair' },
  ]

  var CITY_LINKS = [{ name: '杭州', path: '/city/hangzhou' }]
  var FOOTER_NOTE = '本页内容仅供参考。实际方案与费用请与门店线下确认。'
  var MINIPROGRAM_HINT = '微信搜一搜「辙见」打开小程序'
  var MINIPROGRAM_CODE = '/api/v1/public/h5/miniprogram-code'

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
      '<p class="h5-site-footer__note">' +
      escapeHtml(MINIPROGRAM_HINT) +
      '</p>' +
      '<img class="h5-mp-qr" src="' +
      MINIPROGRAM_CODE +
      '" width="88" height="88" alt="辙见小程序码" onerror="this.remove()">' +
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
