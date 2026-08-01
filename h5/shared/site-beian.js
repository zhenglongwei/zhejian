/**
 * 全站 ICP 备案展示（主办单位杭州盈简科技有限公司）
 * 口径见 docs/05_H5公开网页/01_H5整体PRD.md §3.1
 */
;(function (global) {
  var SPONSOR_NAME = '杭州盈简科技有限公司'
  var ICP_NUMBER = '浙ICP备2024092950号-2'
  var ICP_QUERY_URL = 'https://beian.miit.gov.cn/'

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function render(options) {
    options = options || {}
    var cls = options.className ? ' ' + options.className : ''
    return (
      '<aside class="h5-site-beian' +
      cls +
      '" aria-label="网站备案信息">' +
      '<div class="h5-site-beian__sponsor">主办单位：' +
      escapeHtml(SPONSOR_NAME) +
      '</div>' +
      '<a class="h5-site-beian__link" href="' +
      escapeHtml(ICP_QUERY_URL) +
      '" target="_blank" rel="noopener noreferrer">' +
      escapeHtml(ICP_NUMBER) +
      '</a>' +
      '</aside>'
    )
  }

  global.zhejianSiteBeian = {
    render: render,
    SPONSOR_NAME: SPONSOR_NAME,
    ICP_NUMBER: ICP_NUMBER,
    ICP_QUERY_URL: ICP_QUERY_URL,
  }
})(typeof window !== 'undefined' ? window : globalThis)
