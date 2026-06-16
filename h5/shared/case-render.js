(function () {
  var COPY = {
    displayDisclaimer:
      '本页内容由商家自行发布或经车主授权展示，仅供参考。实际方案与费用请与门店线下确认。',
    geoDisclaimer:
      '页面内容用于展示维修服务信息、门店信息和脱敏案例，不构成线上报价或维修承诺。实际维修方案、费用、配件、质保和售后由用户与门店线下确认。',
    desensitize:
      '公开展示仅使用脱敏图片，不含车牌、手机号等隐私信息。',
  }

  var TAG_MAP = {
    authorized: { text: '已授权', cls: 'h5-tag--order' },
    named: { text: '实名授权', cls: 'h5-tag--order' },
    anonymous: { text: '匿名授权', cls: 'h5-tag--desensitized' },
    desensitized: { text: '已脱敏', cls: 'h5-tag--desensitized' },
    audited: { text: '已审核', cls: 'h5-tag--audited' },
  }

  function isDesensitizedUrl(url) {
    if (!url) return false
    var value = String(url)
    if (value.indexOf('mock://desensitized/') === 0) return true
    if (value.indexOf('/files/uploads/desensitized/') !== -1) return true
    if (value.indexOf('/media/files/uploads/desensitized/') !== -1) return true
    return false
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

  function pickCaseCover(data) {
    if (data.coverImageDesensitized && isDesensitizedUrl(data.coverImageDesensitized)) {
      return data.coverImageDesensitized
    }
    if (data.coverImage && isDesensitizedUrl(data.coverImage)) {
      return data.coverImage
    }
    for (var i = 0; i < (data.nodes || []).length; i += 1) {
      var imgs = pickNodeDesensitizedImages(data.nodes[i])
      if (imgs.length) return imgs[0]
    }
    return ''
  }

  function ensureMeta(attrName, key, content) {
    if (!content) return
    var selector = 'meta[' + attrName + '="' + key + '"]'
    var el = document.querySelector(selector)
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute(attrName, key)
      document.head.appendChild(el)
    }
    el.setAttribute('content', content)
  }

  function ensureLink(rel, href) {
    if (!href) return
    var selector = 'link[rel="' + rel + '"]'
    var el = document.querySelector(selector)
    if (!el) {
      el = document.createElement('link')
      el.setAttribute('rel', rel)
      document.head.appendChild(el)
    }
    el.setAttribute('href', href)
  }

  function ensureJsonLd(id, data) {
    var selector = 'script[type="application/ld+json"]#' + id
    var el = document.querySelector(selector)
    if (!el) {
      el = document.createElement('script')
      el.type = 'application/ld+json'
      el.id = id
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(data)
  }

  function casePagePath(caseId, slugSource) {
    var slug = slugSource
    if (slugSource && typeof slugSource === 'object') {
      slug =
        slugSource.slug ||
        (slugSource.seo && slugSource.seo.slug) ||
        ''
    }
    if (slug) return '/case/' + String(slug) + '.html'
    return '/case/view.html?id=' + encodeURIComponent(caseId)
  }

  function setNoIndex() {
    ensureMeta('name', 'robots', 'noindex,nofollow')
  }

  function vehicleLabel(data) {
    if (data.vehicleText) return String(data.vehicleText)
    var row = (data.keyInfo || []).find(function (item) {
      return item && (item.label === '车型' || item.label === '车辆')
    })
    return row && row.value ? String(row.value) : ''
  }

  function buildPageTitle(data) {
    if (data.seo && data.seo.title) {
      return String(data.seo.title) + ' · 辙见'
    }
    if (data.seoTitle) {
      return String(data.seoTitle) + ' · 辙见'
    }
    var city = data.city || ''
    var vehicle = vehicleLabel(data)
    var service = data.serviceName || '维修服务'
    var store = shouldShowStorePublicly(data) ? data.storeName || '' : ''
    var headline = city + vehicle + service + '维修案例'
    return (store ? headline + '_' + store : headline) + ' · 辙见'
  }

  function buildPageDescription(data) {
    if (data.seo && data.seo.description) return String(data.seo.description)
    if (data.seoDescription) return String(data.seoDescription)
    var city = data.city || ''
    var store = shouldShowStorePublicly(data) ? data.storeName || '服务门店' : '服务门店'
    var vehicle = vehicleLabel(data) || '车辆'
    var service = data.serviceName || '维修服务'
    return (
      '本案例展示' +
      city +
      store +
      '为' +
      vehicle +
      '提供' +
      service +
      '的维修过程，包括故障现象、施工过程、维修结果和价格影响因素，图片已做隐私脱敏处理。'
    )
  }

  function buildImageAlt(data, node) {
    var city = data.city || ''
    var vehicle = vehicleLabel(data)
    var service = data.serviceName || '维修服务'
    var stage = (node && node.title) || '维修过程'
    return (city + vehicle + service + stage).trim() || '脱敏维修过程图片'
  }

  function setShareMeta(data) {
    var title = buildPageTitle(data)
    var desc = buildPageDescription(data)
    var cover = pickCaseCover(data)
    var canonicalPath =
      (data.seo && data.seo.canonicalPath) ||
      data.canonicalPath ||
      casePagePath(data.id, data.seo && data.seo.slug ? data.seo.slug : data.slug)
    var canonical = canonicalPath.indexOf('http') === 0 ? canonicalPath : location.origin + canonicalPath

    document.title = title
    if ((data.seo && data.seo.noindex) || data.seoNoindex) {
      setNoIndex()
    }
    ensureMeta('name', 'description', desc)
    ensureMeta('property', 'og:title', title)
    ensureMeta('property', 'og:description', desc)
    ensureMeta('property', 'og:type', 'article')
    ensureMeta('property', 'og:site_name', '辙见')
    ensureMeta('property', 'og:url', canonical)
    if (cover) ensureMeta('property', 'og:image', cover)
    ensureLink('canonical', canonical)

    var articleSchema = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: data.title || title,
      description: data.aiSummary || data.summary || desc,
      articleBody: (data.article && data.article.body) || data.articleBody || undefined,
      url: canonical,
      datePublished: data.publishedAt || undefined,
      dateModified: data.updatedAt || data.publishedAt || undefined,
      image: cover || undefined,
      author: shouldShowStorePublicly(data)
        ? { '@type': 'Organization', name: data.storeName || '辙见合作门店' }
        : { '@type': 'Organization', name: '辙见' },
      publisher: {
        '@type': 'Organization',
        name: '辙见',
        url: location.origin + '/',
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': canonical,
      },
    }
    ensureJsonLd('case-article-schema', articleSchema)

    if (cover) {
      ensureJsonLd('case-cover-image-schema', {
        '@context': 'https://schema.org',
        '@type': 'ImageObject',
        contentUrl: cover,
        name: data.title || title,
        description: desc,
      })
    }

    if (data.serviceName) {
      var serviceProvider =
        shouldShowStorePublicly(data) && data.store && data.store.name
          ? {
              '@type': 'AutoRepair',
              name: data.store.name,
              url:
                location.origin +
                '/store/' +
                encodeURIComponent(data.store.id) +
                '.html',
            }
          : { '@type': 'Organization', name: '辙见' }
      ensureJsonLd('case-service-schema', {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: data.serviceName,
        description: data.aiSummary || data.summary || desc,
        provider: serviceProvider,
        areaServed: data.city
          ? { '@type': 'City', name: data.city }
          : { '@type': 'Country', name: '中国' },
        url: canonical,
      })
    }

    var faqInline = (data.faq || []).filter(function (item) {
      return item && item.q && item.a
    })
    var faqLinks = (data.faqLinks || []).concat(
      (data.faq || []).filter(function (item) {
        return item && item.title && item.url
      })
    )
    if (faqInline.length) {
      ensureJsonLd('case-faq-inline-schema', {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqInline.map(function (item) {
          return {
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          }
        }),
      })
    }
    if (faqLinks.length) {
      ensureJsonLd('case-faq-schema', {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: '延伸阅读',
        itemListElement: faqLinks.map(function (item, index) {
          return {
            '@type': 'ListItem',
            position: index + 1,
            name: item.title,
            url: item.url,
          }
        }),
      })
    }

    if (data.store && shouldShowStorePublicly(data) && data.store.name) {
      var storeSchema = {
        '@context': 'https://schema.org',
        '@type': 'AutoRepair',
        name: data.store.name,
        address: data.store.address || undefined,
        telephone: data.store.phone || data.storePhone || undefined,
        url: location.origin + '/store/' + encodeURIComponent(data.store.id) + '.html',
      }
      if (data.store.latitude != null && data.store.longitude != null) {
        storeSchema.geo = {
          '@type': 'GeoCoordinates',
          latitude: data.store.latitude,
          longitude: data.store.longitude,
        }
      }
      ensureJsonLd('case-store-schema', storeSchema)
    }
  }

  function sanitizeCaseForDisplay(data) {
    var next = Object.assign({}, data)
    next.nodes = (data.nodes || []).map(function (node) {
      return Object.assign({}, node, {
        images: pickNodeDesensitizedImages(node),
        imagesDesensitized: pickNodeDesensitizedImages(node),
      })
    })
    var cover = pickCaseCover(next)
    next.coverImage = cover
    next.coverImageDesensitized = cover
    return next
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function resolveCaseId() {
    if (window.__CASE_ID__) return String(window.__CASE_ID__).trim()
    var params = new URLSearchParams(location.search)
    var fromQuery = params.get('id') || params.get('caseId') || ''
    if (fromQuery) return String(fromQuery).trim()
    var match = location.pathname.match(/\/([^/]+)\.html$/)
    if (!match) return ''
    var base = match[1]
    if (base === 'view' || base === 'index') return ''
    return base
  }

  function isFixtureFallbackAllowed() {
    var host = String(location.hostname || '').toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1') return true
    if (window.__H5_ALLOW_FIXTURES__ === true) return true
    return false
  }

  function renderTags(data) {
    var tier = data.authorizationTier
    var html = ''
    if (tier === 'anonymous') {
      html += '<span class="h5-tag h5-tag--desensitized">匿名授权</span>'
    } else if (tier === 'named') {
      html += '<span class="h5-tag h5-tag--order">实名授权</span>'
    } else if (tier === 'private') {
      html += '<span class="h5-tag h5-tag--audited">门店留档</span>'
    } else {
      html += '<span class="h5-tag h5-tag--order">已授权</span>'
    }
    html += '<span class="h5-tag h5-tag--desensitized">已脱敏</span>'
    html += '<span class="h5-tag h5-tag--audited">已审核</span>'
    return html
  }

  function renderKeyInfo(rows) {
    if (!rows || !rows.length) return ''
    var body = rows
      .map(function (row) {
        return (
          '<tr><th>' +
          escapeHtml(row.label) +
          '</th><td>' +
          escapeHtml(row.value) +
          '</td></tr>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">关键信息</h2><table class="h5-table">' +
      body +
      '</table></div>'
    )
  }

  function renderNodeImage(data, node) {
    var desensitized = pickNodeDesensitizedImages(node)
    var alt = escapeHtml(buildImageAlt(data, node))
    if (desensitized.length) {
      return (
        '<img class="h5-node-img" src="' +
        escapeHtml(desensitized[0]) +
        '" alt="' +
        alt +
        '" loading="lazy" />'
      )
    }
    return '<div class="h5-placeholder-img">脱敏图片暂未就绪</div>'
  }

  function renderNodes(data, nodes) {
    if (!nodes || !nodes.length) return ''
    var items = nodes
      .map(function (node) {
        return (
          '<div class="h5-node">' +
          '<div class="h5-node-title">' +
          escapeHtml(node.title) +
          '</div>' +
          renderNodeImage(data, node) +
          (node.note
            ? '<div class="h5-node-note">' + escapeHtml(node.note) + '</div>'
            : '') +
          '</div>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">维修过程</h2>' +
      '<p class="h5-compliance">' +
      escapeHtml(COPY.desensitize) +
      '</p>' +
      items +
      '</div>'
    )
  }

  function shouldShowStorePublicly(data) {
    return data.authorizationTier !== 'anonymous'
  }

  function renderInternalLinks(data) {
    var links = data.internalLinks
    if (!links) return ''
    var entries = []
    if (links.store && links.store.path) {
      entries.push({
        type: 'store',
        label: links.store.name || '服务门店',
        hint: '门店主页',
        path: links.store.path,
      })
    }
    if (links.vehicle && links.vehicle.path) {
      entries.push({
        type: 'vehicle',
        label: links.vehicle.label || '车型相关',
        hint: '更多同类案例',
        path: links.vehicle.path,
      })
    }
    if (links.service && links.service.path) {
      entries.push({
        type: 'service',
        label: links.service.name || '服务项目',
        hint: '流程与价格参考',
        path: links.service.path,
      })
    }
    if (links.faq && links.faq.path) {
      entries.push({
        type: 'faq',
        label: links.faq.label || '常见问题',
        hint: '维修说明与 FAQ',
        path: links.faq.path,
        isAnchor: links.faq.isAnchor,
      })
    } else if (links.geoTopic && links.geoTopic.path) {
      entries.push({
        type: 'geo',
        label: links.geoTopic.title || '相关服务说明',
        hint: '流程、价格与常见问题',
        path: links.geoTopic.path,
      })
    } else if (links.relatedService && links.relatedService.path) {
      entries.push({
        type: 'geo',
        label: links.relatedService.name || '相关服务',
        hint: '服务项目说明与 FAQ',
        path: links.relatedService.path,
      })
    }
    if (!entries.length) return ''

    var items = entries
      .map(function (entry) {
        return (
          '<a class="h5-internal-link-item" href="' +
          escapeHtml(entry.path) +
          '" data-internal-link-type="' +
          escapeHtml(entry.type) +
          '">' +
          '<span class="h5-internal-link-label">' +
          escapeHtml(entry.label) +
          '</span>' +
          '<span class="h5-internal-link-hint">' +
          escapeHtml(entry.hint) +
          ' ›</span></a>'
        )
      })
      .join('')

    return (
      '<div class="h5-card" id="case-internal-links">' +
      '<h2 class="h5-section-title">延伸浏览</h2>' +
      '<p class="h5-compliance">通过以下链接查看门店、服务项目、同类案例与常见问题，便于对比参考。</p>' +
      '<div class="h5-internal-links">' +
      items +
      '</div></div>'
    )
  }

  function renderRelatedServiceCard(data) {
    var links = data.internalLinks
    if (!links) return ''
    var target = links.geoTopic || links.relatedService
    if (!target || !target.path) return ''
    var title = target.title || (links.relatedService && links.relatedService.name) || '相关服务说明'
    var summary = target.summary || ''
    return (
      '<div class="h5-card" id="case-related-service">' +
      '<h2 class="h5-section-title">相关服务说明</h2>' +
      (summary
        ? '<p class="h5-summary">' + escapeHtml(summary) + '</p>'
        : '<p class="h5-compliance">查看该服务项目的流程说明、参考价格与常见问题。</p>') +
      '<a class="h5-btn h5-btn--secondary" href="' +
      escapeHtml(target.path) +
      '">查看' +
      escapeHtml(title) +
      '</a></div>'
    )
  }

  function renderStoreSection(data) {
    if (!shouldShowStorePublicly(data)) {
      var cityHint = data.city ? '（' + data.city + '）' : ''
      return (
        '<div class="h5-card"><h2 class="h5-section-title">联系门店</h2>' +
        '<p class="h5-compliance">本案例为匿名授权公示，不展示门店名称。</p>' +
        '<p class="h5-compliance">可通过下方电话或留言联系服务门店' +
        escapeHtml(cityHint) +
        '</p></div>'
      )
    }
    return (
      '<div class="h5-card">' +
      '<h2 class="h5-section-title">关联门店</h2>' +
      '<p>' +
      escapeHtml(data.storeName) +
      '</p>' +
      '<p class="h5-compliance">' +
      escapeHtml(data.city || '') +
      '</p>' +
      '<a class="h5-link" id="h5-store-link" href="/store/' +
      encodeURIComponent(data.storeId) +
      '.html" data-store-id="' +
      escapeHtml(data.storeId) +
      '">查看门店详情 ›</a>' +
      '</div>'
    )
  }

  function renderDisclaimerBlock() {
    if (window.zhejianH5Ui && window.zhejianH5Ui.renderDisclaimer) {
      return window.zhejianH5Ui.renderDisclaimer(
        COPY.displayDisclaimer,
        COPY.geoDisclaimer
      )
    }
    return (
      '<div class="h5-disclaimer" data-h5-disclaimer>' +
      '<p class="h5-disclaimer__primary">' +
      escapeHtml(COPY.displayDisclaimer) +
      '</p>' +
      '<div class="h5-disclaimer__more" hidden><p>' +
      escapeHtml(COPY.geoDisclaimer) +
      '</p></div>' +
      '<button type="button" class="h5-disclaimer__toggle" data-h5-disclaimer-toggle aria-expanded="false">展开说明</button>' +
      '</div>'
    )
  }

  function renderRelatedCases(cases, currentId, title) {
    var list = (cases || []).filter(function (item) {
      return item && item.id && item.id !== currentId
    })
    if (!list.length) return ''
    var cards = list
      .slice(0, 3)
      .map(function (item) {
        if (window.zhejianH5Ui && window.zhejianH5Ui.renderCaseListItem) {
          return window.zhejianH5Ui.renderCaseListItem(item, {
            href: casePagePath(item.id, item),
            extraAttrs:
              ' data-case-id="' + escapeHtml(item.id) + '"',
          })
        }
        var cover = pickCaseCover(item)
        var price = buildPriceDisplay(item)
        var coverHtml = cover
          ? '<img class="h5-media-list-thumb" src="' +
            escapeHtml(cover) +
            '" alt="脱敏案例封面" loading="lazy" />'
          : '<div class="h5-media-list-thumb h5-media-list-thumb--placeholder">案例</div>'
        return (
          '<a class="h5-media-list-item" href="' +
          casePagePath(item.id, item) +
          '" data-case-id="' +
          escapeHtml(item.id) +
          '">' +
          coverHtml +
          '<div class="h5-media-list-body">' +
          '<div class="h5-media-list-title">' +
          escapeHtml(item.title || item.serviceName || '公开案例') +
          '</div>' +
          '<div class="h5-media-list-meta">' +
          escapeHtml(stripPriceSuffix(price.priceText)) +
          '</div></div></a>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">' +
      escapeHtml(title || '相关案例') +
      '</h2>' +
      '<div class="h5-media-list h5-related-case-list">' +
      cards +
      '</div></div>'
    )
  }

  function hasArticleLayout(data) {
    return Boolean(
      (data.article && data.article.hasArticle) ||
      (data.articleBody && String(data.articleBody).length > 20)
    )
  }

  function getArticleSections(data) {
    if (data.article && data.article.sections && data.article.sections.length) {
      return data.article.sections
    }
    return []
  }

  function buildNodeNarrativeMap(data) {
    var map = {}
    var list = (data.article && data.article.nodeNarratives) || []
    list.forEach(function (item) {
      if (item && item.nodeId) map[item.nodeId] = item
    })
    return map
  }

  function renderArticleSections(data) {
    var sections = getArticleSections(data).filter(function (section) {
      return section && section.content && section.key !== 'priceFactors'
    })
    if (!sections.length) return ''
    return sections
      .map(function (section) {
        return (
          '<section class="h5-article-section h5-card">' +
          '<h2 class="h5-section-title">' +
          escapeHtml(section.title || '') +
          '</h2>' +
          '<div class="h5-article-text">' +
          escapeHtml(section.content).replace(/\n/g, '<br>') +
          '</div></section>'
        )
      })
      .join('')
  }

  function renderArticleLead(data) {
    var text = data.aiSummary || data.summary || ''
    if (!text) return ''
    return (
      '<section class="h5-article-lead">' +
      '<p class="h5-article-lead-label">案例摘要</p>' +
      '<p class="h5-summary">' +
      escapeHtml(text) +
      '</p></section>'
    )
  }

  function renderArticleProcess(data, nodes) {
    if (!nodes || !nodes.length) return ''
    var narrativeMap = buildNodeNarrativeMap(data)
    var items = nodes
      .filter(function (node) {
        return pickNodeDesensitizedImages(node).length > 0
      })
      .map(function (node) {
        var nodeId = node.id || node.nodeId || ''
        var narrative = narrativeMap[nodeId] || {}
        var desc = narrative.description || node.note || ''
        var captions = narrative.imageCaptions || []
        var images = pickNodeDesensitizedImages(node)
        var imgsHtml = images
          .map(function (url, index) {
            var caption = captions[index] && captions[index].alt ? captions[index].alt : buildImageAlt(data, node)
            return (
              '<figure class="h5-figure">' +
              '<img class="h5-node-img" src="' +
              escapeHtml(url) +
              '" alt="' +
              escapeHtml(caption) +
              '" loading="lazy" />' +
              (captions[index] && captions[index].caption
                ? '<figcaption class="h5-figure-caption">' +
                  escapeHtml(captions[index].caption) +
                  '</figcaption>'
                : '') +
              '</figure>'
            )
          })
          .join('')
        return (
          '<article class="h5-node h5-article-node">' +
          '<h3 class="h5-node-title">' +
          escapeHtml(narrative.nodeName || node.title || '维修过程') +
          '</h3>' +
          (desc ? '<p class="h5-node-note">' + escapeHtml(desc) + '</p>' : '') +
          imgsHtml +
          '</article>'
        )
      })
      .join('')
    if (!items) return ''
    return (
      '<section class="h5-card">' +
      '<h2 class="h5-section-title">维修过程图集</h2>' +
      '<p class="h5-compliance">' +
      escapeHtml(COPY.desensitize) +
      '</p>' +
      items +
      '</section>'
    )
  }

  function buildStoreNavUrl(store) {
    if (!store) return ''
    var lat = store.latitude
    var lng = store.longitude
    if (lat != null && lng != null && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))) {
      return (
        'https://uri.amap.com/marker?position=' +
        encodeURIComponent(String(lng) + ',' + String(lat)) +
        '&name=' +
        encodeURIComponent(store.name || '门店')
      )
    }
    if (store.address) {
      return (
        'https://uri.amap.com/search?keyword=' + encodeURIComponent(store.address)
      )
    }
    return ''
  }

  function renderConversionFooter(data) {
    return (
      '<footer class="h5-footer">' +
      '<div class="h5-footer-inner h5-footer-inner--dual">' +
      '<button type="button" class="h5-btn h5-btn--secondary" id="h5-call-btn">电话咨询</button>' +
      '<button type="button" class="h5-btn" id="h5-consult-open-btn">留言咨询</button>' +
      '</div>' +
      '<div class="h5-footer-links">' +
      (buildStoreNavUrl(data.store)
        ? '<a class="h5-footer-link" id="h5-nav-link" href="' +
          escapeHtml(buildStoreNavUrl(data.store)) +
          '" target="_blank" rel="noopener">门店导航</a>'
        : '') +
      (data.storeId
        ? '<a class="h5-footer-link" href="/store/' +
          encodeURIComponent(data.storeId) +
          '.html">本店主页</a>'
        : '') +
      '<button type="button" class="h5-footer-link h5-footer-link-btn" id="h5-open-weapp-link">小程序查看</button>' +
      '</div></footer>' +
      renderConsultSheet(data)
    )
  }

  function renderConsultSheet(data) {
    var storeLabel = shouldShowStorePublicly(data)
      ? data.storeName || '服务门店'
      : data.city
        ? data.city + '服务门店'
        : '服务门店'
    return (
      '<div class="h5-consult-sheet" id="h5-consult-sheet" hidden>' +
      '<div class="h5-consult-sheet-mask" id="h5-consult-sheet-mask"></div>' +
      '<div class="h5-consult-sheet-panel">' +
      '<div class="h5-consult-sheet-head">' +
      '<h2 class="h5-section-title">留言咨询</h2>' +
      '<button type="button" class="h5-consult-close" id="h5-consult-close">关闭</button>' +
      '</div>' +
      '<p class="h5-compliance">向「' +
      escapeHtml(storeLabel) +
      '」提交咨询，门店将电话与您联系。非平台报价承诺。</p>' +
      '<label class="h5-field"><span>称呼</span><input id="h5-consult-name" type="text" maxlength="20" placeholder="如何称呼您" /></label>' +
      '<label class="h5-field"><span>手机号</span><input id="h5-consult-phone" type="tel" maxlength="11" placeholder="11位手机号" /></label>' +
      '<label class="h5-field"><span>咨询内容</span><textarea id="h5-consult-desc" rows="4" maxlength="500" placeholder="请描述您的车辆问题或想了解的维修项目"></textarea></label>' +
      '<label class="h5-consult-consent"><input id="h5-consult-consent" type="checkbox" /> 我已知悉：线上咨询仅为预约沟通，实际方案与费用需到店确认。</label>' +
      '<p class="h5-consult-error" id="h5-consult-error" hidden></p>' +
      '<button type="button" class="h5-btn" id="h5-consult-submit">提交咨询</button>' +
      '</div></div>'
    )
  }

  function renderLegacyFooter(data) {
    return (
      '<footer class="h5-footer">' +
      '<div class="h5-footer-inner h5-footer-inner--triple">' +
      '<button type="button" class="h5-btn h5-btn--secondary" id="h5-call-btn">电话</button>' +
      '<button type="button" class="h5-btn h5-btn--secondary" id="h5-open-weapp-btn-footer">打开小程序</button>' +
      '<button type="button" class="h5-btn" id="h5-message-btn">留言</button>' +
      '</div></footer>'
    )
  }

  function miniprogramCasePath(data) {
    return (
      '/pages/case/detail/index?id=' +
      encodeURIComponent(data.id || '') +
      '&source=h5&page_type=case&utm_source=h5' +
      (data.storeId ? '&store_id=' + encodeURIComponent(data.storeId) : '')
    )
  }

  function miniprogramConsultPath(data) {
    return (
      '/pages/consult/submit/index?storeId=' +
      encodeURIComponent(data.storeId || '') +
      '&caseId=' +
      encodeURIComponent(data.id || '') +
      '&sourcePage=h5&source=h5&utm_source=h5'
    )
  }

  function openWeapp(path) {
    alert('请打开微信小程序继续。路径：' + path)
  }

  function renderPriceFactors(factors) {
    if (!factors || !factors.length) return ''
    var items = factors
      .map(function (item) {
        return '<p class="h5-bullet">· ' + escapeHtml(item) + '</p>'
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">影响价格的因素</h2>' +
      items +
      '</div>'
    )
  }

  function renderFaq(data) {
    var faqInline = (data.faq || []).filter(function (item) {
      return item && item.q && item.a
    })
    var faqLinks = (data.faqLinks || []).concat(
      (data.faq || []).filter(function (item) {
        return item && item.title && item.url
      })
    )
    var html = ''
    if (faqInline.length) {
      var inlineItems = faqInline
        .map(function (item) {
          return (
            '<div class="h5-faq-item"><div class="h5-faq-q">' +
            escapeHtml(item.q) +
            '</div><div class="h5-faq-a">' +
            escapeHtml(item.a) +
            '</div></div>'
          )
        })
        .join('')
      html +=
        '<div class="h5-card" id="case-faq-inline"><h2 class="h5-section-title">常见问题</h2>' +
        inlineItems +
        '</div>'
    }
    if (faqLinks.length) {
      var linkItems = faqLinks
        .map(function (item) {
          var href = String(item.url || '').replace(/"/g, '&quot;')
          return (
            '<a class="h5-faq-link" href="' +
            href +
            '" target="_blank" rel="noopener noreferrer">' +
            '<span class="h5-faq-link__title">' +
            escapeHtml(item.title) +
            '</span>' +
            '<span class="h5-faq-link__hint">公众号文章</span>' +
            '</a>'
          )
        })
        .join('')
      html +=
        '<div class="h5-card" id="case-faq"><h2 class="h5-section-title">延伸阅读</h2>' +
        '<div class="h5-faq-links">' +
        linkItems +
        '</div></div>'
    }
    return html
  }

  function resolveFixedAmount(data) {
    if (data.amount != null && data.amount !== '') {
      var amount = Number(data.amount)
      if (Number.isFinite(amount)) return amount
    }
    var min = data.minAmount != null ? Number(data.minAmount) : null
    var max = data.maxAmount != null ? Number(data.maxAmount) : null
    if (min != null && max != null && min === max) return min
    if (data.priceMode === 'fixed' && data.planAmount != null && data.planAmount !== '') {
      var plan = Number(data.planAmount)
      if (Number.isFinite(plan)) return plan
    }
    return null
  }

  function stripPriceSuffix(text) {
    return String(text || '')
      .replace(/\s*起\s*$/u, '')
      .trim()
  }

  function buildPriceDisplay(data) {
    var mode = data.priceMode || 'range'
    var currency = '¥'
    var fixedAmount = resolveFixedAmount(data)
    var isAuthorized =
      data.authorizationTier === 'named' || data.authorizationTier === 'anonymous'

    if (mode === 'accident') {
      return {
        sectionTitle: '价格说明',
        priceText: '预约到店检测后报价',
        disclaimer: '事故车维修无法仅凭线上信息准确报价，请预约到店检测后确认方案。',
        compliance: '本案例不构成线上报价承诺。',
      }
    }
    if (fixedAmount != null && (mode === 'fixed' || isAuthorized)) {
      return {
        sectionTitle: '方案报价',
        priceText: currency + fixedAmount,
        disclaimer: '',
        compliance: '本案例为车主授权公示，价格为当时方案报价，不构成线上报价承诺。',
      }
    }
    if (mode === 'consult') {
      return {
        sectionTitle: '价格说明',
        priceText: '到店检测后报价',
        disclaimer: '实际费用以门店检测结果为准。',
        compliance: '本案例价格仅为参考，不构成线上报价承诺。',
      }
    }
    if (data.minAmount != null && data.maxAmount != null) {
      return {
        sectionTitle: '价格说明',
        priceText: '参考区间 ' + currency + data.minAmount + ' - ' + currency + data.maxAmount,
        disclaimer: '实际费用以门店检测结果为准。',
        compliance: '本案例价格仅为参考区间，不构成线上报价承诺。',
      }
    }
    return {
      sectionTitle: '价格说明',
      priceText: stripPriceSuffix(data.priceText || '到店检测后报价'),
      disclaimer: '实际费用以门店检测结果为准。',
      compliance: '本案例价格仅为参考区间，不构成线上报价承诺。',
    }
  }

  function renderPriceSection(data) {
    var display = buildPriceDisplay(data)
    display.priceText = stripPriceSuffix(display.priceText)
    var disclaimerHtml = display.disclaimer
      ? '<span class="h5-price-note">' + escapeHtml(display.disclaimer) + '</span>'
      : ''
    return (
      '<div class="h5-card">' +
      '<h2 class="h5-section-title">' +
      escapeHtml(display.sectionTitle) +
      '</h2>' +
      '<div class="h5-price">' +
      escapeHtml(display.priceText) +
      '</div>' +
      disclaimerHtml +
      '<p class="h5-compliance">' +
      escapeHtml(display.compliance) +
      '</p>' +
      '</div>'
    )
  }

  function bindCaseInteractions(safeData, articleMode) {
    var caseId = safeData.id || ''
    var storeId = safeData.storeId || ''

    document.querySelectorAll('[data-case-id]').forEach(function (el) {
      if (el.id === 'h5-store-link') return
      el.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_related_case_click', {
            caseId: caseId,
            relatedCaseId: el.getAttribute('data-case-id') || '',
            storeId: storeId,
          })
        }
      })
    })

    var storeLink = document.getElementById('h5-store-link')
    if (storeLink) {
      storeLink.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_store_card_click', {
            caseId: caseId,
            storeId: storeId,
          })
        }
      })
    }

    document.querySelectorAll('[data-internal-link-type]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_case_internal_link_click', {
            caseId: caseId,
            storeId: storeId,
            linkType: el.getAttribute('data-internal-link-type') || '',
            targetPath: el.getAttribute('href') || '',
          })
        }
      })
    })

    function trackOpenWeapp() {
      if (window.zhejianTrack) {
        window.zhejianTrack.track('h5_open_weapp_click', {
          page_type: 'case',
          caseId: caseId,
          storeId: storeId,
        })
      }
    }

    function trackConsultClick() {
      if (window.zhejianTrack) {
        window.zhejianTrack.track('h5_consult_click', {
          caseId: caseId,
          storeId: storeId,
        })
      }
    }

    function handleCallClick() {
      if (window.zhejianTrack) {
        window.zhejianTrack.track('h5_call_click', {
          caseId: caseId,
          storeId: storeId,
        })
      }
      var phone = safeData.storePhone || (safeData.store && safeData.store.phone) || ''
      if (phone) {
        window.location.href = 'tel:' + phone
      } else if (articleMode) {
        openConsultSheet()
      } else {
        alert('暂无门店电话，请打开小程序留言咨询。')
      }
    }

    ;['h5-call-btn', 'h5-call-btn-top'].forEach(function (id) {
      var btn = document.getElementById(id)
      if (btn) btn.addEventListener('click', handleCallClick)
    })

    var navLink = document.getElementById('h5-nav-link')
    if (navLink) {
      navLink.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_store_nav_click', {
            caseId: caseId,
            storeId: storeId,
          })
        }
      })
    }

    function openConsultSheet() {
      var sheet = document.getElementById('h5-consult-sheet')
      if (sheet) sheet.hidden = false
    }

    function closeConsultSheet() {
      var sheet = document.getElementById('h5-consult-sheet')
      if (sheet) sheet.hidden = true
      var err = document.getElementById('h5-consult-error')
      if (err) err.hidden = true
    }

    ;['h5-consult-open-btn', 'h5-consult-open-top'].forEach(function (id) {
      var btn = document.getElementById(id)
      if (btn) {
        btn.addEventListener('click', function () {
          trackConsultClick()
          openConsultSheet()
        })
      }
    })

    var closeBtn = document.getElementById('h5-consult-close')
    if (closeBtn) closeBtn.addEventListener('click', closeConsultSheet)
    var mask = document.getElementById('h5-consult-sheet-mask')
    if (mask) mask.addEventListener('click', closeConsultSheet)

    var submitBtn = document.getElementById('h5-consult-submit')
    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        var nameEl = document.getElementById('h5-consult-name')
        var phoneEl = document.getElementById('h5-consult-phone')
        var descEl = document.getElementById('h5-consult-desc')
        var consentEl = document.getElementById('h5-consult-consent')
        var errEl = document.getElementById('h5-consult-error')
        var name = nameEl ? String(nameEl.value || '').trim() : ''
        var phone = phoneEl ? String(phoneEl.value || '').replace(/\D/g, '') : ''
        var description = descEl ? String(descEl.value || '').trim() : ''
        var consent = consentEl ? consentEl.checked : false

        function showError(msg) {
          if (!errEl) {
            alert(msg)
            return
          }
          errEl.textContent = msg
          errEl.hidden = false
        }

        if (!storeId) {
          showError('缺少门店信息，请刷新后重试')
          return
        }
        if (!/^1\d{10}$/.test(phone)) {
          showError('请填写有效手机号')
          return
        }
        if (description.length < 4) {
          showError('请填写至少 4 字咨询内容')
          return
        }
        if (!consent) {
          showError('请先勾选说明')
          return
        }

        submitBtn.disabled = true
        fetch('/api/v1/public/h5/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId: storeId,
            caseId: caseId,
            serviceName: safeData.serviceName || '',
            name: name,
            phone: phone,
            description: description,
            platformConsent: true,
            sourcePage: 'h5_case',
          }),
        })
          .then(function (res) {
            return res.json().then(function (body) {
              return { ok: res.ok, body: body }
            })
          })
          .then(function (result) {
            if (!result.ok || result.body.code !== 0) {
              throw new Error((result.body && result.body.message) || '提交失败')
            }
            trackConsultClick()
            closeConsultSheet()
            alert('咨询已提交，门店将尽快与您联系。')
          })
          .catch(function (err) {
            showError((err && err.message) || '提交失败，请稍后重试')
          })
          .finally(function () {
            submitBtn.disabled = false
          })
      })
    }

    if (articleMode) {
      var weappLink = document.getElementById('h5-open-weapp-link')
      if (weappLink) {
        weappLink.addEventListener('click', function () {
          trackOpenWeapp()
          openWeapp(miniprogramCasePath(safeData))
        })
      }
      return
    }

    ;['h5-open-weapp-btn', 'h5-open-weapp-btn-footer'].forEach(function (id) {
      var btn = document.getElementById(id)
      if (btn) {
        btn.addEventListener('click', function () {
          trackOpenWeapp()
          openWeapp(miniprogramCasePath(safeData))
        })
      }
    })

    ;['h5-message-btn', 'h5-consult-top-btn'].forEach(function (id) {
      var btn = document.getElementById(id)
      if (btn) {
        btn.addEventListener('click', function () {
          trackConsultClick()
          var phone = safeData.storePhone || (safeData.store && safeData.store.phone) || ''
          if (phone) {
            window.location.href = 'tel:' + phone
          } else {
            alert('暂无门店电话，请稍后再试。')
          }
        })
      }
    })
  }

  function renderCase(data) {
    var safeData = sanitizeCaseForDisplay(data)
    var articleMode = hasArticleLayout(safeData)
    setShareMeta(safeData)

    var breadcrumbItems = [{ label: '辙见', href: '/' }, { label: '公开案例', href: '/case/' }]
    if (safeData.internalLinks && safeData.internalLinks.service) {
      breadcrumbItems.push({
        label: safeData.internalLinks.service.name,
        href: safeData.internalLinks.service.path,
      })
    }
    breadcrumbItems.push({ label: safeData.title || '公开案例' })

    var breadcrumbHtml = window.zhejianSeo
      ? window.zhejianSeo.renderBreadcrumbHtml(breadcrumbItems)
      : '<nav class="h5-breadcrumb"><a href="/">辙见</a> › <a href="/case/">公开案例</a> › ' +
        escapeHtml(safeData.title) +
        '</nav>'

    if (window.zhejianSeo) {
      window.zhejianSeo.applyBreadcrumbSchema(breadcrumbItems, 'case-breadcrumb-schema-v2')
    }

    var html =
      '<div class="h5-page">' +
      breadcrumbHtml +
      '<header class="h5-header">' +
      '<div class="h5-brand">辙见 · 公开维修案例</div>' +
      '<h1 class="h5-title">' +
      escapeHtml(safeData.title) +
      '</h1>' +
      '<div class="h5-tags">' +
      renderTags(safeData) +
      '</div>' +
      renderDisclaimerBlock() +
      '</header>'

    if (articleMode) {
      html +=
        '<div class="h5-top-actions">' +
        '<button type="button" class="h5-btn h5-btn--secondary" id="h5-call-btn-top">电话咨询</button>' +
        '<button type="button" class="h5-btn" id="h5-consult-open-top">留言咨询</button>' +
        '</div>' +
        renderArticleLead(safeData) +
        renderKeyInfo(safeData.keyInfo) +
        renderPriceSection(safeData) +
        renderArticleSections(safeData) +
        renderArticleProcess(safeData, safeData.nodes)
    } else {
      html +=
        '<div class="h5-top-actions">' +
        '<button type="button" class="h5-btn h5-btn--secondary" id="h5-open-weapp-btn">打开小程序</button>' +
        '<button type="button" class="h5-btn" id="h5-consult-top-btn">预约类似服务</button>' +
        '</div>' +
        (safeData.aiSummary
          ? '<p class="h5-summary">' + escapeHtml(safeData.aiSummary) + '</p>'
          : '') +
        renderKeyInfo(safeData.keyInfo) +
        renderPriceSection(safeData)

      if (safeData.faultDesc) {
        html +=
          '<div class="h5-card"><h2 class="h5-section-title">故障表现</h2><p>' +
          escapeHtml(safeData.faultDesc) +
          '</p></div>'
      }
      if (safeData.inspectResult) {
        html +=
          '<div class="h5-card"><h2 class="h5-section-title">检查结果</h2><p>' +
          escapeHtml(safeData.inspectResult) +
          '</p></div>'
      }
      if (safeData.repairPlan) {
        html +=
          '<div class="h5-card"><h2 class="h5-section-title">维修方案</h2><p>' +
          escapeHtml(safeData.repairPlan) +
          '</p></div>'
      }

      html += renderNodes(safeData, safeData.nodes)
      html += renderPriceFactors(safeData.priceFactors)
    }

    html += renderStoreSection(safeData)
    html += renderRelatedServiceCard(safeData)
    html += renderInternalLinks(safeData)
    html += renderFaq(safeData)
    html += renderRelatedCases(
      safeData.relatedCases,
      safeData.id,
      articleMode ? '本店更多案例' : '相关案例'
    )

    html += '<div class="h5-body-spacer"></div></div>'
    html += articleMode ? renderConversionFooter(safeData) : renderLegacyFooter(safeData)

    var app = document.getElementById('app')
    if (app) app.innerHTML = html

    bindCaseInteractions(safeData, articleMode)

    if (window.zhejianH5Ui && window.zhejianH5Ui.bindDisclaimerToggles) {
      window.zhejianH5Ui.bindDisclaimerToggles()
    }

    if (window.zhejianTrack) {
      window.zhejianTrack.trackCaseView(safeData)
      window.zhejianTrack.bindScrollDepth({
        caseId: safeData.id || '',
        storeId: safeData.storeId || '',
      })
    }
  }

  function renderError(message, caseId, noIndex) {
    document.title = '案例不可用 · 辙见'
    if (noIndex) setNoIndex()
    var app = document.getElementById('app')
    if (app) {
      app.innerHTML =
        '<div class="h5-error">' +
        '<h1>无法加载案例</h1>' +
        '<p>' +
        escapeHtml(message) +
        '</p>' +
        (caseId
          ? '<p class="h5-error-id">案例 ID：' + escapeHtml(caseId) + '</p>'
          : '') +
        '<button type="button" class="h5-btn h5-error-retry" id="h5-retry-btn">重试</button>' +
        '</div>'
      var retryBtn = document.getElementById('h5-retry-btn')
      if (retryBtn) {
        retryBtn.addEventListener('click', function () {
          location.reload()
        })
      }
    }
  }

  function loadFromApi(caseId) {
    var apiUrl =
      window.__CASE_API__ ||
      '/api/v1/user/cases/' + encodeURIComponent(caseId)
    return fetch(apiUrl)
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, status: res.status, body: body }
        })
      })
      .then(function (result) {
        if (!result.ok || result.body.code !== 0 || !result.body.data) {
          var err = new Error('案例不存在或未公开')
          err.httpStatus = result.status
          err.apiCode = result.body && result.body.code
          throw err
        }
        renderCase(result.body.data)
      })
  }

  function loadFixture(caseId) {
    if (!caseId) {
      return Promise.reject(new Error('missing case id'))
    }
    return fetch('/fixtures/' + encodeURIComponent(caseId) + '.json')
      .then(function (res) {
        if (!res.ok) throw new Error('fixture missing')
        return res.json()
      })
      .then(renderCase)
  }

  function resolveLoadErrorMessage(err) {
    if (err && err.message === 'missing case id') return '案例 ID 无效，请检查链接是否完整'
    if (err && (err.httpStatus === 404 || err.apiCode === 100004)) {
      return '案例不存在或未公开展示'
    }
    if (err && err.name === 'TypeError') return '网络异常，请稍后重试'
    return '案例不存在、未公开或脱敏内容未就绪'
  }

  function loadCase(caseId) {
    if (!caseId) {
      renderError('案例 ID 无效，请检查链接是否完整', '', true)
      return
    }

    loadFromApi(caseId)
      .catch(function (apiErr) {
        if (!isFixtureFallbackAllowed()) {
          throw apiErr
        }
        console.info('[h5-case] API 失败，本地 fallback fixtures', caseId)
        return loadFixture(caseId)
      })
      .catch(function (err) {
        var noIndex =
          err &&
          (err.httpStatus === 404 || err.httpStatus === 410 || err.apiCode === 100004)
        renderError(resolveLoadErrorMessage(err), caseId, noIndex)
      })
  }

  loadCase(resolveCaseId())
})()
