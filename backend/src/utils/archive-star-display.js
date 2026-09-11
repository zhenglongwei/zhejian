/**
 * 档案星标（GitHub 式，只打在案例上，不加总到门店）
 */

function displayNickname(nickname) {
  const name = String(nickname || '').trim()
  return name || '一位车主'
}

/**
 * 公开名单：门店出店名；个人只出昵称。不含手机号、真实姓名、证件。
 * @param {{ user?: { nickname?: string, avatarUrl?: string }, store?: { id?: string, name?: string, avatarUrl?: string } }} input
 */
function formatPublicStargazer(input = {}) {
  const store = input.store
  if (store && store.name) {
    const storeId = String(store.id || '').trim()
    return {
      kind: 'store',
      displayName: String(store.name).trim(),
      avatarUrl: String(store.avatarUrl || '').trim(),
      href: storeId ? `/store/${encodeURIComponent(storeId)}.html` : '',
    }
  }
  const user = input.user || {}
  return {
    kind: 'person',
    displayName: displayNickname(user.nickname),
    avatarUrl: String(user.avatarUrl || '').trim(),
    href: '',
  }
}

function emptyStarSummary() {
  return {
    count: 0,
    starred: false,
    list: [],
  }
}

module.exports = {
  displayNickname,
  formatPublicStargazer,
  emptyStarSummary,
}
