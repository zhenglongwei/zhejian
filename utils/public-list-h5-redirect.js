/**
 * DS-D-04～06 · 公域列表页下线 → H5 内容站跳转桥接
 * 深链 detail 页保留；service/case/store 列表 index 仅作兼容入口。
 */
const {
  H5_CONTENT_SITE_URL,
  buildCaseListH5Url,
  buildStoreListH5Url,
  buildStoreH5Url,
  buildStoreCasesH5Url,
  openH5Url,
} = require('../constants/h5-links')

const PAGE_COPY = {
  service: {
    title: '服务',
    loading: '正在打开服务方案…',
    offlineTitle: '全站服务列表已迁移',
    hint: '公开服务方案请在辙见内容站浏览；本店分享链将打开该门店主页。',
  },
  case: {
    title: '公开案例',
    loading: '正在打开公开案例…',
    offlineTitle: '全站案例列表已迁移',
    hint: '公开维修案例请在辙见内容站浏览。',
  },
  store: {
    title: '门店',
    loading: '正在打开门店列表…',
    offlineTitle: '全站门店列表已迁移',
    hint: '门店与公开案例请在辙见内容站浏览。',
  },
}

function resolvePublicListH5Url(pageKey, options = {}) {
  const storeId = String(options.storeId || '').trim()
  if (pageKey === 'case') {
    if (storeId) return buildStoreCasesH5Url({ storeId })
    return buildCaseListH5Url()
  }
  if (pageKey === 'store') {
    return buildStoreListH5Url()
  }
  if (pageKey === 'service') {
    if (storeId) return buildStoreH5Url({ storeId })
    return H5_CONTENT_SITE_URL
  }
  return H5_CONTENT_SITE_URL
}

function createPublicListRedirectPage(pageKey) {
  const copy = PAGE_COPY[pageKey] || PAGE_COPY.case
  return {
    data: {
      status: 'loading',
      errorMessage: '',
      hint: copy.hint,
      offlineTitle: copy.offlineTitle,
      loadingText: copy.loading,
    },

    onLoad(options) {
      this.pageOptions = options || {}
      wx.setNavigationBarTitle({ title: copy.title })
      this.redirectToH5()
    },

    async redirectToH5() {
      this.setData({ status: 'loading', errorMessage: '' })
      const url = resolvePublicListH5Url(pageKey, this.pageOptions)
      if (!url) {
        this.setData({ status: 'error', errorMessage: '内容站链接不可用' })
        return
      }
      const opened = await openH5Url(url, { redirect: true })
      if (!opened) {
        this.setData({
          status: 'error',
          errorMessage: '无法打开内容站，请复制链接后在浏览器访问',
        })
      }
    },

    onRetry() {
      this.redirectToH5()
    },

    onBackHome() {
      wx.switchTab({ url: '/pages/home/index' })
    },
  }
}

module.exports = {
  PAGE_COPY,
  resolvePublicListH5Url,
  createPublicListRedirectPage,
}
