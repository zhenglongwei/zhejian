/**
 * 服务相册模板 × 六阶段 — 节点说明与拍摄指引（对齐 04/02_相册模板与节点规则 §11）
 */

const TEMPLATE_STAGE_META = {
  body_paint: {
    stage_1: {
      description: '各损伤部位远景，一处一图',
      photoTips: '拍清位置即可；近景放到下一节点。',
      requiredLevelLabel: '建议拍摄',
      requiredLevelVariant: 'info',
    },
    stage_2: {
      description: '各损伤点近景/特写',
      photoTips: '顺序与上一节点对应（第1张对第1处…）。',
      requiredLevelLabel: '建议拍摄',
      requiredLevelVariant: 'info',
    },
    stage_3: {
      description: '方案与费用留痕',
      photoTips: '方案截图；note 写明修复方式。',
    },
    stage_4: {
      description: '施工过程记录',
      photoTips: '过程照即可。',
    },
    stage_5: {
      description: '修复前/后分列上传，按序号配对',
      photoTips: '上方默认引用损伤评估；下方上传同序号修复后照片。',
      requiredLevelLabel: '必拍',
      requiredLevelVariant: 'danger',
    },
    stage_6: {
      description: '完工效果，与「损伤状态」同序同角',
      photoTips: '第1张对第1处…，用于车主端自动生成对比。',
      compareGuidance: '勿在中间插入照片打乱序号。',
      requiredLevelLabel: '建议拍摄',
      requiredLevelVariant: 'info',
    },
  },
  accident: {
    stage_1: {
      description: '接车登记：外观、里程与事故概况',
      photoTips: '四角、里程表、损伤远景；可用 OCR 识别车牌/VIN。',
      requiredLevelLabel: '建议拍摄',
      requiredLevelVariant: 'info',
    },
    stage_2: {
      description: '损伤检测（近景/读数）',
      photoTips: '顺序与后续「完工验收」对应。',
      requiredLevelLabel: '必拍',
      requiredLevelVariant: 'danger',
    },
    stage_3: {
      description: '维修方案与费用确认',
      photoTips: '方案截图；note 写检测结论。',
      requiredLevelLabel: '必拍',
      requiredLevelVariant: 'danger',
    },
    stage_4: {
      description: '',
      photoTips: '根据维修方案拍摄新配件的包装、编码、note标类型等',
    },
    stage_5: {
      description: '修复施工过程',
      photoTips: '过程照即可。',
      compareGuidance: '对比看接车记录 ↔ 完工验收，本节点不参与自动对比。',
    },
    stage_6: {
      description: '完工验收',
      photoTips: '与接车/检测同序重拍各损伤部位。',
      compareGuidance: '角度尽量一致，否则对比会错位。',
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
  }
}

module.exports = {
  TEMPLATE_STAGE_META,
  getTemplateStageMetaMap,
  resolveTemplateStageMeta,
  applyTemplateStageMeta,
}
