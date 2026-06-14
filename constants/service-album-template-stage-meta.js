/**
 * 服务相册模板 × 六阶段 — 节点说明与拍摄指引（对齐 04/02_相册模板与节点规则 §11）
 * 商家端优先于通用 SERVICE_ALBUM_STAGES 默认文案。
 */

const TEMPLATE_STAGE_META = {
  body_paint: {
    stage_1: {
      description: '记录各损伤部位在进店时的整体状态（远景为主，一处一图）',
      photoTips:
        '每个损伤部位拍 1 张远景，尽量包含周边参照（门把手/灯框等）。此处拍「在哪、长什么样」，近景特写请到下一节点「损伤评估」。',
      requiredLevelLabel: '建议拍摄',
      requiredLevelVariant: 'info',
    },
    stage_2: {
      description: '逐处补充损伤细节，供评估与方案说明引用',
      photoTips:
        '与「损伤状态」顺序对应：第 1 张近景对应第 1 处远景，第 2 张对应第 2 处……可在此节点 note 填写损伤类型/深度。',
      requiredLevelLabel: '建议拍摄',
      requiredLevelVariant: 'info',
    },
    stage_3: {
      description: '记录修复方案、部位与费用说明',
      photoTips: '可上传方案确认截图；note 中写明修复方式（钣金/喷漆/补漆等）。',
    },
    stage_4: {
      description: '记录施工过程（打磨、遮蔽、喷漆等）',
      photoTips: '过程记录即可，不要求与损伤点一一对应。',
    },
    stage_5: {
      description: '可选：在本节点直接上传「同位置修复前/后」成对照片',
      photoTips:
        '同一位置先传修复前、再传修复后（第 1 张前、第 2 张后；第 3 张前、第 4 张后……）。须尽量与「损伤状态/完工结果」同角度，否则车主端对比会错位。',
      compareGuidance:
        '本节点为快捷对照：按「前→后→前→后」顺序上传。若已在「损伤状态 + 完工结果」按同序拍齐，可不重复上传；上传顺序弄乱时，请删除重传或改在 note 标明对应关系。',
      requiredLevelLabel: '必拍',
      requiredLevelVariant: 'danger',
    },
    stage_6: {
      description: '修复完工后的最终效果（与「损伤状态」同序、同角度）',
      photoTips:
        '与「损伤状态」一一对应：第 1 张对第 1 处、第 2 张对第 2 处……车主端将按序号自动生成前后对比滑块（最多展示 6 组）。',
      compareGuidance:
        '务必与「损伤状态」保持相同拍摄顺序与角度；新增损伤请同时在 stage_1 与 stage_6 末尾各补 1 张，不要插入中间打乱序号。',
      requiredLevelLabel: '建议拍摄',
      requiredLevelVariant: 'info',
    },
  },
  accident: {
    stage_1: {
      description: '接车登记：外观、里程与事故概况',
      photoTips: '拍摄车辆四角、里程表、事故部位远景；车牌/VIN 可使用下方 OCR 识别。',
      requiredLevelLabel: '建议拍摄',
      requiredLevelVariant: 'info',
    },
    stage_2: {
      description: '拆检前/后的损伤检测与 Hidden damage 记录',
      photoTips:
        '与接车远景区分：此处拍损伤近景、测量尺/检测仪读数；一处损伤一张，顺序与后续「完工验收」对应。',
      requiredLevelLabel: '必拍',
      requiredLevelVariant: 'danger',
    },
    stage_3: {
      description: '维修方案与费用确认留痕',
      photoTips: '方案单或沟通记录截图；事故车不在线上报价，note 说明检测结论即可。',
      requiredLevelLabel: '必拍',
      requiredLevelVariant: 'danger',
    },
    stage_4: {
      description: '配件/材料告知与凭证',
      photoTips: '新件包装、编码；note 标明标准类型。',
    },
    stage_5: {
      description: '修复施工过程记录',
      photoTips:
        '过程照即可。若需车主端前后对比，请在「接车记录」与「完工验收」按同序、同角度各拍一组，或成对上传（前→后→前→后）。',
      compareGuidance:
        '事故车对比依赖「接车记录 ↔ 完工验收」同序号照片；本节点过程图不参与自动对比。',
    },
    stage_6: {
      description: '完工验收：修复结果与交车检查',
      photoTips:
        '与「接车记录/损伤检测」同序重拍各损伤部位；第 1 张对第 1 处……便于车主查看修复前后差异。',
      compareGuidance:
        '验收照顺序须与接车/检测阶段一致；角度尽量一致，否则对比滑块会错位。',
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
