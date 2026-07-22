/** 平台标准服务项目（B-SVC-02 Phase 1 常量；后续可迁 DB） */

const SERVICE_CATEGORIES = [
  { id: 'cat_maintenance', name: '保养服务' },
  { id: 'cat_brake', name: '刹车系统' },
  { id: 'cat_tire', name: '轮胎服务' },
  { id: 'cat_battery', name: '电瓶服务' },
  { id: 'cat_body', name: '钣喷修复' },
  { id: 'cat_accident', name: '事故车维修' },
  { id: 'cat_other', name: '其他服务' },
]

const SERVICE_ITEMS = [
  {
    id: 'item_maintenance',
    categoryId: 'cat_maintenance',
    name: '小保养',
    defaultPriceMode: 'fixed',
    complexityLevel: 'L2',
    needQualificationLevel: 'L2',
  },
  {
    id: 'item_brake_pad',
    categoryId: 'cat_brake',
    name: '刹车片更换',
    defaultPriceMode: 'consult',
    complexityLevel: 'L2',
    needQualificationLevel: 'L2',
  },
  {
    id: 'item_body_paint',
    categoryId: 'cat_body',
    name: '钣喷修复',
    defaultPriceMode: 'consult',
    complexityLevel: 'L3',
    needQualificationLevel: 'L3',
  },
  {
    id: 'item_battery',
    categoryId: 'cat_battery',
    name: '电瓶更换',
    defaultPriceMode: 'fixed',
    complexityLevel: 'L2',
    needQualificationLevel: 'L2',
  },
  {
    id: 'item_accident',
    categoryId: 'cat_accident',
    name: '事故车维修预约',
    defaultPriceMode: 'consult',
    complexityLevel: 'L4',
    needQualificationLevel: 'L4',
  },
  {
    id: 'item_custom',
    categoryId: 'cat_other',
    name: '自定义服务',
    defaultPriceMode: 'consult',
    complexityLevel: 'L2',
    needQualificationLevel: 'L2',
    selectable: false,
  },
]

function getCategoryName(categoryId) {
  const cat = SERVICE_CATEGORIES.find((c) => c.id === categoryId)
  return cat ? cat.name : ''
}

function getServiceItem(id) {
  return SERVICE_ITEMS.find((item) => item.id === id) || null
}

function listServiceItems() {
  return SERVICE_ITEMS.filter((item) => item.selectable !== false).map((item) => ({
    ...item,
    categoryName: getCategoryName(item.categoryId),
  }))
}

module.exports = {
  SERVICE_CATEGORIES,
  SERVICE_ITEMS,
  getCategoryName,
  getServiceItem,
  listServiceItems,
}
