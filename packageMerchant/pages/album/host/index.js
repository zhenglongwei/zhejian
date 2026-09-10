const {
  fetchMerchantServiceAlbum,
  hostMerchantAlbum,
  auditHostedPublicPrivacy,
  generateHostedGeoDraft,
  confirmHostedPublicPublish,
  cancelPublicHostIntent,
  fetchHostPublicFace,
  ensureHostDesensitizeTask,
} = require('../../../../services/merchant-service-album')
const { fetchTask, runAutoMask, applyManualMask } = require('../../../../services/desensitize')
const { SERVICE_ALBUM_STATUS } = require('../../../../constants/service-album-status')

function stripUrlQuery(url) {
  return String(url || '').trim().split('?')[0].split('#')[0]
}

function urlsLikelyMatch(a, b) {
  const x = stripUrlQuery(a)
  const y = stripUrlQuery(b)
  if (!x || !y) return false
  if (x === y) return true
  return x.endsWith(y) || y.endsWith(x)
}

function withCacheBust(url, token) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  const stamp = String(token || Date.now())
  if (/[?&]v=/.test(raw)) {
    return raw.replace(/([?&]v=)[^&]*/, `$1${stamp}`)
  }
  return `${raw}${raw.includes('?') ? '&' : '?'}v=${stamp}`
}

/** 店页说明：空分区提示（商家口吻，不写实现叙事） */
function buildGeoSectionHints(draft = {}) {
  const hasDetail = ['faultDesc', 'inspectResult', 'repairPlan', 'resultConfirm'].some((k) =>
    String(draft[k] || '').trim(),
  )
  return {
    geoHighlightsEmptyHint: '暂无要点。可按标签补充，例如车型、检测、方案、结果。',
    geoFaqEmptyHint: hasDetail
      ? '暂无常见问法，可按车主会问的话自行补充。'
      : '本单缺少现象、检测或方案等细节，未自动生成常见问法。可自行补充。',
  }
}

function normalizeGeoHighlights(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((row, i) => {
      if (!row || typeof row !== 'object') return null
      const label = String(row.label || row.key || '').trim()
      const value = String(row.value || '').trim()
      if (!label && !value) return null
      return {
        label,
        value,
        _k: row._k || `hl_${i}_${label}`,
      }
    })
    .filter(Boolean)
}

function normalizeGeoFaq(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((row, i) => {
      if (!row || typeof row !== 'object') return null
      const q = String(row.q || row.question || '').trim()
      const a = String(row.a || row.answer || '').trim()
      if (!q) return null
      return {
        q,
        a,
        needsAnswer: !a || Boolean(row.needsAnswer),
        _k: row._k || `faq_${i}_${q.slice(0, 12)}`,
      }
    })
    .filter(Boolean)
}

function applyGeoDraftToPageData(draft = {}) {
  const highlights = normalizeGeoHighlights(draft.highlights)
  const faq = normalizeGeoFaq(draft.faq)
  const hints = buildGeoSectionHints(draft)
  const unanswered = faq.filter((row) => !String(row.a || '').trim()).length
  const hasMaterial = draft.faqHasMaterial !== false && Boolean(
    ['faultDesc', 'inspectResult', 'repairPlan', 'resultConfirm'].some((k) =>
      String(draft[k] || '').trim(),
    ),
  )
  let geoFaqEmptyHint = hints.geoFaqEmptyHint
  if (faq.length && unanswered) {
    geoFaqEmptyHint = hasMaterial
      ? `有 ${unanswered} 条尚未填写答案。未填答的不会出现在公开页，请结合本单补充。`
      : '以下为本类常见问法。本单细节不足，答案留空，请结合本单填写；未填答的不会出现在公开页。'
  } else if (!faq.length) {
    geoFaqEmptyHint =
      '暂无常见问法。可点「添加问法」自行补充；未填答的不会出现在公开页。'
  }
  return {
    geoDraft: draft,
    geoSummary: draft.summary || '',
    geoHighlights: highlights,
    geoFaq: faq,
    geoHighlightsEmpty: !highlights.length,
    geoFaqEmpty: !faq.length,
    geoFaqUnanswered: unanswered,
    geoHighlightsEmptyHint: hints.geoHighlightsEmptyHint,
    geoFaqEmptyHint,
  }
}

function patchReviewDocImageUrls(docs, fromUrl, toUrl) {
  const nextUrl = withCacheBust(toUrl, Date.now())
  const match = (u) => urlsLikelyMatch(u, fromUrl) || urlsLikelyMatch(stripUrlQuery(u), stripUrlQuery(fromUrl))
  return (docs || []).map((doc) => {
    if (!doc || doc.locked) return doc
    let changed = false
    const findings = Array.isArray(doc.findings)
      ? doc.findings.map((row) => {
          if (!row || !match(row.url)) return row
          changed = true
          return { ...row, url: nextUrl }
        })
      : doc.findings
    const lines = Array.isArray(doc.lines)
      ? doc.lines.map((row) => {
          if (!row || !match(row.evidenceUrl)) return row
          changed = true
          return { ...row, evidenceUrl: nextUrl }
        })
      : doc.lines
    const deliveryPhotos = Array.isArray(doc.deliveryPhotos)
      ? doc.deliveryPhotos.map((photo) => {
          if (typeof photo === 'string') {
            if (!match(photo)) return photo
            changed = true
            return nextUrl
          }
          if (!photo || !match(photo.url)) return photo
          changed = true
          return { ...photo, url: nextUrl }
        })
      : doc.deliveryPhotos
    return changed ? { ...doc, findings, lines, deliveryPhotos } : doc
  })
}

/** 向导步骤：1 存档 · 2 核对公开内容 · 3 店页说明 */
function resolveWizardStep(hostMeta = {}, hostMode = 'private') {
  if (!hostMeta.hosted) return 1
  if (hostMeta.visibility === 'public') return 1
  const stage = String(hostMeta.publicPublishStage || '')
  if (!stage) return 1
  if (stage === 'awaiting_privacy') return 2
  if (stage === 'awaiting_geo' || stage === 'awaiting_geo_confirm') return 3
  if (stage === 'published') return 1
  if (hostMode === 'public') return 2
  return 1
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
    wizardStep: 1,
    privacyPassed: false,
    privacyBlocks: [],
    reviewDocs: [],
    previewTexts: [],
    previewImages: [],
    previewImageCount: 0,
    geoDraft: {},
    geoSummary: '',
    geoHighlights: [],
    geoFaq: [],
    geoHighlightsEmpty: true,
    geoFaqEmpty: true,
    geoFaqUnanswered: 0,
    geoHighlightsEmptyHint: '暂无要点。可按标签补充，例如车型、检测、方案、结果。',
    geoFaqEmptyHint: '本单缺少现象、检测或方案等细节，未自动生成常见问法。可自行补充。',
    geoConfirmed: false,
    maskEditorVisible: false,
    maskEditorUrl: '',
    maskEditorTitle: '',
    maskEditorSubmitting: false,
  },

  onLoad(options) {
    this.albumId = String(options.albumId || '').trim()
    this.setData({ albumId: this.albumId })
    this.bootstrap()
  },

  onShow() {
    if (this.albumId && this.data.status === 'ready' && this.data.wizardStep === 2) {
      this.loadPublicFace({ silent: true })
    }
  },

  async bootstrap() {
    if (!this.albumId) {
      this.setData({ status: 'error', errorMessage: '缺少相册' })
      return
    }
    this.setData({ status: 'loading', errorMessage: '' })
    try {
      const album = await fetchMerchantServiceAlbum(this.albumId)
      const albumStatus = album.status || ''
      if (
        albumStatus !== SERVICE_ALBUM_STATUS.COMPLETED &&
        albumStatus !== 'published' &&
        albumStatus !== SERVICE_ALBUM_STATUS.PUBLISHED
      ) {
        this.setData({
          status: 'error',
          errorMessage: '请先完成服务流程并整单完工',
        })
        return
      }
      this.applyAlbum(album)
      if (this.data.wizardStep === 2) {
        await this.loadPublicFace({ silent: true })
      } else if (
        this.data.wizardStep === 3 &&
        this.data.privacyPassed &&
        !String(this.data.geoSummary || '').trim()
      ) {
        try {
          const res = await generateHostedGeoDraft(this.albumId)
          this.setData({
            ...applyGeoDraftToPageData(res.geoDraft || {}),
            publicPublishStage: res.publicPublishStage || 'awaiting_geo_confirm',
          })
        } catch (_) {
          /* 留空由用户点重新生成 */
        }
      }
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
    const visibility = hostMeta.visibility || 'private'
    const hostMode =
      hosted && (stage || visibility === 'public') ? 'public' : hosted ? 'private' : this.data.hostMode
    const wizardStep = resolveWizardStep(hostMeta, hostMode)
    const draftForUi =
      geoDraft && (geoDraft.summary || (geoDraft.highlights && geoDraft.highlights.length) || (geoDraft.faq && geoDraft.faq.length))
        ? geoDraft
        : {
            summary: geoLayer.summary || '',
            highlights: geoLayer.highlights || [],
            faq: geoLayer.faq || [],
            faultDesc: geoDraft.faultDesc || '',
            inspectResult: geoDraft.inspectResult || '',
            repairPlan: geoDraft.repairPlan || '',
            resultConfirm: geoDraft.resultConfirm || '',
          }
    this.setData({
      status: 'ready',
      serviceName: album.serviceName || '服务相册',
      hosted,
      hostVisibility: visibility,
      publicPublishStage: stage,
      hostMode: hosted ? hostMode : this.data.hostMode,
      wizardStep,
      privacyPassed: Boolean(hostMeta.privacyAuditPassedAt),
      privacyBlocks: [],
      ...applyGeoDraftToPageData(draftForUi),
      geoConfirmed: Boolean(geoLayer.confirmedAt) || visibility === 'public',
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

  async loadPublicFace(options = {}) {
    try {
      const face = await fetchHostPublicFace(this.albumId)
      const stamp = Date.now()
      const reviewDocs = (Array.isArray(face.reviewDocs) ? face.reviewDocs : []).map((doc) => {
        if (!doc || doc.locked) return doc
        const bust = (u) => (u ? withCacheBust(u, stamp) : u)
        return {
          ...doc,
          findings: Array.isArray(doc.findings)
            ? doc.findings.map((row) => (row && row.url ? { ...row, url: bust(row.url) } : row))
            : doc.findings,
          lines: Array.isArray(doc.lines)
            ? doc.lines.map((row) =>
                row && row.evidenceUrl ? { ...row, evidenceUrl: bust(row.evidenceUrl) } : row,
              )
            : doc.lines,
          deliveryPhotos: Array.isArray(doc.deliveryPhotos)
            ? doc.deliveryPhotos.map((photo) => {
                if (typeof photo === 'string') return bust(photo)
                if (photo && photo.url) return { ...photo, url: bust(photo.url) }
                return photo
              })
            : doc.deliveryPhotos,
        }
      })
      this.setData({
        reviewDocs,
        previewTexts: face.texts || [],
        previewImages: face.images || [],
        previewImageCount: face.imageCount || 0,
        privacyBlocks: face.hardBlocks || this.data.privacyBlocks,
      })
    } catch (e) {
      if (!options.silent) {
        wx.showToast({ title: (e && e.message) || '预览加载失败', icon: 'none' })
      }
    }
  },

  async onSubmitHost() {
    if (this.data.working || this.data.hosted) return
    this.setData({ working: true })
    try {
      await hostMerchantAlbum(this.albumId, {
        mode: this.data.hostMode,
        useDesensitizeTool: true,
      })
      const album = await fetchMerchantServiceAlbum(this.albumId)
      this.applyAlbum(album)
      wx.showToast({
        title: this.data.hostMode === 'public' ? '已存档，请核对内容' : '已私密存档',
        icon: 'success',
      })
      if (this.data.wizardStep === 2) {
        await this.loadPublicFace()
      }
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '托管失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  async onSwitchToPublic() {
    if (this.data.working) return
    this.setData({ working: true })
    try {
      await hostMerchantAlbum(this.albumId, { mode: 'public', useDesensitizeTool: true })
      const album = await fetchMerchantServiceAlbum(this.albumId)
      this.applyAlbum(album)
      this.setData({ hostMode: 'public' })
      await this.loadPublicFace()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  async onCancelPublicIntent() {
    if (this.data.working) return
    const isLive = this.data.hostVisibility === 'public'
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: isLive ? '取消公开？' : '改回仅私密？',
        content: isLive
          ? '店页将不再展示本单，档案仍保留在案例站。'
          : '将清空公开进度，档案仍私密托管。',
        confirmText: isLive ? '取消公开' : '改回私密',
        success: (res) => resolve(Boolean(res.confirm)),
      })
    })
    if (!ok) return
    this.setData({ working: true })
    try {
      await cancelPublicHostIntent(this.albumId)
      const album = await fetchMerchantServiceAlbum(this.albumId)
      this.applyAlbum(album)
      this.setData({
        hostMode: 'private',
        reviewDocs: [],
        previewTexts: [],
        previewImages: [],
        privacyBlocks: [],
      })
      wx.showToast({ title: '已改回私密', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  async ensureMaskTask() {
    const res = await ensureHostDesensitizeTask(this.albumId)
    const taskId = res && res.taskId
    if (!taskId) {
      const err = new Error('脱敏任务未就绪')
      throw err
    }
    this._maskTaskId = taskId
    return taskId
  },

  async findMaskAssetId(imageUrl) {
    const taskId = await this.ensureMaskTask()
    const task = await fetchTask(taskId)
    const assets = (task && task.rawAssets) || []
    const hit = assets.find(
      (row) =>
        urlsLikelyMatch(row.url, imageUrl) ||
        urlsLikelyMatch(row.maskedUrl, imageUrl) ||
        urlsLikelyMatch(row.preMaskedUrl, imageUrl),
    )
    if (!hit) {
      const err = new Error('未找到对应过程图，请从脱敏工作台处理')
      throw err
    }
    return { taskId, assetId: hit.id }
  },

  async onReviewImageEdit(e) {
    if (this.data.working || this.data.maskEditorVisible) return
    const url = e.detail && e.detail.url
    if (!url) return
    this.setData({ working: true })
    try {
      const { taskId, assetId } = await this.findMaskAssetId(url)
      const task = await fetchTask(taskId)
      const asset = ((task && task.rawAssets) || []).find((row) => row.id === assetId)
      this._maskEdit = {
        taskId,
        assetId,
        sourceUrl: url,
      }
      this.setData({
        maskEditorVisible: true,
        maskEditorUrl: (asset && (asset.maskedUrl || asset.url)) || url,
        maskEditorTitle: (asset && asset.nodeTitle) || '过程图',
        maskEditorSubmitting: false,
      })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '无法打开打码', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  onCloseMaskEditor() {
    if (this.data.maskEditorSubmitting) return
    this._maskEdit = null
    this.setData({
      maskEditorVisible: false,
      maskEditorUrl: '',
      maskEditorTitle: '',
      maskEditorSubmitting: false,
    })
  },

  onPreventTouchMove() {
    /* 拦住触摸，避免底层核对页跟着滑 */
  },

  async onMaskEditorSubmit(e) {
    if (this.data.maskEditorSubmitting) return
    const edit = this._maskEdit
    if (!edit || !edit.taskId || !edit.assetId) return
    const { regions, mode } = e.detail || {}
    if (!regions || !regions.length) {
      wx.showToast({ title: '请先框选打码区域', icon: 'none' })
      return
    }
    this.setData({ maskEditorSubmitting: true })
    try {
      const task = await applyManualMask(edit.taskId, edit.assetId, {
        regions,
        mode: mode || 'mosaic',
      })
      const asset = ((task && task.rawAssets) || []).find((row) => row.id === edit.assetId)
      const maskedUrl = (asset && (asset.maskedUrl || asset.preMaskedUrl)) || ''
      if (maskedUrl) {
        const reviewDocs = patchReviewDocImageUrls(
          this.data.reviewDocs,
          edit.sourceUrl,
          maskedUrl,
        )
        // 同源多处引用也替换
        const reviewDocs2 = patchReviewDocImageUrls(
          reviewDocs,
          asset.url || edit.sourceUrl,
          maskedUrl,
        )
        this.setData({ reviewDocs: reviewDocs2 })
      }
      wx.showToast({ title: '已打码', icon: 'success' })
      this._maskEdit = null
      this.setData({
        maskEditorVisible: false,
        maskEditorUrl: '',
        maskEditorTitle: '',
        maskEditorSubmitting: false,
      })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '打码失败', icon: 'none' })
      this.setData({ maskEditorSubmitting: false })
    }
  },

  async onRunHostAutoMask() {
    if (this.data.working) return
    this.setData({ working: true })
    try {
      const taskId = await this.ensureMaskTask()
      wx.showLoading({ title: '脱敏中…', mask: true })
      const task = await runAutoMask(taskId)
      wx.hideLoading()
      const assets = (task && task.rawAssets) || []
      const okCount = assets.filter((row) => row && String(row.maskedUrl || '').trim()).length
      const total = assets.length
      if (!total) {
        wx.showToast({ title: '本单暂无过程图', icon: 'none' })
        return
      }
      if (!okCount) {
        wx.showModal({
          title: '自动脱敏未完成',
          content:
            '引擎未产出脱敏图。请确认 backend/.env 已配置 ALIYUN_ACCESS_KEY_ID 与 ALIYUN_ACCESS_KEY_SECRET（或 ECS RAM 角色）；DASHSCOPE / 千帆密钥只用于文案，不能打码。也可点图片手工框选。',
          showCancel: false,
          confirmText: '知道了',
        })
        return
      }
      // 用任务里的脱敏图直接替换通读预览，避免只靠服务端映射漏掉
      let reviewDocs = this.data.reviewDocs || []
      assets.forEach((row) => {
        if (!row || !row.maskedUrl) return
        reviewDocs = patchReviewDocImageUrls(reviewDocs, row.url, row.maskedUrl)
        if (row.preMaskedUrl) {
          reviewDocs = patchReviewDocImageUrls(reviewDocs, row.preMaskedUrl, row.maskedUrl)
        }
      })
      this.setData({ reviewDocs })
      wx.showToast({
        title: okCount < total ? `已脱敏 ${okCount}/${total} 张` : '脱敏完成',
        icon: 'success',
      })
      await this.loadPublicFace({ silent: true })
    } catch (e) {
      wx.hideLoading()
      const msg = (e && e.message) || '脱敏失败'
      wx.showModal({
        title: '自动脱敏失败',
        content: `${msg}\n可点图片改用手工打码。`,
        showCancel: false,
        confirmText: '知道了',
      })
    } finally {
      this.setData({ working: false })
    }
  },

  async onContinueAfterReview() {
    if (this.data.working) return
    this.setData({ working: true })
    try {
      const audit = await auditHostedPublicPrivacy(this.albumId)
      const blocks = audit.hardBlocks || []
      this.setData({
        privacyPassed: Boolean(audit.passed),
        privacyBlocks: blocks,
      })
      if (!audit.passed) {
        wx.showToast({
          title: (blocks[0] && blocks[0].message) || '还有需处理项',
          icon: 'none',
        })
        return
      }
      const res = await generateHostedGeoDraft(this.albumId)
      const draft = res.geoDraft || {}
      this.setData({
        ...applyGeoDraftToPageData(draft),
        wizardStep: 3,
        publicPublishStage: res.publicPublishStage || 'awaiting_geo_confirm',
      })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '继续失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  async onRegenerateCopy() {
    if (this.data.working) return
    this.setData({ working: true })
    try {
      const res = await generateHostedGeoDraft(this.albumId)
      this.setData(applyGeoDraftToPageData(res.geoDraft || {}))
      wx.showToast({ title: '已重新生成', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '生成失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  onGeoSummaryInput(e) {
    this.setData({ geoSummary: e.detail.value })
  },

  onAddHighlight() {
    const list = [
      ...(this.data.geoHighlights || []),
      { label: '', value: '', _k: `hl_${Date.now()}` },
    ]
    this.setData({
      geoHighlights: list,
      geoHighlightsEmpty: false,
    })
  },

  onRemoveHighlight(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
    const list = (this.data.geoHighlights || []).filter((_, i) => i !== index)
    this.setData({
      geoHighlights: list,
      geoHighlightsEmpty: !list.length,
    })
  },

  onHighlightFieldInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    if (!Number.isFinite(index) || (field !== 'label' && field !== 'value')) return
    const list = (this.data.geoHighlights || []).map((row, i) =>
      i === index ? { ...row, [field]: e.detail.value } : row,
    )
    this.setData({ geoHighlights: list })
  },

  onAddFaq() {
    const list = [
      ...(this.data.geoFaq || []),
      { q: '', a: '', needsAnswer: true, _k: `faq_${Date.now()}` },
    ]
    const unanswered = list.filter((row) => !String(row.a || '').trim()).length
    this.setData({
      geoFaq: list,
      geoFaqEmpty: false,
      geoFaqUnanswered: unanswered,
    })
  },

  onRemoveFaq(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index)) return
    const list = (this.data.geoFaq || []).filter((_, i) => i !== index)
    const unanswered = list.filter((row) => !String(row.a || '').trim()).length
    this.setData({
      geoFaq: list,
      geoFaqEmpty: !list.length,
      geoFaqUnanswered: unanswered,
    })
  },

  onFaqFieldInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    if (!Number.isFinite(index) || (field !== 'q' && field !== 'a')) return
    const list = (this.data.geoFaq || []).map((row, i) => {
      if (i !== index) return row
      const next = { ...row, [field]: e.detail.value }
      next.needsAnswer = !String(next.a || '').trim()
      return next
    })
    const unanswered = list.filter((row) => !String(row.a || '').trim()).length
    this.setData({
      geoFaq: list,
      geoFaqEmpty: !list.length,
      geoFaqUnanswered: unanswered,
    })
  },

  async onConfirmPublic() {
    if (this.data.working) return
    const summary = String(this.data.geoSummary || '').trim()
    if (!summary) {
      wx.showToast({ title: '请填写店页说明', icon: 'none' })
      return
    }
    const highlights = (this.data.geoHighlights || [])
      .map((row) => ({
        label: String((row && row.label) || '').trim(),
        value: String((row && row.value) || '').trim(),
      }))
      .filter((row) => row.label || row.value)
    // 空答不上网：仍把全量交给后端，由 filterPublishableFaq 过滤
    const faq = (this.data.geoFaq || []).map((row) => ({
      q: String((row && row.q) || '').trim(),
      a: String((row && row.a) || '').trim(),
    }))
    this.setData({ working: true })
    try {
      await confirmHostedPublicPublish(this.albumId, {
        summary,
        highlights,
        faq,
      })
      wx.showToast({ title: '已上店页', icon: 'success' })
      const album = await fetchMerchantServiceAlbum(this.albumId)
      this.applyAlbum(album)
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '公开失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },
})
