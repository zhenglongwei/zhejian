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
    var value = normalizeText(text)
    if (window.zhejianPublicCopy && window.zhejianPublicCopy.stripPublicBoilerplate) {
      value = window.zhejianPublicCopy.stripPublicBoilerplate(value)
    }
    return value
      .replace(/^这是一个/u, '')
      .replace(/^.+?维修案例。/u, '')
      .replace(/车辆主要问题为用户反馈的相关问题。?/gu, '')
      .replace(/门店根据车辆实际情况进行了检查，?/gu, '')
      .replace(/门店根据检测结果，?/gu, '')
      .replace(/根据检测结果，门店完成了.+?的处理。?/gu, '')
      .replace(/该类服务价格会受到车型、配件品牌、损伤程度、工时和维修方案影响，?/gu, '')
      .replace(/页面展示价格仅供参考。?/gu, '')
      .replace(/维修维修/gu, '维修')
      .replace(/，+/g, '，')
      .replace(/^，+|，+$/g, '')
  }

  var TEMPLATE_SUMMARY_MARKERS = [
    '用户反馈的相关问题',
    '门店根据车辆实际情况进行了检查',
    '门店根据检测结果',
    '该类服务价格会受到',
    '页面展示价格仅供参考',
  ]

  function isTemplateBoilerplateSummary(text) {
    var v = normalizeText(text)
    if (!v) return true
    if (/^这是一个.+维修案例/u.test(v)) return true
    if (/^.+维修案例。车辆主要问题为/u.test(v)) return true
    if (v.indexOf('用户反馈的相关问题') !== -1 && v.indexOf('门店根据车辆实际情况进行了检查') !== -1) {
      return true
    }
    var hits = 0
    TEMPLATE_SUMMARY_MARKERS.forEach(function (marker) {
      if (v.indexOf(marker) !== -1) hits += 1
    })
    return hits >= 2
  }

  function collectNodeSummaryFacts(data) {
    var facts = []
    ;(data.displayNodes || data.nodes || []).forEach(function (node) {
      var note = normalizeText(node.note)
      if (!note) return
      if (isGenericFaultDesc(note) || isGenericInspectResult(note) || isGenericRepairPlan(note, data.serviceName)) {
        return
      }
      if (facts.indexOf(note) !== -1) return
      facts.push(note)
    })
    return facts
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
    var snapshotFrozen = Number(data.snapshotVersion) >= 1
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
        if (!note && !snapshotFrozen && narrative && narrative.description) {
          note = normalizeText(narrative.description)
        }
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

  function uniqueUrls(urls) {
    var seen = {}
    var out = []
    ;(urls || []).forEach(function (url) {
      var key = String(url || '').trim()
      if (!key || seen[key]) return
      seen[key] = true
      out.push(key)
    })
    return out
  }

  function pickNodeDesensitizedImages(node) {
    var urls = []
    ;(node.imagesDesensitized || []).forEach(function (img) {
      if (isDesensitizedUrl(img)) urls.push(img)
    })
    ;(node.images || []).forEach(function (img) {
      if (isDesensitizedUrl(img)) urls.push(img)
    })
    return uniqueUrls(urls)
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
    if (Number(data.snapshotVersion) >= 1) {
      var frozenRaw = stripBoilerplateSummary(data.aiSummary || data.summary || '')
      if (
        frozenRaw &&
        frozenRaw.length >= 8 &&
        !isTemplateBoilerplateSummary(frozenRaw)
      ) {
        return frozenRaw.length > 180 ? frozenRaw.slice(0, 179) + '…' : frozenRaw
      }
      return ''
    }

    var parts = []
    if (!isGenericFaultDesc(data.faultDesc)) parts.push(normalizeText(data.faultDesc))
    if (!isGenericInspectResult(data.inspectResult)) parts.push(normalizeText(data.inspectResult))
    if (!isGenericRepairPlan(data.repairPlan, data.serviceName)) {
      parts.push(normalizeText(data.repairPlan))
    }
    if (!parts.length) {
      parts = parts.concat(collectNodeSummaryFacts(data))
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

    var raw = stripBoilerplateSummary(data.aiSummary || data.summary || '')
    if (raw && raw.length >= 8 && !isTemplateBoilerplateSummary(raw) && !isTemplateBoilerplateSummary(data.aiSummary)) {
      return raw.length > 180 ? raw.slice(0, 179) + '…' : raw
    }
    return ''
  }

  function enrichCaseForRender(data) {
    var next = Object.assign({}, data)
    if (data.enrichment && typeof data.enrichment === 'object') {
      if (data.enrichment.aiSummary) next.aiSummary = data.enrichment.aiSummary
      if (data.enrichment.faq) next.faq = data.enrichment.faq
      if (data.enrichment.faqLinks) next.faqLinks = data.enrichment.faqLinks
      if (data.enrichment.keyInfo && data.enrichment.keyInfo.length) {
        next.keyInfo = data.enrichment.keyInfo
      }
      if (data.enrichment.sections && data.enrichment.sections.length) {
        next.article = Object.assign({}, next.article || {}, {
          sections: data.enrichment.sections,
        })
      }
      if (data.enrichment.nodeNarratives && data.enrichment.nodeNarratives.length) {
        next.article = Object.assign({}, next.article || {}, {
          nodeNarratives: data.enrichment.nodeNarratives,
        })
      }
    }
    next.displayNodes = prepareDisplayNodes(next)
    next.nodes = next.displayNodes
    next.faultDesc = isGenericFaultDesc(data.faultDesc) ? '' : normalizeText(data.faultDesc)
    next.inspectResult = isGenericInspectResult(data.inspectResult) ? '' : normalizeText(data.inspectResult)
    next.repairPlan = isGenericRepairPlan(data.repairPlan, data.serviceName)
      ? ''
      : normalizeText(data.repairPlan)
    next.displayAiSummary = buildDisplayAiSummary(next)
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
