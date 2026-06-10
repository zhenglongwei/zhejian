const { GEO_PAGES } = require('../../../mock/geo-pages')
const { fetchGeoPageDetail } = require('../../../services/geo')
const { buildGeoTopicH5Url, openGeoTopicH5 } = require('../../../constants/h5-links')

function looksLikeGeoTopicSlug(ref) {
  const s = String(ref || '').trim()
  if (!s || s.startsWith('geo_')) return false
  return /^[a-z0-9]+(-[a-z0-9]+)+$/i.test(s)
}

function resolveGeoTopicFromLocal(ref) {
  const normalized = String(ref || '').trim()
  if (!normalized) return null
  const page = GEO_PAGES.find((item) => item.slug === normalized || item.id === normalized)
  if (!page) return null
  const slug = page.slug || page.id
  return { id: page.id, slug, h5Path: `/topic/${slug}` }
}

Page({
  data: {
    status: 'loading',
    errorMessage: '',
  },

  onLoad(options) {
    this.pageRef = (options && (options.id || options.slug)) || ''
    if (!this.pageRef) {
      this.setData({ status: 'error', errorMessage: '缺少专题参数' })
      return
    }
    wx.setNavigationBarTitle({ title: '专题' })
    this.redirectToH5(this.pageRef)
  },

  async redirectToH5(ref) {
    this.setData({ status: 'loading', errorMessage: '' })

    let params = null
    if (looksLikeGeoTopicSlug(ref)) {
      params = { slug: ref }
    } else {
      params = resolveGeoTopicFromLocal(ref)
    }

    if (!params) {
      try {
        const detail = await fetchGeoPageDetail(ref)
        params = {
          id: detail.id,
          slug: detail.slug,
          h5Path: detail.h5Path,
        }
      } catch (e) {
        this.setData({
          status: 'error',
          errorMessage: (e && e.message) || '专题不可用',
        })
        return
      }
    }

    const url = buildGeoTopicH5Url(params)
    if (!url) {
      this.setData({ status: 'error', errorMessage: '专题链接不可用' })
      return
    }

    const opened = await openGeoTopicH5(url, { redirect: true })
    if (!opened) {
      this.setData({ status: 'error', errorMessage: '无法打开专题页，请复制链接后在浏览器访问' })
    }
  },

  onRetry() {
    if (this.pageRef) {
      this.redirectToH5(this.pageRef)
    }
  },
})
