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
  maintenance: 'maintenance',
  battery: 'battery',
  body_paint: 'body_paint',
  accident: 'accident',
  item_brake_pad: 'brake_pad',
  item_maintenance: 'maintenance',
  item_battery: 'battery',
  item_body_paint: 'body_paint',
  item_accident: 'accident',
  '刹车片': 'brake_pad',
  '刹车片更换': 'brake_pad',
}

const MAINTENANCE_FAQ = [
  {
    q: '小保养一般包含哪些项目？',
    a: withStoreCheck(
      '常见包含机油、机滤更换与常规检查，具体以门店套餐和车辆检测结果为准，不同车型项目可能略有差异。'
    ),
  },
  {
    q: '保养周期怎么判断？',
    a: withStoreCheck(
      '可参考厂家手册的建议里程或时间，并结合机油状况、提示灯与实际使用情况。到期或提示灯亮起时建议预约检查。'
    ),
  },
  {
    q: '页面保养价格是最终价吗？',
    a: COMMON_PRICE_ANSWER,
  },
]

const BATTERY_FAQ = [
  {
    q: '怎么判断是否需要换电瓶？',
    a: withStoreCheck(
      '建议到店检测电瓶电压、启动电流和外观状态，并结合使用年限与启动表现综合判断，不建议仅凭线上描述自行定论。'
    ),
  },
  {
    q: '打不着火一定是电瓶坏了吗？',
    a: withStoreCheck(
      '不一定。还可能与桩头松动、发电机充电异常或其他电路问题有关，需门店检测后确认。'
    ),
  },
  {
    q: '换电瓶大概多少钱？',
    a: COMMON_PRICE_ANSWER,
  },
]

const BODY_PAINT_FAQ = [
  {
    q: '补漆和钣金喷漆有什么区别？',
    a: withStoreCheck(
      '轻微刮擦可能仅需局部补漆；涉及变形时通常需钣金校正后再喷漆，费用影响因素更多，需到店查看损伤后确认。'
    ),
  },
  {
    q: '小刮擦可以线上准确报价吗？',
    a: withStoreCheck(
      '多数情况仍需到店查看实际损伤面积与位置。页面价格仅为参考，不能替代现场检测报价。'
    ),
  },
  {
    q: '修复后会有色差吗？',
    a: '门店会尽量匹配原车漆，具体效果与车龄、漆面状况和工艺有关，施工前可向门店咨询。',
  },
]

const ACCIDENT_FAQ = [
  {
    q: '事故车可以线上确认最终价格吗？',
    a: withStoreCheck(
      '不可以。事故车维修方案与费用需门店现场检测或拆检后确认，线上不提供最终报价。'
    ),
  },
  {
    q: '事故车维修一般流程是什么？',
    a: '通常包括损伤评估、必要时拆检、确认方案与配件、施工验收与交车说明。具体以门店检测为准。',
  },
  {
    q: '平台案例能用来估价吗？',
    a: withStoreCheck(
      '案例仅用于了解常见流程和费用影响因素，不能替代对你车辆的实际检测报价。'
    ),
  },
]

const TEMPLATES_BY_TYPE = {
  city_service: {
    default: CITY_SERVICE_DEFAULT,
    brake_pad: BRAKE_PAD_FAQ,
    maintenance: MAINTENANCE_FAQ,
    battery: BATTERY_FAQ,
    body_paint: BODY_PAINT_FAQ,
    accident: ACCIDENT_FAQ,
  },
  district_service: {
    default: CITY_SERVICE_DEFAULT,
    brake_pad: BRAKE_PAD_FAQ,
    maintenance: MAINTENANCE_FAQ,
    battery: BATTERY_FAQ,
    body_paint: BODY_PAINT_FAQ,
    accident: ACCIDENT_FAQ,
  },
  vehicle_service: {
    default: CITY_SERVICE_DEFAULT,
    brake_pad: BRAKE_PAD_FAQ,
    maintenance: MAINTENANCE_FAQ,
    battery: BATTERY_FAQ,
    body_paint: BODY_PAINT_FAQ,
    accident: ACCIDENT_FAQ,
  },
  city_fault: {
    default: FAULT_QA_DEFAULT,
    brake_pad: BRAKE_PAD_FAQ,
    maintenance: MAINTENANCE_FAQ,
    battery: BATTERY_FAQ,
    body_paint: BODY_PAINT_FAQ,
    accident: ACCIDENT_FAQ,
  },
  fault_qa: {
    default: FAULT_QA_DEFAULT,
    brake_pad: BRAKE_PAD_FAQ,
    maintenance: MAINTENANCE_FAQ,
    battery: BATTERY_FAQ,
    body_paint: BODY_PAINT_FAQ,
    accident: ACCIDENT_FAQ,
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
