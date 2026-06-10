/**
 * MOCK: 用户账户与我的页 summary，联调后由 services/user.js 接真实 API
 */
const { maskPhone } = require('../utils/auth')

function delay(ms = 320) {
  return new Promise((r) => setTimeout(r, ms))
}

const MOCK_SUMMARY = {
  consultPending: 1,
  albumPendingAuth: 1,
  authorizeCount: 0,
}

async function mockWechatLogin() {
  await delay(400)
  const user = {
    userId: 'usr_mock_001',
    nickname: '辙见用户',
    avatarUrl: '',
    phoneDisplay: '',
    isPhoneBound: false,
  }
  const token = `mock_token_${Date.now()}`
  return { token, user }
}

async function mockBindPhone() {
  await delay(300)
  const phone = '13812345678'
  return {
    phone,
    phoneDisplay: maskPhone(phone),
    isPhoneBound: true,
  }
}

async function mockMineSummary(user) {
  await delay(280)
  if (!user) return null
  let albumPendingAuth = MOCK_SUMMARY.albumPendingAuth
  let recentAlbums = []
  let hasAlbumBindings = false
  try {
    const { mockCountPendingAuth, mockFetchUserServiceAlbums } = require('./service-albums')
    albumPendingAuth = mockCountPendingAuth()
    const list = await mockFetchUserServiceAlbums({ tab: 'private' })
    hasAlbumBindings = (list || []).length > 0
    recentAlbums = (list || []).slice(0, 3)
  } catch (e) {
    /* fallback to static mock */
  }
  return {
    user: {
      userId: user.userId,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      phoneDisplay: user.phoneDisplay || '',
      isPhoneBound: Boolean(user.isPhoneBound),
    },
    consultPending: MOCK_SUMMARY.consultPending,
    albumPendingAuth,
    authorizeCount: MOCK_SUMMARY.authorizeCount,
    recentAlbums,
    hasAlbumBindings,
  }
}

async function mockLogout() {
  await delay(200)
  return { ok: true }
}

async function mockUpdateUserProfile(payload = {}, currentUser = {}) {
  await delay(240)
  return {
    userId: currentUser.userId || 'usr_mock_001',
    nickname:
      payload.nickname !== undefined ? String(payload.nickname || '').trim() : currentUser.nickname || '',
    avatarUrl:
      payload.avatarUrl !== undefined ? String(payload.avatarUrl || '').trim() : currentUser.avatarUrl || '',
    phoneDisplay: currentUser.phoneDisplay || '',
    isPhoneBound: Boolean(currentUser.isPhoneBound),
  }
}

module.exports = {
  mockWechatLogin,
  mockBindPhone,
  mockMineSummary,
  mockLogout,
  mockUpdateUserProfile,
}
