/**
 * 维修相册 V1 — 模板节点与状态（商家非平台创建）
 */
const ALBUM_STATUS = {
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
}

const ALBUM_STATUS_LABEL = {
  [ALBUM_STATUS.DRAFT]: '草稿',
  [ALBUM_STATUS.PENDING_REVIEW]: '待审核',
  [ALBUM_STATUS.APPROVED]: '已通过',
  [ALBUM_STATUS.REJECTED]: '已驳回',
}

/** 首批模板节点（简化）— 用于商家「历史案例/独立相册」；订单相册见 constants/order-album-templates.js */
const ALBUM_TEMPLATES = {
  brake: {
    id: 'brake',
    name: '刹车片/刹车盘',
    serviceName: '刹车片更换',
    nodes: [
      { id: 'before', title: '维修前状态' },
      { id: 'fault', title: '故障点' },
      { id: 'parts', title: '新旧配件对比' },
      { id: 'process', title: '维修过程' },
      { id: 'done', title: '完工结果' },
    ],
  },
  paint: {
    id: 'paint',
    name: '钣喷修复',
    serviceName: '钣金喷漆',
    nodes: [
      { id: 'before', title: '损伤状态' },
      { id: 'process', title: '修复过程' },
      { id: 'compare', title: '前后对比' },
      { id: 'done', title: '完工结果' },
    ],
  },
  battery: {
    id: 'battery',
    name: '电瓶更换',
    serviceName: '电瓶更换',
    nodes: [
      { id: 'before', title: '维修前状态' },
      { id: 'parts', title: '新旧配件对比' },
      { id: 'done', title: '完工结果' },
    ],
  },
}

const TEMPLATE_LIST = Object.values(ALBUM_TEMPLATES)

module.exports = {
  ALBUM_STATUS,
  ALBUM_STATUS_LABEL,
  ALBUM_TEMPLATES,
  TEMPLATE_LIST,
}
