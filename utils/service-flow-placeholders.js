/**
 * 商家端填写占位：按服务类目给短例子（不是界面说明书）。
 * 类目对齐 17_ / 28_；相册模板钣喷 id 为 `paint`，与清单 `body_paint` 同义。
 */
const TEMPLATE_TO_CATEGORY = {
  maintenance: 'maintenance',
  major_maintenance: 'major_maintenance',
  brake: 'brake',
  battery: 'battery',
  tire: 'tire',
  ac: 'ac',
  body_paint: 'body_paint',
  paint: 'body_paint',
  accident: 'accident',
  chassis_noise: 'chassis_noise',
}

const NAME_RULES = [
  { category: 'major_maintenance', pattern: /大保养|火花塞|变速箱油/ },
  { category: 'maintenance', pattern: /小保养|机油|机滤|常规保养/ },
  { category: 'brake', pattern: /刹车|制动/ },
  { category: 'battery', pattern: /电瓶|蓄电池|亏电|打不着/ },
  { category: 'tire', pattern: /轮胎|换胎|补胎|胎压/ },
  { category: 'ac', pattern: /空调|冷媒|蒸发箱/ },
  { category: 'body_paint', pattern: /钣金|喷漆|划痕|凹陷|补漆|钣喷/ },
  { category: 'accident', pattern: /事故|定损|碰撞/ },
  { category: 'chassis_noise', pattern: /异响|胶套|摆臂|减震|底盘响/ },
]

const PLACEHOLDERS = {
  maintenance: {
    chiefComplaint: '例：到店保养，里程 86500',
    findingPart: '例：机油',
    findingAdvice: '例：机油发黑有杂质',
    quoteNote: '例：更换机油机滤',
    workCaption: '例：机油 5W-30，机滤一并更换',
  },
  major_maintenance: {
    chiefComplaint: '例：到店大保，里程 86500',
    findingPart: '例：空滤',
    findingAdvice: '例：空滤积灰明显',
    quoteNote: '例：更换空滤、火花塞',
    workCaption: '例：空滤已更换，火花塞按手册扭矩',
  },
  brake: {
    chiefComplaint: '例：刹车异响，到店检查',
    findingPart: '例：前刹车片',
    findingAdvice: '例：前外侧片厚约 3mm',
    quoteNote: '例：更换前刹车片',
    workCaption: '例：已按规定扭矩紧固',
  },
  battery: {
    chiefComplaint: '例：亏电打不着',
    findingPart: '例：电瓶',
    findingAdvice: '例：电压 11.8V，桩头有氧化',
    quoteNote: '例：更换电瓶',
    workCaption: '例：型号匹配，桩头已紧固',
  },
  tire: {
    chiefComplaint: '例：右前胎鼓包',
    findingPart: '例：右前轮胎',
    findingAdvice: '例：胎侧鼓包，花纹剩余约 3mm',
    quoteNote: '例：更换右前轮胎',
    workCaption: '例：规格一致，已做动平衡',
  },
  ac: {
    chiefComplaint: '例：空调不制冷',
    findingPart: '例：空调滤芯',
    findingAdvice: '例：滤芯发黑，出风偏弱',
    quoteNote: '例：更换空调滤芯',
    workCaption: '例：新旧滤已更换',
  },
  body_paint: {
    chiefComplaint: '例：右前门刮擦补漆',
    findingPart: '例：右前门',
    findingAdvice: '例：中度划痕，漆膜已破',
    quoteNote: '例：本板局部补漆',
    workCaption: '例：本板打磨后局部补漆',
  },
  accident: {
    chiefComplaint: '例：右前碰撞，到店维修',
    findingPart: '例：右前翼子板',
    findingAdvice: '例：翼子板凹陷，大灯完好',
    quoteNote: '例：更换翼子板并喷漆',
    workCaption: '例：翼子板已更换，缝隙已校',
  },
  chassis_noise: {
    chiefComplaint: '例：过减速带右前异响',
    findingPart: '例：右前下摆臂胶套',
    findingAdvice: '例：胶套开裂，路试可复现',
    quoteNote: '例：更换右前下摆臂胶套',
    workCaption: '例：胶套已压装，力矩已打卡',
  },
  generic: {
    chiefComplaint: '例：到店检查异响',
    findingPart: '例：检查部位',
    findingAdvice: '例：该部位有可见磨损',
    quoteNote: '例：按检测结果处理该部位',
    workCaption: '例：已按规范安装',
  },
}

function resolveFlowCategory(templateId, serviceName) {
  const raw = String(templateId || '').trim()
  if (TEMPLATE_TO_CATEGORY[raw]) return TEMPLATE_TO_CATEGORY[raw]
  const name = String(serviceName || '')
  for (let i = 0; i < NAME_RULES.length; i += 1) {
    if (NAME_RULES[i].pattern.test(name)) return NAME_RULES[i].category
  }
  return 'generic'
}

function getFlowPlaceholders(templateId, serviceName) {
  const category = resolveFlowCategory(templateId, serviceName)
  const row = PLACEHOLDERS[category] || PLACEHOLDERS.generic
  return {
    category,
    chiefComplaint: row.chiefComplaint,
    findingPart: row.findingPart,
    findingAdvice: row.findingAdvice,
    findingAdviceOk: '无需处理',
    quoteNote: row.quoteNote,
    workCaption: row.workCaption,
  }
}

module.exports = {
  resolveFlowCategory,
  getFlowPlaceholders,
}
