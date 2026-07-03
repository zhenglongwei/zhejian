/**
 * 服务相册模板 · 六阶段标题（前后端/mock 共用）
 * stage_2 统一「检测记录」；stage_4「配件/材料凭证」；stage_5「施工过程」
 */
const SERVICE_ALBUM_NODE_TITLES = {
  maintenance: ['接车记录', '检测记录', '保养方案', '配件/材料凭证', '施工过程', '完工检查'],
  major_maintenance: ['接车记录', '检测记录', '保养方案', '配件/材料凭证', '施工过程', '完工确认'],
  brake: ['接车记录', '检测记录', '维修方案', '配件/材料凭证', '施工过程', '试车检查'],
  battery: ['接车记录', '检测记录', '更换方案', '配件/材料凭证', '施工过程', '完工检查'],
  tire: ['接车记录', '检测记录', '更换方案', '配件/材料凭证', '施工过程', '动平衡/完工'],
  ac: ['接车记录', '检测记录', '维修方案', '配件/材料凭证', '施工过程', '完工测试'],
  body_paint: ['接车记录', '检测记录', '修复方案', '配件/材料凭证', '施工过程', '完工结果'],
  accident: ['接车记录', '检测记录', '维修方案', '配件/材料凭证', '施工过程', '完工验收'],
  default: ['接车记录', '检测记录', '方案与报价', '配件/材料凭证', '施工过程', '完工交付'],
}

const STAGE_IDS = [
  'stage_1',
  'stage_2',
  'stage_3',
  'stage_4',
  'stage_5',
  'stage_6',
]

function resolveTemplateStageTitle(templateId, stageId) {
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
  resolveTemplateStageTitle,
  buildTemplateNodeTitleList,
}
