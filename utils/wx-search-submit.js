/**
 * 微信搜一搜页面收录 · UI-ALB-D-07
 * 深链公开页加载成功后推送 path+query；同会话去重。
 */

const SUBMITTED = new Set()

function normalizePath(path) {
  return String(path || '')
    .replace(/^\//, '')
    .replace(/\.html$/, '')
}

function buildQuery(params = {}) {
  return Object.keys(params)
    .filter((key) => params[key] != null && params[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
    .join('&')
}

function clip(text, max) {
  const value = String(text || '').trim()
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function submitSearchPage({ path, query, title, content }) {
  const normalizedPath = normalizePath(path)
  const normalizedQuery = String(query || '')
  const pageTitle = clip(title, 32)
  if (!normalizedPath || !pageTitle) return

  const dedupeKey = `${normalizedPath}?${normalizedQuery}`
  if (SUBMITTED.has(dedupeKey)) return

  const searchApi = wx.search
  if (!searchApi || typeof searchApi.submitPages !== 'function') return

  searchApi.submitPages({
    pages: [
      {
        path: normalizedPath,
        query: normalizedQuery,
        title: pageTitle,
        content: clip(content || pageTitle, 200),
      },
    ],
    success: () => {
      SUBMITTED.add(dedupeKey)
    },
    fail: (err) => {
      console.warn('[wx-search-submit] submitPages failed', err)
    },
  })
}

function applyDynamicNavTitle(title) {
  const pageTitle = clip(title, 32)
  if (!pageTitle) return
  wx.setNavigationBarTitle({ title: pageTitle })
}

function submitStoreDetailPage(store, options = {}) {
  if (!store || !store.id || options.preview) return
  const name = store.name || store.storeName || '门店详情'
  applyDynamicNavTitle(name)
  submitSearchPage({
    path: 'pages/store/detail/index',
    query: buildQuery({ id: store.id, storeId: options.storeId || store.id }),
    title: name,
    content: [name, store.address, store.specialties && store.specialties.join('、')]
      .filter(Boolean)
      .join(' · '),
  })
}

function submitCaseDetailPage(detail, options = {}) {
  if (!detail || !detail.id) return
  const title = detail.title || detail.serviceName || '公开案例'
  applyDynamicNavTitle(title)
  const query = buildQuery({
    id: detail.id,
    storeId: options.storeId || detail.storeId || '',
  })
  submitSearchPage({
    path: 'pages/case/detail/index',
    query,
    title,
    content: [title, detail.storeName, detail.serviceName].filter(Boolean).join(' · '),
  })
}

function submitServiceDetailPage(detail, options = {}) {
  if (!detail || !detail.id) return
  const title = detail.name || detail.serviceName || '服务方案'
  applyDynamicNavTitle(title)
  const query = buildQuery({
    id: detail.id,
    storeId: options.storeId || detail.storeId || '',
  })
  submitSearchPage({
    path: 'pages/service/detail/index',
    query,
    title,
    content: [title, detail.storeName].filter(Boolean).join(' · '),
  })
}

module.exports = {
  submitSearchPage,
  submitStoreDetailPage,
  submitCaseDetailPage,
  submitServiceDetailPage,
  applyDynamicNavTitle,
}
