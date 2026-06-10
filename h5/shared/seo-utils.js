(function (global) {
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function absUrl(path) {
    if (!path) return location.origin + '/'
    var value = String(path)
    if (value.indexOf('http://') === 0 || value.indexOf('https://') === 0) return value
    return location.origin + (value.charAt(0) === '/' ? value : '/' + value)
  }

  function ensureMeta(attrName, key, content) {
    if (content == null || content === '') return
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

  function removeLink(rel) {
    var el = document.querySelector('link[rel="' + rel + '"]')
    if (el && el.parentNode) el.parentNode.removeChild(el)
  }

  function ensureJsonLd(id, data) {
    if (!data) return
    var el = document.getElementById(id)
    if (!el) {
      el = document.createElement('script')
      el.type = 'application/ld+json'
      el.id = id
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(data)
  }

  function applyPageSeo(options) {
    options = options || {}
    var canonicalPath = options.canonicalPath || location.pathname
    var canonical = absUrl(canonicalPath)

    if (options.title) document.title = options.title
    if (options.description) ensureMeta('name', 'description', options.description)
    if (options.robots) ensureMeta('name', 'robots', options.robots)
    if (options.title) ensureMeta('property', 'og:title', options.title)
    if (options.description) ensureMeta('property', 'og:description', options.description)
    ensureMeta('property', 'og:type', options.ogType || 'website')
    ensureMeta('property', 'og:site_name', '辙见')
    ensureMeta('property', 'og:url', canonical)
    ensureLink('canonical', canonical)

    if (options.prevPath) ensureLink('prev', absUrl(options.prevPath))
    else removeLink('prev')
    if (options.nextPath) ensureLink('next', absUrl(options.nextPath))
    else removeLink('next')

    return canonical
  }

  function renderBreadcrumbHtml(items, sep) {
    sep = sep || ' › '
    if (!items || !items.length) return ''
    var parts = items.map(function (item, index) {
      if (item.href) {
        return (
          '<a href="' + escapeHtml(item.href) + '">' + escapeHtml(item.label) + '</a>'
        )
      }
      return '<span>' + escapeHtml(item.label) + '</span>'
    })
    return (
      '<nav class="h5-breadcrumb" aria-label="面包屑">' + parts.join(sep) + '</nav>'
    )
  }

  function buildBreadcrumbSchema(items) {
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: (items || []).map(function (item, index) {
        var entry = {
          '@type': 'ListItem',
          position: index + 1,
          name: item.label,
        }
        if (item.href) entry.item = absUrl(item.href)
        return entry
      }),
    }
  }

  function applyBreadcrumbSchema(items, id) {
    if (!items || !items.length) return
    ensureJsonLd(id || 'page-breadcrumb-schema', buildBreadcrumbSchema(items))
  }

  global.zhejianSeo = {
    escapeHtml: escapeHtml,
    absUrl: absUrl,
    ensureMeta: ensureMeta,
    ensureLink: ensureLink,
    removeLink: removeLink,
    ensureJsonLd: ensureJsonLd,
    applyPageSeo: applyPageSeo,
    renderBreadcrumbHtml: renderBreadcrumbHtml,
    buildBreadcrumbSchema: buildBreadcrumbSchema,
    applyBreadcrumbSchema: applyBreadcrumbSchema,
  }
})(typeof window !== 'undefined' ? window : globalThis)
