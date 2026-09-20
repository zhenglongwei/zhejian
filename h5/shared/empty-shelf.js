/**
 * 案例站空库：面向门店（是什么 / 为什么空 / 下一步）
 * 口径：docs/01_项目总览与业务架构/15_案例档案与托管状态机.md §7.10
 */
;(function (global) {
  var HOSTING = 'https://simplewin.cn/zhejian.html'
  var BRAND = 'https://simplewin.cn/'
  var CODE = '/api/v1/public/h5/miniprogram-code?_=wb'

  function renderMerchantEmpty(options) {
    options = options || {}
    var heading = options.heading || '辙见公开档案库'
    var titleTag = options.titleTag === 'h2' ? 'h2' : 'h1'
    var titleClass = titleTag === 'h2' ? 'h5-section-title' : 'h5-title'
    return (
      '<div class="h5-card h5-empty-guide">' +
      '<' +
      titleTag +
      ' class="' +
      titleClass +
      '">' +
      heading +
      '</' +
      titleTag +
      '>' +
      '<p class="h5-summary">门店把真实维修过程做成可核对的公开档案。现在还没有门店选择公开。</p>' +
      '<p class="h5-empty-guide__how">要出现在这里：微信搜一搜「辙见」，或扫码进门店工作台做相册，再决定是否托管、是否公开。</p>' +
      '<img class="h5-mp-qr h5-mp-qr--guide" src="' +
      CODE +
      '" width="120" height="120" alt="辙见小程序码" onerror="this.remove()">' +
      '<p class="h5-home-more"><a class="h5-link" href="' +
      HOSTING +
      '">了解托管</a> · <a class="h5-link" href="' +
      BRAND +
      '">盈简官网</a></p>' +
      '</div>'
    )
  }

  global.zhejianEmptyShelf = {
    renderMerchantEmpty: renderMerchantEmpty,
  }
})(typeof window !== 'undefined' ? window : globalThis)
