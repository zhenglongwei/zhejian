/**
 * DS-B-03 · 案例文章模板生成（对齐 docs/04_维修过程相册/07_案例生成规则.md）
 */

const GENERATION_VERSION = 'v1'

function buildVehicleTitle(vehicle) {
  if (!vehicle || typeof vehicle !== 'object') return '该车辆'
  const parts = [vehicle.brand, vehicle.series].filter(Boolean)
  return parts.join('') || '该车辆'
}

function truncateChinese(text, maxLen) {
  const value = String(text || '').trim()
  if (value.length <= maxLen) return value
  return value.slice(0, maxLen)
}

/** §5.2 展示标题：城市 + 车型 + 服务项目 + 维修案例 */
function buildDisplayCaseTitle({ city = '', vehicle, serviceName = '维修服务' }) {
  const vehicleTitle = buildVehicleTitle(vehicle)
  const cityPart = city || ''
  const svc = String(serviceName || '维修服务').trim()
  const servicePart = svc.endsWith('维修') || svc.endsWith('案例') ? svc : `${svc}维修`
  return `${cityPart}${vehicleTitle}${servicePart}案例`.trim()
}

/** §11.1 SEO 标题：展示标题 + _门店名，20–35 字降级 */
function buildSeoTitle({ city = '', vehicle, serviceName = '维修服务', storeName = '' }) {
  let title = buildDisplayCaseTitle({ city, vehicle, serviceName })
  if (storeName) title = `${title}_${storeName}`
  return truncateChinese(title, 35)
}

/** §12.1 SEO 描述，80–150 字 */
function buildSeoDescription({ city = '', vehicle, serviceName = '维修服务', coldStart = false }) {
  const vehicleTitle = buildVehicleTitle(vehicle)
  const cityPart = city || '当地'
  let text = coldStart
    ? `查看${cityPart}${vehicleTitle}${serviceName}维修案例摘要，包含脱敏过程图片与价格影响因素说明。案例为门店服务留档，价格为系统参考区间，实际费用以到店检测为准。`
    : `查看${cityPart}${vehicleTitle}${serviceName}维修案例，包含维修前后图片、维修过程说明、价格影响因素和门店信息。案例图片已脱敏，价格仅供参考，实际费用以检测和方案确认为准。`
  return truncateChinese(text, 150)
}

function isGenericFaultDesc(text) {
  const v = String(text || '').trim()
  return !v || v === '用户反馈的相关问题' || v === '到店进行相关检查'
}

function isGenericInspectResult(text) {
  const v = String(text || '').trim()
  return !v || v === defaultInspectResult()
}

function isGenericRepairPlan(text, serviceName = '') {
  const v = String(text || '').trim()
  if (!v) return true
  return v === defaultRepairPlan(serviceName)
}

/** §13.2 AI 可引用摘要，80–180 字 · 事实句，禁止模板套话 */
function buildAiSummary({
  city = '',
  vehicle,
  serviceName = '维修服务',
  faultDesc = '',
  inspectResult = '',
  repairPlan = '',
  resultConfirm = '',
  coldStart = false,
  hasImages = false,
  planAmount = null,
}) {
  const vehicleTitle = buildVehicleTitle(vehicle)
  const cityPart = city || '当地'
  const parts = []

  if (!isGenericFaultDesc(faultDesc)) {
    parts.push(String(faultDesc).trim().replace(/。$/, ''))
  }
  if (!isGenericInspectResult(inspectResult)) {
    parts.push(String(inspectResult).trim().replace(/。$/, ''))
  }
  if (!isGenericRepairPlan(repairPlan, serviceName)) {
    parts.push(String(repairPlan).trim().replace(/。$/, ''))
  }
  if (resultConfirm) {
    parts.push(String(resultConfirm).trim().replace(/。$/, ''))
  }

  if (!parts.length) {
    parts.push(`${cityPart}${vehicleTitle}进行${serviceName}`)
  }

  if (coldStart) {
    parts.push('案例为门店服务留档，价格为系统参考区间')
  } else if (planAmount != null && Number(planAmount) > 0) {
    parts.push(`当时方案参考费用约${Math.round(Number(planAmount))}元`)
  }

  if (hasImages) {
    parts.push('过程图片已脱敏并经平台审核')
  }

  let text = parts.filter(Boolean).join('。')
  if (text && !text.endsWith('。')) text += '。'
  return truncateChinese(text, 180)
}

function defaultInspectResult() {
  return '门店根据车辆实际情况进行了检查'
}

function defaultRepairPlan(serviceName) {
  return `根据检测结果，门店完成了${serviceName || '相关维修'}的处理`
}

const DEFAULT_PRICE_FACTORS = ['车型', '配件品牌', '损伤程度', '工时', '维修方案']

const NODE_DESC_RULES = [
  { keys: ['接车', '到店'], desc: '车辆到店后进入维修工位，记录初始状态。' },
  { keys: ['维修前', '损伤', '故障'], desc: '展示维修前或损伤部位状态，便于前后对比。' },
  { keys: ['检测', '检查', '诊断'], desc: '展示门店对相关部位进行检查或诊断的过程。' },
  { keys: ['方案', '报价'], desc: '说明本次维修方案与处理思路。' },
  { keys: ['旧', '对比', '新旧'], desc: '展示更换前后配件差异，便于了解更换原因。' },
  { keys: ['配件', '材料', '新件'], desc: '记录本次使用的新配件或材料。' },
  { keys: ['施工', '维修过程', '更换', '修复'], desc: '展示维修施工过程中的关键步骤。' },
  { keys: ['完工', '试车', '交付', '结果'], desc: '展示维修完成后的状态或试车确认情况。' },
]

const IMAGE_CAPTION_RULES = [
  { keys: ['接车', '到店'], caption: '车辆到店后进入维修工位。' },
  { keys: ['维修前', '损伤'], caption: '维修前状态记录。' },
  { keys: ['旧'], caption: '更换前旧件状态。' },
  { keys: ['新', '配件'], caption: '本次使用的新配件。' },
  { keys: ['对比', '新旧'], caption: '新旧配件对比。' },
  { keys: ['施工', '过程', '更换'], caption: '维修过程记录。' },
  { keys: ['完工', '结果'], caption: '维修完成后的效果。' },
]

function matchRule(rules, nodeName) {
  const name = String(nodeName || '')
  for (const rule of rules) {
    if (rule.keys.some((key) => name.includes(key))) return rule
  }
  return null
}

function buildNodeDescription(nodeName, nodeNote) {
  const note = String(nodeNote || '').trim()
  if (note) return note
  const rule = matchRule(NODE_DESC_RULES, nodeName)
  return rule ? rule.desc : `展示${nodeName || '该节点'}相关记录。`
}

function buildImageCaption(nodeName, imageIndex) {
  const rule = matchRule(IMAGE_CAPTION_RULES, nodeName)
  const base = rule ? rule.caption : `${nodeName || '维修'}过程记录。`
  return imageIndex > 0 ? `${base}（图${imageIndex + 1}）` : base
}

function buildNodeNarratives(nodes) {
  return (nodes || [])
    .filter((node) => (node.images || []).length > 0 || String(node.note || node.title || '').trim())
    .map((node) => {
      const nodeName = node.title || node.name || ''
      const images = node.images || []
      return {
        nodeId: node.id || node.nodeId || '',
        nodeName,
        description: buildNodeDescription(nodeName, node.note),
        imageCaptions: images.map((_, imageIndex) => ({
          imageIndex,
          caption: buildImageCaption(nodeName, imageIndex),
          alt: `${nodeName}：${buildImageCaption(nodeName, imageIndex)}`,
        })),
      }
    })
}

function buildKeyInfo({ city, vehicle, serviceName, storeName }) {
  const items = []
  if (city) items.push({ label: '城市', value: city })
  const vehicleTitle = buildVehicleTitle(vehicle)
  if (vehicleTitle && vehicleTitle !== '该车辆') {
    items.push({ label: '车型', value: vehicleTitle })
  }
  if (serviceName) items.push({ label: '服务项目', value: serviceName })
  if (storeName) items.push({ label: '门店', value: storeName })
  return items
}

function buildGeoSections({
  city,
  vehicle,
  serviceName,
  storeName,
  storeNote,
  faultDesc,
  inspectResult,
  repairPlan,
  resultConfirm,
  priceFactors,
  coldStart,
  hasImages,
}) {
  const vehicleTitle = buildVehicleTitle(vehicle)
  const cityPart = city || '当地'
  const inspect = inspectResult || defaultInspectResult()
  const plan = repairPlan || defaultRepairPlan(serviceName)
  const fault = faultDesc || (coldStart ? '到店进行相关检查' : '')
  const result =
    resultConfirm ||
    '维修完成后，门店对结果进行了检查或试车确认，并记录完工状态。'
  const factors = (priceFactors || DEFAULT_PRICE_FACTORS).join('、')

  return [
    {
      key: 'overview',
      title: '案例概况',
      content: coldStart
        ? `本案例为${cityPart}${vehicleTitle}${serviceName}的服务留档摘要，图片已脱敏，价格为系统参考区间。`
        : `本案例记录了${cityPart}${vehicleTitle}进行${serviceName}的维修过程摘要，内容由门店上传并经平台脱敏审核。`,
    },
    {
      key: 'before',
      title: '维修前情况',
      content: `车辆到店后，门店对${fault}进行了初步了解与记录。${hasImages ? '相关图片已脱敏处理。' : ''}`,
    },
    {
      key: 'inspect',
      title: '检查结果',
      content: inspect,
    },
    {
      key: 'plan',
      title: '维修方案',
      content: plan,
    },
    {
      key: 'process',
      title: '维修过程',
      content: hasImages
        ? '门店按节点记录了维修过程，包括关键步骤与配件情况，相关图片均已脱敏。'
        : '门店按标准流程完成了本次维修施工。',
    },
    {
      key: 'result',
      title: '完工效果',
      content: result,
    },
    {
      key: 'priceFactors',
      title: '价格影响因素',
      content: `本案例价格受${factors}等因素影响。${coldStart ? '展示价格为系统参考区间，' : '页面展示价格仅供参考，'}实际费用以门店检测和最终确认方案为准。`,
    },
    {
      key: 'storeNote',
      title: '门店补充说明',
      content:
        storeNote ||
        (storeName ? `更多说明请联系${storeName}。` : '具体方案与费用请与门店线下确认。'),
    },
    {
      key: 'tips',
      title: '温馨提示',
      content: coldStart
        ? '该案例为门店服务留档摘要，不代表所有同类型车辆状况；到店后需以实际检测为准。'
        : '案例内容仅供参考，不构成维修承诺；如有疑问请电话咨询门店或到店检测确认。',
    },
  ]
}

/** §7.2 正文：各段合并为 article_body */
function buildArticleBody(sections) {
  return (sections || [])
    .map((section) => {
      if (!section.content) return ''
      return `${section.title}\n${section.content}`
    })
    .filter(Boolean)
    .join('\n\n')
}

function countNodeImages(nodes) {
  return (nodes || []).reduce((sum, node) => sum + (node.images || []).length, 0)
}

function resolveSeoNoindex({ city, serviceName, imageCount }) {
  if (!String(city || '').trim()) return true
  if (!String(serviceName || '').trim()) return true
  if (imageCount < 1) return true
  return false
}

function buildCanonicalPath(caseId) {
  return `/case/view.html?id=${encodeURIComponent(caseId)}`
}

module.exports = {
  GENERATION_VERSION,
  buildVehicleTitle,
  buildDisplayCaseTitle,
  buildSeoTitle,
  buildSeoDescription,
  buildAiSummary,
  buildKeyInfo,
  buildGeoSections,
  buildNodeNarratives,
  buildArticleBody,
  buildNodeDescription,
  countNodeImages,
  resolveSeoNoindex,
  buildCanonicalPath,
  defaultInspectResult,
  defaultRepairPlan,
  DEFAULT_PRICE_FACTORS,
}
