/**
 * GEO-TOPIC-B07 · 专题页内 FAQ 种子模板（合规初稿，运营可再编辑）
 */

const STORE_CHECK_HINT = '具体方案与费用以到店检测为准'

const COMMON_PRICE_ANSWER =
  '费用会因车型、配件品牌、损伤程度和门店检测结果而不同，平台展示的价格仅为参考区间。' +
  STORE_CHECK_HINT +
  '。'

function withStoreCheck(answer) {
  if (!answer || answer.includes('到店检测') || answer.includes('到店检查')) {
    return answer
  }
  return `${answer}${answer.endsWith('。') ? '' : '。'}${STORE_CHECK_HINT}。`
}

const CITY_SERVICE_DEFAULT = [
  {
    q: '这个问题一定要马上修吗？',
    a: withStoreCheck(
      '是否需要立即处理，要结合故障表现和检查结果判断。轻微异常可先观察或预约检查；若已影响安全或性能，建议尽快到店排查，避免小问题扩大。'
    ),
  },
  {
    q: '维修前需要准备什么？',
    a: '建议提前说明车型、里程和主要症状，并携带行驶证以便核对车辆信息。到店后门店会先检测再给出方案，您可在了解项目和费用后再决定是否维修。',
  },
  {
    q: '价格为什么差别很大？',
    a: COMMON_PRICE_ANSWER,
  },
]

const BRAKE_PAD_FAQ = [
  {
    q: '刹车片多久需要更换？',
    a: withStoreCheck(
      '没有固定公里数，需结合片厚、磨损均匀度、异响和制动表现综合判断。城市拥堵、频繁急刹会加速磨损，建议按保养周期或出现异常时及时检查。'
    ),
  },
  {
    q: '刹车异响一定是刹车片问题吗？',
    a: withStoreCheck(
      '不一定。异响可能来自片材、盘面积碳、卡钳或异物等，需要举升检查后才能确认。持续异响或制动力下降时，建议尽快到店检测。'
    ),
  },
  {
    q: '换刹车片大概多少钱？',
    a: COMMON_PRICE_ANSWER,
  },
]

const FAULT_QA_DEFAULT = [
  {
    q: '这个故障常见原因有哪些？',
    a: withStoreCheck(
      '同类症状可能对应多种原因，需结合读码、路试和拆解检查确认。线上信息只能作参考，不能替代实车检测。'
    ),
  },
  {
    q: '不修会有什么风险？',
    a: '风险取决于部件状态和驾驶环境。部分问题短期内可继续行驶，但若涉及制动、转向或冷却等系统，拖延可能带来安全隐患或更高维修成本。',
  },
  {
    q: '可以先检查再决定是否维修吗？',
    a: '可以。多数门店支持先检测后报价，您了解方案和费用后再决定是否施工，无需在未确认前强制消费。',
  },
]

const SERVICE_ID_ALIASES = {
  brake_pad: 'brake_pad',
  brake: 'brake_pad',
  '刹车片': 'brake_pad',
  '刹车片更换': 'brake_pad',
}

const TEMPLATES_BY_TYPE = {
  city_service: {
    default: CITY_SERVICE_DEFAULT,
    brake_pad: BRAKE_PAD_FAQ,
  },
  district_service: {
    default: CITY_SERVICE_DEFAULT,
    brake_pad: BRAKE_PAD_FAQ,
  },
  vehicle_service: {
    default: CITY_SERVICE_DEFAULT,
    brake_pad: BRAKE_PAD_FAQ,
  },
  city_fault: {
    default: FAULT_QA_DEFAULT,
  },
  fault_qa: {
    default: FAULT_QA_DEFAULT,
  },
  case_collection: {
    default: [
      {
        q: '这些案例能说明什么？',
        a: '案例展示的是脱敏后的真实维修记录片段，用来说明常见问题和处理思路，不代表所有车辆都会出现相同情况。',
      },
      {
        q: '可以直接按案例价格下单吗？',
        a: withStoreCheck(
          '不可以。案例中的价格为当时方案参考，您的车辆需经门店检测后才能确定配件与工时费用。'
        ),
      },
    ],
  },
  case_agg: {
    default: [
      {
        q: '案例价格可以直接套用吗？',
        a: COMMON_PRICE_ANSWER,
      },
      {
        q: '如何预约同款服务？',
        a: '可通过页面电话咨询或留言咨询，说明车型与症状，门店会安排检测并给出方案。',
      },
    ],
  },
  merchant_geo: {
    default: CITY_SERVICE_DEFAULT,
  },
}

/**
 * @param {string} pageType
 * @param {string} [serviceId]
 * @param {{ city?: string, title?: string }} [context]
 * @returns {{ q: string, a: string }[]}
 */
function getGeoFaqTemplate(pageType, serviceId = '', context = {}) {
  const typeKey = TEMPLATES_BY_TYPE[pageType] ? pageType : 'city_service'
  const bucket = TEMPLATES_BY_TYPE[typeKey]
  const rawServiceKey = String(serviceId || '').trim().toLowerCase()
  const aliasKey = SERVICE_ID_ALIASES[rawServiceKey] || SERVICE_ID_ALIASES[serviceId] || rawServiceKey
  const items = bucket[aliasKey] || bucket.default || CITY_SERVICE_DEFAULT
  return items.map((item) => ({ q: item.q, a: item.a }))
}

module.exports = {
  getGeoFaqTemplate,
  STORE_CHECK_HINT,
}
