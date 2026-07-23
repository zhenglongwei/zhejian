/**
 * 服务相册模板 × 六阶段 — 节点说明与拍摄指引（对齐 04/02_相册模板与节点规则 §11）
 */

/** PV-REFORM · 单上传自动分流：阶段级公示/留档提示 */
const STAGE_PUBLIC_UPLOAD_HINTS = {
  stage_1: '本阶段照片仅用于留档，不会进入公示。',
  stage_2: '建议拍损伤近景；含车牌或整车全景的图仅留档。',
  stage_3: '报价单照片仅留档；公开展示方案文字与配件名（不展示金额），请填写方案说明。',
  stage_4: '建议拍零件/包装特写；含个人信息单据整页仅留档。避免钥匙、人脸。',
  stage_5: '建议拍施工细节、防护与扭矩打卡；避免车牌、钥匙、人员正脸。',
  stage_6: '建议拍修复局部与旧件交接；避免整车外观与环境照。',
}

const TEMPLATE_STAGE_META = {
  body_paint: {
    stage_1: {
      description: '各损伤部位远景，一处一图',
      photoTips: '拍清位置即可；近景放到检测记录。',
      requiredLevelLabel: '建议拍摄',
      requiredLevelVariant: 'info',
    },
    stage_2: {
      description: '各损伤点近景/特写',
      photoTips: '顺序与完工结果对比组对应（第1张对第1组…）。',
      requiredLevelLabel: '建议拍摄',
      requiredLevelVariant: 'info',
    },
    stage_3: {
      description: '方案与费用留痕',
      photoTips: '',
    },
    stage_4: {
      description: '登记本次使用的辅料/材料',
      photoTips: '包装、标签、批次等凭证图；有方案目录时可从报价单识别。',
    },
    stage_5: {
      description: '施工过程记录',
      photoTips: '建议拍摄拆卸、修复、安装等关键环节。',
    },
    stage_6: {
      description: '完工效果，组织前后对比组',
      photoTips: '与检测记录同序同角上传修复后照片，便于车主端对比。',
      compareGuidance:
        '建议按行上传一一对应的完工效果与维修前照片；完整配对可在车主端生成对比效果，维修前可留空。也可点「从检测记录填入维修前」按序同步。',
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
      description: '检测记录（近景/读数）',
      photoTips: '顺序与后续「完工验收」对应。',
      requiredLevelLabel: '必拍',
      requiredLevelVariant: 'danger',
    },
    stage_3: {
      description: '维修方案与费用确认',
      photoTips: '',
      requiredLevelLabel: '必拍',
      requiredLevelVariant: 'danger',
    },
    stage_4: {
      description: '',
      photoTips: '根据维修方案拍摄新配件的包装、编码等凭证图',
    },
    stage_5: {
      description: '修复施工过程',
      photoTips: '建议拍摄拆卸、修复、安装等关键环节。',
    },
    stage_6: {
      description: '完工验收',
      photoTips: '与接车/检测同序重拍各损伤部位。',
      compareGuidance:
        '建议按行上传一一对应的完工效果与维修前照片；完整配对可在车主端生成对比效果，维修前可留空。',
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
