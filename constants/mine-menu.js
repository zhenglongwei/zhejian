const MINE_FAVORITE_ITEM = {
  key: 'favorite',
  label: '我的收藏',
  desc: '收藏的服务、门店与案例',
  needPhone: true,
  url: '/pages/mine/favorite/index',
}

const MINE_VEHICLE_ITEM = {
  key: 'vehicle',
  label: '我的车辆',
  desc: '管理常用车辆信息',
  needPhone: true,
  url: '/pages/mine/vehicle/index',
}

/** 我的页 — V2.0 核心数据入口（PRD 12 §3） */
const MINE_CORE_MENUS = [
  {
    key: 'consult',
    label: '我的咨询',
    desc: '查看咨询与预约记录',
    needPhone: false,
    url: '/pages/consult/index/index',
    badgeKey: 'consultPending',
  },
  {
    key: 'album',
    label: '我的服务相册',
    desc: '查看门店为你创建的服务相册',
    needPhone: true,
    url: '/pages/album/list/index',
    badgeKey: 'albumPendingAuth',
  },
  {
    key: 'authorize',
    label: '我的公开授权',
    desc: '查看授权与审核状态',
    needPhone: true,
    url: '/pages/album/authorize/index',
  },
  MINE_FAVORITE_ITEM,
  MINE_VEHICLE_ITEM,
]

/** 常用工具（PRD 12 §11） */
const MINE_TOOL_MENUS = [
  { key: 'settings', label: '设置', needPhone: false, url: '/pages/mine/settings/index' },
]

/** 未登录也可访问 */
const MINE_PUBLIC_MENUS = [
  { key: 'support', label: '联系客服' },
  { key: 'rules', label: '使用规则' },
  { key: 'about', label: '关于辙见' },
]

const MINE_MERCHANT_ITEM = {
  key: 'merchant',
  label: '商家工作台',
  needPhone: false,
}

function attachBadge(item, badges) {
  const badge = item.badgeKey && badges[item.badgeKey] ? badges[item.badgeKey] : ''
  return { ...item, desc: item.desc || '', badge }
}

/** 我的页菜单分区 — 供 wxml 单循环渲染 */
function buildMineMenuSections(badges = {}) {
  return [
    { key: 'core', items: MINE_CORE_MENUS.map((item) => attachBadge(item, badges)) },
    { key: 'tools', items: MINE_TOOL_MENUS.map((item) => attachBadge(item, badges)) },
    {
      key: 'public',
      items: [...MINE_PUBLIC_MENUS, MINE_MERCHANT_ITEM].map((item) => attachBadge(item, badges)),
    },
  ]
}

module.exports = {
  MINE_CORE_MENUS,
  MINE_FAVORITE_ITEM,
  MINE_VEHICLE_ITEM,
  MINE_TOOL_MENUS,
  MINE_PUBLIC_MENUS,
  MINE_MERCHANT_ITEM,
  buildMineMenuSections,
}
