/**
 * 门店透明度 · dimensions + evidence 契约（面向 AI Agent）
 * 人机同源：页面卡片 / Schema / Feed 共用同一结构
 *
 * 诚实空态（对照表 §3）：公开案例数 = 0 时不对外暴露总分与分项百分数。
 * P2：内部 KPI 下沉或白话化；咨询响应不下发公开页。
 */

/** 对外公开分项 id（不含后台专用） */
const PUBLIC_DIMENSION_IDS = new Set([
  'public_cases',
  'album_completeness',
  'service_profile',
  'qualification',
  'content_freshness',
  'capability_profile',
])

const DIMENSION_DEFS = [
  {
    id: 'public_cases',
    label: '公开案例',
    breakdownKey: 'case',
    maxScore: 20,
    unit: 'count',
    audience: 'public',
    meaning: '已审核并公开展示的维修案例数量，可点开查看过程说明',
  },
  {
    id: 'album_completeness',
    label: '过程资料齐全度',
    breakdownKey: 'album',
    maxScore: 25,
    unit: 'percent',
    audience: 'public',
    meaning:
      '已完工服务相册中，关键接车、检查、方案等资料的齐全比例（聚合统计，不展示进行中或私密相册）',
  },
  {
    id: 'service_profile',
    label: '可预约服务',
    breakdownKey: 'serviceProfile',
    maxScore: 15,
    unit: 'count',
    audience: 'public',
    meaning: '本店已上架、可预约的服务方案数量',
  },
  {
    id: 'qualification',
    label: '资质认证',
    breakdownKey: 'qualification',
    maxScore: 15,
    unit: 'score',
    audience: 'public',
    meaning: '营业执照与维修资质等平台核验信息（含有效期），可在本页资质区查看',
  },
  {
    id: 'content_freshness',
    label: '内容新鲜度',
    breakdownKey: 'freshness',
    maxScore: 10,
    unit: 'score',
    audience: 'public',
    meaning: '最近公开案例与资料核实时间，用于判断门店内容是否持续更新',
  },
  {
    id: 'capability_profile',
    label: '能力资料',
    breakdownKey: 'capability',
    maxScore: 5,
    unit: 'score',
    audience: 'public',
    meaning: '已审核展示的技师或设备能力信息完善程度',
  },
  {
    id: 'lead_response',
    label: '咨询响应',
    breakdownKey: 'leadResponse',
    maxScore: 10,
    unit: 'score',
    audience: 'internal',
    meaning: '近7日咨询线索被门店联系的响应情况（仅商家后台）',
  },
]

const PUBLIC_METHODOLOGY =
  '资料完整度综合公开案例、已完工过程资料齐全情况、可预约服务、资质核验、内容新鲜度与已审核能力资料等可验证信息，按日更新。过程齐全度不代表可浏览他人进行中相册。咨询响应等经营指标仅在商家后台展示。'

function truncate(text, maxLen) {
  const value = String(text || '').trim()
  if (!value) return ''
  if (value.length <= maxLen) return value
  return `${value.slice(0, maxLen)}…`
}

/**
 * @param {object} input
 * @param {{ audience?: 'public'|'all' }} [options]
 */
function buildTransparencyDimensions(input = {}, options = {}) {
  const audience = options.audience === 'all' ? 'all' : 'public'
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
      path:
        item.path ||
        (item.slug
          ? `/case/${encodeURIComponent(item.slug)}.html`
          : item.id
            ? `/case/view.html?id=${encodeURIComponent(item.id)}`
            : ''),
    }))
    .filter((item) => item.title)
    .slice(0, 3)

  const casesPath = storeId ? `/store/${encodeURIComponent(storeId)}/cases` : ''

  // 无公开案例：不组装 KPI 分项（资质墙走独立区块）
  if (caseCount <= 0) return []

  const defs =
    audience === 'all'
      ? DIMENSION_DEFS
      : DIMENSION_DEFS.filter((def) => def.audience !== 'internal')

  const built = defs.map((def) => {
    const scorePart =
      breakdown[def.breakdownKey] != null ? Number(breakdown[def.breakdownKey]) : null

    if (def.id === 'public_cases') {
      return {
        id: def.id,
        label: def.label,
        value: caseCount,
        displayValue: String(caseCount),
        unit: def.unit,
        scorePart: null,
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
      const hasSample = albumRate != null && albumRate > 0
      return {
        id: def.id,
        label: def.label,
        value: rate,
        displayValue: hasSample ? `约 ${rate}%` : '—',
        unit: def.unit,
        scorePart: null,
        maxScore: def.maxScore,
        meaning: def.meaning,
        evidence: {
          type: 'aggregate_note',
          url: '',
          anchor: '#store-cases',
          note: hasSample
            ? '根据近期服务过程资料抽样统计，不开放用户私密相册原图链接。'
            : '',
          available: hasSample,
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
        scorePart: null,
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
        scorePart: null,
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

    if (def.id === 'content_freshness') {
      const lastCaseAt = String(input.lastPublicCaseAt || '').trim()
      const verifiedAt = String(input.lastProfileVerifiedAt || '').trim()
      const hasFresh = Boolean(lastCaseAt || verifiedAt || (scorePart != null && scorePart > 0))
      const bits = []
      if (lastCaseAt) bits.push(`最近公开案例 ${lastCaseAt}`)
      if (verifiedAt) bits.push(`资料核实 ${verifiedAt}`)
      return {
        id: def.id,
        label: def.label,
        value: scorePart != null ? scorePart : 0,
        displayValue: bits.length ? bits.join(' · ') : hasFresh ? '有更新' : '—',
        unit: def.unit,
        scorePart: null,
        maxScore: def.maxScore,
        meaning: def.meaning,
        evidence: {
          type: 'freshness',
          url: casesPath,
          anchor: '#store-cases',
          note: bits.join(' · '),
          available: hasFresh,
        },
      }
    }

    if (def.id === 'capability_profile') {
      const techCount = Number(input.technicianCount) || 0
      const eqCount = Number(input.equipmentCount) || 0
      const hasCap = techCount > 0 || eqCount > 0 || (scorePart != null && scorePart > 0)
      return {
        id: def.id,
        label: def.label,
        value: scorePart != null ? scorePart : 0,
        displayValue: hasCap
          ? `技师 ${techCount} · 设备 ${eqCount}`
          : '完善中',
        unit: def.unit,
        scorePart: null,
        maxScore: def.maxScore,
        meaning: def.meaning,
        evidence: {
          type: 'capability',
          url: '',
          anchor: '#store-staff',
          note: hasCap ? '仅展示已审核通过的技师与设备信息' : '',
          available: hasCap,
        },
      }
    }

    // lead_response · 仅 audience=all
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

  return built.filter((dim) => dim && dim.evidence && dim.evidence.available)
}

/**
 * 是否对外暴露透明度 KPI（有公开案例才暴露）
 * @param {{ caseCount?: number, exposed?: boolean }} raw
 */
function isTransparencyExposed(raw = {}) {
  if (raw.exposed === false) return false
  if (raw.exposed === true) return true
  return Number(raw.caseCount) > 0
}

const EMPTY_CASE_SUMMARY = '该门店公开案例完善中，可先查看资质认证与门店资料。'

/**
 * 将原始统计规范为对外 payload；无公开案例时不出总分/分项。
 * @param {object} raw
 */
function normalizeTransparencyPayload(raw = {}) {
  const caseCount = Number(raw.caseCount) || 0
  const serviceCount = Number(raw.serviceCount) || 0
  const exposed = isTransparencyExposed({ ...raw, caseCount })

  if (!exposed) {
    return {
      exposed: false,
      score: null,
      caseCount,
      albumCompleteRate: null,
      serviceCount,
      summary: String(raw.summary || EMPTY_CASE_SUMMARY),
      breakdown: null,
      methodology: '',
      asOfDate: '',
      dimensions: [],
    }
  }

  let dimensions = Array.isArray(raw.dimensions)
    ? raw.dimensions.filter((dim) => dim && dim.evidence && dim.evidence.available !== false)
    : buildTransparencyDimensions(raw)

  // 公开读侧：过滤内部 KPI，并清掉加权 scorePart
  dimensions = dimensions
    .filter((dim) => dim && PUBLIC_DIMENSION_IDS.has(dim.id))
    .map((dim) => ({ ...dim, scorePart: null }))

  const scoreNum = Number(raw.score)
  const score = Number.isFinite(scoreNum) && scoreNum >= 10 ? Math.round(scoreNum) : null

  return {
    exposed: true,
    score,
    caseCount,
    albumCompleteRate:
      raw.albumCompleteRate != null && Number(raw.albumCompleteRate) > 0
        ? Number(raw.albumCompleteRate)
        : null,
    serviceCount,
    summary: String(raw.summary || ''),
    breakdown: null,
    methodology: String(raw.methodology || PUBLIC_METHODOLOGY),
    asOfDate: String(raw.asOfDate || ''),
    dimensions,
  }
}

module.exports = {
  DIMENSION_DEFS,
  PUBLIC_DIMENSION_IDS,
  PUBLIC_METHODOLOGY,
  EMPTY_CASE_SUMMARY,
  buildTransparencyDimensions,
  normalizeTransparencyPayload,
  isTransparencyExposed,
}
