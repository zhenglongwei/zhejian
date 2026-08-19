const {
  fetchMerchantCaseDraft,
  fetchMerchantCaseDraftMaskStatus,
  saveMerchantCaseDraft,
  polishMerchantCaseDraft,
  confirmAndCompleteMerchantCaseDraft,
  exportMerchantCaseDraftCopy,
  generateMerchantPublicCase,
  confirmMerchantPublicCasePublish,
} = require('../../../../services/merchant-service-album')
const {
  fetchMerchantProfile,
  MERCHANT_STATUS,
} = require('../../../../services/merchant')
const { resolveImageSrc, isDesensitizedUrl } = require('../../../../utils/desensitize-url')

Page({
  data: {
    status: 'loading',
    loadingHint: '正在写顺文案，请稍候',
    errorMessage: '',
    albumId: '',
    fromComplete: false,
    generateMode: false,
    resubmit: false,
    editable: false,
    saving: false,
    completing: false,
    generating: false,
    publishing: false,
    title: '',
    caseSummary: '',
    titleHeight: 40,
    summaryHeight: 40,
    faq: [],
    sections: [],
    hasDetailSections: false,
    media: [],
    confirmed: false,
    primaryActionText: '确认完工',
    showCompletePrimary: false,
    showGeneratePrimary: false,
    showPublishPrimary: false,
    auditScore: null,
    auditPassed: false,
    auditPainBonus: 0,
    auditClaims: [],
    auditHardBlocks: [],
    auditSummary: '',
    canPublish: false,
  },

  /** 页面工作稿：同步更新，避免 setData 未完成就提交旧文 */
  _workingDraft: null,

  onLoad(options) {
    this.albumId = options.albumId || ''
    const fromComplete = options.from === 'complete' || options.gate === '1'
    this.generateMode = options.from === 'generate'
    const generateMode = this.generateMode
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '服务相册信息缺失' })
      return
    }
    this.setData({ fromComplete, generateMode })
    this.initPage()
  },

  onUnload() {
    this._maskPollGeneration = (this._maskPollGeneration || 0) + 1
  },

  async initPage() {
    const profile = await fetchMerchantProfile()
    if (!profile || profile.status !== MERCHANT_STATUS.APPROVED) {
      this.setData({ status: 'error', errorMessage: '请先完成商家入驻' })
      return
    }
    await this.loadDraft()
  },

  /** 按正文字号估算 textarea 高度，避免微信 auto-height 异步赋值失效 */
  measureTextHeight(text = '', minLines = 1) {
    let windowWidth = 375
    try {
      const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()
      windowWidth = info.windowWidth || 375
    } catch (_) {
      windowWidth = 375
    }
    const rpx = windowWidth / 750
    const linePx = 40 * rpx
    const padY = 16 * rpx * 2
    // 页边距 32*2 + 卡片内边距 24*2 + 文本框左右 padding 16*2
    const textWidth = Math.max(120, windowWidth - 144 * rpx)
    const charPx = 28 * rpx
    const cols = Math.max(6, Math.floor(textWidth / charPx))
    const raw = String(text || '')
    let lines = 0
    if (!raw) {
      lines = minLines
    } else {
      raw.split('\n').forEach((row) => {
        const len = Array.from(row).length
        lines += Math.max(1, Math.ceil(len / cols))
      })
    }
    return Math.ceil(Math.max(minLines, lines) * linePx + padY + 2)
  },

  mediaDisplayUrl(item) {
    const masked = resolveImageSrc((item && item.maskedUrl) || '')
    const preview = resolveImageSrc((item && item.previewUrl) || '')
    if (this.generateMode) {
      if (masked) return masked
      if (preview && isDesensitizedUrl(preview)) return preview
      return ''
    }
    return preview || masked
  },

  mapMedia(list) {
    return (list || [])
      .map((item) => ({
        ...item,
        id: `${item.nodeId}_${item.idx}`,
        displayUrl: this.mediaDisplayUrl(item),
      }))
      .filter((item) => item.displayUrl)
  },

  mapSections(list, media) {
    const mediaList = media || []
    return (list || []).map((sec) => {
      const body = String((sec && sec.body) || '').trim()
      const bodyBlank =
        !body || body === '旧件与交车确认以门店留档为准；质保以门店承诺为准。'
      const sectionMedia = mediaList.filter((item) => item && item.sectionKey === sec.key)
      return {
        ...sec,
        media: sectionMedia,
        bodyHeight: this.measureTextHeight(sec && sec.body, 1),
        hasContent: !bodyBlank || sectionMedia.length > 0,
      }
    })
  },

  mapFaq(list) {
    return (list || []).map((item) => ({
      q: (item && item.q) || '',
      a: (item && item.a) || '',
      qHeight: this.measureTextHeight((item && item.q) || '', 1),
      aHeight: this.measureTextHeight((item && item.a) || '', 2),
    }))
  },

  applyDraftView(draft = {}, extra = {}) {
    const title = draft.title || ''
    const caseSummary = draft.caseSummary || ''
    const media = this.mapMedia(draft.media || [])
    const sections = this.mapSections(draft.sections || [], media)
    const faq = this.mapFaq(draft.faq || [])
    const editable = extra.editable != null ? Boolean(extra.editable) : this.data.editable
    const resubmit = extra.resubmit != null ? Boolean(extra.resubmit) : this.data.resubmit
    const fromComplete = this.data.fromComplete
    const generateMode = this.generateMode || this.data.generateMode
    const canPublish = Boolean(extra.canPublish)
    const audit = extra.audit || null
    const showPublishPrimary = Boolean(editable && canPublish && generateMode)
    const showGeneratePrimary = Boolean(editable && generateMode && !resubmit && !showPublishPrimary)
    const showCompletePrimary = Boolean(editable && (fromComplete || resubmit) && !generateMode)
    const primaryActionText = showPublishPrimary
      ? '确认发布到店页'
      : generateMode
        ? '生成并机审'
        : resubmit
          ? '重新提交'
          : '确认完工'
    if (showGeneratePrimary || showPublishPrimary) {
      wx.setNavigationBarTitle({ title: '生成公开案例' })
    } else if (showCompletePrimary) {
      wx.setNavigationBarTitle({
        title: resubmit ? '案例预览 · 重新提交' : '案例预览 · 确认完工',
      })
    }
    const auditClaims = Array.isArray(audit && audit.unsupportedClaims)
      ? audit.unsupportedClaims
      : []
    const auditHardBlocks = Array.isArray(audit && audit.hardBlocks) ? audit.hardBlocks : []
    let auditSummary = ''
    if (audit) {
      const score = audit.authenticityScore != null ? audit.authenticityScore : '—'
      const thr = audit.threshold != null ? audit.threshold : 60
      auditSummary = audit.passed
        ? `机审已过线：真实性 ${score}/${thr}`
        : `机审未过线：真实性 ${score}/${thr}，请按下方清单补证后再生成`
    }
    this._workingDraft = {
      title,
      caseSummary,
      faq: faq.map((item) => ({ q: item.q, a: item.a })),
      sections: sections.map((sec) => ({
        key: sec.key,
        title: sec.title,
        body: sec.body || '',
      })),
      media: media.map((item) => ({
        nodeId: item.nodeId,
        idx: item.idx,
        maskedUrl: item.maskedUrl || '',
        previewUrl: item.previewUrl || '',
        caption: item.caption || '',
        hint: item.hint || '',
        sectionKey: item.sectionKey || '',
      })),
      source: draft.source || (this._workingDraft && this._workingDraft.source) || 'merchant_edit',
    }
    this.setData({
      ...extra,
      title,
      caseSummary,
      faq,
      titleHeight: this.measureTextHeight(title, 1),
      summaryHeight: this.measureTextHeight(caseSummary, 2),
      sections,
      hasDetailSections: sections.some((sec) => sec && sec.hasContent),
      media,
      resubmit,
      primaryActionText,
      showCompletePrimary,
      showGeneratePrimary,
      showPublishPrimary,
      canPublish,
      auditScore: audit && audit.authenticityScore != null ? audit.authenticityScore : null,
      auditPassed: Boolean(audit && audit.passed),
      auditPainBonus: (audit && audit.painPointBonus) || 0,
      auditClaims,
      auditHardBlocks,
      auditSummary,
    })
  },

  needsAutoPolish(draft = {}, extra = {}) {
    const editable = extra.editable != null ? Boolean(extra.editable) : this.data.editable
    const confirmed = Boolean(extra.confirmed || (draft && draft.confirmedAt))
    const source = String((draft && draft.source) || 'rule')
    return Boolean(editable && !confirmed && source !== 'llm' && source !== 'merchant_edit')
  },

  async polishDraftQuietly(draft = {}) {
    try {
      const data = await polishMerchantCaseDraft(this.albumId, {
        draft: {
          title: draft.title || '',
          caseSummary: draft.caseSummary || '',
          faq: draft.faq || [],
          sections: draft.sections || [],
          media: draft.media || [],
          source: draft.source || 'rule',
        },
      })
      const next = data.draft || {}
      return {
        ...next,
        media: Array.isArray(draft.media) && draft.media.length ? draft.media : next.media || [],
      }
    } catch (_) {
      return draft
    }
  },

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  },

  async waitForDraftMask(retry = false) {
    const MASK_POLL_MS = 2000
    const MASK_POLL_MAX_MS = 5 * 60 * 1000
    this._maskPollGeneration = (this._maskPollGeneration || 0) + 1
    const generation = this._maskPollGeneration
    const started = Date.now()
    let askedRetry = Boolean(retry)
    while (Date.now() - started < MASK_POLL_MAX_MS) {
      if (this._maskPollGeneration !== generation) {
        const err = new Error('已取消')
        err.cancelled = true
        throw err
      }
      const data = await fetchMerchantCaseDraftMaskStatus(this.albumId, {
        retry: askedRetry,
      })
      askedRetry = false
      const state = data && data.state
      if (state === 'ready') return
      if (state === 'failed') {
        throw new Error('配图打码失败，请稍后重试')
      }
      await this.sleep(MASK_POLL_MS)
    }
    throw new Error('配图处理超时，请稍后重试')
  },

  async loadDraft(options = {}) {
    const retryMask = Boolean(options.retryMask)
    this.setData({
      status: 'loading',
      errorMessage: '',
      loadingHint: this.generateMode ? '正在处理配图' : '正在写顺文案，请稍候',
    })
    try {
      if (this.generateMode) {
        await this.waitForDraftMask(retryMask)
        this.setData({ loadingHint: '正在写顺文案，请稍候' })
      }
      const data = await fetchMerchantCaseDraft(this.albumId)
      let draft = data.draft || {}
      const extra = {
        albumId: this.albumId,
        editable: Boolean(data.editable),
        resubmit: Boolean(data.resubmit),
        confirmed: Boolean(data.confirmed || (draft && draft.confirmedAt)),
        audit: data.audit || null,
        meta: data.meta || null,
        canPublish: Boolean(data.canPublish),
      }
      if (this.needsAutoPolish(draft, extra)) {
        draft = await this.polishDraftQuietly(draft)
      }
      this.applyDraftView(draft, {
        status: 'normal',
        ...extra,
      })
    } catch (e) {
      if (e && e.cancelled) return
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  onRetry() {
    this.loadDraft({ retryMask: this.generateMode })
  },

  onTitleInput(e) {
    const title = e.detail.value || ''
    if (this._workingDraft) this._workingDraft.title = title
    this.setData({
      title,
      titleHeight: this.measureTextHeight(title, 1),
    })
  },

  onSummaryInput(e) {
    const caseSummary = e.detail.value || ''
    if (this._workingDraft) this._workingDraft.caseSummary = caseSummary
    this.setData({
      caseSummary,
      summaryHeight: this.measureTextHeight(caseSummary, 2),
    })
  },

  onSectionInput(e) {
    const { key } = e.currentTarget.dataset
    const value = e.detail.value || ''
    const sections = (this.data.sections || []).map((sec) =>
      sec.key === key
        ? { ...sec, body: value, bodyHeight: this.measureTextHeight(value, 1) }
        : sec,
    )
    if (this._workingDraft) {
      this._workingDraft.sections = sections.map((sec) => ({
        key: sec.key,
        title: sec.title,
        body: sec.body || '',
      }))
    }
    this.setData({ sections })
  },

  onFaqInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    const value = e.detail.value || ''
    const faq = (this.data.faq || []).map((item, i) => {
      if (i !== index) return item
      const next = { ...item, [field]: value }
      if (field === 'q') next.qHeight = this.measureTextHeight(value, 1)
      if (field === 'a') next.aHeight = this.measureTextHeight(value, 2)
      return next
    })
    if (this._workingDraft) {
      this._workingDraft.faq = faq.map((item) => ({ q: item.q, a: item.a }))
    }
    this.setData({ faq })
  },

  onRemoveFaq(e) {
    const index = Number(e.currentTarget.dataset.index)
    const faq = (this.data.faq || []).filter((_, i) => i !== index)
    if (this._workingDraft) {
      this._workingDraft.faq = faq.map((item) => ({ q: item.q, a: item.a }))
    }
    this.setData({ faq })
  },

  onPreviewMedia(e) {
    const { nodeId, idx } = e.currentTarget.dataset
    const urls = (this.data.media || [])
      .map((item) => item && item.displayUrl)
      .filter(Boolean)
    if (!urls.length) return
    const currentItem = (this.data.media || []).find(
      (item) => String(item.nodeId) === String(nodeId) && Number(item.idx) === Number(idx),
    )
    const current = (currentItem && currentItem.displayUrl) || urls[0]
    wx.previewImage({ current, urls })
  },

  onRemoveMedia(e) {
    const { nodeId, idx } = e.currentTarget.dataset
    const media = (this.data.media || []).filter(
      (item) => !(String(item.nodeId) === String(nodeId) && Number(item.idx) === Number(idx)),
    )
    if (this._workingDraft) {
      this._workingDraft.media = media.map((item) => ({
        nodeId: item.nodeId,
        idx: item.idx,
        maskedUrl: item.maskedUrl || '',
        previewUrl: item.previewUrl || '',
        caption: item.caption || '',
        hint: item.hint || '',
        sectionKey: item.sectionKey || '',
      }))
    }
    this.setData({ media })
  },

  buildDraftPayload() {
    if (this._workingDraft) {
      return {
        title: this._workingDraft.title || '',
        caseSummary: this._workingDraft.caseSummary || '',
        faq: (this._workingDraft.faq || []).map((item) => ({
          q: item.q || '',
          a: item.a || '',
        })),
        sections: (this._workingDraft.sections || []).map((sec) => ({
          key: sec.key,
          title: sec.title,
          body: sec.body,
        })),
        media: (this._workingDraft.media || []).map((item) => ({
          nodeId: item.nodeId,
          idx: item.idx,
          maskedUrl: item.maskedUrl || '',
          previewUrl: item.previewUrl || '',
          caption: item.caption || '',
          hint: item.hint || '',
          sectionKey: item.sectionKey || '',
        })),
        source: this._workingDraft.source || 'merchant_edit',
      }
    }
    return {
      title: this.data.title,
      caseSummary: this.data.caseSummary,
      faq: (this.data.faq || []).map((item) => ({
        q: item.q || '',
        a: item.a || '',
      })),
      sections: (this.data.sections || []).map((sec) => ({
        key: sec.key,
        title: sec.title,
        body: sec.body,
      })),
      media: (this.data.media || []).map((item) => ({
        nodeId: item.nodeId,
        idx: item.idx,
        maskedUrl: item.maskedUrl || '',
        previewUrl: item.previewUrl || '',
        caption: item.caption || '',
        hint: item.hint || '',
        sectionKey: item.sectionKey || '',
      })),
      source: 'merchant_edit',
    }
  },

  async onSave(confirm) {
    if (!this.data.editable || this.data.saving) return
    this.setData({ saving: true })
    try {
      const data = await saveMerchantCaseDraft(this.albumId, {
        confirm: Boolean(confirm),
        draft: this.buildDraftPayload(),
      })
      const draft = data.draft || {}
      this.applyDraftView(draft, {
        editable: Boolean(data.editable),
        confirmed: Boolean(data.confirmed || draft.confirmedAt),
        resubmit: data.resubmit != null ? Boolean(data.resubmit) : this.data.resubmit,
      })
      wx.showToast({
        title: confirm ? '已确认案例稿' : '已保存',
        icon: 'success',
      })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },


  async onGenerateCase() {
    if (!this.data.editable || this.data.generating) return
    this.setData({ generating: true })
    try {
      wx.showLoading({ title: '生成并机审中', mask: true })
      const result = await generateMerchantPublicCase(this.albumId, {
        draft: this.buildDraftPayload(),
      })
      wx.hideLoading()
      if (result && result.status === 'pre_mask_pending') {
        wx.showModal({
          title: '配图准备中',
          content: (result && result.message) || '脱敏图尚未就绪，请稍后再试',
          showCancel: false,
        })
        return
      }
      await this.loadDraft()
      if (result && result.canPublish) {
        wx.showToast({ title: '机审已过线', icon: 'success' })
        return
      }
      const score =
        result && result.audit && result.audit.authenticityScore != null
          ? result.audit.authenticityScore
          : '—'
      wx.showModal({
        title: '机审未过线',
        content: `真实性 ${score}/60。请按清单回相册补证据后再生成。`,
        showCancel: false,
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '生成失败', icon: 'none' })
    } finally {
      this.setData({ generating: false })
    }
  },

  async onPublishCase() {
    if (!this.data.editable || this.data.publishing || !this.data.canPublish) return
    this.setData({ publishing: true })
    try {
      wx.showLoading({ title: '发布中', mask: true })
      await confirmMerchantPublicCasePublish(this.albumId, {
        draft: this.buildDraftPayload(),
      })
      wx.hideLoading()
      wx.showModal({
        title: '已发布',
        content: '案例已出现在店页。',
        showCancel: false,
        success: () => wx.navigateBack({ delta: 1 }),
      })
    } catch (e) {
      wx.hideLoading()
      if (e && e.code === 'AUDIT_FAILED') {
        await this.loadDraft()
      }
      wx.showToast({ title: (e && e.message) || '发布失败', icon: 'none' })
    } finally {
      this.setData({ publishing: false })
    }
  },

  onTapAuditClaim(e) {
    const key = String((e.currentTarget.dataset && e.currentTarget.dataset.key) || '').trim()
    if (!key) {
      wx.showToast({ title: '请回相册对应检查项补证', icon: 'none' })
      return
    }
    if (!this.albumId) return
    wx.navigateTo({
      url: `/packageMerchant/pages/album/edit/index?albumId=${encodeURIComponent(
        this.albumId,
      )}&itemKey=${encodeURIComponent(key)}`,
    })
  },

  onSaveDraft() {
    this.onSave(false)
  },

  onConfirmDraft() {
    this.onSave(true)
  },

  async onConfirmAndComplete() {
    if (!this.data.editable || this.data.completing) return
    this.setData({ completing: true })
    const isResubmit = this.data.resubmit
    try {
      wx.showLoading({ title: isResubmit ? '重新提交中' : '确认完工中', mask: true })
      await confirmAndCompleteMerchantCaseDraft(this.albumId, {
        draft: this.buildDraftPayload(),
      })
      wx.hideLoading()
      this.setData({
        confirmed: true,
        editable: false,
        fromComplete: false,
        resubmit: false,
        showCompletePrimary: false,
      })
      await this.loadDraft()
      wx.showModal({
        title: isResubmit ? '已重新提交' : '已确认完工',
        content: isResubmit
          ? '已再次进入平台案例审核。通过后将出现在店页。'
          : '相册已完工。之后可从相册点「生成案例」送审；通过后会出现在店页。',
        confirmText: '复制文案',
        cancelText: '返回相册',
        success: (res) => {
          if (res.confirm) this.onCopyExport()
          else wx.navigateBack({ delta: 1 })
        },
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ completing: false })
    }
  },

  async onCopyExport() {
    try {
      let text = ''
      if (this.data.confirmed) {
        wx.showLoading({ title: '准备文案', mask: true })
        const data = await exportMerchantCaseDraftCopy(this.albumId)
        wx.hideLoading()
        text = (data && data.text) || ''
      }
      if (!text) {
        const { draftToPlainText } = require('../../../../utils/merchant-case-draft-display')
        text = draftToPlainText({
          title: this.data.title,
          caseSummary: this.data.caseSummary,
          sections: this.data.sections,
        })
      }
      if (!text) {
        wx.showToast({ title: '暂无可复制文案', icon: 'none' })
        return
      }
      await wx.setClipboardData({ data: text })
      wx.showToast({ title: '已复制文字（不含图）', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '复制失败', icon: 'none' })
    }
  },
})
