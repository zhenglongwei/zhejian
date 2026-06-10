/** 原公域列表深链 → navigateTo 兼容页（DS-D-04～06 内跳转 H5） */
const {
  buildStoreScopedListPath,
  isShareStoreIsolated,
  getShareStoreId,
} = require('./share-store-context')

const LEGACY_LIST_URLS = {
  service: '/pages/service/index',
  case: '/pages/case/index',
  store: '/pages/store/index',
}

function openLegacyListPage(key, storeId) {
  const sid = storeId || getShareStoreId()
  if (sid && (isShareStoreIsolated() || storeId)) {
    const scoped = buildStoreScopedListPath(key, sid)
    if (scoped) {
      wx.navigateTo({ url: scoped })
      return
    }
  }
  const url = LEGACY_LIST_URLS[key]
  if (!url) return
  wx.navigateTo({ url })
}

module.exports = {
  openLegacyListPage,
}
