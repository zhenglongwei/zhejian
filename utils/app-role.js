/**
 * 自己打开小程序时的身份：商家 / 车主。
 * 本机记住；登录后同步到账号。分享与二维码不经过这里。
 */

const STORAGE_KEY = 'zj_app_role_v1'

const ROLE_MERCHANT = 'merchant'
const ROLE_OWNER = 'owner'
const MERCHANT_HOME = '/packageMerchant/pages/workbench/index'
const OWNER_HOME = '/pages/mine/index'

function normalizeRole(value) {
  return value === ROLE_MERCHANT || value === ROLE_OWNER ? value : ''
}

/**
 * @param {{ local?: string, preferredRole?: string, isMerchant?: boolean, hasAlbumBindings?: boolean }} input
 * @returns {'merchant'|'owner'|''}
 */
function decideRole(input = {}) {
  const remembered = normalizeRole(input.local)
  if (remembered) return remembered
  const account = normalizeRole(input.preferredRole)
  if (account) return account
  if (input.isMerchant) return ROLE_MERCHANT
  if (input.hasAlbumBindings) return ROLE_OWNER
  return ''
}

function readLocalRole() {
  try {
    return normalizeRole(wx.getStorageSync(STORAGE_KEY))
  } catch (e) {
    return ''
  }
}

function writeLocalRole(role) {
  const next = normalizeRole(role)
  if (!next) return
  try {
    wx.setStorageSync(STORAGE_KEY, next)
  } catch (e) {
    // ignore
  }
}

function homePathForRole(role) {
  return normalizeRole(role) === ROLE_MERCHANT ? MERCHANT_HOME : OWNER_HOME
}

function hideLaunchHomeButton() {
  if (typeof wx === 'undefined' || typeof wx.hideHomeButton !== 'function') return
  wx.hideHomeButton()
}

function reLaunchRoleHome(role) {
  const url = homePathForRole(role)
  const go = () => {
    wx.reLaunch({
      url,
      fail() {
        wx.redirectTo({ url })
      },
    })
  }
  if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
    wx.nextTick(go)
    return
  }
  setTimeout(go, 0)
}

async function persistRole(role) {
  const next = normalizeRole(role)
  if (!next) return
  writeLocalRole(next)
  try {
    const { isLoggedIn } = require('./auth')
    if (!isLoggedIn()) return
    const { updateUserProfile } = require('../services/user')
    await updateUserProfile({ preferredRole: next })
  } catch (e) {
    // 本机已记住；下次登录再同步
  }
}

function syncRoleWithAccount(user) {
  const server = normalizeRole(user && user.preferredRole)
  const local = readLocalRole()
  if (local && local !== server) {
    persistRole(local)
    return
  }
  if (!local && server) writeLocalRole(server)
}

module.exports = {
  ROLE_MERCHANT,
  ROLE_OWNER,
  MERCHANT_HOME,
  OWNER_HOME,
  normalizeRole,
  decideRole,
  readLocalRole,
  writeLocalRole,
  homePathForRole,
  reLaunchRoleHome,
  hideLaunchHomeButton,
  persistRole,
  syncRoleWithAccount,
}
