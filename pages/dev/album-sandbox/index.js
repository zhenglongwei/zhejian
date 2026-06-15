const { buildDevAlbumSandboxData } = require('../../../constants/dev-album-sandbox')

function getWindowMetrics() {
  try {
    return typeof wx.getWindowInfo === 'function'
      ? wx.getWindowInfo()
      : wx.getSystemInfoSync()
  } catch (err) {
    return { windowHeight: 667, windowWidth: 375 }
  }
}

Page({
  data: {
    viewerHeightPx: 420,
    viewerCurrent: 0,
    toolbarNodeId: '',
    infoSheetVisible: false,
    favorited: false,
    toastMessage: '',
    ...buildDevAlbumSandboxData(),
  },

  onLoad() {
    const win = getWindowMetrics()
    const windowHeight = Math.floor(win.windowHeight || 667)
    const viewerHeightPx = Math.max(Math.floor(windowHeight * 0.52), 360)
    const { chapters } = this.data
    this.setData({
      viewerHeightPx,
      toolbarNodeId: (chapters[0] && chapters[0].nodeId) || '',
    })
  },

  onViewerChange(e) {
    const current = Number(e.detail.index) || 0
    const page = e.detail.page || (this.data.flipPages || [])[current]
    const nodeId = (page && page.nodeId) || this.data.toolbarNodeId
    const chapter = (this.data.chapters || []).find((item) => item.nodeId === nodeId)
    const stageProgress = (this.data.stageProgress || []).map((stage) => ({
      ...stage,
      active: stage.id === nodeId,
    }))
    this.setData({
      viewerCurrent: current,
      toolbarNodeId: nodeId,
      activeNodeId: nodeId,
      activeStageTitle: (chapter && chapter.title) || this.data.activeStageTitle,
      stageProgress,
      'infoSheet.pageProgress': `${current + 1} / ${(this.data.flipPages || []).length}`,
    })
  },

  onToolbarChapterTap(e) {
    const nodeId = e.detail.nodeId || ''
    const startIndex = Number(e.detail.startIndex)
    if (!nodeId && !Number.isFinite(startIndex)) return

    const chapter = (this.data.chapters || []).find((item) => item.nodeId === nodeId)
    const index = Number.isFinite(startIndex)
      ? startIndex
      : (chapter ? chapter.startIndex : 0)
    const stageProgress = (this.data.stageProgress || []).map((stage) => ({
      ...stage,
      active: stage.id === nodeId,
    }))
    this.setData({
      viewerCurrent: index,
      toolbarNodeId: nodeId,
      activeNodeId: nodeId,
      activeStageTitle: (chapter && chapter.title) || '',
      stageProgress,
    })
  },

  onToggleInfoSheet() {
    this.setData({ infoSheetVisible: !this.data.infoSheetVisible })
  },

  onToggleFavorite() {
    const favorited = !this.data.favorited
    this.setData({
      favorited,
      toastMessage: favorited ? '已收藏（sandbox）' : '已取消收藏（sandbox）',
    })
  },

  onSandboxShare() {
    this.setData({ toastMessage: '分享（sandbox 占位）' })
  },

  onSandboxAuth() {
    this.setData({ toastMessage: '授权公示（sandbox 占位）' })
  },

  onSandboxFeedback() {
    this.setData({ toastMessage: '反馈（sandbox 占位）' })
  },

  onSandboxContact() {
    this.setData({ toastMessage: '联系门店（sandbox 占位）' })
  },

  onDismissToast() {
    this.setData({ toastMessage: '' })
  },
})
