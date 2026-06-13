const NAV_ICON_BASE = '/assets/nav'

const NAV_ICON_MAP = {
  album: { icon: `${NAV_ICON_BASE}/album.png`, iconBg: 'primary-light' },
  authorize: { icon: `${NAV_ICON_BASE}/authorize.png`, iconBg: 'success-light' },
  message: { icon: `${NAV_ICON_BASE}/message.png`, iconBg: 'info-light' },
  vehicle: { icon: `${NAV_ICON_BASE}/vehicle.png`, iconBg: 'primary-light' },
  settings: { icon: `${NAV_ICON_BASE}/settings.png`, iconBg: 'well' },
  help: { icon: `${NAV_ICON_BASE}/help.png`, iconBg: 'info-light' },
  support: { icon: `${NAV_ICON_BASE}/support.png`, iconBg: 'info-light' },
  merchant: { icon: `${NAV_ICON_BASE}/merchant.png`, iconBg: 'warning-light' },
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
