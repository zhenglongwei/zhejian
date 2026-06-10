(function () {
  var COPY = {
    displayDisclaimer:
      '本页内容由商家自行发布或经车主授权展示，仅供参考。实际方案与费用请与门店线下确认。',
    geoDisclaimer:
      '页面内容用于展示维修服务信息、门店信息和脱敏案例，不构成线上报价或维修承诺。实际维修方案、费用、配件、质保和售后由用户与门店线下确认。',
    casePrice:
      '车主授权公示的案例展示当时方案报价；其余案例价格为系统参考区间，实际费用以门店检测为准。',
    caseCompliance:
      '公开展示仅使用脱敏图片，不含车牌、手机号等隐私信息。',
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function parseSlug() {
    var match = location.pathname.match(/\/service\/([^/]+)\.html$/i)
    if (!match || match[1] === 'view' || match[1] === 'index') return ''
    return decodeURIComponent(match[1]).trim()
  }

  function looksLikePlanId(id) {
    return /^svc_|^plan_/.test(String(id || ''))
  }

  function storePagePath(storeId) {
    return '/store/' + encodeURIComponent(storeId) + '.html'
  }

  function servicePlanPath(planId) {
    return '/service/' + encodeURIComponent(planId) + '.html'
  }

  function casePagePath(item) {
    if (item.slug) return '/case/' + encodeURIComponent(item.slug) + '.html'
    return '/case/view.html?id=' + encodeURIComponent(item.id)
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
    var el = document.querySelector('link[rel="' + rel + '"]')
    if (!el) {
      el = document.createElement('link')
      el.setAttribute('rel', rel)
      document.head.appendChild(el)
    }
    el.setAttribute('href', href)
  }

  function injectJsonLd(data) {
    var el = document.getElementById('h5-service-item-jsonld')
    if (!el) {
      el = document.createElement('script')
      el.type = 'application/ld+json'
      el.id = 'h5-service-item-jsonld'
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(data)
  }

  function setPageMeta(data) {
    var seo = data.seo || {}
    var item = data.item || {}
    var title = seo.title || item.name + ' · 辙见'
    var desc = seo.description || item.summary || ''
    var canonical = location.origin + (seo.canonicalPath || location.pathname)
    document.title = title
    ensureMeta('name', 'description', desc)
    ensureMeta('name', 'robots', seo.robots || 'index,follow')
    ensureMeta('property', 'og:title', title)
    ensureMeta('property', 'og:description', desc)
    ensureMeta('property', 'og:url', canonical)
    ensureLink('canonical', canonical)

    var graph = [
      {
        '@type': 'WebPage',
        name: title,
        description: desc,
        url: canonical,
      },
      {
        '@type': 'Service',
        name: item.name,
        description: item.summary,
        url: canonical,
      },
    ]
    if (data.faq && data.faq.length) {
      graph.push({
        '@type': 'FAQPage',
        mainEntity: data.faq.map(function (entry) {
          return {
            '@type': 'Question',
            name: entry.q,
            acceptedAnswer: { '@type': 'Answer', text: entry.a },
          }
        }),
      })
    }
    injectJsonLd({ '@context': 'https://schema.org', '@graph': graph })
  }

  function renderBulletSection(title, items) {
    if (!items || !items.length) return ''
    var lis = items
      .map(function (text) {
        return '<li>' + escapeHtml(text) + '</li>'
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">' +
      escapeHtml(title) +
      '</h2><ul class="h5-home-intro">' +
      lis +
      '</ul></div>'
    )
  }

  function isDesensitizedUrl(url) {
    if (!url) return false
    var value = String(url)
    return (
      value.indexOf('mock://desensitized/') === 0 ||
      value.indexOf('/files/uploads/desensitized/') !== -1 ||
      value.indexOf('/media/files/uploads/desensitized/') !== -1
    )
  }

  function pickCaseCover(data) {
    if (data.coverImageDesensitized && isDesensitizedUrl(data.coverImageDesensitized)) {
      return data.coverImageDesensitized
    }
    if (data.coverImage && isDesensitizedUrl(data.coverImage)) return data.coverImage
    return ''
  }

  function buildStorePriceText(store) {
    if (store.priceMode === 'accident') return '到店检测后报价'
    if (store.amount != null) return '¥' + store.amount + ' 起'
    if (store.minAmount != null && store.maxAmount != null) {
      return '¥' + store.minAmount + '–¥' + store.maxAmount
    }
    return '到店检测后报价'
  }

  function renderCases(cases, item) {
    var section =
      '<div class="h5-card"><h2 class="h5-section-title">真实维修案例</h2>' +
      '<p class="h5-compliance">' +
      escapeHtml(COPY.casePrice) +
      '</p>' +
      '<p class="h5-compliance">' +
      escapeHtml(COPY.caseCompliance) +
      '</p>'
    if (!cases || !cases.length) {
      return (
        section +
        '<div class="h5-empty-block">该服务项目暂无公开案例，可先查看推荐门店并预约咨询。</div></div>'
      )
    }
    var cards = cases
      .map(function (entry) {
        var cover = pickCaseCover(entry)
        var coverHtml = cover
          ? '<img class="h5-node-img" src="' +
            escapeHtml(cover) +
            '" alt="' +
            escapeHtml((item.name || '') + '脱敏案例封面') +
            '" loading="lazy" />'
          : '<div class="h5-placeholder-img">脱敏封面暂未就绪</div>'
        return (
          '<a class="h5-store-case-card" href="' +
          casePagePath(entry) +
          '" data-case-id="' +
          escapeHtml(entry.id) +
          '">' +
          coverHtml +
          '<h3 class="h5-store-case-card-title">' +
          escapeHtml(entry.title || entry.serviceName || '公开案例') +
          '</h3>' +
          '<p class="h5-store-case-card-meta">' +
          escapeHtml([entry.city, entry.storeName].filter(Boolean).join(' · ')) +
          '</p></a>'
        )
      })
      .join('')
    return section + '<div class="h5-store-case-list">' + cards + '</div></div>'
  }

  function renderStores(stores) {
    if (!stores || !stores.length) {
      return (
        '<div class="h5-card"><h2 class="h5-section-title">推荐门店</h2>' +
        '<div class="h5-empty-block">暂无门店上架该服务项目，请稍后再查看。</div></div>'
      )
    }
    var cards = stores
      .map(function (store) {
        var href = store.servicePlanId
          ? servicePlanPath(store.servicePlanId)
          : storePagePath(store.id)
        return (
          '<a class="h5-case-list-item" href="' +
          href +
          '" data-store-id="' +
          escapeHtml(store.id) +
          '">' +
          '<div class="h5-case-list-title">' +
          escapeHtml(store.name) +
          '</div>' +
          '<div class="h5-case-list-meta">' +
          escapeHtml(
            [store.address, '参考 ' + buildStorePriceText(store), store.caseCount ? '案例 ' + store.caseCount : '']
              .filter(Boolean)
              .join(' · ')
          ) +
          '</div></a>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">推荐门店</h2>' +
      '<div class="h5-case-list">' +
      cards +
      '</div></div>'
    )
  }

  function renderRelated(related) {
    if (!related || !related.length) return ''
    var items = related
      .map(function (entry) {
        return (
          '<a class="h5-city-service-item" href="' +
          escapeHtml(entry.path) +
          '"><span class="h5-city-service-name">' +
          escapeHtml(entry.name) +
          '</span></a>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">相关服务</h2>' +
      '<div class="h5-city-service-grid">' +
      items +
      '</div></div>'
    )
  }

  function renderFaq(faq) {
    if (!faq || !faq.length) return ''
    var items = faq
      .map(function (entry) {
        return (
          '<div class="h5-faq-item"><div class="h5-faq-q">' +
          escapeHtml(entry.q) +
          '</div><div class="h5-faq-a">' +
          escapeHtml(entry.a) +
          '</div></div>'
        )
      })
      .join('')
    return (
      '<div class="h5-card"><h2 class="h5-section-title">常见问题</h2>' + items + '</div>'
    )
  }

  function bindInteractions(data) {
    var item = data.item || {}
    document.querySelectorAll('[data-case-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_service_case_click', {
            serviceSlug: item.slug,
            serviceItemId: item.serviceItemId,
            caseId: el.getAttribute('data-case-id') || '',
          })
        }
      })
    })
    document.querySelectorAll('[data-store-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_service_store_click', {
            serviceSlug: item.slug,
            serviceItemId: item.serviceItemId,
            storeId: el.getAttribute('data-store-id') || '',
          })
        }
      })
    })
    var weappBtn = document.getElementById('h5-open-weapp-btn')
    if (weappBtn) {
      weappBtn.addEventListener('click', function () {
        var path =
          'pages/index/index?source=h5&page_type=service&service_slug=' +
          encodeURIComponent(item.slug || '') +
          '&service_item_id=' +
          encodeURIComponent(item.serviceItemId || '')
        if (window.zhejianTrack) {
          window.zhejianTrack.track('h5_open_weapp_click', {
            page_type: 'service_item',
            serviceSlug: item.slug,
            serviceItemId: item.serviceItemId,
          })
        }
        alert('请打开微信小程序继续。路径：/' + path)
      })
    }
  }

  function renderPage(data) {
    var item = data.item
    var price = data.referencePrice || {}
    setPageMeta(data)

    var html =
      '<div class="h5-page">' +
      '<nav class="h5-breadcrumb"><a href="/">辙见</a> › 服务项目 › ' +
      escapeHtml(item.name) +
      '</nav>' +
      '<header class="h5-header">' +
      '<div class="h5-brand">辙见服务平台 · 服务项目</div>' +
      '<h1 class="h5-title">' +
      escapeHtml(item.name) +
      '案例、流程与价格参考</h1>' +
      '<p class="h5-summary">' +
      escapeHtml(item.summary) +
      '</p>' +
      '<div class="h5-banner">' +
      escapeHtml(COPY.displayDisclaimer) +
      '</div>' +
      '<div class="h5-banner">' +
      escapeHtml(COPY.geoDisclaimer) +
      '</div>' +
      '</header>' +
      '<div class="h5-home-quick">' +
      '<a class="h5-btn" href="/case/">浏览公开案例</a>' +
      '<button type="button" class="h5-btn h5-btn--secondary" id="h5-open-weapp-btn">打开小程序预约</button>' +
      '</div>' +
      renderBulletSection('什么情况需要做', item.scenarios) +
      renderBulletSection('维修流程', item.process) +
      '<div class="h5-card"><h2 class="h5-section-title">参考价格</h2>' +
      '<p class="h5-price">' +
      escapeHtml(price.text || '') +
      '</p>' +
      (price.note ? '<p class="h5-price-note">' + escapeHtml(price.note) + '</p>' : '') +
      (item.priceMode === 'accident'
        ? '<p class="h5-compliance">事故车维修无法仅凭线上信息准确报价，需到店检测或拆检后确认方案和费用。</p>'
        : '<p class="h5-compliance">页面价格为参考范围，实际费用会因车型、配件品牌、损伤程度和门店检测结果不同而变化。</p>') +
      '</div>' +
      renderBulletSection('价格影响因素', item.priceFactors) +
      renderCases(data.featuredCases, item) +
      renderStores(data.recommendedStores) +
      renderRelated(data.relatedServices) +
      renderFaq(data.faq) +
      '<p class="h5-compliance h5-home-footnote">公开内容经审核与脱敏处理，不构成平台对维修质量或价格的担保。</p>' +
      '</div>'

    var app = document.getElementById('app')
    if (app) app.innerHTML = html
    bindInteractions(data)

    if (window.zhejianTrack) {
      window.zhejianTrack.trackServiceView({
        serviceItemId: item.serviceItemId,
        serviceName: item.name,
        serviceSlug: item.slug,
        pageType: 'service_item',
      })
      if (window.zhejianTrack.bindScrollDepth) {
        window.zhejianTrack.bindScrollDepth({
          pageType: 'service_item',
          serviceSlug: item.slug,
        })
      }
    }
  }

  function tryLoadServiceItem(slug) {
    if (!slug || looksLikePlanId(slug)) return Promise.resolve(false)

    return fetch('/api/v1/public/h5/service-items/' + encodeURIComponent(slug))
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, status: res.status, body: body }
        })
      })
      .then(function (result) {
        if (result.status === 404) return false
        if (!result.ok || result.body.code !== 0 || !result.body.data) return false
        window.__H5_SERVICE_ITEM_HANDLED__ = true
        renderPage(result.body.data)
        return true
      })
      .catch(function () {
        return false
      })
  }

  window.zhejianServiceItemBootstrap = function (slug) {
    return tryLoadServiceItem(slug || parseSlug())
  }

  var slug = parseSlug()
  if (slug && !looksLikePlanId(slug)) {
    window.__H5_SERVICE_ITEM_BOOTSTRAP__ = tryLoadServiceItem(slug)
  } else {
    window.__H5_SERVICE_ITEM_BOOTSTRAP__ = Promise.resolve(false)
  }
})()
