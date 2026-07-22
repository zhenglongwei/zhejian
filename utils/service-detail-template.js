/**
 * 服务详情模板 — 商家未填字段时的默认文案（MOCK，联调后由 API 返回）
 */
const { PRICE_MODE, normalizePriceMode } = require('../constants/price-mode')
const { getServiceItem } = require('../constants/service')

const COMPLEXITY_LABEL = {
  L1: '简单检测与养护',
  L2: '常规维修',
  L3: '专项维修',
  L4: '复杂维修/事故车',
}

const DEFAULT_FAQ = [
  {
    q: '线上价格就是最终价格吗？',
    a: '标准套餐服务如页面明确标注一口价或套餐价，以页面展示为准。如车辆情况超出套餐范围，门店会与你确认新增维修方案和费用。',
  },
  {
    q: '维修过程可以看到吗？',
    a: '支持辙见的门店会上传维修过程图片，你可以在订单中查看服务相册。',
  },
]

const ACCIDENT_FAQ = [
  {
    q: '事故车价格怎么定？',
    a: '事故车维修费用需到店检测后确定。',
  },
  ...DEFAULT_FAQ,
]

const ITEM_TEMPLATES = {
  item_maintenance: {
    includedItems: ['指定机油、机滤', '标准工时', '基础检测'],
    excludedItems: ['额外维修项目', '非套餐配件', '特殊车型差价'],
    applicableScenes: ['到达保养里程', '机油老化', '常规保养需求'],
    notApplicableScenes: ['发动机严重异响', '需拆检后才能判断的故障'],
    serviceFlow: [
      '选择服务并预约门店',
      '到店检测确认套餐范围',
      '完成保养并上传维修记录',
      '确认完工',
    ],
  },
  item_brake_pad: {
    includedItems: ['刹车片检测', '更换工时', '试车检查'],
    excludedItems: ['刹车盘更换（如需）', '额外损坏维修', '特殊车型差价'],
    applicableScenes: ['刹车异响', '刹车片磨损', '刹车距离变长'],
    notApplicableScenes: ['严重事故导致结构件损伤', '需保险定损的维修'],
    serviceFlow: [
      '预约到店检测',
      '确认刹车片/盘状况',
      '更换并完成试车',
      '确认完工',
    ],
    defaultPriceFactors: ['车型与年款', '配件品牌', '刹车盘是否需更换'],
  },
  item_body_paint: {
    includedItems: ['损伤评估', '标准喷漆工时'],
    excludedItems: ['钣金修复', '附加件更换', '特殊色漆加价'],
    applicableScenes: ['局部刮擦', '小面积凹陷修复后喷漆'],
    notApplicableScenes: ['大面积事故损伤', '需保险定损案件'],
    serviceFlow: ['预约到店', '评估损伤范围', '确认方案和费用', '施工与交车'],
    defaultPriceFactors: ['损伤面积', '是否需要钣金', '油漆类型'],
  },
  item_battery: {
    includedItems: ['电瓶更换', '标准工时', '电压检测'],
    excludedItems: ['发电机故障维修', '线路检修'],
    applicableScenes: ['电瓶亏电', '启动困难', '电瓶到期更换'],
    notApplicableScenes: ['需拆检电路故障', '复杂电气系统问题'],
    serviceFlow: ['选择套餐', '预约到店', '更换并检测', '确认完工'],
  },
  item_accident: {
    includedItems: ['到店检测评估', '损伤记录'],
    excludedItems: ['线上最终报价', '未经检测的维修承诺'],
    applicableScenes: ['交通事故车辆', '需到店检测评估损伤'],
    notApplicableScenes: ['期望线上确定最终维修价'],
    serviceFlow: [
      '查看类似案例了解常见方案',
      '预约门店检测',
      '到店检测或拆检',
      '确认维修方案与费用',
    ],
    defaultPriceFactors: [
      '是否涉及结构件',
      '是否涉及安全气囊',
      '是否需要拆检',
      '是否涉及保险定损',
    ],
  },
}

function getDefaultPriceFactors(serviceItemId, priceMode) {
  const tpl = ITEM_TEMPLATES[serviceItemId]
  if (tpl && tpl.defaultPriceFactors) return tpl.defaultPriceFactors
  if (serviceItemId === 'item_accident') {
    return ITEM_TEMPLATES.item_accident.defaultPriceFactors
  }
  if (normalizePriceMode(priceMode) === PRICE_MODE.CONSULT) {
    return ['车型', '配件品牌', '损伤程度', '门店检测结果']
  }
  return []
}

function getServiceFlow(serviceItemId, priceMode) {
  const tpl = ITEM_TEMPLATES[serviceItemId]
  if (tpl && tpl.serviceFlow) return tpl.serviceFlow
  if (serviceItemId === 'item_accident') {
    return ITEM_TEMPLATES.item_accident.serviceFlow
  }
  return [
    '选择服务',
    '选择门店',
    '预约到店',
    '门店检测确认方案',
    '完成维修',
  ]
}

function getFaq(priceMode, serviceItemId) {
  if (serviceItemId === 'item_accident') return ACCIDENT_FAQ
  return DEFAULT_FAQ
}

function getComplexityLabel(serviceItemId) {
  const item = getServiceItem(serviceItemId)
  if (!item || !item.complexity) return '常规维修'
  return COMPLEXITY_LABEL[item.complexity] || '常规维修'
}

/**
 * 合并商家 record 与模板默认字段
 * @param {object} record
 */
function applyDetailTemplate(record) {
  const tpl = ITEM_TEMPLATES[record.serviceItemId] || {}
  const priceMode = record.priceMode

  return {
    includedItems:
      record.includedItems && record.includedItems.length
        ? record.includedItems
        : tpl.includedItems || [],
    excludedItems:
      record.excludedItems && record.excludedItems.length
        ? record.excludedItems
        : tpl.excludedItems || [],
    applicableScenes:
      record.applicableScenes && record.applicableScenes.length
        ? record.applicableScenes
        : tpl.applicableScenes || [],
    notApplicableScenes:
      record.notApplicableScenes && record.notApplicableScenes.length
        ? record.notApplicableScenes
        : tpl.notApplicableScenes || [],
    priceFactors:
      record.priceFactors && record.priceFactors.length
        ? record.priceFactors
        : getDefaultPriceFactors(record.serviceItemId, priceMode),
    serviceFlow: getServiceFlow(record.serviceItemId, priceMode),
    faq: getFaq(priceMode, record.serviceItemId),
    complexityLabel: getComplexityLabel(record.serviceItemId),
  }
}

module.exports = {
  applyDetailTemplate,
  getComplexityLabel,
  ITEM_TEMPLATES,
}
