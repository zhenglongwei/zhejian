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
const { fetchTask, runAutoMask } = require('../../../../services/desensitize')
const { SERVICE_ALBUM_STATUS } = require('../../../../constants/service-album-status')
const {
  resolveWizardStep,
  resolveWizardMaxStep,
  canVisitWizardStep,
  shouldKeepExistingGeoDraft,
} = require('../../../../utils/host-wizard-step')

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

function looksMaskedUrl(url) {
  const value = String(url || '').trim()
  if (!value) return false
  return (
    value.includes('/files/uploads/desensitized/') ||
    value.includes('/media/files/uploads/desensitized/') ||
    value.includes('/media/uploads/desensitized/') ||
    value.includes('mock://desensitized/')
  )
}

function collectMaskImagesFromChapters(chapters) {
  const rows = []
  const seen = new Set()
  const push = (raw) => {
    const url = String(typeof raw === 'object' && raw ? raw.url || raw.src || '' : raw || '').trim()
    if (!url) return
    const key = stripUrlQuery(url)
    if (!key || seen.has(key)) return
    seen.add(key)
    rows.push({ url, masked: looksMaskedUrl(url) })
  }
  ;(Array.isArray(chapters) ? chapters : []).forEach((ch) => {
    if (!ch) return
    ;(Array.isArray(ch.findings) ? ch.findings : []).forEach((row) => push(row))
    ;(Array.isArray(ch.photos) ? ch.photos : []).forEach(push)
    ;(Array.isArray(ch.items) ? ch.items : []).forEach((row) => {
      if (!row) return
      push(row.evidenceUrl)
      ;(Array.isArray(row.images) ? row.images : []).forEach(push)
    })
  })
  return rows.sort((a, b) => Number(Boolean(a.masked)) - Number(Boolean(b.masked)))
}

function normalizeArchiveChapters(chapters) {
  return (Array.isArray(chapters) ? chapters : []).map((ch, index) => ({
    id: String((ch && ch.id) || `ch_${index}`),
    kind: String((ch && ch.kind) || ''),
    title: String((ch && ch.title) || ''),
    chiefComplaint: String((ch && ch.chiefComplaint) || ''),
    findings: Array.isArray(ch && ch.findings) ? ch.findings : [],
    items: Array.isArray(ch && ch.items) ? ch.items : [],
    photos: Array.isArray(ch && ch.photos) ? ch.photos : [],
    warrantyPeriod: String((ch && ch.warrantyPeriod) || ''),
    warrantyNotes: String((ch && ch.warrantyNotes) || ''),
  }))
}

function patchArchiveChapterImageUrls(chapters, fromUrl, toUrl) {
  const nextUrl = withCacheBust(toUrl, Date.now())
  const match = (u) =>
    urlsLikelyMatch(u, fromUrl) || urlsLikelyMatch(stripUrlQuery(u), stripUrlQuery(fromUrl))
  return (chapters || []).map((ch) => {
    if (!ch) return ch
    let changed = false
    const findings = Array.isArray(ch.findings)
      ? ch.findings.map((row) => {
          if (!row || !match(row.url)) return row
          changed = true
          return { ...row, url: nextUrl }
        })
      : ch.findings
    const mapPhoto = (photo) => {
      if (typeof photo === 'string') {
        if (!match(photo)) return photo
        changed = true
        return nextUrl
      }
      if (!photo || !match(photo.url)) return photo
      changed = true
      return { ...photo, url: nextUrl }
    }
    const photos = Array.isArray(ch.photos) ? ch.photos.map(mapPhoto) : ch.photos
    const items = Array.isArray(ch.items)
      ? ch.items.map((row) => {
          if (!row) return row
          let next = row
          if (match(row.evidenceUrl)) {
            changed = true
            next = { ...next, evidenceUrl: nextUrl }
          }
          if (Array.isArray(row.images)) {
            const images = row.images.map(mapPhoto)
            if (images.some((item, index) => item !== row.images[index])) {
              changed = true
              next = { ...next, images }
            }
          }
          return next
        })
      : ch.items
    return changed ? { ...ch, findings, photos, items } : ch
  })
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

function decorateGeoCopyState(base, summary, faq) {
  const qualitySuggestions = (Array.isArray(base) ? base : []).filter(
    (row) => row && row.issue !== 'thin_summary' && row.issue !== 'empty_faq',
  )
  const s = String(summary || '').trim()
  const summaryHint =
    s && (/含过程图片记录/.test(s) || /手动;自动/.test(s) || /\(\d{4}\.\d{2}/.test(s))
      ? '这句像目录。改成：为何来、查了什么、怎么处理。'
      : ''
  const answered = (Array.isArray(faq) ? faq : []).some((row) =>
    String((row && (row.a || row.answer)) || '').trim(),
  )
  const faqHint = s && !answered ? '补几条本单能核对的问答；空着的不会出现在店页。' : ''
  return { qualitySuggestions, summaryHint, faqHint }
}

/** 打码状态文案：未打完软提醒；已打过的不要求再点一键 */
function buildMaskStatusCopy(maskImages = [], options = {}) {
  const list = Array.isArray(maskImages) ? maskImages : []
  const unmaskedCount = list.filter((row) => !row.masked).length
  const total = list.length
  const autoRunning = Boolean(options.autoRunning)
  const privacyTouched = Boolean(options.privacyTouched)
  if (autoRunning) {
    return {
      unmaskedCount,
      maskStatusTitle: '正在检查隐私…',
      maskStatusHint: '平台自动处理未打码图片；已打过码的不会重打。',
    }
  }
  if (!total) {
    return {
      unmaskedCount: 0,
      maskStatusTitle: '本单暂无照片',
      maskStatusHint: '仍可继续写店页说明；有图时请点图核对。',
    }
  }
  if (unmaskedCount > 0) {
    return {
      unmaskedCount,
      maskStatusTitle: `还有 ${unmaskedCount} 张未能上店页`,
      maskStatusHint: '未打码原图不会出现在店页。可点图手工补打，也可先继续。',
    }
  }
  return {
    unmaskedCount: 0,
    maskStatusTitle: privacyTouched ? '已为您做脱敏处理' : '照片已可公开',
    maskStatusHint: privacyTouched
      ? '检测到涉及客户隐私的内容，已处理。请预览核对后再公开。'
      : '请预览下方档案；还需改码可点图。',
  }
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
    wizardMaxStep: 1,
    privacyPassed: false,
    privacyBlocks: [],
    qualitySuggestions: [],
    reviewDocs: [],
    archiveChapters: [],
    maskImages: [],
    unmaskedCount: 0,
    maskStatusTitle: '',
    maskStatusHint: '',
    maskAutoRunning: false,
    privacyTouched: false,
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
    geoHighlightsEmptyHint: '',
    geoFaqEmptyHint: '本单缺少现象、检测或方案等细节，未自动生成常见问法。可自行补充。',
    geoConfirmed: false,
    summaryHint: '',
    faqHint: '',
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
      if (this.data.wizardStep === 2 || this.data.wizardStep === 3) {
        await this.loadPublicFace({ silent: true })
      }
      if (this.data.wizardStep === 2 && this.data.hostMode === 'public') {
        await this.ensureAutoMaskOnReview()
      }
      if (
        this.data.wizardStep === 3 &&
        this.data.privacyPassed &&
        !String(this.data.geoSummary || '').trim()
      ) {
        try {
          const res = await generateHostedGeoDraft(this.albumId)
          const qualitySuggestions = Array.isArray(res.qualitySuggestions)
            ? res.qualitySuggestions
            : this.data.qualitySuggestions
          this._baseQualitySuggestions = qualitySuggestions
          this.setData({
            ...applyGeoDraftToPageData(res.geoDraft || {}),
            publicPublishStage: res.publicPublishStage || 'awaiting_geo_confirm',
            ...decorateGeoCopyState(
              qualitySuggestions,
              (res.geoDraft && res.geoDraft.summary) || '',
              (res.geoDraft && res.geoDraft.faq) || [],
            ),
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
    const wizardMaxStep = resolveWizardMaxStep(hostMeta, hostMode)
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
      wizardMaxStep,
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

  onWizardStepTap(e) {
    const step = Number(e.currentTarget.dataset.step)
    if (!canVisitWizardStep(step, this.data.wizardMaxStep)) return
    if (step === this.data.wizardStep) return
    this.setData({ wizardStep: step })
    if (step === 2) {
      Promise.resolve()
        .then(() => this.loadPublicFace({ silent: true }))
        .then(() => this.ensureAutoMaskOnReview())
        .catch(() => {})
    }
  },

  async loadPublicFace(options = {}) {
    try {
      const face = await fetchHostPublicFace(this.albumId)
      const stamp = Date.now()
      const bust = (u) => (u ? withCacheBust(u, stamp) : u)
      const flowChapters = normalizeArchiveChapters(
        (face.serviceFlow && face.serviceFlow.chapters) || [],
      ).map((ch) => ({
        ...ch,
        findings: (ch.findings || []).map((row) =>
          row && row.url ? { ...row, url: bust(row.url) } : row,
        ),
        photos: (ch.photos || []).map((photo) => {
          if (typeof photo === 'string') return { url: bust(photo), caption: '' }
          if (photo && photo.url) return { ...photo, url: bust(photo.url) }
          return photo
        }),
        items: (ch.items || []).map((row) => {
          if (!row) return row
          return {
            ...row,
            evidenceUrl: row.evidenceUrl ? bust(row.evidenceUrl) : '',
          }
        }),
      }))
      let maskImages = (Array.isArray(face.maskImages) ? face.maskImages : [])
        .map((row) => ({
          url: bust(row && row.url),
          masked: Boolean(row && row.masked),
        }))
        .filter((row) => row.url)
      if (!maskImages.length) {
        maskImages = collectMaskImagesFromChapters(flowChapters).map((row) => ({
          url: bust(row.url),
          masked: Boolean(row.masked),
        }))
      }
      maskImages = maskImages
        .slice()
        .sort((a, b) => Number(Boolean(a.masked)) - Number(Boolean(b.masked)))
      const maskCopy = buildMaskStatusCopy(maskImages, {
        autoRunning: this.data.maskAutoRunning,
        privacyTouched: this.data.privacyTouched,
      })
      this.setData({
        archiveChapters: flowChapters,
        reviewDocs: Array.isArray(face.reviewDocs) ? face.reviewDocs : [],
        maskImages,
        unmaskedCount: maskCopy.unmaskedCount,
        maskStatusTitle: maskCopy.maskStatusTitle,
        maskStatusHint: maskCopy.maskStatusHint,
        previewTexts: face.texts || [],
        previewImages: face.images || [],
        previewImageCount: face.imageCount || 0,
        privacyBlocks: face.hardBlocks || this.data.privacyBlocks,
        qualitySuggestions: Array.isArray(face.qualitySuggestions)
          ? face.qualitySuggestions
          : this.data.qualitySuggestions,
      })
      this._baseQualitySuggestions = Array.isArray(face.qualitySuggestions)
        ? face.qualitySuggestions
        : []
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
        await this.ensureAutoMaskOnReview()
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
      await this.ensureAutoMaskOnReview()
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
        maskImages: [],
        unmaskedCount: 0,
        previewTexts: [],
        previewImages: [],
        privacyBlocks: [],
        qualitySuggestions: [],
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

  onMaskThumbTap(e) {
    const url = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.url
    this.onReviewImageEdit({ detail: { url } })
  },

  async onReviewImageEdit(e) {
    if (this.data.working) return
    const url = e.detail && e.detail.url
    if (!url) return
    this.setData({ working: true })
    try {
      const { taskId, assetId } = await this.findMaskAssetId(url)
      this._maskEdit = { taskId, assetId, sourceUrl: url }
      const albumId = this.albumId || this.data.albumId || ''
      wx.navigateTo({
        url:
          `/pages/desensitize/mask/index?taskId=${encodeURIComponent(taskId)}` +
          `&assetId=${encodeURIComponent(assetId)}` +
          (albumId ? `&albumId=${encodeURIComponent(albumId)}` : ''),
        events: {
          maskUpdated: () => {
            this.refreshReviewAfterMask()
          },
        },
      })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '无法打开打码', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  async refreshReviewAfterMask() {
    const edit = this._maskEdit
    if (!edit || !edit.taskId) return
    try {
      const task = await fetchTask(edit.taskId)
      const asset = ((task && task.rawAssets) || []).find((row) => row.id === edit.assetId)
      const maskedUrl = (asset && (asset.maskedUrl || asset.preMaskedUrl)) || ''
      if (!maskedUrl) return
      let archiveChapters = patchArchiveChapterImageUrls(
        this.data.archiveChapters,
        edit.sourceUrl,
        maskedUrl,
      )
      archiveChapters = patchArchiveChapterImageUrls(
        archiveChapters,
        (asset && asset.url) || edit.sourceUrl,
        maskedUrl,
      )
      this.setData({ archiveChapters })
      this._maskEdit = null
      await this.loadPublicFace({ silent: true })
    } catch (_) {
      /* 返回后仍可再点图 */
    }
  },

  /**
   * 进入核对步后台自动打码（无「一键」按钮）。
   * 已打过的图由任务侧跳过；调用失败 ≠ 未检出隐私。
   */
  async ensureAutoMaskOnReview() {
    if (this._autoMaskTried || this.data.maskAutoRunning) return
    const pending = (this.data.maskImages || []).filter((row) => !row.masked)
    if (!pending.length) {
      const copy = buildMaskStatusCopy(this.data.maskImages, {
        privacyTouched: this.data.privacyTouched,
      })
      this.setData({
        unmaskedCount: copy.unmaskedCount,
        maskStatusTitle: copy.maskStatusTitle,
        maskStatusHint: copy.maskStatusHint,
      })
      return
    }
    this._autoMaskTried = true
    this.setData({
      maskAutoRunning: true,
      ...buildMaskStatusCopy(this.data.maskImages, { autoRunning: true }),
    })
    try {
      const taskId = await this.ensureMaskTask()
      const task = await runAutoMask(taskId)
      const assets = (task && task.rawAssets) || []
      const maskedAssets = assets.filter((row) => row && String(row.maskedUrl || '').trim())
      const privacyTouched = maskedAssets.length > 0
      let archiveChapters = this.data.archiveChapters || []
      maskedAssets.forEach((row) => {
        archiveChapters = patchArchiveChapterImageUrls(
          archiveChapters,
          row.url,
          row.maskedUrl,
        )
        if (row.preMaskedUrl) {
          archiveChapters = patchArchiveChapterImageUrls(
            archiveChapters,
            row.preMaskedUrl,
            row.maskedUrl,
          )
        }
      })
      this.setData({ archiveChapters, privacyTouched, maskAutoRunning: false })
      await this.loadPublicFace({ silent: true })
      const copy = buildMaskStatusCopy(this.data.maskImages, { privacyTouched })
      this.setData({
        unmaskedCount: copy.unmaskedCount,
        maskStatusTitle: copy.maskStatusTitle,
        maskStatusHint: copy.maskStatusHint,
      })
    } catch (e) {
      const copy = buildMaskStatusCopy(this.data.maskImages, {
        privacyTouched: this.data.privacyTouched,
      })
      this.setData({
        maskAutoRunning: false,
        unmaskedCount: copy.unmaskedCount,
        maskStatusTitle: '自动处理未完成',
        maskStatusHint: `${(e && e.message) || '打码服务暂不可用'}。可点图手工补打，也可先继续（未打码图不上店页）。`,
      })
    }
  },

  async onContinueAfterReview() {
    if (this.data.working) return
    if (Number(this.data.unmaskedCount) > 0) {
      const go = await new Promise((resolve) => {
        wx.showModal({
          title: '还有照片未能上店页',
          content: `还有 ${this.data.unmaskedCount} 张未打码，公开页不会展示这些原图。可点图补打，或仍继续写店页说明。`,
          confirmText: '仍继续',
          cancelText: '回去看',
          success: (res) => resolve(Boolean(res.confirm)),
        })
      })
      if (!go) return
    }
    this.setData({ working: true })
    try {
      const audit = await auditHostedPublicPrivacy(this.albumId)
      const blocks = audit.hardBlocks || []
      this.setData({
        privacyPassed: Boolean(audit.passed),
        privacyBlocks: blocks,
        qualitySuggestions: Array.isArray(audit.qualitySuggestions)
          ? audit.qualitySuggestions
          : this.data.qualitySuggestions,
      })
      if (!audit.passed) {
        wx.showToast({
          title: (blocks[0] && blocks[0].message) || '还有需处理项',
          icon: 'none',
        })
        return
      }
      if (shouldKeepExistingGeoDraft(this.data)) {
        this.setData({
          wizardStep: 3,
          wizardMaxStep: Math.max(3, Number(this.data.wizardMaxStep) || 1),
          ...decorateGeoCopyState(
            this._baseQualitySuggestions,
            this.data.geoSummary,
            this.data.geoFaq,
          ),
        })
        return
      }
      const res = await generateHostedGeoDraft(this.albumId)
      const draft = res.geoDraft || {}
      const qualitySuggestions = Array.isArray(res.qualitySuggestions)
        ? res.qualitySuggestions
        : this.data.qualitySuggestions
      this._baseQualitySuggestions = qualitySuggestions
      this.setData({
        ...applyGeoDraftToPageData(draft),
        wizardStep: 3,
        wizardMaxStep: 3,
        publicPublishStage: res.publicPublishStage || 'awaiting_geo_confirm',
        ...decorateGeoCopyState(qualitySuggestions, draft.summary, draft.faq),
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
      const res = await generateHostedGeoDraft(this.albumId, { forceRegen: true })
      this.setData({
        ...applyGeoDraftToPageData(res.geoDraft || {}),
        ...decorateGeoCopyState(
          Array.isArray(res.qualitySuggestions)
            ? res.qualitySuggestions
            : this._baseQualitySuggestions,
          (res.geoDraft && res.geoDraft.summary) || '',
          (res.geoDraft && res.geoDraft.faq) || [],
        ),
      })
      this._baseQualitySuggestions = Array.isArray(res.qualitySuggestions)
        ? res.qualitySuggestions
        : this._baseQualitySuggestions
      wx.showToast({
        title: res.message && /暂不可用/.test(res.message) ? '请自行改写' : '已重新生成',
        icon: 'none',
      })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '生成失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  onGeoSummaryInput(e) {
    const geoSummary = e.detail.value
    this.setData({
      geoSummary,
      ...decorateGeoCopyState(
        this._baseQualitySuggestions,
        geoSummary,
        this.data.geoFaq,
      ),
    })
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
      ...decorateGeoCopyState(this._baseQualitySuggestions, this.data.geoSummary, list),
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
      ...decorateGeoCopyState(this._baseQualitySuggestions, this.data.geoSummary, list),
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
      ...decorateGeoCopyState(this._baseQualitySuggestions, this.data.geoSummary, list),
    })
  },

  async onConfirmPublic() {
    if (this.data.working) return
    const summary = String(this.data.geoSummary || '').trim()
    if (!summary) {
      wx.showToast({ title: '请填写店页说明', icon: 'none' })
      return
    }
    // 空答不上网：仍把全量交给后端，由 filterPublishableFaq 过滤
    const faq = (this.data.geoFaq || []).map((row) => ({
      q: String((row && row.q) || '').trim(),
      a: String((row && row.a) || '').trim(),
    }))
    const copyState = decorateGeoCopyState(
      this._baseQualitySuggestions,
      summary,
      faq,
    )
    const lines = []
      .concat(
        (copyState.qualitySuggestions || []).map((row) => `· ${row.title}`),
        copyState.summaryHint ? '· 摘要还是目录句' : '',
        copyState.faqHint ? '· 常见问法还空着' : '',
        Number(this.data.unmaskedCount) > 0
          ? `· 还有 ${this.data.unmaskedCount} 张未打码图不会出现在店页`
          : '',
      )
      .filter(Boolean)
    if (lines.length) {
      const ok = await new Promise((resolve) => {
        wx.showModal({
          title: '仍有可优化项',
          content: `${lines.slice(0, 5).join('\n')}\n可回去改，或仍公开（责任由本店承担）。`,
          confirmText: '仍要公开',
          cancelText: '回去改',
          success: (res) => resolve(Boolean(res.confirm)),
        })
      })
      if (!ok) return
    }
    this.setData({ working: true })
    try {
      await confirmHostedPublicPublish(this.albumId, {
        summary,
        highlights: [],
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
