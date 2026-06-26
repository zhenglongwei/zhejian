(function () {
  function normalizeText(text) {
    return String(text || '').trim()
  }

  var GENERIC_FAULT = { '用户反馈的相关问题': 1, '到店进行相关检查': 1 }
  var GENERIC_INSPECT = '门店根据车辆实际情况进行了检查'

  function defaultRepairPlan(serviceName) {
    return '根据检测结果，门店完成了' + (serviceName || '相关维修') + '的处理'
  }

  function isGenericFaultDesc(text) {
    var v = normalizeText(text)
    return !v || GENERIC_FAULT[v]
  }

  function isGenericInspectResult(text) {
    var v = normalizeText(text)
    return !v || v === GENERIC_INSPECT
  }

  function isGenericRepairPlan(text, serviceName) {
    var v = normalizeText(text)
    if (!v) return true
    return v === defaultRepairPlan(serviceName)
  }

  function stripBoilerplateSummary(text) {
    return normalizeText(text)
      .replace(/^这是一个/u, '')
      .replace(/^该案例为/u, '')
      .replace(/^本案例为/u, '')
      .replace(/图片已进行车牌、人脸、VIN、手机号等隐私脱敏，并通过平台审核。/gu, '')
      .replace(/页面展示价格仅供参考。/gu, '')
      .replace(/维修维修/gu, '维修')
  }

  var STAGE_GEO_FIELD = {
    stage_1: 'faultDesc',
    stage_2: 'inspectResult',
    stage_3: 'repairPlan',
    stage_6: 'resultConfirm',
  }

  var TITLE_GEO_RULES = [
    { keys: ['接车', '故障', '维修前', '损伤'], field: 'faultDesc' },
    { keys: ['检测', '诊断', '检查'], field: 'inspectResult' },
    { keys: ['方案', '报价'], field: 'repairPlan' },
    { keys: ['完工', '试车', '交付', '结果', '对比'], field: 'resultConfirm' },
  ]

  function resolveGeoFieldForNode(node, data) {
    var serviceName = data.serviceName || ''
    var id = normalizeText(node.id || node.nodeId)
    var fieldKey = STAGE_GEO_FIELD[id]
    if (fieldKey) {
      var direct = normalizeText(data[fieldKey])
      if (
        direct &&
        !isGenericFaultDesc(direct) &&
        !isGenericInspectResult(direct) &&
        !isGenericRepairPlan(direct, serviceName)
      ) {
        return direct
      }
    }
    var title = normalizeText(node.title)
    for (var i = 0; i < TITLE_GEO_RULES.length; i += 1) {
      var rule = TITLE_GEO_RULES[i]
      if (rule.keys.some(function (key) {
        return title.indexOf(key) !== -1
      })) {
        var value = normalizeText(data[rule.field])
        if (
          value &&
          !isGenericFaultDesc(value) &&
          !isGenericInspectResult(value) &&
          !isGenericRepairPlan(value, serviceName)
        ) {
          return value
        }
      }
    }
    return ''
  }

  function prepareDisplayNodes(data) {
    var narratives = (data.article && data.article.nodeNarratives) || data.nodeNarratives || []
    var narrativeMap = {}
    narratives.forEach(function (item) {
      if (item && item.nodeId) narrativeMap[item.nodeId] = item
    })

    return (data.nodes || [])
      .map(function (node) {
        var id = normalizeText(node.id || node.nodeId)
        var narrative = narrativeMap[id]
        var note = normalizeText(node.note)
        if (!note && narrative && narrative.description) note = normalizeText(narrative.description)
        if (!note) note = resolveGeoFieldForNode(node, data)
        if (
          isGenericFaultDesc(note) ||
          isGenericInspectResult(note) ||
          isGenericRepairPlan(note, data.serviceName)
        ) {
          note = ''
        }
        var images = pickNodeDesensitizedImages(node)
        return {
          id: id,
          title: normalizeText(node.title),
          note: note,
          images: images,
          imagesDesensitized: images,
        }
      })
      .filter(function (node) {
        return (node.images && node.images.length) || node.note
      })
  }

  function pickNodeDesensitizedImages(node) {
    var urls = []
    ;(node.imagesDesensitized || []).forEach(function (img) {
      if (isDesensitizedUrl(img)) urls.push(img)
    })
    ;(node.images || []).forEach(function (img) {
      if (isDesensitizedUrl(img)) urls.push(img)
    })
    return urls
  }

  function isDesensitizedUrl(url) {
    if (!url) return false
    var value = String(url)
    if (value.indexOf('mock://desensitized/') === 0) return true
    if (value.indexOf('/files/uploads/desensitized/') !== -1) return true
    if (value.indexOf('/media/files/uploads/desensitized/') !== -1) return true
    return false
  }

  function buildDisplayAiSummary(data) {
    var raw = stripBoilerplateSummary(data.aiSummary || data.summary || '')
    if (raw && raw.length >= 24 && !/^这是一个.+维修案例/u.test(raw)) {
      return raw.length > 180 ? raw.slice(0, 179) + '…' : raw
    }

    var parts = []
    if (!isGenericFaultDesc(data.faultDesc)) parts.push(normalizeText(data.faultDesc))
    if (!isGenericInspectResult(data.inspectResult)) parts.push(normalizeText(data.inspectResult))
    if (!isGenericRepairPlan(data.repairPlan, data.serviceName)) {
      parts.push(normalizeText(data.repairPlan))
    }

    var isAuthorized = data.authorizationTier === 'anonymous' || data.authorizationTier === 'named'
    var amount = data.amount != null ? data.amount : data.planAmount
    if (isAuthorized && amount != null && Number(amount) > 0) {
      parts.push('当时方案参考费用约' + Math.round(Number(amount)) + '元')
    }

    if (parts.length) {
      var text = parts.join('。')
      if (text.slice(-1) !== '。') text += '。'
      return text.length > 180 ? text.slice(0, 179) + '…' : text
    }
    return raw
  }

  function enrichCaseForRender(data) {
    var next = Object.assign({}, data)
    next.displayAiSummary = buildDisplayAiSummary(data)
    next.displayNodes = prepareDisplayNodes(data)
    next.nodes = next.displayNodes
    next.faultDesc = isGenericFaultDesc(data.faultDesc) ? '' : normalizeText(data.faultDesc)
    next.inspectResult = isGenericInspectResult(data.inspectResult) ? '' : normalizeText(data.inspectResult)
    next.repairPlan = isGenericRepairPlan(data.repairPlan, data.serviceName)
      ? ''
      : normalizeText(data.repairPlan)
    return next
  }

  window.zhejianCaseDisplay = {
    enrichCaseForRender: enrichCaseForRender,
    prepareDisplayNodes: prepareDisplayNodes,
    buildDisplayAiSummary: buildDisplayAiSummary,
    isGenericFaultDesc: isGenericFaultDesc,
    isGenericInspectResult: isGenericInspectResult,
    isGenericRepairPlan: isGenericRepairPlan,
    pickNodeDesensitizedImages: pickNodeDesensitizedImages,
    isDesensitizedUrl: isDesensitizedUrl,
  }
})()
