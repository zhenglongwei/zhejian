/**
 * 服务相册六阶段 — Phase 1（对齐 04/02_相册模板与节点规则.md §2.1）
 */
const SERVICE_ALBUM_STAGES = [
  {
    id: 'stage_1',
    title: '接车记录',
    description: '记录进店外观、里程与故障描述',
    photoTips: '建议拍摄外观、里程表、故障部位',
    notePlaceholder: '描述故障现象或客户需求，如异响、漏油、保养项目',
    requiredLevelLabel: '',
    requiredLevelVariant: 'default',
  },
  {
    id: 'stage_2',
    title: '检测诊断',
    description: '记录检测过程与诊断结论',
    photoTips: '建议拍摄故障点、检测仪器读数',
    notePlaceholder: '填写检查结论或诊断说明，可附检测图',
    requiredLevelLabel: '',
    requiredLevelVariant: 'default',
  },
  {
    id: 'stage_3',
    title: '方案与报价',
    description: '记录本次维修方案与实际费用',
    photoTips: '可上传报价单或方案说明截图',
    notePlaceholder: '说明维修方案与费用依据，或在下方填写报价金额',
    requiredLevelLabel: '',
    requiredLevelVariant: 'default',
  },
  {
    id: 'stage_4',
    title: '配件告知',
    description: '',
    photoTips: '根据维修方案拍摄新配件的包装、编码、note标类型等',
    notePlaceholder: '可补充配件品牌、编码或更换说明（选填）',
    requiredLevelLabel: '',
    requiredLevelVariant: 'default',
  },
  {
    id: 'stage_5',
    title: '施工记录',
    description: '记录施工过程与新旧件对比',
    photoTips: '建议拍摄拆卸前后、新旧对比、安装完成',
    notePlaceholder: '补充施工过程或新旧件对比说明（选填）',
    requiredLevelLabel: '',
    requiredLevelVariant: 'default',
  },
  {
    id: 'stage_6',
    title: '完工交付',
    description: '完工展示、试车说明与交付检查',
    photoTips: '建议拍摄完工效果、试车相关说明',
    notePlaceholder: '说明试车/交付结果与完工确认，便于生成可引用摘要',
    requiredLevelLabel: '',
    requiredLevelVariant: 'default',
  },
]

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
  return SERVICE_ALBUM_STAGES.find((s) => s.id === stageId) || null
}

module.exports = {
  SERVICE_ALBUM_STAGES,
  buildEmptyStageNodes,
  getStageMeta,
}
