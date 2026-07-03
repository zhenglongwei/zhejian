/**
 * B-SVC-06 · service_item_id → 服务相册节点模板（Phase 1 常量，对齐 PRD §10 / 02_相册模板与节点规则 §12.1）
 */
const { DEFAULT_STAGE_NODES } = require('./v2')
const { SERVICE_ALBUM_NODE_TITLES } = require('../../../constants/service-album-node-templates')

function makeStageNodes(templateId, requiredLevels) {
  const titles = SERVICE_ALBUM_NODE_TITLES[templateId] || SERVICE_ALBUM_NODE_TITLES.default
  return DEFAULT_STAGE_NODES.map((base, i) => ({
    nodeId: base.nodeId,
    title: titles[i] || base.title,
    sortOrder: base.sortOrder,
    requiredLevel: requiredLevels?.[i] || 'recommended',
  }))
}

/** @type {Record<string, { templateId: string, templateName: string, serviceItemId?: string, nodes: object[] }>} */
const ALBUM_NODE_TEMPLATES = {
  maintenance: {
    templateId: 'maintenance',
    templateName: '小保养',
    serviceItemId: 'item_maintenance',
    nodes: makeStageNodes('maintenance', ['optional', 'recommended', 'recommended', 'recommended', 'optional', 'recommended']),
  },
  major_maintenance: {
    templateId: 'major_maintenance',
    templateName: '大保养',
    nodes: makeStageNodes('major_maintenance', ['optional', 'recommended', 'recommended', 'recommended', 'optional', 'recommended']),
  },
  brake: {
    templateId: 'brake',
    templateName: '刹车片/刹车盘',
    serviceItemId: 'item_brake_pad',
    nodes: makeStageNodes('brake', ['optional', 'recommended', 'recommended', 'required', 'recommended', 'recommended']),
  },
  battery: {
    templateId: 'battery',
    templateName: '电瓶更换',
    serviceItemId: 'item_battery',
    nodes: makeStageNodes('battery', ['optional', 'recommended', 'recommended', 'recommended', 'optional', 'recommended']),
  },
  tire: {
    templateId: 'tire',
    templateName: '轮胎更换',
    nodes: makeStageNodes('tire', ['optional', 'recommended', 'recommended', 'recommended', 'recommended', 'recommended']),
  },
  ac: {
    templateId: 'ac',
    templateName: '空调服务',
    nodes: makeStageNodes('ac', ['optional', 'recommended', 'recommended', 'recommended', 'optional', 'recommended']),
  },
  body_paint: {
    templateId: 'body_paint',
    templateName: '钣喷修复',
    serviceItemId: 'item_body_paint',
    nodes: makeStageNodes('body_paint', ['recommended', 'recommended', 'recommended', 'recommended', 'optional', 'required']),
  },
  accident: {
    templateId: 'accident',
    templateName: '事故车维修',
    serviceItemId: 'item_accident',
    nodes: makeStageNodes('accident', ['recommended', 'required', 'required', 'recommended', 'optional', 'recommended']),
  },
  default: {
    templateId: 'default',
    templateName: '通用六阶段',
    nodes: DEFAULT_STAGE_NODES.map((n) => ({
      ...n,
      requiredLevel: 'recommended',
    })),
  },
}

const TEMPLATE_BY_ITEM_ID = Object.values(ALBUM_NODE_TEMPLATES).reduce((acc, tpl) => {
  if (tpl.serviceItemId) acc[tpl.serviceItemId] = tpl
  return acc
}, {})

/** PRD §12.1 关键词 → templateId（服务项目名无标准 item 时使用） */
const KEYWORD_TEMPLATE_RULES = [
  { templateId: 'major_maintenance', keywords: ['大保养', '火花塞', '变速箱油', '刹车油'] },
  { templateId: 'maintenance', keywords: ['机油', '机滤', '小保养', '保养'] },
  { templateId: 'brake', keywords: ['刹车片', '刹车盘', '刹车异响', '刹车'] },
  { templateId: 'battery', keywords: ['电瓶', '蓄电池', '无法启动'] },
  { templateId: 'tire', keywords: ['轮胎', '换胎', '补胎', '动平衡'] },
  { templateId: 'ac', keywords: ['空调', '冷媒', '滤芯', '异味'] },
  { templateId: 'body_paint', keywords: ['钣金', '喷漆', '划痕', '凹陷', '补漆', '钣喷'] },
  { templateId: 'accident', keywords: ['事故', '碰撞', '定损'] },
]

function normalizeServiceName(name) {
  return String(name || '').replace(/\s/g, '').toLowerCase()
}

function matchKeywordTemplate(serviceName) {
  const normalized = normalizeServiceName(serviceName)
  if (!normalized) return null
  for (const rule of KEYWORD_TEMPLATE_RULES) {
    if (rule.keywords.some((kw) => normalized.includes(kw.toLowerCase()))) {
      return ALBUM_NODE_TEMPLATES[rule.templateId] || null
    }
  }
  return null
}

function getTemplateNodeMetaMap(templateId) {
  const key = String(templateId || '').trim()
  const tpl = key ? ALBUM_NODE_TEMPLATES[key] : null
  if (!tpl || !Array.isArray(tpl.nodes)) return {}
  return tpl.nodes.reduce((acc, node) => {
    acc[node.nodeId] = node
    return acc
  }, {})
}

/**
 * @param {{ serviceItemId?: string, serviceName?: string }} input
 */
function resolveAlbumNodeTemplate(input = {}) {
  const serviceItemId = String(input.serviceItemId || '').trim()
  if (serviceItemId && serviceItemId !== 'item_custom') {
    const byItem = TEMPLATE_BY_ITEM_ID[serviceItemId]
    if (byItem) return { ...byItem }
  }

  const byKeyword = matchKeywordTemplate(input.serviceName)
  if (byKeyword) return { ...byKeyword }

  return { ...ALBUM_NODE_TEMPLATES.default }
}

function buildAlbumNodesFromTemplate(template) {
  const tpl = template || ALBUM_NODE_TEMPLATES.default
  return (tpl.nodes || ALBUM_NODE_TEMPLATES.default.nodes).map((n, i) => ({
    nodeId: n.nodeId,
    title: n.title,
    sortOrder: n.sortOrder != null ? n.sortOrder : i,
    status: 'pending',
    note: '',
  }))
}

function listServiceAlbumTemplateOptions() {
  return Object.values(ALBUM_NODE_TEMPLATES)
    .filter((tpl) => tpl.templateId && tpl.templateId !== 'default')
    .map((tpl) => ({ id: tpl.templateId, name: tpl.templateName }))
}

function getAlbumTemplateById(templateId) {
  const key = String(templateId || '').trim()
  if (!key || key === 'default') return null
  return ALBUM_NODE_TEMPLATES[key] || null
}

module.exports = {
  ALBUM_NODE_TEMPLATES,
  TEMPLATE_BY_ITEM_ID,
  resolveAlbumNodeTemplate,
  buildAlbumNodesFromTemplate,
  matchKeywordTemplate,
  getTemplateNodeMetaMap,
  listServiceAlbumTemplateOptions,
  getAlbumTemplateById,
}
