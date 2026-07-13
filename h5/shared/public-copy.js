/**
 * H5 公开站展示文案 · 脱敏/授权告知在小程序完成，公开页仅展示内容
 */
(function (global) {
  var H5 = {
    displayDisclaimer: '本页内容仅供参考。实际方案与费用请与门店线下确认。',
    geoDisclaimer:
      '页面用于展示维修服务信息、门店信息与公开案例，不构成线上报价或维修承诺。实际方案、费用、质保与售后由用户与门店线下确认。',
    casePrice:
      '车主授权公示的案例展示当时方案报价；其余案例价格为系统参考区间，实际费用以门店检测为准。',
    price:
      '页面价格为参考范围，实际费用会因车型、配件品牌、损伤程度和门店检测结果不同而变化。',
    footnote:
      '页面内容为维修信息展示，不构成线上报价或维修承诺。实际方案与费用以门店线下确认为准。',
    listNote: '案例价格仅为参考，实际费用以门店检测为准。',
    caseCoverAlt: '案例封面',
    imagePlaceholder: '图片暂未就绪',
    caseLoadError: '案例不存在、未公开或内容未就绪',
  }

  function sanitizeVehicleLabel(text) {
    return String(text || '')
      .replace(/\s*[（(]\s*已脱敏\s*[）)]\s*/gu, '')
      .replace(/\s*已脱敏\s*/gu, '')
      .trim()
  }

  function stripPublicBoilerplate(text) {
    return String(text || '')
      .trim()
      .replace(/^该案例经车主授权[，,]?/u, '')
      .replace(/^该案例经车主匿名授权[，,]?/u, '')
      .replace(/^该案例为/u, '')
      .replace(/^本案例为/u, '')
      .replace(/记录了.+?的维修过程(摘要)?[。.]?/u, '')
      .replace(/图片已脱敏[^。]*。?/gu, '')
      .replace(/图片已进行[^。]*脱敏[^。]*。?/gu, '')
      .replace(/相关图片已脱敏[^。]*。?/gu, '')
      .replace(/过程图片已脱敏[^。]*。?/gu, '')
      .replace(/相关图片均已脱敏[^。]*。?/gu, '')
      .replace(/并通过平台审核[。.]?/gu, '')
      .replace(/并经平台脱敏审核[。.]?/gu, '')
      .replace(/经脱敏与审核后公开[。.]?/gu, '')
      .replace(/含脱敏过程图片[^。]*。?/gu, '')
      .replace(/脱敏过程图片/gu, '过程图片')
      .replace(/真实脱敏维修案例/gu, '真实维修案例')
      .replace(/已审核[、,]?已脱敏/gu, '已审核')
      .replace(/已脱敏[、,]?已审核/gu, '已审核')
      .replace(/，+/g, '，')
      .replace(/^，+|，+$/g, '')
      .trim()
  }

  global.zhejianPublicCopy = {
    H5: H5,
    sanitizeVehicleLabel: sanitizeVehicleLabel,
    stripPublicBoilerplate: stripPublicBoilerplate,
  }
})(typeof window !== 'undefined' ? window : globalThis)
