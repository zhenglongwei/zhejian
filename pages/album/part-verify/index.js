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
  PART_VERIFY_VALUE_LINE,
  PART_VERIFY_STEPS,
  PART_VERIFY_DEGRADE_HINT,
  PART_VERIFY_ONSITE_REMINDER,
  PART_VERIFY_ALBUM_SECTION_TITLE,
  PART_VERIFY_PLAN_SECTION_TITLE,
  PART_VERIFY_EXTRA_SECTION_TITLE,
  PART_VERIFY_STATUS_OPTIONS,
  PART_VERIFY_FIELD_DIFF_LABELS,
  PART_VERIFY_LINK_STATUS_HINT,
} = require('../../../constants/album-review')

function mapVerificationFields(entry = {}) {
  const verification = entry.verification || {}
  return {
    ...entry,
    status: verification.status || 'skipped',
    note: verification.note || '',
    images: verification.images || [],
  }
}

function resolveTypeVariant(partType) {
  return PART_TYPE_VARIANT[partType] || 'default'
}

function mapPairCard(entry = {}) {
  const plan = entry.planPart || {}
  const album = entry.albumPart || {}
  const fieldDiffs = Array.isArray(entry.fieldDiffs) ? entry.fieldDiffs : []
  const diffLabels = fieldDiffs
    .map((key) => PART_VERIFY_FIELD_DIFF_LABELS[key] || key)
    .filter(Boolean)
  const title = plan.name || album.name || '配件项'
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
    diffLabels,
    showPlanColumn: Boolean(plan.name || entry.linkStatus === 'plan_only'),
    showAlbumColumn: Boolean(album.name || entry.linkStatus !== 'plan_only'),
    status: entry.status || 'skipped',
    note: entry.note || '',
    images: entry.images || [],
    partName: album.name || plan.name || '',
    partType: album.partType || plan.partType || '',
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
    valueLine: PART_VERIFY_VALUE_LINE,
    steps: PART_VERIFY_STEPS,
    albumSectionTitle: PART_VERIFY_ALBUM_SECTION_TITLE,
    planSectionTitle: PART_VERIFY_PLAN_SECTION_TITLE,
    extraSectionTitle: PART_VERIFY_EXTRA_SECTION_TITLE,
    onsiteReminder: PART_VERIFY_ONSITE_REMINDER,
    onsiteExpanded: false,
    consentText: PART_VERIFY_CONSENT_TEXT,
    consent: false,
    submitting: false,
    loginSheetVisible: false,
    statusOptions: PART_VERIFY_STATUS_OPTIONS,
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
          qty: part.qty,
          thumbUrl: part.thumbUrl,
          partName: part.name,
        }))
        verifyItems = parts
      }

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
        onsiteReminder: data.onsiteReminder || PART_VERIFY_ONSITE_REMINDER,
        consentText: data.consentText || PART_VERIFY_CONSENT_TEXT,
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

  onToggleOnsite() {
    this.setData({ onsiteExpanded: !this.data.onsiteExpanded })
  },

  onContactStore() {
    const phone = String(this.data.storePhone || '').trim()
    if (!phone) {
      wx.showToast({ title: '暂无门店电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  onStatusTap(e) {
    const { partKey, status } = e.currentTarget.dataset
    const index = this.findVerifyIndex(partKey)
    if (index < 0) return
    this.setData({ [`verifyItems[${index}].status`]: status })
    this.syncDisplayLists(index, { status })
  },

  onNoteInput(e) {
    const { partKey } = e.currentTarget.dataset
    const index = this.findVerifyIndex(partKey)
    if (index < 0) return
    const note = e.detail.value || ''
    this.setData({ [`verifyItems[${index}].note`]: note })
    this.syncDisplayLists(index, { note })
  },

  onImagesChange(e) {
    const partKey = e.currentTarget.dataset.partKey
    const index = this.findVerifyIndex(partKey)
    if (index < 0) return
    const images = e.detail.images || []
    this.setData({ [`verifyItems[${index}].images`]: images })
    this.syncDisplayLists(index, { images })
  },

  syncDisplayLists(index, overrides = {}) {
    const base = this.data.verifyItems[index]
    if (!base) return
    const item = { ...base, ...overrides }
    const patch = {
      status: item.status,
      note: item.note,
      images: item.images,
    }
    if (this.data.usePairsMode) {
      const pairIndex = (this.data.pairs || []).findIndex((row) => row.partKey === item.partKey)
      if (pairIndex >= 0) {
        this.setData({
          [`pairs[${pairIndex}].status`]: patch.status,
          [`pairs[${pairIndex}].note`]: patch.note,
          [`pairs[${pairIndex}].images`]: patch.images,
        })
        return
      }
      const extraIndex = (this.data.extras || []).findIndex((row) => row.partKey === item.partKey)
      if (extraIndex >= 0) {
        this.setData({
          [`extras[${extraIndex}].status`]: patch.status,
          [`extras[${extraIndex}].note`]: patch.note,
          [`extras[${extraIndex}].images`]: patch.images,
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
      })
    }
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
        items,
      })
      wx.showToast({ title: PART_VERIFY_SUCCESS_MESSAGE, icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
