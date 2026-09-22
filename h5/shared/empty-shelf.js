/**
 * 案例站空库：先说明没有公开案例，再给下一步
 * 口径：docs/01_项目总览与业务架构/12_官网与GEO体检转型口径.md §3.2
 */
;(function (global) {
  var HOSTING = 'https://simplewin.cn/zhejian.html'
  var CASES = '/case/'
  var CODE = '/api/v1/public/h5/miniprogram-code?entry=owner'

  function renderOwnerEmpty(options) {
    options = options || {}
    var heading = options.heading || '让真实被看见'
    var titleTag = options.titleTag === 'h2' ? 'h2' : 'h1'
    var titleClass = titleTag === 'h2' ? 'h5-section-title' : 'h5-title'
    var lead =
      options.lead || '这里展示用户选择公开的案例。现阶段以修理厂商家为主。'
    var emptyLine = options.emptyLine || '这一类暂时还没有公开案例。'
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
      '<p class="h5-summary">' +
      lead +
      '</p>' +
      '<p class="h5-empty-guide__how">' +
      emptyLine +
      '你可以先<a class="h5-link" href="' +
      CASES +
      '">浏览其他分类</a>，或了解辙见怎么上传（微信搜「辙见」）。</p>' +
      '<p class="h5-empty-guide__how">欢迎修理厂商家上传并选择公开。</p>' +
      '<img class="h5-mp-qr h5-mp-qr--guide" src="' +
      CODE +
      '" width="120" height="120" alt="辙见小程序码" onerror="this.remove()">' +
      '<p class="h5-home-more"><a class="h5-link" href="' +
      HOSTING +
      '">了解辙见</a></p>' +
      '</div>'
    )
  }

  global.zhejianEmptyShelf = {
    renderMerchantEmpty: renderOwnerEmpty,
    renderOwnerEmpty: renderOwnerEmpty,
  }
})(typeof window !== 'undefined' ? window : globalThis)
