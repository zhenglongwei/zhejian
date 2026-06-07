const { newId } = require('../lib/ids')
const { resolveAlbumNodeTemplate } = require('../constants/service-album-node-template')

const DEFAULT_FAQ = [
  {
    q: '本次维修一般需要多久？',
    a: '具体时间取决于车辆状况、配件库存和门店排队情况，常规项目多数可在半天内完成，具体以门店确认为准。',
  },
  {
    q: '案例价格是否等于实际支付金额？',
    a: '不等于。页面仅展示参考区间，实际费用以门店检测与最终方案为准。',
  },
  {
    q: '公开案例中的图片是否包含隐私信息？',
    a: '公开案例仅使用经脱敏处理后的图片，不展示车牌、手机号等隐私信息。',
  },
]

const FAQ_BY_SERVICE = {
  刹车片更换: [
    {
      q: '刹车片更换一般需要多久？',
      a: '常规情况下约 1–2 小时，具体时间取决于车辆状况和门店排队情况。',
    },
    {
      q: '刹车片是否必须前后一起更换？',
      a: '不一定，需要根据前后刹车片的实际磨损情况判断。',
    },
    {
      q: '更换刹车片后需要注意什么？',
      a: '建议短期内避免急刹，关注刹车脚感和异响情况，必要时回店检查。',
    },
  ],
  小保养: [
    {
      q: '小保养一般包含哪些项目？',
      a: '通常包含机油机滤更换及常规检查，具体以门店方案为准。',
    },
    {
      q: '保养周期如何确定？',
      a: '可参考车辆手册或门店建议，结合里程与时间综合判断。',
    },
    {
      q: '保养后是否需要试车？',
      a: '门店通常会进行基础检查，如有异常应及时反馈。',
    },
  ],
}

/** 相册模板 FAQ — 对齐 PRD 02_相册模板与节点规则 §5.5–§11.5 */
const FAQ_BY_TEMPLATE = {
  maintenance: [
    {
      q: '小保养一般多久做一次？',
      a: '通常建议根据车辆保养手册、机油类型和实际用车环境决定，一般为 5000–10000 公里或 6–12 个月。',
    },
    {
      q: '机油型号可以随便换吗？',
      a: '不建议随意更换，应优先参考车辆厂家建议的机油粘度和认证标准。',
    },
    {
      q: '只换机油不换机滤可以吗？',
      a: '通常建议机油和机滤一起更换，以保证过滤效果和保养质量。',
    },
  ],
  major_maintenance: [
    {
      q: '大保养和小保养有什么区别？',
      a: '小保养通常以机油机滤为主，大保养会根据里程和车况增加滤芯、火花塞、油液等项目。',
    },
    {
      q: '大保养项目可以只做一部分吗？',
      a: '可以，但建议结合车辆手册、里程和门店检测结果综合确定，不建议遗漏关键项目。',
    },
    {
      q: '大保养一般需要多久？',
      a: '项目较多时耗时会更长，具体取决于更换内容和门店安排，以门店确认为准。',
    },
  ],
  brake: [
    {
      q: '刹车片多久需要更换一次？',
      a: '更换周期与车型、驾驶习惯和路况有关，建议结合实际磨损厚度和门店检查结果判断。',
    },
    {
      q: '刹车异响一定是刹车片问题吗？',
      a: '不一定。刹车异响可能与刹车片材质、刹车盘状态、异物或安装情况有关，需要检查后确认。',
    },
    {
      q: '刹车盘需要和刹车片一起更换吗？',
      a: '不一定。若刹车盘磨损严重、变形或有明显沟槽，可能需要同时更换。',
    },
  ],
  battery: [
    {
      q: '电瓶一般能用多久？',
      a: '使用寿命与车型、使用频率、停放环境和维护情况有关，出现启动困难等情况建议尽快检测。',
    },
    {
      q: '更换电瓶后需要做什么设置吗？',
      a: '部分车型更换后可能需要恢复部分电子设置，门店会按车型进行必要检查。',
    },
    {
      q: '电瓶亏电和电瓶损坏怎么区分？',
      a: '需通过电压、负载测试等方式判断，建议由门店检测后确认是否需要更换。',
    },
  ],
  tire: [
    {
      q: '轮胎多久需要更换？',
      a: '需结合花纹深度、使用年限、损伤情况和门店检测结果综合判断，不建议仅看里程。',
    },
    {
      q: '换胎后一定要做动平衡吗？',
      a: '通常建议进行动平衡，以减少高速行驶时的抖动风险，具体以门店建议为准。',
    },
    {
      q: '四条轮胎必须一起换吗？',
      a: '不一定，可根据各轮胎磨损程度和位置情况决定，门店会给出更换建议。',
    },
  ],
  ac: [
    {
      q: '空调不制冷一定是缺冷媒吗？',
      a: '不一定，可能与冷媒、压缩机、管路或滤芯状态有关，需要检测后确认。',
    },
    {
      q: '空调有异味怎么处理？',
      a: '常见与滤芯、蒸发箱清洁或管路状态有关，建议到店检查后再确定处理方案。',
    },
    {
      q: '空调保养一般包含哪些项目？',
      a: '可能包含检测、清洁、冷媒补充或滤芯更换等，具体以门店方案为准。',
    },
  ],
  body_paint: [
    {
      q: '钣喷修复后会有色差吗？',
      a: '色差与车辆颜色、漆面老化程度、调色和施工工艺有关，门店会尽量进行颜色匹配和过渡处理。',
    },
    {
      q: '小划痕需要整面喷漆吗？',
      a: '不一定，需要根据划痕深度、位置、颜色和修复效果要求判断。',
    },
    {
      q: '钣喷修复一般需要多久？',
      a: '维修时间会受到损伤面积、是否拆件、喷漆工序和天气等因素影响，具体以门店确认为准。',
    },
  ],
  accident: [
    {
      q: '事故车维修前为什么要先检测？',
      a: '需确认损伤范围、结构件状态和隐藏损伤，才能制定合理的维修方案和报价。',
    },
    {
      q: '事故车维修费用为什么差异较大？',
      a: '费用与损伤部位、配件选择、是否涉及结构件和喷漆面积等因素有关，需检测后确认。',
    },
    {
      q: '事故车维修后如何验收？',
      a: '建议关注外观匹配、功能恢复和关键部位安装情况，具体验收标准以门店说明为准。',
    },
  ],
}

const FAQ_MAX = 6
const FAQ_MIN = 3

function normalizeQuestion(q) {
  return String(q || '')
    .replace(/^Q\d*[：:]\s*/i, '')
    .trim()
}

function withFaqIds(items) {
  return (items || []).map((item) => ({
    id: item.id || newId('faq'),
    q: normalizeQuestion(item.q),
    a: String(item.a || '').trim(),
  }))
}

function dedupeFaq(items) {
  const seen = new Set()
  const out = []
  for (const item of items || []) {
    const q = normalizeQuestion(item.q)
    const a = String(item.a || '').trim()
    if (!q || !a) continue
    const key = q.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ q, a })
  }
  return out
}

function buildCaseFaq(serviceName) {
  if (serviceName && FAQ_BY_SERVICE[serviceName]) {
    return withFaqIds(FAQ_BY_SERVICE[serviceName])
  }
  return withFaqIds(DEFAULT_FAQ)
}

/**
 * A-PUB-07 · 按 PRD 07 §10 优先级生成案例 FAQ（3–6 条）
 * @param {{ serviceName?: string, serviceItemId?: string, templateId?: string, coldStart?: boolean }} input
 */
function generateCaseFaq(input = {}) {
  const serviceName = String(input.serviceName || '').trim()
  const template = resolveAlbumNodeTemplate({
    serviceItemId: input.serviceItemId,
    serviceName,
  })
  const templateId = String(input.templateId || template.templateId || '').trim()

  let base = []
  if (serviceName && FAQ_BY_SERVICE[serviceName]) {
    base = FAQ_BY_SERVICE[serviceName]
  } else if (templateId && FAQ_BY_TEMPLATE[templateId]) {
    base = FAQ_BY_TEMPLATE[templateId]
  } else {
    base = DEFAULT_FAQ
  }

  let merged = dedupeFaq(base)

  if (input.coldStart) {
    merged = dedupeFaq([
      {
        q: '该案例是否代表所有同类型车辆？',
        a: '不代表。本案例仅记录该次维修过程摘要，不同车辆状况和方案可能存在差异。',
      },
      ...merged,
    ])
  }

  if (merged.length < FAQ_MIN) {
    merged = dedupeFaq([...merged, ...DEFAULT_FAQ])
  }

  return withFaqIds(merged.slice(0, FAQ_MAX))
}

module.exports = {
  buildCaseFaq,
  generateCaseFaq,
  DEFAULT_FAQ,
  FAQ_BY_SERVICE,
  FAQ_BY_TEMPLATE,
  FAQ_MIN,
  FAQ_MAX,
}
