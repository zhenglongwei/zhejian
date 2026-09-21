/**
 * 案例站空库：车主先看懂，门店给下一步
 * 口径：docs/01_项目总览与业务架构/15_案例档案与托管状态机.md §7.10
 *      docs/01_项目总览与业务架构/12_官网与GEO体检转型口径.md §3.2
 */
;(function (global) {
  var HOSTING = 'https://simplewin.cn/zhejian.html'
  var CITY = '/city/hangzhou'
  var CASES = '/case/'
  var CODE = '/api/v1/public/h5/miniprogram-code?entry=owner'

  function renderOwnerEmpty(options) {
    options = options || {}
    var heading = options.heading || '辙见公开案例站'
    var titleTag = options.titleTag === 'h2' ? 'h2' : 'h1'
    var titleClass = titleTag === 'h2' ? 'h5-section-title' : 'h5-title'
    var lead =
      options.lead || '这里是门店选择公开的维修记录，能看到检查和维修过程。'
    var emptyLine = options.emptyLine || '现在还没有门店公开记录。'
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
      CITY +
      '">看杭州页的门店</a>，或<a class="h5-link" href="' +
      CASES +
      '">看其他项目</a>。</p>' +
      '<p class="h5-empty-guide__how">门店若要公开维修记录：微信搜一搜「辙见」。</p>' +
      '<img class="h5-mp-qr h5-mp-qr--guide" src="' +
      CODE +
      '" width="120" height="120" alt="辙见小程序码" onerror="this.remove()">' +
      '<p class="h5-home-more"><a class="h5-link" href="' +
      HOSTING +
      '">门店说明</a></p>' +
      '</div>'
    )
  }

  global.zhejianEmptyShelf = {
    renderMerchantEmpty: renderOwnerEmpty,
    renderOwnerEmpty: renderOwnerEmpty,
  }
})(typeof window !== 'undefined' ? window : globalThis)
