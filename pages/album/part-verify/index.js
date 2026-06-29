const {
  fetchAlbumPartVerifyContext,
  saveAlbumPartVerifications,
} = require('../../../services/album-part-verify')
const { persistLocalImages } = require('../../../utils/media-upload')
const { checkAuth } = require('../../../utils/auth')
const { PART_VERIFY_CONSENT_TEXT } = require('../../../constants/album-review')

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    albumTitle: '',
    parts: [],
    summaryLabel: '',
    consentText: PART_VERIFY_CONSENT_TEXT,
    consent: false,
    submitting: false,
    loginSheetVisible: false,
    statusOptions: [
      { value: 'matched', label: '与登记一致' },
      { value: 'question', label: '有疑问' },
      { value: 'skipped', label: '暂未核对' },
    ],
  },

  onLoad(options) {
    const albumId = String(options.albumId || '').trim()
    if (!albumId) {
      this.setData({ status: 'error', errorMessage: '缺少相册信息' })
      return
    }
    this.setData({ albumId })
    wx.setNavigationBarTitle({ title: '核对配件' })
    if (!checkAuth().ok) {
      this.setData({ loginSheetVisible: true })
    }
    this.loadContext()
  },

  async loadContext() {
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const data = await fetchAlbumPartVerifyContext(this.data.albumId)
      if (!data.hasParts) {
        this.setData({
          status: 'empty',
          albumTitle: data.albumTitle || '我的服务相册',
        })
        return
      }
      const parts = (data.parts || []).map((part) => ({
        ...part,
        status: (part.verification && part.verification.status) || 'skipped',
        note: (part.verification && part.verification.note) || '',
        images: (part.verification && part.verification.images) || [],
      }))
      this.setData({
        status: 'normal',
        albumTitle: data.albumTitle || '我的服务相册',
        parts,
        summaryLabel: (data.summary && data.summary.label) || '',
        consentText: data.consentText || PART_VERIFY_CONSENT_TEXT,
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onStatusTap(e) {
    const { index, status } = e.currentTarget.dataset
    const key = `parts[${index}].status`
    this.setData({ [key]: status })
  },

  onNoteInput(e) {
    const { index } = e.currentTarget.dataset
    this.setData({ [`parts[${index}].note`]: e.detail.value || '' })
  },

  onImagesChange(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (Number.isNaN(index)) return
    this.setData({ [`parts[${index}].images`]: e.detail.images || [] })
  },

  onRetry() {
    this.loadContext()
  },

  toggleConsent() {
    this.setData({ consent: !this.data.consent })
  },

  ensureAuth() {
    const auth = checkAuth()
    if (!auth.ok) {
      this.setData({ loginSheetVisible: true })
      return false
    }
    return true
  },

  closeLoginSheet() {
    this.setData({ loginSheetVisible: false })
  },

  onLoginSuccess() {
    this.closeLoginSheet()
    this.loadContext()
  },

  async onSubmit() {
    if (this.data.submitting) return
    if (!this.ensureAuth()) return
    if (!this.data.consent) {
      wx.showToast({ title: '请先勾选核对声明', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const items = []
      for (const part of this.data.parts) {
        let images = part.images || []
        if (images.length) {
          const uploaded = await persistLocalImages(images)
          images = uploaded.images
        }
        items.push({
          partKey: part.partKey,
          partName: part.name,
          partType: part.partType,
          status: part.status || 'skipped',
          note: String(part.note || '').trim(),
          images,
        })
      }
      await saveAlbumPartVerifications(this.data.albumId, {
        consent: true,
        items,
      })
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
