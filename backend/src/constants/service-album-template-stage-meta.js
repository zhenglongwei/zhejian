/**
 * 服务相册模板 × 六阶段 — 节点说明与拍摄指引（对齐 04/02_相册模板与节点规则 §11）
 * 编辑页提示精简：闸门文案不在此念；节点只留短 description。
 */

/** 历史字段保留为空：闸门仍由后端处理，商家编辑 UI 不再展示留档/公示话术 */
const STAGE_PUBLIC_UPLOAD_HINTS = {
  stage_1: '',
  stage_2: '',
  stage_3: '',
  stage_4: '',
  stage_5: '',
  stage_6: '',
}

const TEMPLATE_STAGE_META = {
  body_paint: {
    stage_1: {
      description: '损伤部位远景，一处一图',
      photoTips: '',
      requiredLevelLabel: '建议拍摄',
      requiredLevelVariant: 'info',
    },
    stage_2: {
      description: '损伤近景，顺序对应完工对照',
      photoTips: '',
      requiredLevelLabel: '建议拍摄',
      requiredLevelVariant: 'info',
    },
    stage_3: {
      description: '填写方案说明（报价单可附图）',
      photoTips: '',
    },
    stage_4: {
      description: '包装、标签等材料凭证',
      photoTips: '',
    },
    stage_5: {
      description: '遮蔽与关键工序',
      photoTips: '',
    },
    stage_6: {
      description: '完工效果对照',
      photoTips: '',
      compareGuidance: '',
      requiredLevelLabel: '建议拍摄',
      requiredLevelVariant: 'info',
    },
  },
  accident: {
    stage_1: {
      description: '外观、里程与事故概况',
      photoTips: '',
      requiredLevelLabel: '建议拍摄',
      requiredLevelVariant: 'info',
    },
    stage_2: {
      description: '损伤近景与检测读数',
      photoTips: '',
      requiredLevelLabel: '必拍',
      requiredLevelVariant: 'danger',
    },
    stage_3: {
      description: '维修方案说明',
      photoTips: '',
      requiredLevelLabel: '必拍',
      requiredLevelVariant: 'danger',
    },
    stage_4: {
      description: '新配件包装与编码凭证',
      photoTips: '',
    },
    stage_5: {
      description: '拆卸、修复、安装关键环节',
      photoTips: '',
    },
    stage_6: {
      description: '完工验收对照',
      photoTips: '',
      compareGuidance: '',
      requiredLevelLabel: '建议拍摄',
      requiredLevelVariant: 'info',
    },
  },
}

function getTemplateStageMetaMap(templateId) {
  const key = String(templateId || '').trim()
  return TEMPLATE_STAGE_META[key] || {}
}

function resolveTemplateStageMeta(templateId, stageId) {
  const map = getTemplateStageMetaMap(templateId)
  return map[stageId] || null
}

function applyTemplateStageMeta(templateId, stageId, base = {}) {
  const meta = resolveTemplateStageMeta(templateId, stageId)
  if (!meta) return { ...base }
  return {
    ...base,
    description: meta.description || base.description || '',
    photoTips: meta.photoTips || base.photoTips || '',
    compareGuidance: meta.compareGuidance || base.compareGuidance || '',
    requiredLevelLabel: meta.requiredLevelLabel || base.requiredLevelLabel || '',
    requiredLevelVariant: meta.requiredLevelVariant || base.requiredLevelVariant || 'default',
    publicUploadHint: STAGE_PUBLIC_UPLOAD_HINTS[stageId] || '',
  }
}

module.exports = {
  TEMPLATE_STAGE_META,
  STAGE_PUBLIC_UPLOAD_HINTS,
  getTemplateStageMetaMap,
  resolveTemplateStageMeta,
  applyTemplateStageMeta,
}
