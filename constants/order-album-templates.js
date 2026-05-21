/**
 * 订单相册模板 — 对齐 docs/04_维修过程相册/02_相册模板与节点规则.md
 * 用于平台订单相册；历史案例仍用 constants/album.js
 */
const {
  NODE_REQUIRED_LEVEL,
  NODE_TYPE,
} = require('./order-album-node')

function n(id, title, opts = {}) {
  return {
    id,
    title,
    nodeType: opts.nodeType || NODE_TYPE.OTHER,
    requiredLevel: opts.requiredLevel || NODE_REQUIRED_LEVEL.OPTIONAL,
    description: opts.description || '',
    photoTips: opts.photoTips || '',
  }
}

const ORDER_ALBUM_TEMPLATES = {
  maintenance: {
    id: 'maintenance',
    name: '小保养',
    serviceKeywords: ['小保养', '机油', '机滤', '常规保养', '基础检测'],
    nodes: [
      n('vehicle_arrival', '到店车辆', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '展示车辆到店及工位状态',
        photoTips: '可拍工位全景，注意遮挡或避开车牌',
      }),
      n('mileage', '里程记录', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '记录保养里程',
        photoTips: '拍摄仪表里程，避免拍到 VIN 或完整车牌',
      }),
      n('old_oil', '旧机油状态', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '展示放出的旧机油状态',
        photoTips: '拍摄机油颜色和刻度，适合前后对比',
      }),
      n('oil_material', '机油/滤芯材料', {
        nodeType: NODE_TYPE.PARTS,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '展示本次使用的机油与滤芯',
        photoTips: '拍摄包装标签，展示品牌与规格',
      }),
      n('process', '更换过程', {
        nodeType: NODE_TYPE.PROCESS,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '放油、换滤芯、加注等过程',
        photoTips: '可拍关键步骤，无需每张都拍',
      }),
      n('check', '完工检查', {
        nodeType: NODE_TYPE.CHECK,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '液位、发动机舱检查',
        photoTips: '拍摄机油尺液位或机舱检查状态',
      }),
      n('advice', '保养建议', {
        nodeType: NODE_TYPE.OTHER,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '下次保养时间/里程建议',
        photoTips: '可文字说明，也可拍手写建议单（注意脱敏）',
      }),
    ],
  },
  major_maintenance: {
    id: 'major_maintenance',
    name: '大保养',
    serviceKeywords: ['大保养', '火花塞', '变速箱油', '刹车油', '防冻液', '综合检测'],
    nodes: [
      n('vehicle_arrival', '到店车辆', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '车辆到店',
      }),
      n('mileage', '里程记录', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '当前保养里程',
        photoTips: '拍摄仪表，避免 VIN 与车牌',
      }),
      n('parts_overview', '更换项目总览', {
        nodeType: NODE_TYPE.PARTS,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '展示本次更换材料',
      }),
      n('old_parts', '旧件状态', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '空滤、空调滤、火花塞等旧件',
        photoTips: '适合拍摄新旧对比',
      }),
      n('parts_compare', '新旧件对比', {
        nodeType: NODE_TYPE.PARTS,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '新旧配件对比',
      }),
      n('fluid_process', '油液更换过程', {
        nodeType: NODE_TYPE.PROCESS,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '刹车油、防冻液等更换过程',
      }),
      n('inspection', '检测结果', {
        nodeType: NODE_TYPE.CHECK,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '基础检测或电脑检测结果',
        photoTips: '检测设备界面注意隐藏 VIN',
      }),
      n('done_check', '完工确认', {
        nodeType: NODE_TYPE.AFTER,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '完工后检查',
      }),
      n('advice', '保养建议', {
        nodeType: NODE_TYPE.OTHER,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '下次维护建议',
      }),
    ],
  },
  brake: {
    id: 'brake',
    name: '刹车片/刹车盘',
    serviceKeywords: ['刹车片', '刹车盘', '刹车异响', '制动'],
    nodes: [
      n('vehicle_arrival', '车辆到店', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '车辆及工位',
        photoTips: '注意车牌脱敏',
      }),
      n('old_pad', '旧刹车片状态', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '展示磨损厚度',
        photoTips: '近景拍摄刹车片厚度，适合前后对比',
      }),
      n('rotor', '刹车盘状态', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '展示沟槽、磨损、变形等',
      }),
      n('new_parts', '新配件展示', {
        nodeType: NODE_TYPE.PARTS,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '新刹车片/刹车盘',
      }),
      n('parts_compare', '新旧对比', {
        nodeType: NODE_TYPE.PARTS,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '新旧刹车片或刹车盘对比',
      }),
      n('install', '安装过程', {
        nodeType: NODE_TYPE.PROCESS,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '安装细节',
      }),
      n('done_check', '完工检查', {
        nodeType: NODE_TYPE.AFTER,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '安装后状态',
      }),
      n('road_test', '试车/确认', {
        nodeType: NODE_TYPE.CHECK,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '刹车测试或说明',
      }),
    ],
  },
  battery: {
    id: 'battery',
    name: '电瓶更换',
    serviceKeywords: ['电瓶', '蓄电池', '无法启动', '启动困难'],
    nodes: [
      n('old_test', '旧电瓶检测', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '展示检测仪结果',
        photoTips: '检测仪界面注意隐藏 VIN',
      }),
      n('old_battery', '旧电瓶状态', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '展示原电瓶',
      }),
      n('new_battery', '新电瓶信息', {
        nodeType: NODE_TYPE.PARTS,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '展示新电瓶品牌型号',
      }),
      n('parts_compare', '新旧对比', {
        nodeType: NODE_TYPE.PARTS,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '新旧电瓶对比',
      }),
      n('install', '安装过程', {
        nodeType: NODE_TYPE.PROCESS,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '安装固定、电极连接',
      }),
      n('start_test', '启动测试', {
        nodeType: NODE_TYPE.CHECK,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '完工测试',
      }),
      n('notice', '注意事项', {
        nodeType: NODE_TYPE.OTHER,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '启停匹配、质保说明',
      }),
    ],
  },
  tire: {
    id: 'tire',
    name: '轮胎更换',
    serviceKeywords: ['轮胎', '换胎', '补胎', '动平衡', '胎压'],
    nodes: [
      n('old_tire', '旧轮胎状态', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '磨损、裂纹、鼓包等',
      }),
      n('tire_spec', '轮胎规格', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '展示尺寸规格',
        photoTips: '拍摄胎侧规格标识',
      }),
      n('new_tire', '新轮胎展示', {
        nodeType: NODE_TYPE.PARTS,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '新轮胎品牌、花纹',
      }),
      n('parts_compare', '新旧对比', {
        nodeType: NODE_TYPE.PARTS,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '新旧轮胎对比',
      }),
      n('install', '安装过程', {
        nodeType: NODE_TYPE.PROCESS,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '拆装、扒胎、充气',
      }),
      n('balance', '动平衡', {
        nodeType: NODE_TYPE.CHECK,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '动平衡过程',
      }),
      n('done', '安装完成', {
        nodeType: NODE_TYPE.AFTER,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '完成状态',
      }),
      n('pressure', '胎压确认', {
        nodeType: NODE_TYPE.CHECK,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '胎压检查',
      }),
    ],
  },
  ac: {
    id: 'ac',
    name: '空调服务',
    serviceKeywords: ['空调', '冷媒', '滤芯', '异味', '蒸发箱'],
    nodes: [
      n('fault', '故障描述', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '异味、不制冷等',
      }),
      n('old_filter', '旧空调滤芯', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '展示脏污状态',
      }),
      n('new_filter', '新空调滤芯', {
        nodeType: NODE_TYPE.PARTS,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '展示新滤芯',
      }),
      n('filter_compare', '新旧滤芯对比', {
        nodeType: NODE_TYPE.PARTS,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '新旧滤芯对比',
      }),
      n('clean', '清洗过程', {
        nodeType: NODE_TYPE.PROCESS,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '管路、蒸发箱清洗',
      }),
      n('refrigerant', '冷媒检测/加注', {
        nodeType: NODE_TYPE.CHECK,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '压力表、加注过程',
        photoTips: '注意隐藏车辆识别信息',
      }),
      n('done_test', '完工测试', {
        nodeType: NODE_TYPE.AFTER,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '出风、制冷测试',
      }),
      n('advice', '使用建议', {
        nodeType: NODE_TYPE.OTHER,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '后续使用建议',
      }),
    ],
  },
  paint: {
    id: 'paint',
    name: '钣喷修复',
    serviceKeywords: ['钣金', '喷漆', '划痕', '凹陷', '补漆', '钣喷'],
    nodes: [
      n('damage_far', '损伤部位远景', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '展示损伤所在位置',
        photoTips: '注意车牌与完整车身脱敏',
      }),
      n('damage_near', '损伤部位近景', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '展示划痕、凹陷、破损',
      }),
      n('damage_angles', '多角度损伤', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '侧面、斜角、近景',
      }),
      n('prep', '拆卸/打磨', {
        nodeType: NODE_TYPE.PROCESS,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '拆件、打磨、补土等过程',
      }),
      n('paint_process', '喷漆过程', {
        nodeType: NODE_TYPE.PROCESS,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '喷漆房或局部喷涂',
      }),
      n('done_near', '完工近景', {
        nodeType: NODE_TYPE.AFTER,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '修复后近景',
      }),
      n('done_far', '完工远景', {
        nodeType: NODE_TYPE.AFTER,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '维修部位整体效果',
      }),
      n('color_check', '色差检查', {
        nodeType: NODE_TYPE.CHECK,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '色差对比或自然光检查',
      }),
      n('warranty', '质保说明', {
        nodeType: NODE_TYPE.OTHER,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '漆面质保和注意事项',
      }),
    ],
  },
  accident: {
    id: 'accident',
    name: '事故车维修',
    serviceKeywords: ['事故车', '事故', '定损', '碰撞'],
    nodes: [
      n('damage_exterior', '事故损伤外观', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '多角度展示损伤',
        photoTips: '公开展示需脱敏车牌与工单信息',
      }),
      n('teardown', '拆检照片', {
        nodeType: NODE_TYPE.PROCESS,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '展示隐藏损伤',
      }),
      n('estimate', '定损/维修明细', {
        nodeType: NODE_TYPE.OTHER,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '注意隐私脱敏',
        photoTips: '单据需打码车牌、手机号、VIN',
      }),
      n('structure', '结构件修复', {
        nodeType: NODE_TYPE.PROCESS,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '如涉及必须谨慎展示',
      }),
      n('parts_compare', '核心配件更换', {
        nodeType: NODE_TYPE.PARTS,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '新旧件对比',
      }),
      n('body_work', '钣金修复过程', {
        nodeType: NODE_TYPE.PROCESS,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '钣金修复',
      }),
      n('paint_work', '喷漆过程', {
        nodeType: NODE_TYPE.PROCESS,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '喷漆过程',
      }),
      n('done_exterior', '完工外观', {
        nodeType: NODE_TYPE.AFTER,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '维修后外观',
      }),
      n('qc', '质检结果', {
        nodeType: NODE_TYPE.CHECK,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '质检结果',
      }),
      n('advice', '维修建议', {
        nodeType: NODE_TYPE.OTHER,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '后续建议',
      }),
    ],
  },
  generic: {
    id: 'generic',
    name: '通用维修',
    serviceKeywords: [],
    nodes: [
      n('before', '维修前状态', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '展示维修前的问题状态',
      }),
      n('fault', '故障点', {
        nodeType: NODE_TYPE.BEFORE,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '展示问题部位',
      }),
      n('parts_compare', '新旧对比', {
        nodeType: NODE_TYPE.PARTS,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '展示旧件与新件差异',
      }),
      n('process', '维修过程', {
        nodeType: NODE_TYPE.PROCESS,
        requiredLevel: NODE_REQUIRED_LEVEL.OPTIONAL,
        description: '展示维修过程',
      }),
      n('done', '完工结果', {
        nodeType: NODE_TYPE.AFTER,
        requiredLevel: NODE_REQUIRED_LEVEL.RECOMMENDED,
        description: '展示最终效果',
      }),
    ],
  },
}

/** 平台标准服务项目 → 模板 — 02 §12 + constants/service.js SERVICE_ITEMS */
const SERVICE_ITEM_TEMPLATE_MAP = {
  item_maintenance: 'maintenance',
  item_brake_pad: 'brake',
  item_battery: 'battery',
  item_body_paint: 'paint',
  item_accident: 'accident',
}

const CATEGORY_TEMPLATE_MAP = {
  cat_maintenance: 'maintenance',
  cat_brake: 'brake',
  cat_tire: 'tire',
  cat_battery: 'battery',
  cat_body: 'paint',
  cat_accident: 'accident',
}

const TEMPLATE_LIST = Object.values(ORDER_ALBUM_TEMPLATES)

module.exports = {
  ORDER_ALBUM_TEMPLATES,
  SERVICE_ITEM_TEMPLATE_MAP,
  CATEGORY_TEMPLATE_MAP,
  TEMPLATE_LIST,
}
