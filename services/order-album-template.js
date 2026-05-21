/**
 * 订单相册模板匹配 — 对齐 docs/04_维修过程相册/02_相册模板与节点规则.md §12
 * MOCK/前端共用；联调后后端可返回 templateId，本服务作 fallback
 */
const { ORDER_TYPE } = require('../constants/order-type')
const {
  NODE_REQUIRED_LEVEL,
  NODE_REQUIRED_LEVEL_LABEL,
  NODE_REQUIRED_LEVEL_TAG,
} = require('../constants/order-album-node')
const {
  ORDER_ALBUM_TEMPLATES,
  SERVICE_ITEM_TEMPLATE_MAP,
  CATEGORY_TEMPLATE_MAP,
  TEMPLATE_LIST,
} = require('../constants/order-album-templates')
const { findRawService } = require('./service')

const MATCH_SOURCE = {
  SERVICE_ITEM: 'service_item',
  CATEGORY: 'category',
  KEYWORD: 'keyword',
  ORDER_TYPE: 'order_type',
  GENERIC: 'generic',
  MANUAL: 'manual',
}

/** 模板来源 — 02 §12.2 手动切换后固定为 manual */
const TEMPLATE_SOURCE = {
  AUTO: 'auto',
  MANUAL: 'manual',
}

/** §12.1 关键词 → 模板（顺序优先） */
const KEYWORD_TEMPLATE_RULES = [
  { templateId: 'major_maintenance', keywords: ['大保养', '火花塞', '变速箱油', '刹车油', '防冻液', '综合检测'] },
  { templateId: 'maintenance', keywords: ['小保养', '机油', '机滤', '常规保养', '基础检测'] },
  { templateId: 'brake', keywords: ['刹车片', '刹车盘', '刹车异响', '制动'] },
  { templateId: 'battery', keywords: ['电瓶', '蓄电池', '无法启动', '启动困难'] },
  { templateId: 'tire', keywords: ['轮胎', '换胎', '补胎', '动平衡', '胎压'] },
  { templateId: 'ac', keywords: ['空调', '冷媒', '滤芯', '异味', '蒸发箱'] },
  { templateId: 'paint', keywords: ['钣金', '喷漆', '划痕', '凹陷', '补漆', '钣喷'] },
  { templateId: 'accident', keywords: ['事故车', '事故', '定损', '碰撞'] },
]

function getTemplateById(templateId) {
  return ORDER_ALBUM_TEMPLATES[templateId] || ORDER_ALBUM_TEMPLATES.generic
}

function matchByKeywords(serviceName) {
  const name = (serviceName || '').trim()
  if (!name) return null
  for (let i = 0; i < KEYWORD_TEMPLATE_RULES.length; i += 1) {
    const rule = KEYWORD_TEMPLATE_RULES[i]
    const hit = rule.keywords.some((kw) => name.includes(kw))
    if (hit) {
      return {
        template: getTemplateById(rule.templateId),
        matchSource: MATCH_SOURCE.KEYWORD,
        matchKey: rule.templateId,
      }
    }
  }
  return null
}

/**
 * 解析订单应使用的相册模板
 * @param {object} input — order 或 { serviceId, serviceItemId, categoryId, serviceName, orderType }
 */
function resolveOrderAlbumTemplate(input = {}) {
  const order = input || {}
  let serviceItemId = order.serviceItemId
  let categoryId = order.categoryId
  let serviceName = order.serviceName || ''

  if (order.serviceId) {
    const service = findRawService(order.serviceId, 'user')
    if (service) {
      serviceItemId = serviceItemId || service.serviceItemId
      categoryId = categoryId || service.categoryId
      serviceName = serviceName || service.name || ''
    }
  }

  if (order.orderType === ORDER_TYPE.ACCIDENT_BOOKING) {
    return {
      template: ORDER_ALBUM_TEMPLATES.accident,
      templateId: 'accident',
      templateName: ORDER_ALBUM_TEMPLATES.accident.name,
      matchSource: MATCH_SOURCE.ORDER_TYPE,
      matchKey: ORDER_TYPE.ACCIDENT_BOOKING,
    }
  }

  if (serviceItemId && SERVICE_ITEM_TEMPLATE_MAP[serviceItemId]) {
    const templateId = SERVICE_ITEM_TEMPLATE_MAP[serviceItemId]
    const template = getTemplateById(templateId)
    return {
      template,
      templateId,
      templateName: template.name,
      matchSource: MATCH_SOURCE.SERVICE_ITEM,
      matchKey: serviceItemId,
    }
  }

  if (categoryId && CATEGORY_TEMPLATE_MAP[categoryId]) {
    const templateId = CATEGORY_TEMPLATE_MAP[categoryId]
    const template = getTemplateById(templateId)
    return {
      template,
      templateId,
      templateName: template.name,
      matchSource: MATCH_SOURCE.CATEGORY,
      matchKey: categoryId,
    }
  }

  const keywordMatch = matchByKeywords(serviceName)
  if (keywordMatch) {
    return {
      template: keywordMatch.template,
      templateId: keywordMatch.template.id,
      templateName: keywordMatch.template.name,
      matchSource: keywordMatch.matchSource,
      matchKey: keywordMatch.matchKey,
    }
  }

  const template = ORDER_ALBUM_TEMPLATES.generic
  return {
    template,
    templateId: template.id,
    templateName: template.name,
    matchSource: MATCH_SOURCE.GENERIC,
    matchKey: 'generic',
  }
}

function resolveOrderAlbumTemplateForOrder(order) {
  return resolveOrderAlbumTemplate(order)
}

/**
 * 读取相册应使用的模板（手动切换优先于自动匹配）
 */
function resolveTemplateForAlbum(order, storedAlbum) {
  if (
    storedAlbum &&
    storedAlbum.templateSource === TEMPLATE_SOURCE.MANUAL &&
    storedAlbum.templateId
  ) {
    const template = getTemplateById(storedAlbum.templateId)
    return {
      template,
      templateId: template.id,
      templateName: template.name,
      matchSource: MATCH_SOURCE.MANUAL,
      templateSource: TEMPLATE_SOURCE.MANUAL,
    }
  }
  const resolved = resolveOrderAlbumTemplateForOrder(order)
  return {
    ...resolved,
    templateSource: TEMPLATE_SOURCE.AUTO,
  }
}

/**
 * §12.2 手动切换模板 — 保留同 id 节点上的图片与说明
 */
function applyTemplateSwitch(templateId, existingNodes) {
  const template = getTemplateById(templateId)
  const mergedNodes = buildOrderAlbumNodes(template, existingNodes)
  return {
    templateId: template.id,
    templateName: template.name,
    templateSource: TEMPLATE_SOURCE.MANUAL,
    matchSource: MATCH_SOURCE.MANUAL,
    nodes: enrichOrderAlbumNodesForDisplay(mergedNodes),
    completeness: computeAlbumCompleteness(mergedNodes),
  }
}

function listOrderAlbumTemplateOptions() {
  return TEMPLATE_LIST.map((t) => ({
    id: t.id,
    name: t.name,
  }))
}

function normalizeOrderAlbumNodesForStorage(nodes) {
  return (nodes || []).map((n) => ({
    id: n.id,
    title: n.title,
    nodeType: n.nodeType,
    requiredLevel: n.requiredLevel,
    description: n.description || '',
    photoTips: n.photoTips || '',
    images: n.images || [],
    note: n.note || '',
    updatedAt: n.updatedAt || '',
    uploadStatus: n.uploadStatus || ((n.images || []).length ? 'uploaded' : 'pending'),
  }))
}

/**
 * 由模板生成节点实例，并与已有节点合并（保留 images/note/updatedAt）
 */
function buildOrderAlbumNodes(template, existingNodes) {
  const tpl = template && template.nodes ? template : ORDER_ALBUM_TEMPLATES.generic
  const existingMap = {}
  ;(existingNodes || []).forEach((node) => {
    if (node && node.id) existingMap[node.id] = node
  })

  return (tpl.nodes || []).map((def) => {
    const prev = existingMap[def.id] || {}
    const images = prev.images || []
    return {
      id: def.id,
      title: def.title,
      nodeType: def.nodeType,
      requiredLevel: def.requiredLevel,
      description: def.description || '',
      photoTips: def.photoTips || '',
      images,
      note: prev.note || '',
      updatedAt: prev.updatedAt || '',
      uploadStatus: images.length ? 'uploaded' : 'pending',
    }
  })
}

function isNodeFilled(node) {
  return Boolean(node && node.images && node.images.length > 0)
}

/**
 * 节点完整度 — 02 §4.3：推荐/必拍节点完成比例（不阻断履约）
 */
function computeAlbumCompleteness(nodes) {
  const list = nodes || []
  const tracked = list.filter(
    (n) =>
      n.requiredLevel === NODE_REQUIRED_LEVEL.REQUIRED ||
      n.requiredLevel === NODE_REQUIRED_LEVEL.RECOMMENDED
  )
  const total = tracked.length
  const completed = tracked.filter(isNodeFilled).length
  const score = total ? Math.round((completed / total) * 100) : 0
  let grade = '待完善'
  if (score >= 85) grade = '优'
  else if (score >= 60) grade = '良'
  else if (score >= 30) grade = '中'

  return {
    score,
    grade,
    totalRecommended: total,
    completedRecommended: completed,
    summaryText:
      total > 0
        ? `建议节点 ${completed}/${total} 已完成 · 完整度 ${score}%`
        : '暂无建议节点',
  }
}

function enrichOrderAlbumNodeForDisplay(node) {
  if (!node) return node
  const level = node.requiredLevel || NODE_REQUIRED_LEVEL.OPTIONAL
  return {
    ...node,
    requiredLevelLabel: NODE_REQUIRED_LEVEL_LABEL[level] || '可选',
    requiredLevelVariant: NODE_REQUIRED_LEVEL_TAG[level] || 'default',
    emptyText: '暂未上传，可按拍摄建议补充',
  }
}

function enrichOrderAlbumNodesForDisplay(nodes) {
  return (nodes || []).map(enrichOrderAlbumNodeForDisplay)
}

function buildOrderAlbumViewModel(order, storedAlbum) {
  const resolved = resolveTemplateForAlbum(order, storedAlbum)
  const mergedNodes = buildOrderAlbumNodes(
    resolved.template,
    (storedAlbum && storedAlbum.nodes) || []
  )
  const completeness = computeAlbumCompleteness(mergedNodes)
  return {
    templateId: resolved.templateId,
    templateName: resolved.templateName,
    matchSource: resolved.matchSource,
    templateSource: resolved.templateSource,
    nodes: enrichOrderAlbumNodesForDisplay(mergedNodes),
    completeness,
  }
}

module.exports = {
  MATCH_SOURCE,
  TEMPLATE_SOURCE,
  resolveOrderAlbumTemplate,
  resolveOrderAlbumTemplateForOrder,
  resolveTemplateForAlbum,
  buildOrderAlbumNodes,
  computeAlbumCompleteness,
  enrichOrderAlbumNodeForDisplay,
  enrichOrderAlbumNodesForDisplay,
  buildOrderAlbumViewModel,
  applyTemplateSwitch,
  listOrderAlbumTemplateOptions,
  normalizeOrderAlbumNodesForStorage,
  getTemplateById,
}
