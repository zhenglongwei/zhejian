const { fetchAlbumList } = require('../../../../services/album')
const { ALBUM_STATUS, ALBUM_STATUS_LABEL } = require('../../../../constants/album')
const { CASE_SOURCE } = require('../../../../constants/case-source')
const {
  buildAlbumListTitle,
  buildAlbumListTags,
  pickAlbumListCover,
} = require('../../../../utils/album-card')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')

const TAB_ALL = 'all'

const STATUS_TABS = [
  { key: TAB_ALL, label: '全部' },
  { key: ALBUM_STATUS.DRAFT, label: '草稿' },
  { key: ALBUM_STATUS.PENDING_REVIEW, label: '待审核' },
  { key: ALBUM_STATUS.APPROVED, label: '已通过' },
]

Page({
  data: {
    status: 'loading',
    list: [],
    statusTabs: STATUS_TABS,
    tab: TAB_ALL,
    errorMessage: '',
  },

  onShow() {
    this.ensureMerchant()
  },

  async ensureMerchant() {
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      wx.showModal({
        title: '请先入驻',
        content: '完成商家入驻后可管理案例',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/packageMerchant/pages/onboarding/index' })
          } else {
            wx.navigateBack()
          }
        },
      })
      return
    }
    this.loadList()
  },

  async loadList() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const status =
        this.data.tab === TAB_ALL ? undefined : this.data.tab
      const { list } = await fetchAlbumList(status)
      this.setData({
        list: list.map((a) => ({
          ...a,
          statusLabel: ALBUM_STATUS_LABEL[a.status] || a.status,
          caseSource: CASE_SOURCE.MERCHANT_HISTORY,
          coverImage: pickAlbumListCover(a),
          title: buildAlbumListTitle(a),
          cardTags: buildAlbumListTags(a),
        })),
        status: list.length ? 'normal' : 'empty',
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onTabChange(e) {
    const { key } = e.detail
    this.setData({ tab: key }, () => this.loadList())
  },

  onCreate() {
    wx.navigateTo({ url: '/packageMerchant/pages/album/create/index' })
  },

  onRetry() {
    this.loadList()
  },
})
