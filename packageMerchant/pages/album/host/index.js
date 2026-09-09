const {
  fetchMerchantServiceAlbum,
  hostMerchantAlbum,
  auditHostedPublicPrivacy,
  generateHostedGeoDraft,
  confirmHostedPublicPublish,
} = require('../../../../services/merchant-service-album')
const { SERVICE_ALBUM_STATUS } = require('../../../../constants/service-album-status')

const STAGE_LABELS = {
  awaiting_privacy: '待隐私校验',
  awaiting_geo: '待生成 GEO',
  awaiting_geo_confirm: '待确认 GEO',
  published: '已公开',
}

Page({
  data: {
    albumId: '',
    status: 'loading',
    errorMessage: '',
    serviceName: '',
    working: false,
    hostMode: 'private',
    hosted: false,
    hostVisibility: 'private',
    publicPublishStage: '',
    stageLabel: '',
    privacyPassed: false,
    privacyBlocks: [],
    geoDraft: {},
    geoSummary: '',
    geoConfirmed: false,
  },

  onLoad(options) {
    this.albumId = String(options.albumId || '').trim()
    this.setData({ albumId: this.albumId })
    this.bootstrap()
  },

  async bootstrap() {
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '缺少相册 ID' })
      return
    }
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const album = await fetchMerchantServiceAlbum(this.albumId)
      const albumStatus = album.status || ''
      if (albumStatus !== SERVICE_ALBUM_STATUS.COMPLETED && albumStatus !== 'published') {
        this.setData({
          status: 'error',
          errorMessage: '请先完成服务流程并整单完工',
        })
        return
      }
      this.applyAlbum(album)
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  applyAlbum(album) {
    const hostMeta = album.hostMeta || {}
    const stage = String(hostMeta.publicPublishStage || '')
    const geoLayer = hostMeta.geoLayer || {}
    const geoDraft = hostMeta.geoDraft || {}
    const hosted = Boolean(hostMeta.hosted)
    const hostMode =
      hosted && (stage || hostMeta.visibility === 'public') ? 'public' : this.data.hostMode
    this.setData({
      status: 'ready',
      serviceName: album.serviceName || '服务相册',
      hosted,
      hostVisibility: hostMeta.visibility || 'private',
      publicPublishStage: stage,
      stageLabel: STAGE_LABELS[stage] || '',
      hostMode: hosted ? hostMode : this.data.hostMode,
      privacyPassed: Boolean(hostMeta.privacyAuditPassedAt),
      privacyBlocks: [],
      geoDraft,
      geoSummary: geoDraft.summary || geoLayer.summary || '',
      geoConfirmed: Boolean(geoLayer.confirmedAt) || hostMeta.visibility === 'public',
    })
  },

  onRetry() {
    this.bootstrap()
  },

  onSelectMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (!mode || this.data.hosted) return
    this.setData({ hostMode: mode })
  },

  async onSwitchToPublic() {
    if (this.data.working) return
    this.setData({ working: true })
    try {
      const res = await hostMerchantAlbum(this.albumId, { mode: 'public', useDesensitizeTool: true })
      const album = await fetchMerchantServiceAlbum(this.albumId)
      this.applyAlbum(album)
      this.setData({ hostMode: 'public' })
      if (res && res.nextStep === 'privacy') {
        await this.onRunPrivacyAudit()
      } else if (res && res.nextStep === 'geo') {
        await this.onGenerateGeo()
      }
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  async onSubmitHost() {
    if (this.data.working || this.data.hosted) return
    this.setData({ working: true })
    try {
      const res = await hostMerchantAlbum(this.albumId, {
        mode: this.data.hostMode,
        useDesensitizeTool: true,
      })
      wx.showToast({ title: '已托管', icon: 'success' })
      const album = await fetchMerchantServiceAlbum(this.albumId)
      this.applyAlbum(album)
      if (this.data.hostMode === 'public' || (res && res.nextStep === 'privacy')) {
        await this.onRunPrivacyAudit()
      }
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '托管失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  async onRunPrivacyAudit() {
    if (this.data.working) return
    this.setData({ working: true })
    try {
      const res = await auditHostedPublicPrivacy(this.albumId)
      const blocks = res.hardBlocks || []
      this.setData({
        privacyPassed: Boolean(res.passed),
        privacyBlocks: blocks,
        publicPublishStage: res.publicPublishStage || this.data.publicPublishStage,
        stageLabel: STAGE_LABELS[res.publicPublishStage] || this.data.stageLabel,
      })
      if (res.passed) {
        wx.showToast({ title: '隐私校验通过', icon: 'success' })
        await this.onGenerateGeo()
      } else {
        wx.showToast({
          title: (blocks[0] && blocks[0].message) || '隐私校验未通过',
          icon: 'none',
        })
      }
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '校验失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  async onGenerateGeo() {
    if (this.data.working || !this.data.privacyPassed) return
    this.setData({ working: true })
    try {
      const res = await generateHostedGeoDraft(this.albumId)
      const draft = res.geoDraft || {}
      this.setData({
        geoDraft: draft,
        geoSummary: draft.summary || '',
        publicPublishStage: res.publicPublishStage || 'awaiting_geo_confirm',
        stageLabel: STAGE_LABELS.awaiting_geo_confirm,
      })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '生成失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  onGeoSummaryInput(e) {
    this.setData({ geoSummary: e.detail.value })
  },

  async onConfirmPublic() {
    if (this.data.working) return
    const summary = String(this.data.geoSummary || '').trim()
    if (!summary) {
      wx.showToast({ title: '请填写摘要', icon: 'none' })
      return
    }
    this.setData({ working: true })
    try {
      await confirmHostedPublicPublish(this.albumId, {
        summary,
        faq: (this.data.geoDraft && this.data.geoDraft.faq) || [],
      })
      wx.showToast({ title: '已公开', icon: 'success' })
      const album = await fetchMerchantServiceAlbum(this.albumId)
      this.applyAlbum(album)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '公开失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },
})
