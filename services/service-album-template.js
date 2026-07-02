/**
 * 服务相册模板选项 — 对齐 backend service-album-node-template
 */
const { ENV } = require('./config')
const { get } = require('./request')

const MOCK_TEMPLATE_OPTIONS = [
  { id: 'maintenance', name: '小保养' },
  { id: 'major_maintenance', name: '大保养' },
  { id: 'brake', name: '刹车片/刹车盘' },
  { id: 'battery', name: '电瓶更换' },
  { id: 'tire', name: '轮胎更换' },
  { id: 'ac', name: '空调服务' },
  { id: 'body_paint', name: '钣喷修复' },
  { id: 'accident', name: '事故车维修' },
]

/** mock 切换模板时的六阶段标题 */
const MOCK_TEMPLATE_NODE_TITLES = {
  maintenance: ['接车记录', '机油/滤芯检测', '保养方案', '机油机滤材料', '更换过程', '完工检查'],
  major_maintenance: ['接车记录', '综合检测', '保养方案', '更换材料', '施工过程', '完工确认'],
  brake: ['接车记录', '刹车检测', '维修方案', '新旧配件对比', '更换过程', '试车检查'],
  battery: ['接车记录', '电压检测', '更换方案', '新旧电瓶对比', '更换过程', '完工检查'],
  tire: ['接车记录', '轮胎检测', '更换方案', '新旧轮胎对比', '换胎过程', '动平衡/完工'],
  ac: ['接车记录', '空调检测', '维修方案', '滤芯/冷媒材料', '施工过程', '完工测试'],
  body_paint: ['损伤状态', '损伤评估', '修复方案', '施工过程', '前后对比', '完工结果'],
  accident: ['接车记录', '损伤检测', '维修方案', '配件/材料凭证', '修复过程', '完工验收'],
}

async function fetchServiceAlbumTemplateOptions() {
  if (ENV.mode === 'mock') {
    return MOCK_TEMPLATE_OPTIONS.slice()
  }
  const data = await get('/merchant/service-albums/templates')
  return data.list || []
}

module.exports = {
  fetchServiceAlbumTemplateOptions,
  MOCK_TEMPLATE_OPTIONS,
  MOCK_TEMPLATE_NODE_TITLES,
}
