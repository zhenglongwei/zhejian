/**
 * 服务相册阶段（ALB-UX · 四阶段）
 * 新建：接车 → 检测 → 施工 → 完工
 * 存量六段（含 stage_3/4）仍可通过 LEGACY 元数据读取标题
 */
const { STAGE_IDS, LEGACY_STAGE_TITLES } = require('./service-album-node-templates')

const SERVICE_ALBUM_STAGES = [
  {
    id: 'stage_1',
    title: '接车记录',
    description: '记录进店外观、车架号、里程与故障描述',
    photoTips: '建议拍摄外观、车架号（VIN）、仪表里程表、故障部位',
    notePlaceholder: '描述故障现象或客户需求，如异响、漏油、保养项目',
    requiredLevelLabel: '',
    requiredLevelVariant: 'default',
  },
  {
    id: 'stage_2',
    title: '检测记录',
    description: '记录检测过程与诊断结论',
    photoTips: '建议拍摄故障点、检测仪器读数等',
    notePlaceholder: '填写检查结论或诊断说明，可附检测图',
    requiredLevelLabel: '',
    requiredLevelVariant: 'default',
  },
  {
    id: 'stage_5',
    title: '施工过程',
    description: '记录施工关键环节、材料与新旧件对比',
    photoTips: '建议拍摄拆卸、安装、配件包装编码、新旧件同框等过程图；每张可写备注',
    notePlaceholder: '补充施工过程说明（选填；细项说明优先写在各图备注）',
    requiredLevelLabel: '',
    requiredLevelVariant: 'default',
  },
  {
    id: 'stage_6',
    title: '完工交付',
    description: '完工展示、结算与质保说明',
    photoTips: '建议拍摄完工效果；结算单、质保承诺书可上传至本阶段单据槽',
    notePlaceholder:
      '示例：短途试车异响消失，旧件已交还对照；踏板行程正常。（验收结论 / 旧件交接 / 勿写金额）',
    requiredLevelLabel: '',
    requiredLevelVariant: 'default',
  },
]

/** 历史方案/配件节点（仅存量相册展示） */
const LEGACY_SERVICE_ALBUM_STAGES = [
  {
    id: 'stage_3',
    title: LEGACY_STAGE_TITLES.stage_3 || '方案与报价（历史）',
    description: '历史方案节点（新建相册已取消）',
    photoTips: '',
    notePlaceholder: '历史说明',
    requiredLevelLabel: '',
    requiredLevelVariant: 'default',
  },
  {
    id: 'stage_4',
    title: LEGACY_STAGE_TITLES.stage_4 || '配件/材料（历史）',
    description: '历史配件节点（新建相册已取消）',
    photoTips: '',
    notePlaceholder: '历史说明',
    requiredLevelLabel: '',
    requiredLevelVariant: 'default',
  },
]

const ALL_STAGE_META = [...SERVICE_ALBUM_STAGES, ...LEGACY_SERVICE_ALBUM_STAGES]

function buildEmptyStageNodes() {
  return SERVICE_ALBUM_STAGES.map((stage) => ({
    id: stage.id,
    title: stage.title,
    status: 'pending',
    images: [],
    note: '',
    updatedAt: '',
  }))
}

function getStageMeta(stageId) {
  return ALL_STAGE_META.find((s) => s.id === stageId) || null
}

/**
 * 编辑页阶段列表：新建四段；若相册仍含 stage_3/4 则插入历史节点
 */
function resolveStagesForAlbumNodes(nodes = []) {
  const ids = new Set(
    (nodes || []).map((n) => String((n && (n.id || n.nodeId)) || '')).filter(Boolean),
  )
  const hasLegacy = ids.has('stage_3') || ids.has('stage_4')
  if (!hasLegacy) return SERVICE_ALBUM_STAGES.slice()

  const out = []
  SERVICE_ALBUM_STAGES.forEach((stage) => {
    out.push(stage)
    if (stage.id === 'stage_2') {
      if (ids.has('stage_3')) {
        out.push(LEGACY_SERVICE_ALBUM_STAGES.find((s) => s.id === 'stage_3'))
      }
      if (ids.has('stage_4')) {
        out.push(LEGACY_SERVICE_ALBUM_STAGES.find((s) => s.id === 'stage_4'))
      }
    }
  })
  return out.filter(Boolean)
}

module.exports = {
  SERVICE_ALBUM_STAGES,
  LEGACY_SERVICE_ALBUM_STAGES,
  STAGE_IDS,
  buildEmptyStageNodes,
  getStageMeta,
  resolveStagesForAlbumNodes,
}
