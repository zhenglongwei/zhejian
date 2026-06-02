/**
 * 服务方案常量 — 与 PRD §3、price-mode 对齐
 */
const { PRICE_MODE } = require('./price-mode')

const SERVICE_STATUS = {
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  REJECTED: 'rejected',
  NEED_MODIFY: 'need_modify',
  SUSPENDED: 'suspended',
}

const SERVICE_STATUS_LABEL = {
  [SERVICE_STATUS.DRAFT]: '草稿',
  [SERVICE_STATUS.PENDING_REVIEW]: '待审核',
  [SERVICE_STATUS.APPROVED]: '未上架',
  [SERVICE_STATUS.PUBLISHED]: '已上架',
  [SERVICE_STATUS.REJECTED]: '已驳回',
  [SERVICE_STATUS.NEED_MODIFY]: '需修改',
  [SERVICE_STATUS.SUSPENDED]: '平台下架',
}

const SERVICE_CATEGORIES = [
  { id: 'cat_maintenance', name: '保养服务', sort: 1 },
  { id: 'cat_brake', name: '刹车系统', sort: 2 },
  { id: 'cat_tire', name: '轮胎服务', sort: 3 },
  { id: 'cat_battery', name: '电瓶服务', sort: 4 },
  { id: 'cat_body', name: '钣喷修复', sort: 5 },
  { id: 'cat_accident', name: '事故车维修', sort: 6 },
]

/** 平台标准服务项目（商家选择后发布方案） */
const SERVICE_ITEMS = {
  maintenance: {
    id: 'item_maintenance',
    categoryId: 'cat_maintenance',
    name: '小保养',
    defaultPriceMode: PRICE_MODE.FIXED,
    complexity: 'L2',
    allowOnlinePayment: true,
  },
  brake_pad: {
    id: 'item_brake_pad',
    categoryId: 'cat_brake',
    name: '刹车片更换',
    defaultPriceMode: PRICE_MODE.RANGE,
    complexity: 'L2',
    allowOnlinePayment: false,
  },
  body_paint: {
    id: 'item_body_paint',
    categoryId: 'cat_body',
    name: '钣喷修复',
    defaultPriceMode: PRICE_MODE.RANGE,
    complexity: 'L3',
    allowOnlinePayment: false,
  },
  battery: {
    id: 'item_battery',
    categoryId: 'cat_battery',
    name: '电瓶更换',
    defaultPriceMode: PRICE_MODE.FIXED,
    complexity: 'L2',
    allowOnlinePayment: true,
  },
  accident: {
    id: 'item_accident',
    categoryId: 'cat_accident',
    name: '事故车维修预约',
    defaultPriceMode: PRICE_MODE.ACCIDENT,
    complexity: 'L4',
    allowOnlinePayment: false,
  },
}

const SERVICE_ITEM_LIST = Object.values(SERVICE_ITEMS)

const PRICE_MODE_OPTIONS = [
  { value: PRICE_MODE.FIXED, label: '一口价' },
  { value: PRICE_MODE.RANGE, label: '参考区间' },
  { value: PRICE_MODE.CONSULT, label: '到店检测后报价' },
  { value: PRICE_MODE.ACCIDENT, label: '事故车预约到店' },
]

function getCategoryName(categoryId) {
  const cat = SERVICE_CATEGORIES.find((c) => c.id === categoryId)
  return cat ? cat.name : ''
}

function getServiceItem(id) {
  return SERVICE_ITEM_LIST.find((item) => item.id === id) || null
}

module.exports = {
  SERVICE_STATUS,
  SERVICE_STATUS_LABEL,
  SERVICE_CATEGORIES,
  SERVICE_ITEMS,
  SERVICE_ITEM_LIST,
  PRICE_MODE_OPTIONS,
  getCategoryName,
  getServiceItem,
}
