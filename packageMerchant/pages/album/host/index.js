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
  // 只允许「整段路径互为后缀」（域名/CDN 前缀不同），禁止文件名 endsWith 误伤 foo_bar.jpg vs bar.jpg
  const slash = (s) => {
    const i = s.lastIndexOf('/')
    return i >= 0 ? s.slice(i) : `/${s}`
  }
  const sx = slash(x)
  const sy = slash(y)
  if (sx.length < 8 || sy.length < 8) return false
  if (sx !== sy) return false
  return x.endsWith(sy) || y.endsWith(sx)
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

/** 后端状态树：仅 call_failed / ok_detect_mask_failed 需手工；未检出不算失败 */
function normalizeMaskImageRow(row) {
  const url = String((row && row.url) || '').trim()
  if (!url) return null
  const outcome = String((row && row.outcome) || '').trim()
  const needsManual =
    row && typeof row.needsManual === 'boolean'
      ? Boolean(row.needsManual)
      : outcome === 'call_failed' || outcome === 'ok_detect_mask_failed'
  const pending =
    row && typeof row.pending === 'boolean'
      ? Boolean(row.pending)
      : outcome === 'pending' || (!outcome && !needsManual && row.masked !== true)
  const publishSafe =
    row && typeof row.masked === 'boolean'
      ? Boolean(row.masked)
      : outcome === 'ok_no_privacy' || outcome === 'ok_masked'
  return {
    url,
    outcome: outcome || (needsManual ? 'call_failed' : pending ? 'pending' : 'ok_no_privacy'),
    needsManual,
    pending,
    masked: publishSafe,
  }
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
    // 无后端 outcome 时只能标 pending，禁止把「非脱敏目录 URL」当需补打
    rows.push({
      url,
      outcome: 'pending',
      needsManual: false,
      pending: true,
      masked: false,
    })
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
  return rows
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

const HOST_PRIVACY_AGREEMENT_VERSION = 'host_privacy_v2'
/** 公开前统一协议：不因自动打码成败换文案 */
const HOST_PRIVACY_AGREEMENT_BODY =
  '请确认店页图片与文字已做好隐私处理（如车牌、人脸、手机号、车架号等）。公开内容的合规责任由本店承担；平台工具仅供辅助，不担保零残留，不代本店担责。同意后将直接公开。'

/** 页上仅在自动处理进行中出轻提示；成败不另挂隐私唠叨（提醒归协议） */
function buildMaskStatusCopy(maskImages = [], options = {}) {
  const list = Array.isArray(maskImages) ? maskImages : []
  const needsManualCount = list.filter((row) => row.needsManual).length
  if (options.autoRunning) {
    return {
      needsManualCount,
      unmaskedCount: needsManualCount,
      showMaskBanner: true,
      maskAutoFailed: false,
      maskStatusTitle: '正在处理图片…',
      maskStatusHint: '可稍后在预览里点图微调。',
    }
  }
  return {
    needsManualCount,
    unmaskedCount: needsManualCount,
    showMaskBanner: false,
    maskAutoFailed: false,
    maskStatusTitle: '',
    maskStatusHint: '',
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
    needsManualCount: 0,
    pendingMaskCount: 0,
    showMaskBanner: false,
    maskStatusTitle: '',
    maskStatusHint: '',
    maskAutoRunning: false,
    maskAutoFailed: false,
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
      if (this.data.wizardStep === 2 && this.data.hostMode === 'public') {
        this._autoMaskTried = false
        await this.enterPublicPreview()
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
      this._autoMaskTried = false
      Promise.resolve()
        .then(() => this.enterPublicPreview())
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
        .map((row) =>
          normalizeMaskImageRow({
            ...row,
            url: bust(row && row.url),
          }),
        )
        .filter(Boolean)
      if (!maskImages.length) {
        maskImages = collectMaskImagesFromChapters(flowChapters)
          .map((row) => normalizeMaskImageRow({ ...row, url: bust(row.url) }))
          .filter(Boolean)
      }
      maskImages = maskImages
        .slice()
        .sort((a, b) => Number(Boolean(b.needsManual)) - Number(Boolean(a.needsManual)))
      const maskCopy = buildMaskStatusCopy(maskImages, {
        autoRunning: this.data.maskAutoRunning,
        maskAutoFailed:
          this.data.maskAutoFailed && maskImages.some((row) => row.needsManual || row.pending),
      })
      this.setData({
        archiveChapters: flowChapters,
        reviewDocs: Array.isArray(face.reviewDocs) ? face.reviewDocs : [],
        maskImages,
        unmaskedCount: maskCopy.needsManualCount,
        needsManualCount: maskCopy.needsManualCount,
        pendingMaskCount: maskImages.filter((row) => row.pending).length,
        showMaskBanner: maskCopy.showMaskBanner,
        maskAutoFailed: maskCopy.maskAutoFailed,
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
      const wantPublic = this.data.hostMode === 'public'
      await hostMerchantAlbum(this.albumId, {
        mode: this.data.hostMode,
        useDesensitizeTool: true,
      })
      const album = await fetchMerchantServiceAlbum(this.albumId)
      this.applyAlbum(album)
      if (wantPublic) {
        this._autoMaskTried = false
        await this.enterPublicPreview()
        wx.showToast({ title: '已存档，请预览', icon: 'success' })
      } else {
        wx.showToast({ title: '已私密存档', icon: 'success' })
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
      this._autoMaskTried = false
      await this.enterPublicPreview()
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
      this._autoMaskTried = false
      this.setData({
        hostMode: 'private',
        reviewDocs: [],
        maskImages: [],
        unmaskedCount: 0,
        needsManualCount: 0,
        pendingMaskCount: 0,
        showMaskBanner: false,
        maskAutoFailed: false,
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

  async ensureMaskTask(options = {}) {
    const res = await ensureHostDesensitizeTask(this.albumId, {
      force: Boolean(options.force),
    })
    const taskId = res && res.taskId
    if (!taskId) {
      const err = new Error('脱敏任务未就绪')
      throw err
    }
    this._maskTaskId = taskId
    return taskId
  },

  countUnresolvedMaskImages(maskImages = []) {
    return (Array.isArray(maskImages) ? maskImages : []).filter(
      (row) => row && (row.pending || row.needsRemask || row.needsManual),
    ).length
  },

  applyAutoMaskTaskResult(task) {
    const assets = (task && task.rawAssets) || []
    const privacyTouched = assets.some(
      (row) =>
        row &&
        String(row.maskedUrl || '').trim() &&
        Array.isArray(row.riskTags) &&
        row.riskTags.length > 0,
    )
    let archiveChapters = this.data.archiveChapters || []
    assets.forEach((row) => {
      const maskedUrl = row && String(row.maskedUrl || row.preMaskedUrl || '').trim()
      if (!maskedUrl) return
      archiveChapters = patchArchiveChapterImageUrls(
        archiveChapters,
        row.url || row.rawUrl,
        maskedUrl,
      )
      if (row.preMaskedUrl && row.maskedUrl) {
        archiveChapters = patchArchiveChapterImageUrls(
          archiveChapters,
          row.preMaskedUrl,
          row.maskedUrl,
        )
      }
    })
    this.setData({ archiveChapters, privacyTouched })
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
   * 进入公开预览：整案必调一轮自动打码。
   * 有成功落痕复用；无落痕/仍原图路径 → 对账补进任务后再打一轮。
   */
  async ensureAutoMaskOnReview() {
    if (this._autoMaskTried || this.data.maskAutoRunning) return
    this._autoMaskTried = true
    this.setData({
      maskAutoRunning: true,
      maskAutoFailed: false,
      ...buildMaskStatusCopy(this.data.maskImages, { autoRunning: true }),
    })
    try {
      let taskId = await this.ensureMaskTask()
      let task = await runAutoMask(taskId)
      this.applyAutoMaskTaskResult(task)
      await this.loadPublicFace({ silent: true })

      // 仍有无落痕原图：force 对账交车等 flow 图，再打一轮
      if (this.countUnresolvedMaskImages(this.data.maskImages) > 0) {
        this.setData({
          ...buildMaskStatusCopy(this.data.maskImages, { autoRunning: true }),
        })
        taskId = await this.ensureMaskTask({ force: true })
        task = await runAutoMask(taskId)
        this.applyAutoMaskTaskResult(task)
        await this.loadPublicFace({ silent: true })
      }

      const copy = buildMaskStatusCopy(this.data.maskImages, {})
      this.setData({
        maskAutoRunning: false,
        unmaskedCount: copy.needsManualCount,
        needsManualCount: copy.needsManualCount,
        pendingMaskCount: (this.data.maskImages || []).filter((row) => row.pending).length,
        showMaskBanner: copy.showMaskBanner,
        maskAutoFailed: false,
        maskStatusTitle: copy.maskStatusTitle,
        maskStatusHint: copy.maskStatusHint,
      })
    } catch (_) {
      // 成败不另挂条；公开前统一走协议提醒。点图仍可手工改码。
      const copy = buildMaskStatusCopy(this.data.maskImages, {})
      this.setData({
        maskAutoRunning: false,
        unmaskedCount: copy.needsManualCount,
        needsManualCount: copy.needsManualCount,
        showMaskBanner: false,
        maskAutoFailed: false,
        maskStatusHint: '',
        maskStatusTitle: '',
      })
    }
  },

  /** 进公开预览：先切到预览步并露处理中，再拉面 → 打码 → 店页草稿 */
  async enterPublicPreview() {
    this.setData({
      wizardStep: 2,
      wizardMaxStep: Math.max(2, Number(this.data.wizardMaxStep) || 1),
      hostMode: 'public',
      showMaskBanner: true,
      maskStatusTitle: '正在处理图片…',
      maskStatusHint: '公开前自动核对隐私；已处理过的不重打。',
    })
    await this.loadPublicFace({ silent: true })
    // 由 ensureAutoMaskOnReview 置 maskAutoRunning，避免此处先置 true 被当成「已在跑」而跳过
    await this.ensureAutoMaskOnReview()
    await this.ensureGeoDraftForPreview()
  },

  async ensureGeoDraftForPreview() {
    if (shouldKeepExistingGeoDraft(this.data)) {
      this.setData(
        decorateGeoCopyState(
          this._baseQualitySuggestions,
          this.data.geoSummary,
          this.data.geoFaq,
        ),
      )
      return
    }
    try {
      const res = await generateHostedGeoDraft(this.albumId)
      const draft = res.geoDraft || {}
      const qualitySuggestions = Array.isArray(res.qualitySuggestions)
        ? res.qualitySuggestions
        : this.data.qualitySuggestions
      this._baseQualitySuggestions = qualitySuggestions
      this.setData({
        ...applyGeoDraftToPageData(draft),
        publicPublishStage: res.publicPublishStage || this.data.publicPublishStage,
        ...decorateGeoCopyState(qualitySuggestions, draft.summary, draft.faq),
      })
    } catch (_) {
      /* 摘要可手填 */
    }
  },

  async onContinuePublish() {
    if (this.data.working || this.data.maskAutoRunning) return
    const summary = String(this.data.geoSummary || '').trim()
    if (!summary) {
      wx.showToast({ title: '请填写店页摘要', icon: 'none' })
      return
    }
    // 统一协议提醒图文脱敏；不因自动打码成败分支
    const agreed = await new Promise((resolve) => {
      wx.showModal({
        title: '公开前确认',
        content: HOST_PRIVACY_AGREEMENT_BODY,
        confirmText: '同意并公开',
        cancelText: '再看看',
        success: (res) => resolve(Boolean(res.confirm)),
      })
    })
    if (!agreed) return

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
          title: (blocks[0] && blocks[0].message) || '还有需改的文案',
          icon: 'none',
        })
        return
      }
      const faq = (this.data.geoFaq || []).map((row) => ({
        q: String((row && row.q) || '').trim(),
        a: String((row && row.a) || '').trim(),
      }))
      await confirmHostedPublicPublish(this.albumId, {
        summary,
        highlights: [],
        faq,
        privacyAgreementAccepted: true,
        privacyAgreementVersion: HOST_PRIVACY_AGREEMENT_VERSION,
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

})
