/**
 * 列表页 onShow 收敛：避免真机双触发 onShow 导致重复请求 / 骨架屏闪烁
 */

function shouldRunInitialShow(page) {
  if (page._listInitialized) return false
  if (page._listInitPending) return false
  page._listInitPending = true
  return true
}

function finishInitialShow(page) {
  page._listInitPending = false
  page._listInitialized = true
}

function markListNeedRefresh(page) {
  page._listNeedRefresh = true
}

function consumeListRefresh(page) {
  if (!page._listInitialized) return false
  if (!page._listNeedRefresh) return false
  page._listNeedRefresh = false
  return true
}

function shouldShowListLoading(page, silent) {
  if (silent) return false
  if (!page._listInitialized) return true
  const status = page.data.status
  return status !== 'normal' && status !== 'loading'
}

module.exports = {
  shouldRunInitialShow,
  finishInitialShow,
  markListNeedRefresh,
  consumeListRefresh,
  shouldShowListLoading,
}
