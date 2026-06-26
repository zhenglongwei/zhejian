const { attachNavIcon } = require('./nav-icons')

const MINE_VEHICLE_ITEM = {
  key: 'vehicle',
  label: '我的车辆',
  desc: '管理常用车辆信息',
  needPhone: true,
  url: '/pages/mine/vehicle/index',
}

/** 程序路由仍保留；首页不再单独展示 */
const MINE_CORE_MENUS = [
  {
    key: 'album',
    label: '我的服务相册',
    desc: '查看门店为你创建的服务相册',
    needPhone: true,
    url: '/pages/album/list/index',
    dotKey: 'albumUnread',
  },
  {
    key: 'authorize',
    label: '授权公示',
    desc: '查看授权与审核状态',
    needPhone: true,
    url: '/pages/album/authorize/index',
    badgeKey: 'albumPendingAuth',
  },
]

const MINE_TOOL_MENUS = [
  {
    key: 'settings',
    label: '设置',
    desc: '账号、帮助与隐私',
    needPhone: false,
    url: '/pages/mine/settings/index',
  },
]

const MINE_PUBLIC_MENUS = [
  {
    key: 'help',
    label: '使用说明与帮助',
    desc: '车主与商家使用指引',
    url: '/pages/mine/help/index',
  },
  { key: 'support', label: '联系客服', desc: '内容、隐私与账号问题' },
]

const MINE_MERCHANT_ITEM = {
  key: 'merchant',
  label: '商家工作台',
  desc: '创建服务相册与管理门店',
  needPhone: false,
}

/** 首页底部快捷 dock（非列表菜单） */
const MINE_HUB_DOCK = [
  MINE_TOOL_MENUS[0],
  MINE_PUBLIC_MENUS[1],
  MINE_MERCHANT_ITEM,
].map((item) => ({
  ...attachNavIcon({ ...item, desc: '' }),
  iconBg: 'well',
}))

function attachBadge(item, badges) {
  const badge = item.badgeKey && badges[item.badgeKey] ? badges[item.badgeKey] : ''
  const dot = Boolean(item.dotKey && badges[item.dotKey])
  return attachNavIcon({ ...item, desc: item.desc || '', badge, dot })
}

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

function buildMineHubDock() {
  return MINE_HUB_DOCK
}

module.exports = {
  MINE_CORE_MENUS,
  MINE_VEHICLE_ITEM,
  MINE_TOOL_MENUS,
  MINE_PUBLIC_MENUS,
  MINE_MERCHANT_ITEM,
  MINE_HUB_DOCK,
  buildMineMenuSections,
  buildMineHubDock,
}
