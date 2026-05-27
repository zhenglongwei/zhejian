const {
  SEARCH_PLACEHOLDER,
  SEARCH_KEYWORD_MAX,
} = require('../../../constants/search')
const { fetchSearchConfig, fetchSearchSuggest } = require('../../../services/search')
const {
  getSearchHistory,
  addSearchHistory,
  clearSearchHistory,
} = require('../../../utils/search-history')

Page({
  data: {
    placeholder: SEARCH_PLACEHOLDER,
    keyword: '',
    focus: true,
    configStatus: 'loading',
    hotwords: [],
    history: [],
    suggests: [],
    showSuggests: false,
    errorMessage: '',
  },

  onLoad(options) {
    if (options && options.keyword) {
      this.setData({ keyword: decodeURIComponent(options.keyword) })
    }
    this.loadConfig()
    this.refreshHistory()
  },

  onShow() {
    this.refreshHistory()
  },

  refreshHistory() {
    this.setData({ history: getSearchHistory() })
  },

  async loadConfig() {
    this.setData({ configStatus: 'loading', errorMessage: '' })
    try {
      const config = await fetchSearchConfig()
      this.setData({
        hotwords: config.hotwords || [],
        configStatus: 'normal',
      })
    } catch (e) {
      this.setData({
        configStatus: 'error',
        errorMessage: (e && e.message) || '加载失败',
        hotwords: [],
      })
    }
  },

  onInput(e) {
    const keyword = (e.detail && e.detail.value) || ''
    this.setData({ keyword, showSuggests: !!keyword.trim() })
    this.loadSuggest(keyword)
  },

  async loadSuggest(keyword) {
    const value = String(keyword || '').trim()
    if (!value) {
      this.setData({ suggests: [], showSuggests: false })
      return
    }
    try {
      const suggests = await fetchSearchSuggest(value)
      this.setData({ suggests, showSuggests: true })
    } catch (e) {
      this.setData({ suggests: [], showSuggests: false })
    }
  },

  onClear() {
    this.setData({ keyword: '', suggests: [], showSuggests: false })
  },

  onCancel() {
    wx.navigateBack({
      fail() {
        wx.switchTab({ url: '/pages/home/index' })
      },
    })
  },

  validateKeyword(keyword) {
    const value = String(keyword || '').trim()
    if (!value) {
      wx.showToast({ title: '请输入搜索关键词', icon: 'none' })
      return ''
    }
    if (value.length > SEARCH_KEYWORD_MAX) {
      wx.showToast({
        title: `关键词不超过 ${SEARCH_KEYWORD_MAX} 字`,
        icon: 'none',
      })
      return ''
    }
    return value
  },

  goResult(keyword) {
    const value = this.validateKeyword(keyword)
    if (!value) return
    addSearchHistory(value)
    wx.navigateTo({
      url: `/pages/search/result/index?keyword=${encodeURIComponent(value)}`,
    })
  },

  onConfirm(e) {
    const keyword = (e.detail && e.detail.value) || this.data.keyword
    this.goResult(keyword)
  },

  onHistoryTap(e) {
    const { keyword } = e.currentTarget.dataset
    this.goResult(keyword)
  },

  onHotwordTap(e) {
    const { keyword } = e.currentTarget.dataset
    this.goResult(keyword)
  },

  onSuggestTap(e) {
    const { keyword } = e.currentTarget.dataset
    this.goResult(keyword)
  },

  onClearHistory() {
    wx.showModal({
      title: '清空搜索历史',
      content: '确定清空全部搜索历史吗？',
      success: (res) => {
        if (!res.confirm) return
        clearSearchHistory()
        this.setData({ history: [] })
      },
    })
  },

  onRetryConfig() {
    this.loadConfig()
  },
})
