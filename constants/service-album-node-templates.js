/**
 * 服务相册模板 · 四阶段标题（ALB-UX）
 * 新建：stage_1 / stage_2 / stage_5 / stage_6
 * 兼容：仍可解析旧 stage_3 / stage_4 标题
 */
const SERVICE_ALBUM_NODE_TITLES = {
  maintenance: ['接车记录', '检测记录', '施工过程', '完工检查'],
  major_maintenance: ['接车记录', '检测记录', '施工过程', '完工确认'],
  brake: ['接车记录', '检测记录', '施工过程', '试车检查'],
  battery: ['接车记录', '检测记录', '施工过程', '完工检查'],
  tire: ['接车记录', '检测记录', '施工过程', '动平衡/完工'],
  ac: ['接车记录', '检测记录', '施工过程', '完工测试'],
  body_paint: ['接车记录', '检测记录', '施工过程', '完工结果'],
  accident: ['接车记录', '检测记录', '施工过程', '完工验收'],
  default: ['接车记录', '检测记录', '施工过程', '完工交付'],
}

/** 新建相册阶段 ID（与 DEFAULT_STAGE_NODES 一致） */
const STAGE_IDS = ['stage_1', 'stage_2', 'stage_5', 'stage_6']

/** 含历史阶段，供兼容解析标题 */
const LEGACY_STAGE_IDS = [
  'stage_1',
  'stage_2',
  'stage_3',
  'stage_4',
  'stage_5',
  'stage_6',
]

const LEGACY_STAGE_TITLES = {
  stage_3: '方案与报价（历史）',
  stage_4: '配件/材料（历史）',
}

function resolveTemplateStageTitle(templateId, stageId) {
  if (LEGACY_STAGE_TITLES[stageId]) return LEGACY_STAGE_TITLES[stageId]
  const tplKey = String(templateId || '').trim() || 'default'
  const titles = SERVICE_ALBUM_NODE_TITLES[tplKey] || SERVICE_ALBUM_NODE_TITLES.default
  const index = STAGE_IDS.indexOf(stageId)
  if (index < 0) return ''
  return titles[index] || ''
}

function buildTemplateNodeTitleList(templateId) {
  const tplKey = String(templateId || '').trim() || 'default'
  return (SERVICE_ALBUM_NODE_TITLES[tplKey] || SERVICE_ALBUM_NODE_TITLES.default).slice()
}

module.exports = {
  SERVICE_ALBUM_NODE_TITLES,
  STAGE_IDS,
  LEGACY_STAGE_IDS,
  LEGACY_STAGE_TITLES,
  resolveTemplateStageTitle,
  buildTemplateNodeTitleList,
}
