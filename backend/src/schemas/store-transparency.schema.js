/**
 * 门店透明度 · dimensions + evidence 契约（面向 AI Agent）
 * 人机同源：页面卡片 / Schema / Feed 共用同一结构
 */

const DIMENSION_DEFS = [
  {
    id: 'public_cases',
    label: '公开案例',
    breakdownKey: 'case',
    maxScore: 25,
    unit: 'count',
    meaning: '已审核并公开展示的维修案例数量',
  },
  {
    id: 'album_completeness',
    label: '相册完整率',
    breakdownKey: 'album',
    maxScore: 30,
    unit: 'percent',
    meaning: '服务相册六阶段节点完成比例（聚合指标，不含私密相册链接）',
  },
  {
    id: 'service_profile',
    label: '服务资料',
    breakdownKey: 'serviceProfile',
    maxScore: 15,
    unit: 'count',
    meaning: '可预约服务数量及资料完整度',
  },
  {
    id: 'qualification',
    label: '资质认证',
    breakdownKey: 'qualification',
    maxScore: 15,
    unit: 'score',
    meaning: '营业执照与维修资质等平台核验信息',
  },
  {
    id: 'lead_response',
    label: '咨询响应',
    breakdownKey: 'leadResponse',
    maxScore: 15,
    unit: 'score',
    meaning: '近7日咨询线索被门店联系的响应情况',
  },
]

function truncate(text, maxLen) {
  const value = String(text || '').trim()
  if (!value) return ''
  if (value.length <= maxLen) return value
  return `${value.slice(0, maxLen)}…`
}

/**
 * @param {object} input
 */
function buildTransparencyDimensions(input = {}) {
  const storeId = String(input.storeId || '').trim()
  const breakdown = input.breakdown || {}
  const caseCount = Number(input.caseCount) || 0
  const albumRate =
    input.albumCompleteRate != null && Number.isFinite(Number(input.albumCompleteRate))
      ? Math.round(Number(input.albumCompleteRate))
      : null
  const serviceCount = Number(input.serviceCount) || 0
  const certifications = Array.isArray(input.certifications) ? input.certifications : []
  const certWall = Array.isArray(input.certWall) ? input.certWall : []
  const casePreviews = (input.casePreviews || [])
    .map((item) => ({
      id: item.id || '',
      title: truncate(item.title || item.serviceName || '公开案例', 40),
      path: item.slug
        ? `/case/${encodeURIComponent(item.slug)}.html`
        : item.id
          ? `/case/view.html?id=${encodeURIComponent(item.id)}`
          : '',
    }))
    .filter((item) => item.title)
    .slice(0, 3)

  const casesPath = storeId ? `/store/${encodeURIComponent(storeId)}/cases` : ''

  return DIMENSION_DEFS.map((def) => {
    const scorePart =
      breakdown[def.breakdownKey] != null ? Number(breakdown[def.breakdownKey]) : null

    if (def.id === 'public_cases') {
      return {
        id: def.id,
        label: def.label,
        value: caseCount,
        displayValue: String(caseCount),
        unit: def.unit,
        scorePart,
        maxScore: def.maxScore,
        meaning: def.meaning,
        evidence: {
          type: 'case_list',
          url: casesPath,
          anchor: '#store-cases',
          count: caseCount,
          preview: casePreviews,
          available: caseCount > 0,
        },
      }
    }

    if (def.id === 'album_completeness') {
      const rate = albumRate != null ? albumRate : 0
      return {
        id: def.id,
        label: def.label,
        value: rate,
        displayValue: albumRate != null ? `${rate}%` : '—',
        unit: def.unit,
        scorePart,
        maxScore: def.maxScore,
        meaning: def.meaning,
        evidence: {
          type: 'aggregate_note',
          url: '',
          anchor: '#store-transparency',
          note: '完整率为平台聚合统计，不公开私密服务相册原图。',
          available: albumRate != null && albumRate > 0,
        },
      }
    }

    if (def.id === 'service_profile') {
      return {
        id: def.id,
        label: def.label,
        value: serviceCount,
        displayValue: String(serviceCount),
        unit: def.unit,
        scorePart,
        maxScore: def.maxScore,
        meaning: def.meaning,
        evidence: {
          type: 'service_list',
          url: '',
          anchor: '#store-services',
          count: serviceCount,
          available: serviceCount > 0,
        },
      }
    }

    if (def.id === 'qualification') {
      const items = certifications.map((row) => ({
        name: row.label || '',
        text: row.text || '',
        status: row.status || 'verified',
      }))
      const images = certWall
        .filter((row) => row.imageUrl)
        .map((row) => ({
          label: row.label || '',
          imageUrl: row.imageUrl,
          status: row.status || 'verified',
        }))
      const verified = items.length > 0 || images.length > 0
      return {
        id: def.id,
        label: def.label,
        value: scorePart != null ? scorePart : verified ? def.maxScore : 0,
        displayValue: verified ? '已核验' : '完善中',
        unit: def.unit,
        scorePart,
        maxScore: def.maxScore,
        meaning: def.meaning,
        evidence: {
          type: 'certifications',
          url: '',
          anchor: '#store-trust',
          items,
          images,
          available: verified,
        },
      }
    }

    // lead_response
    const hasScore = scorePart != null && scorePart > 0
    return {
      id: def.id,
      label: def.label,
      value: scorePart != null ? scorePart : 0,
      displayValue: hasScore ? `${scorePart}/${def.maxScore}` : '暂无',
      unit: def.unit,
      scorePart,
      maxScore: def.maxScore,
      meaning: def.meaning,
      evidence: {
        type: 'response_summary',
        url: '',
        anchor: '#store-transparency',
        note: '近7日咨询线索联系比例；无线索时为平台默认分。',
        available: hasScore,
      },
    }
  })
}

function normalizeTransparencyPayload(raw = {}) {
  const dimensions = Array.isArray(raw.dimensions)
    ? raw.dimensions
    : buildTransparencyDimensions(raw)
  return {
    score: Number(raw.score) || 0,
    caseCount: Number(raw.caseCount) || 0,
    albumCompleteRate:
      raw.albumCompleteRate != null ? Number(raw.albumCompleteRate) : null,
    serviceCount: Number(raw.serviceCount) || 0,
    summary: String(raw.summary || ''),
    breakdown: raw.breakdown || null,
    methodology: String(raw.methodology || ''),
    asOfDate: String(raw.asOfDate || ''),
    dimensions,
  }
}

module.exports = {
  DIMENSION_DEFS,
  buildTransparencyDimensions,
  normalizeTransparencyPayload,
}
