const {
  fetchAlbumPartVerifyContext,
  saveAlbumPartVerifications,
} = require('../../../services/album-part-verify')
const { persistLocalImages } = require('../../../utils/media-upload')
const { checkAuth } = require('../../../utils/auth')
const { PART_TYPE_VARIANT } = require('../../../constants/part-type')
const {
  PART_VERIFY_CONSENT_TEXT,
  PART_VERIFY_SUCCESS_MESSAGE,
  PART_VERIFY_PAGE_TITLE,
  PART_VERIFY_DEGRADE_HINT,
  PART_VERIFY_ALBUM_SECTION_TITLE,
  PART_VERIFY_PLAN_SECTION_TITLE,
  PART_VERIFY_EXTRA_SECTION_TITLE,
  PART_VERIFY_STATUS_OPTIONS,
  PART_VERIFY_LINK_STATUS_HINT,
  PART_VERIFY_METHOD_TITLE,
  PART_VERIFY_METHOD_STEPS,
  PART_VERIFY_STORE_METHOD_INFORMED,
  PART_VERIFY_STORE_METHOD_FALLBACK,
  PART_VERIFY_GUIDE_FEEDBACK_TITLE,
  PART_VERIFY_GUIDE_FEEDBACK_OPTIONS,
  PART_VERIFY_UPLOAD_HINT,
} = require('../../../constants/album-review')

function resolveStoreMethodView(guide = {}) {
  const text = String(guide.text || '').trim()
  if (text) {
    return { methodMode: 'text', storeMethodText: text }
  }
  if (guide.informedOffline) {
    return {
      methodMode: 'informed',
      storeMethodText: PART_VERIFY_STORE_METHOD_INFORMED,
    }
  }
  return {
    methodMode: 'fallback',
    storeMethodText: PART_VERIFY_STORE_METHOD_FALLBACK,
  }
}

function mapVerificationFields(entry = {}) {
  const verification = entry.verification || {}
  return {
    ...entry,
    status: verification.status || 'skipped',
    note: verification.note || '',
    images: verification.images || [],
    detailOpen: Boolean(verification.note || (verification.images && verification.images.length)),
  }
}

function resolveTypeVariant(partType) {
  return PART_TYPE_VARIANT[partType] || 'default'
}

function mapPairCard(entry = {}) {
  const plan = entry.planPart || {}
  const album = entry.albumPart || {}
  const title = album.name || plan.name || '配件项'
  return {
    partKey: entry.partKey,
    title,
    planName: plan.name || '',
    planType: plan.partType || '',
    planTypeVariant: resolveTypeVariant(plan.partType),
    planBrand: plan.partBrand || '',
    planCode: plan.partCode || '',
    planQty: plan.qty || 0,
    albumName: album.name || '',
    albumType: album.partType || '',
    albumTypeVariant: resolveTypeVariant(album.partType),
    albumBrand: album.partBrand || '',
    albumCode: album.partCode || '',
    albumQty: album.qty || 0,
    thumbUrl: album.thumbUrl || '',
    linkStatus: entry.linkStatus || 'linked',
    linkHint: PART_VERIFY_LINK_STATUS_HINT[entry.linkStatus] || '',
    diffLabels: [],
    showPlanColumn: false,
    showAlbumColumn: Boolean(album.name || entry.linkStatus !== 'plan_only'),
    status: entry.status || 'skipped',
    note: entry.note || '',
    images: entry.images || [],
    partName: album.name || plan.name || '',
    partType: album.partType || '',
  }
}

function mapExtraCard(entry = {}) {
  const album = entry.albumPart || {}
  const card = mapPairCard({
    ...entry,
    planPart: null,
    linkStatus: 'album_only',
  })
  return {
    ...card,
    title: album.name || '方案外增项',
    showPlanColumn: false,
    showAlbumColumn: true,
  }
}

Page({
  data: {
    status: 'loading',
    errorMessage: '',
    albumId: '',
    albumTitle: '',
    storeName: '',
    storePhone: '',
    usePairsMode: false,
    pairs: [],
    extras: [],
    parts: [],
    verifyItems: [],
    planQuoteThumbs: [],
    summaryLabel: '',
    planSummary: '',
    hasStructuredPlanParts: false,
    showDegradeHint: false,
    degradeHint: PART_VERIFY_DEGRADE_HINT,
    methodSteps: PART_VERIFY_METHOD_STEPS,
    methodTitle: PART_VERIFY_METHOD_TITLE,
    methodMode: 'fallback',
    storeMethodText: PART_VERIFY_STORE_METHOD_FALLBACK,
    albumSectionTitle: PART_VERIFY_ALBUM_SECTION_TITLE,
    planSectionTitle: PART_VERIFY_PLAN_SECTION_TITLE,
    extraSectionTitle: PART_VERIFY_EXTRA_SECTION_TITLE,
    planExpanded: false,
    guideFeedbackExpanded: false,
    consentText: PART_VERIFY_CONSENT_TEXT,
    consent: false,
    submitting: false,
    loginSheetVisible: false,
    statusOptions: PART_VERIFY_STATUS_OPTIONS,
    guideFeedbackTitle: PART_VERIFY_GUIDE_FEEDBACK_TITLE,
    guideFeedbackOptions: PART_VERIFY_GUIDE_FEEDBACK_OPTIONS,
    guideFeedback: '',
    uploadHint: PART_VERIFY_UPLOAD_HINT,
  },

  onLoad(options) {
    const albumId = String(options.albumId || '').trim()
    if (!albumId) {
      this.setData({ status: 'error', errorMessage: '缺少相册信息' })
      return
    }
    this.setData({ albumId })
    wx.setNavigationBarTitle({ title: PART_VERIFY_PAGE_TITLE })
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

      const usePairsMode = Boolean(
        data.hasStructuredPlanParts &&
          ((data.pairs && data.pairs.length) || (data.extras && data.extras.length)),
      )

      let verifyItems = []
      let pairs = []
      let extras = []
      let parts = []

      if (usePairsMode) {
        pairs = (data.pairs || []).map((entry) => mapPairCard(mapVerificationFields(entry)))
        extras = (data.extras || []).map((entry) => mapExtraCard(mapVerificationFields(entry)))
        verifyItems = [...pairs, ...extras]
      } else {
        parts = (data.parts || []).map((part) => ({
          ...mapVerificationFields({
            partKey: part.partKey,
            albumPart: part,
            verification: part.verification,
          }),
          name: part.name,
          partType: part.partType,
          typeVariant: resolveTypeVariant(part.partType),
          partBrand: part.partBrand || '',
          partCode: part.partCode || '',
          qty: part.qty,
          thumbUrl: part.thumbUrl,
          partName: part.name,
        }))
        verifyItems = parts
      }

      const methodView = resolveStoreMethodView(data.partVerifyGuide || {})
      const guideFeedback = String((data.partVerifyGuide && data.partVerifyGuide.ownerFeedback) || '')

      this.setData({
        status: 'normal',
        albumTitle: data.albumTitle || '我的服务相册',
        storeName: data.storeName || '',
        storePhone: data.storePhone || '',
        usePairsMode,
        pairs,
        extras,
        parts,
        verifyItems,
        planQuoteThumbs: data.planQuoteThumbs || [],
        summaryLabel: (data.summary && data.summary.label) || '',
        planSummary: data.planSummary || '',
        hasStructuredPlanParts: Boolean(data.hasStructuredPlanParts),
        showDegradeHint: !data.hasStructuredPlanParts,
        consentText: data.consentText || PART_VERIFY_CONSENT_TEXT,
        methodMode: methodView.methodMode,
        storeMethodText: methodView.storeMethodText,
        guideFeedback,
      })
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  findVerifyIndex(partKey) {
    return (this.data.verifyItems || []).findIndex((item) => item.partKey === partKey)
  },

  onTogglePlan() {
    this.setData({ planExpanded: !this.data.planExpanded })
  },

  onToggleGuideFeedback() {
    this.setData({ guideFeedbackExpanded: !this.data.guideFeedbackExpanded })
  },

  onContactStore() {
    const phone = String(this.data.storePhone || '').trim()
    if (!phone) {
      wx.showToast({ title: '暂无门店电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  onItemStatusTap(e) {
    const { partKey, status } = e.detail || {}
    this.applyStatusChange(partKey, status)
  },

  applyStatusChange(partKey, status) {
    const index = this.findVerifyIndex(partKey)
    if (index < 0 || !status) return
    const overrides = { status }
    if (status === 'question' && !this.data.verifyItems[index].detailOpen) {
      overrides.detailOpen = true
    }
    this.setData({
      [`verifyItems[${index}].status`]: status,
      ...(overrides.detailOpen ? { [`verifyItems[${index}].detailOpen`]: true } : {}),
    })
    this.syncDisplayLists(index, overrides)
  },

  onItemNoteInput(e) {
    const { partKey, value } = e.detail || {}
    const index = this.findVerifyIndex(partKey)
    if (index < 0) return
    const note = value || ''
    this.setData({ [`verifyItems[${index}].note`]: note })
    this.syncDisplayLists(index, { note })
  },

  onItemImagesChange(e) {
    const { partKey, images } = e.detail || {}
    const index = this.findVerifyIndex(partKey)
    if (index < 0) return
    this.setData({ [`verifyItems[${index}].images`]: images || [] })
    this.syncDisplayLists(index, { images: images || [] })
  },

  onItemDetailToggle(e) {
    const { partKey } = e.detail || {}
    this.applyDetailToggle(partKey)
  },

  applyDetailToggle(partKey) {
    const index = this.findVerifyIndex(partKey)
    if (index < 0) return
    const nextOpen = !this.data.verifyItems[index].detailOpen
    this.setData({ [`verifyItems[${index}].detailOpen`]: nextOpen })
    this.syncDisplayLists(index, { detailOpen: nextOpen })
  },

  syncDisplayLists(index, overrides = {}) {
    const base = this.data.verifyItems[index]
    if (!base) return
    const item = { ...base, ...overrides }
    const patch = {
      status: item.status,
      note: item.note,
      images: item.images,
      detailOpen: item.detailOpen,
    }
    if (this.data.usePairsMode) {
      const pairIndex = (this.data.pairs || []).findIndex((row) => row.partKey === item.partKey)
      if (pairIndex >= 0) {
        this.setData({
          [`pairs[${pairIndex}].status`]: patch.status,
          [`pairs[${pairIndex}].note`]: patch.note,
          [`pairs[${pairIndex}].images`]: patch.images,
          [`pairs[${pairIndex}].detailOpen`]: patch.detailOpen,
        })
        return
      }
      const extraIndex = (this.data.extras || []).findIndex((row) => row.partKey === item.partKey)
      if (extraIndex >= 0) {
        this.setData({
          [`extras[${extraIndex}].status`]: patch.status,
          [`extras[${extraIndex}].note`]: patch.note,
          [`extras[${extraIndex}].images`]: patch.images,
          [`extras[${extraIndex}].detailOpen`]: patch.detailOpen,
        })
      }
      return
    }
    const partIndex = (this.data.parts || []).findIndex((row) => row.partKey === item.partKey)
    if (partIndex >= 0) {
      this.setData({
        [`parts[${partIndex}].status`]: patch.status,
        [`parts[${partIndex}].note`]: patch.note,
        [`parts[${partIndex}].images`]: patch.images,
        [`parts[${partIndex}].detailOpen`]: patch.detailOpen,
      })
    }
  },

  onGuideFeedbackTap(e) {
    const value = String((e.currentTarget.dataset && e.currentTarget.dataset.value) || '')
    this.setData({
      guideFeedback: this.data.guideFeedback === value ? '' : value,
    })
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
      wx.showToast({ title: '请先勾选验真声明', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const items = []
      for (const part of this.data.verifyItems) {
        let images = part.images || []
        if (images.length) {
          const uploaded = await persistLocalImages(images)
          images = uploaded.images
        }
        items.push({
          partKey: part.partKey,
          partName: part.partName || part.title || part.name || '',
          partType: part.partType || '',
          status: part.status || 'skipped',
          note: String(part.note || '').trim(),
          images,
        })
      }
      await saveAlbumPartVerifications(this.data.albumId, {
        consent: true,
        guideFeedback: this.data.guideFeedback || '',
        items,
      })
      const hasQuestion = items.some((row) => row.status === 'question')
      if (hasQuestion) {
        wx.showModal({
          title: '验真记录已保存',
          content: '你有配件标记为「有疑问」。如需进一步沟通，可向门店提交问题反馈。',
          confirmText: '去反馈',
          cancelText: '知道了',
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({
                url: `/pages/album/feedback/index?albumId=${encodeURIComponent(this.data.albumId)}`,
              })
              return
            }
            wx.navigateBack()
          },
        })
        return
      }
      wx.showToast({ title: PART_VERIFY_SUCCESS_MESSAGE, icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
