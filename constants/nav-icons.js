const NAV_ICON_BASE = '/assets/nav'

const NAV_ICON_MAP = {
  album: { icon: `${NAV_ICON_BASE}/album.png`, iconBg: 'primary-light' },
  authorize: { icon: `${NAV_ICON_BASE}/authorize.png`, iconBg: 'success-light' },
  message: { icon: `${NAV_ICON_BASE}/message.png`, iconBg: 'info-light' },
  vehicle: { icon: `${NAV_ICON_BASE}/vehicle.png`, iconBg: 'primary-light' },
  settings: { icon: `${NAV_ICON_BASE}/settings.png`, iconBg: 'warning-light' },
  help: { icon: `${NAV_ICON_BASE}/help.png`, iconBg: 'info-light' },
  support: { icon: `${NAV_ICON_BASE}/support.png`, iconBg: 'info-light' },
  merchant: { icon: `${NAV_ICON_BASE}/merchant.png`, iconBg: 'warning-light' },
  createAlbum: { icon: `${NAV_ICON_BASE}/album.png`, iconBg: 'primary-light' },
  leads: { icon: `${NAV_ICON_BASE}/message.png`, iconBg: 'warning-light' },
  services: { icon: `${NAV_ICON_BASE}/settings.png`, iconBg: 'info-light' },
  dashboard: { icon: `${NAV_ICON_BASE}/album.png`, iconBg: 'well' },
  previewStore: { icon: '/assets/tab/store.png', iconBg: 'info-light' },
  shareStore: { icon: `${NAV_ICON_BASE}/merchant.png`, iconBg: 'warning-light' },
  editStore: { icon: `${NAV_ICON_BASE}/settings.png`, iconBg: 'primary-light' },
  staff: { icon: `${NAV_ICON_BASE}/vehicle.png`, iconBg: 'success-light' },
}

const DEFAULT_NAV_ICON = { icon: '', iconBg: 'well' }

function getNavIcon(key) {
  return NAV_ICON_MAP[key] || DEFAULT_NAV_ICON
}

function attachNavIcon(item) {
  if (!item || !item.key) return item
  const nav = getNavIcon(item.key)
  return {
    ...item,
    icon: nav.icon,
    iconBg: nav.iconBg,
  }
}

module.exports = {
  NAV_ICON_BASE,
  NAV_ICON_MAP,
  getNavIcon,
  attachNavIcon,
}
