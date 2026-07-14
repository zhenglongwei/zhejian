/**
 * GEO-IGAIN-C01 · Schema.org @graph 实体互链（服务端真源）
 */
const { STATS_WINDOW_LABEL } = require('../services/geo-case-aggregate.service')

const SCHEMA_CONTEXT = 'https://schema.org'
const ORG_NAME = '辙见'

function normalizeBase(baseUrl) {
  return String(baseUrl || '').replace(/\/$/, '') || 'https://geo.simplewin.cn'
}

function entityId(base, path, fragment) {
  const baseNorm = normalizeBase(base)
  const pathNorm = String(path || '/').startsWith('/') ? path : `/${path || ''}`
  const frag = String(fragment || '').replace(/^#/, '')
  return `${baseNorm}${pathNorm}${frag ? `#${frag}` : ''}`
}

function buildOrganizationNode(baseUrl, sameAs = []) {
  const base = normalizeBase(baseUrl)
  const node = {
    '@type': 'Organization',
    '@id': `${base}/#organization`,
    name: ORG_NAME,
    url: `${base}/`,
  }
  const links = (sameAs || []).map((item) => String(item || '').trim()).filter(Boolean)
  if (links.length) node.sameAs = links
  return node
}

function formatAdvancedDatasetLines(advanced) {
  if (!advanced || typeof advanced !== 'object') return []
  const lines = []
  ;(advanced.causePriceCross || []).forEach((item) => {
    lines.push(`causePriceCross：「${item.cause}」${item.count} 例（方案价中位 ¥${item.priceMedian}）`)
  })
  if (advanced.processMetrics?.sampleCount) {
    const rate = Math.round((advanced.processMetrics.hasPublicImageRate || 0) * 100)
    lines.push(`processMetrics：${advanced.processMetrics.sampleCount} 例中有公开过程图占比约 ${rate}%`)
  }
  ;(advanced.mileageBands || advanced.mileageBandDistribution || []).forEach((item) => {
    const label = item.bandLabel || item.band || 'unknown'
    const cause = item.topCause ? `，主因「${item.topCause}」` : ''
    lines.push(`mileageBandDistribution：${label}（${item.count} 例${cause}）`)
  })
  ;(advanced.inspectToPlan || []).forEach((item) => {
    lines.push(
      `inspectToPlan：${item.inspect || item.inspectLabel} → ${item.topPlan || item.planLabel}（${item.count} 例）`
    )
  })
  return lines
}

function buildDatasetNode({ baseUrl, canonicalPath, serviceName, aggregateStats }) {
  const stats = aggregateStats || {}
  if (!stats.sampleSize || stats.sampleSize < 1) return null

  const canonical = entityId(baseUrl, canonicalPath, '')
  const parts = [`${STATS_WINDOW_LABEL}收录 ${stats.sampleSize} 例脱敏案例`]
  if (stats.price?.text) parts.push(stats.price.text)
  ;(stats.causeDistribution || []).forEach((item) => {
    parts.push(`${item.label}（${item.count} 例）`)
  })
  formatAdvancedDatasetLines(stats.advanced).forEach((line) => parts.push(line))

  const variableMeasured = parts.map((text) => {
    const advancedKey = text.split('：')[0]
    const knownKeys = [
      'causePriceCross',
      'mileageBandDistribution',
      'processMetrics',
      'inspectToPlan',
    ]
    const name = knownKeys.includes(advancedKey) ? advancedKey : 'aggregateMetric'
    return {
      '@type': 'PropertyValue',
      name,
      value: knownKeys.includes(advancedKey) ? text.slice(text.indexOf('：') + 1) : text,
    }
  })

  return {
    '@type': 'Dataset',
    '@id': entityId(baseUrl, canonicalPath, 'dataset'),
    name: `${serviceName || '维修服务'}脱敏案例聚合统计`,
    description: parts.join('；'),
    temporalCoverage: 'P12M',
    variableMeasured,
    isPartOf: { '@id': entityId(baseUrl, canonicalPath, 'service') },
    url: canonical,
  }
}

function buildFaqNode(faq) {
  const visible = (faq || []).filter((entry) => entry && (entry.q || entry.question) && (entry.a || entry.answer))
  if (!visible.length) return null
  return {
    '@type': 'FAQPage',
    mainEntity: visible.map((entry) => ({
      '@type': 'Question',
      name: entry.q || entry.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: entry.a || entry.answer,
      },
    })),
  }
}

function buildContentTrustLabels(trustMeta) {
  if (!trustMeta || typeof trustMeta !== 'object') return ''
  const labels = []
  const authLabel = String(trustMeta.authorizationTierLabel || '').trim()
  if (authLabel) labels.push(authLabel)
  else if (trustMeta.authorizationTier === 'user_authorized') labels.push('用户授权案例')
  else if (trustMeta.authorizationTier === 'merchant_history') labels.push('商家历史案例')

  if (trustMeta.desensitized !== false) labels.push('已脱敏')
  if (String(trustMeta.reviewStatus || 'approved') === 'approved') labels.push('已审核')
  return labels.join(' · ')
}

function appendTrustMetaSchemaProperties(props, trustMeta) {
  if (!trustMeta || typeof trustMeta !== 'object') return props

  const contentTrustLabels = buildContentTrustLabels(trustMeta)
  if (contentTrustLabels) {
    props.push({
      '@type': 'PropertyValue',
      name: 'contentTrustLabels',
      value: contentTrustLabels,
    })
  }
  if (trustMeta.trustStatement) {
    props.push({
      '@type': 'PropertyValue',
      name: 'trustStatement',
      value: String(trustMeta.trustStatement),
    })
  }
  if (String(trustMeta.reviewStatus || 'approved') === 'approved') {
    props.push({
      '@type': 'PropertyValue',
      name: 'reviewStatusLabel',
      value: '已审核',
    })
    props.push({
      '@type': 'PropertyValue',
      name: 'platformAuditStatus',
      value: 'audited',
    })
  }
  if (trustMeta.desensitized !== false) {
    props.push({
      '@type': 'PropertyValue',
      name: 'desensitizedLabel',
      value: '已脱敏',
    })
  }
  if (trustMeta.evidenceLevelLabel) {
    props.push({
      '@type': 'PropertyValue',
      name: 'evidenceLevelLabel',
      value: String(trustMeta.evidenceLevelLabel),
    })
  }
  if (trustMeta.auditLogSummary) {
    props.push({
      '@type': 'PropertyValue',
      name: 'auditLogSummary',
      value: String(trustMeta.auditLogSummary),
    })
  }
  return props
}

function buildTrustAdditionalProperties(input = {}) {
  const data = input.data || {}
  const trustMeta = data.trustMeta && typeof data.trustMeta === 'object' ? data.trustMeta : null
  if (trustMeta) {
    const props = [
      {
        '@type': 'PropertyValue',
        name: 'authorizationTier',
        value: trustMeta.authorizationTier,
      },
      {
        '@type': 'PropertyValue',
        name: 'authorizationTierLabel',
        value: trustMeta.authorizationTierLabel,
      },
      {
        '@type': 'PropertyValue',
        name: 'snapshotVersion',
        value: String(trustMeta.snapshotVersion),
      },
      {
        '@type': 'PropertyValue',
        name: 'reviewedAt',
        value: String(trustMeta.reviewedAt || '').slice(0, 10),
      },
      {
        '@type': 'PropertyValue',
        name: 'evidenceLevel',
        value: trustMeta.evidenceLevel,
      },
      {
        '@type': 'PropertyValue',
        name: 'desensitized',
        value: trustMeta.desensitized ? 'true' : 'false',
      },
    ]
    if (trustMeta.publicImageCount != null) {
      props.push({
        '@type': 'PropertyValue',
        name: 'publicImageCount',
        value: String(trustMeta.publicImageCount),
      })
    }
    return appendTrustMetaSchemaProperties(props, trustMeta)
  }

  const snapshot =
    (data.contentJson && data.contentJson.snapshot) || data.snapshot || {}
  const publicView = snapshot.publicView || {}
  const props = [
    {
      '@type': 'PropertyValue',
      name: 'contentType',
      value: 'user_authorized_service_case',
    },
    {
      '@type': 'PropertyValue',
      name: 'authorizationTier',
      value: data.authorizationTier || 'named',
    },
    {
      '@type': 'PropertyValue',
      name: 'platformAuditStatus',
      value: data.status === 'public_approved' ? 'audited' : 'pending_review',
    },
  ]
  const snapVersion = snapshot.version ?? data.snapshotVersion
  if (snapVersion != null) {
    props.push({
      '@type': 'PropertyValue',
      name: 'snapshotVersion',
      value: String(snapVersion),
    })
  }
  if (data.albumId) {
    props.push({ '@type': 'PropertyValue', name: 'sourceAlbumId', value: String(data.albumId) })
  }
  const publicMediaCount = publicView.publicMediaCount ?? data.publicMediaCount
  if (publicMediaCount != null) {
    props.push({
      '@type': 'PropertyValue',
      name: 'publicMediaCount',
      value: String(publicMediaCount),
    })
  }
  const hasRepairPlanText = publicView.hasRepairPlanText ?? data.hasRepairPlanText
  if (hasRepairPlanText != null) {
    props.push({
      '@type': 'PropertyValue',
      name: 'hasRepairPlanText',
      value: hasRepairPlanText ? 'true' : 'false',
    })
  }
  if (data.storeId) {
    props.push({ '@type': 'PropertyValue', name: 'storeId', value: String(data.storeId) })
  }
  if (data.serviceName) {
    props.push({ '@type': 'PropertyValue', name: 'serviceName', value: String(data.serviceName) })
  }
  props.push(
    { '@type': 'PropertyValue', name: 'desensitized', value: 'true' },
    { '@type': 'PropertyValue', name: 'desensitizedLabel', value: '已脱敏' },
    { '@type': 'PropertyValue', name: 'reviewStatusLabel', value: '已审核' },
    { '@type': 'PropertyValue', name: 'platformAuditStatus', value: 'audited' },
    {
      '@type': 'PropertyValue',
      name: 'contentTrustLabels',
      value: '已脱敏 · 已审核',
    }
  )
  return props
}

/**
 * @param {object} input
 */
function buildServicePageSchemaGraph(input) {
  const baseUrl = normalizeBase(input.baseUrl)
  const item = input.item || {}
  const seo = input.seo || {}
  const geo = input.geo || {}
  const canonicalPath = seo.canonicalPath || `/service/${item.slug || ''}.html`
  const canonical = entityId(baseUrl, canonicalPath, '')
  const title = seo.title || `${item.name || '服务项目'} · 辙见`
  const description = seo.description || item.aiSummary || item.summary || ''

  const organization = buildOrganizationNode(baseUrl, input.organizationSameAs)
  const graph = [
    organization,
    {
      '@type': 'WebPage',
      '@id': entityId(baseUrl, canonicalPath, 'webpage'),
      name: title,
      description,
      url: canonical,
      dateModified: geo.updatedAt || undefined,
      datePublished: geo.publishedAt || undefined,
      isPartOf: { '@id': organization['@id'] },
    },
    {
      '@type': 'Service',
      '@id': entityId(baseUrl, canonicalPath, 'service'),
      name: item.name || '维修服务',
      description: item.aiSummary || item.summary || description,
      url: canonical,
      provider: { '@id': organization['@id'] },
      areaServed: item.cityFilter
        ? { '@type': 'City', name: item.cityFilter }
        : { '@type': 'Country', name: '中国' },
    },
  ]

  const dataset = buildDatasetNode({
    baseUrl,
    canonicalPath,
    serviceName: item.name,
    aggregateStats: input.aggregateStats,
  })
  if (dataset) graph.push(dataset)

  const faqNode = buildFaqNode(input.faq)
  if (faqNode) graph.push(faqNode)

  return {
    '@context': SCHEMA_CONTEXT,
    '@graph': graph,
  }
}

/**
 * @param {object} input
 */
function buildCasePageSchemaGraph(input) {
  const baseUrl = normalizeBase(input.baseUrl)
  const data = input.data || {}
  const canonicalPath =
    data.canonicalPath ||
    (data.seo && data.seo.canonicalPath) ||
    (data.slug ? `/case/${data.slug}.html` : `/case/view.html?id=${data.id || ''}`)
  const canonical = canonicalPath.startsWith('http')
    ? canonicalPath
    : entityId(baseUrl, canonicalPath, '')
  const title = (data.seo && data.seo.title) || data.title || '维修案例'
  const description = data.aiSummary || data.summary || (data.seo && data.seo.description) || ''
  const cover = data.coverImageDesensitized || data.coverImage || ''
  const showStore = Boolean(input.showStorePublicly && data.store && data.store.name)

  const organization = buildOrganizationNode(baseUrl, input.organizationSameAs)
  const graph = [organization]

  const articleId = entityId(
    baseUrl,
    canonicalPath.replace(/^https?:\/\/[^/]+/, ''),
    'article'
  )

  graph.push({
    '@type': 'Article',
    '@id': articleId,
    headline: data.title || title,
    description,
    articleBody: (data.article && data.article.body) || data.articleBody || undefined,
    url: canonical,
    datePublished: data.publishedAt || undefined,
    dateModified: data.updatedAt || data.publishedAt || undefined,
    image: cover || undefined,
    author: showStore
      ? {
          '@type': 'AutoRepair',
          '@id': entityId(baseUrl, `/store/${data.store.id}.html`, 'autorepair'),
          name: data.store.name,
        }
      : { '@id': organization['@id'] },
    publisher: { '@id': organization['@id'] },
    mainEntityOfPage: { '@id': entityId(baseUrl, canonicalPath.replace(/^https?:\/\/[^/]+/, ''), 'webpage') },
    additionalProperty: buildTrustAdditionalProperties({
      data,
    }),
  })

  graph.push({
    '@type': 'WebPage',
    '@id': entityId(baseUrl, canonicalPath.replace(/^https?:\/\/[^/]+/, ''), 'webpage'),
    name: title,
    description,
    url: canonical,
  })

  if (data.serviceName) {
    const serviceSlug = input.serviceSlug || ''
    const servicePath = serviceSlug ? `/service/${serviceSlug}.html` : canonicalPath
    graph.push({
      '@type': 'Service',
      '@id': entityId(baseUrl, servicePath, 'service'),
      name: data.serviceName,
      description,
      provider: showStore
        ? { '@id': entityId(baseUrl, `/store/${data.store.id}.html`, 'autorepair') }
        : { '@id': organization['@id'] },
      areaServed: data.city ? { '@type': 'City', name: data.city } : undefined,
    })
    graph[graph.length - 1].about = { '@id': graph[graph.length - 1]['@id'] }
    graph[1].about = { '@id': graph[graph.length - 1]['@id'] }
  }

  if (cover) {
    graph.push({
      '@type': 'ImageObject',
      contentUrl: cover.startsWith('http') ? cover : entityId(baseUrl, cover, ''),
      name: data.title || title,
      description,
      isPartOf: { '@id': articleId },
    })
  }

  const faqNode = buildFaqNode(data.faq)
  if (faqNode) graph.push(faqNode)

  return {
    '@context': SCHEMA_CONTEXT,
    '@graph': graph,
  }
}

/**
 * @param {{ baseUrl?: string, organizationSameAs?: string[] }} [input]
 */
function buildHomePageSchemaGraph(input = {}) {
  const baseUrl = normalizeBase(input.baseUrl)
  const organization = buildOrganizationNode(baseUrl, input.organizationSameAs)
  const canonical = `${normalizeBase(baseUrl)}/`
  return {
    '@context': SCHEMA_CONTEXT,
    '@graph': [
      organization,
      {
        '@type': 'WebSite',
        '@id': entityId(baseUrl, '/', 'website'),
        name: ORG_NAME,
        url: canonical,
        publisher: { '@id': organization['@id'] },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${canonical}search/?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  }
}

/**
 * 门店页 · AutoRepair + 透明度 dimensions 证据链（面向 Agent）
 * @param {object} input
 */
function buildStorePageSchemaGraph(input = {}) {
  const baseUrl = normalizeBase(input.baseUrl)
  const store = input.store || {}
  const transparency = input.transparency || store.transparency || {}
  const caseCount =
    Number(transparency.caseCount != null ? transparency.caseCount : store.caseCount) || 0
  const dimsRaw = Array.isArray(transparency.dimensions) ? transparency.dimensions : []
  const exposed =
    transparency.exposed === true ||
    (transparency.exposed !== false &&
      (caseCount > 0 ||
        dimsRaw.some((dim) => dim && dim.id === 'public_cases' && Number(dim.value) > 0)))
  const dimensions = exposed ? dimsRaw : []
  const faq = input.faq || store.faq || []
  const storeId = store.id || ''
  const canonicalPath = (store.seo && store.seo.canonicalPath) || `/store/${storeId}.html`
  const canonical = entityId(baseUrl, canonicalPath, '')
  const organization = buildOrganizationNode(baseUrl, input.organizationSameAs)

  const additionalProperty = []
  if (exposed && transparency.score != null && Number(transparency.score) > 0) {
    additionalProperty.push({
      '@type': 'PropertyValue',
      name: 'transparencyScore',
      value: String(transparency.score),
    })
  }
  if (exposed && transparency.asOfDate) {
    additionalProperty.push({
      '@type': 'PropertyValue',
      name: 'transparencyAsOfDate',
      value: String(transparency.asOfDate),
    })
  }
  if (exposed && transparency.summary) {
    additionalProperty.push({
      '@type': 'PropertyValue',
      name: 'transparencySummary',
      value: String(transparency.summary),
    })
  }

  dimensions.forEach((dim) => {
    if (!dim || !dim.id) return
    if (dim.evidence && dim.evidence.available === false) return
    additionalProperty.push({
      '@type': 'PropertyValue',
      name: `transparency.${dim.id}`,
      value: String(dim.displayValue != null ? dim.displayValue : dim.value),
      description: dim.meaning || dim.label || '',
    })
    if (dim.scorePart != null && Number(dim.scorePart) > 0) {
      additionalProperty.push({
        '@type': 'PropertyValue',
        name: `transparency.${dim.id}.scorePart`,
        value: `${dim.scorePart}/${dim.maxScore || ''}`,
      })
    }
    const evidence = dim.evidence || {}
    const evidenceUrl = evidence.url
      ? entityId(baseUrl, evidence.url, '')
      : evidence.anchor
        ? `${canonical}${evidence.anchor}`
        : ''
    if (evidenceUrl) {
      additionalProperty.push({
        '@type': 'PropertyValue',
        name: `transparency.${dim.id}.evidenceUrl`,
        value: evidenceUrl,
      })
    }
    if (evidence.note) {
      additionalProperty.push({
        '@type': 'PropertyValue',
        name: `transparency.${dim.id}.evidenceNote`,
        value: String(evidence.note),
      })
    }
    if (Array.isArray(evidence.preview) && evidence.preview.length) {
      additionalProperty.push({
        '@type': 'PropertyValue',
        name: `transparency.${dim.id}.evidencePreview`,
        value: evidence.preview.map((item) => item.title || '').filter(Boolean).join('；'),
      })
    }
    if (Array.isArray(evidence.items) && evidence.items.length) {
      additionalProperty.push({
        '@type': 'PropertyValue',
        name: `transparency.${dim.id}.evidenceItems`,
        value: evidence.items
          .map((item) => [item.name, item.text].filter(Boolean).join(' '))
          .filter(Boolean)
          .join('；'),
      })
    }
  })

  const autoRepair = {
    '@type': 'AutoRepair',
    '@id': entityId(baseUrl, canonicalPath, 'autorepair'),
    name: store.name || '维修门店',
    description: store.aiSummary || store.intro || (exposed ? transparency.summary : '') || '',
    url: canonical,
    address: store.address
      ? {
          '@type': 'PostalAddress',
          streetAddress: store.address,
          addressLocality: store.city || '',
          addressCountry: 'CN',
        }
      : undefined,
    telephone: store.phone || undefined,
    image: store.coverImage || store.storefrontImage || undefined,
    additionalProperty: additionalProperty.length ? additionalProperty : undefined,
  }

  const graph = [
    organization,
    {
      '@type': 'WebPage',
      '@id': entityId(baseUrl, canonicalPath, 'webpage'),
      name: store.name || '门店',
      description: autoRepair.description,
      url: canonical,
      about: { '@id': autoRepair['@id'] },
      isPartOf: { '@id': organization['@id'] },
    },
    autoRepair,
  ]

  const certImages = (store.certWall || [])
    .filter((row) => row && row.imageUrl)
    .slice(0, 4)
  certImages.forEach((row, index) => {
    graph.push({
      '@type': 'ImageObject',
      '@id': entityId(baseUrl, canonicalPath, `credential-${index + 1}`),
      name: row.label || '资质证明',
      contentUrl: String(row.imageUrl).startsWith('http')
        ? row.imageUrl
        : entityId(baseUrl, row.imageUrl, ''),
      description: row.text || row.label || '平台核验资质',
      isPartOf: { '@id': autoRepair['@id'] },
    })
  })

  const faqNode = buildFaqNode(faq)
  if (faqNode) graph.push(faqNode)

  const caseDim = dimensions.find((item) => item.id === 'public_cases')
  const previewFromInput = Array.isArray(input.casePreviews)
    ? input.casePreviews
    : Array.isArray(store.casePreviews)
      ? store.casePreviews
      : []
  const preview =
    previewFromInput.length > 0
      ? previewFromInput
      : caseDim?.evidence?.preview || []
  if (preview.length) {
    graph.push({
      '@type': 'ItemList',
      '@id': entityId(baseUrl, canonicalPath, 'case-list'),
      name: `${store.name || '门店'}公开案例`,
      numberOfItems:
        caseDim?.value ||
        Number(transparency.caseCount) ||
        Number(store.caseCount) ||
        preview.length,
      itemListElement: preview.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.title,
        url: item.path
          ? entityId(baseUrl, item.path, '')
          : item.slug
            ? entityId(baseUrl, `/case/${encodeURIComponent(item.slug)}.html`, '')
            : item.id
              ? entityId(baseUrl, `/case/view.html?id=${encodeURIComponent(item.id)}`, '')
              : undefined,
      })),
    })
  }

  return {
    '@context': SCHEMA_CONTEXT,
    '@graph': graph,
  }
}

module.exports = {
  SCHEMA_CONTEXT,
  normalizeBase,
  entityId,
  buildOrganizationNode,
  buildDatasetNode,
  buildContentTrustLabels,
  buildTrustAdditionalProperties,
  buildServicePageSchemaGraph,
  buildCasePageSchemaGraph,
  buildHomePageSchemaGraph,
  buildStorePageSchemaGraph,
}
