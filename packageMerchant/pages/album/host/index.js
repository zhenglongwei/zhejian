const {
  fetchMerchantServiceAlbum,
  hostMerchantAlbum,
  unhostMerchantAlbum,
  auditHostedPublicPrivacy,
  generateHostedGeoDraft,
  confirmHostedPublicPublish,
  fetchHostPublicFace,
  ensureHostDesensitizeTask,
} = require('../../../../services/merchant-service-album')
const { fetchTask, runAutoMask } = require('../../../../services/desensitize')
const { SERVICE_ALBUM_STATUS } = require('../../../../constants/service-album-status')
const {
  resolveWizardStep,
  resolveWizardMaxStep,
  shouldKeepExistingGeoDraft,
} = require('../../../../utils/host-wizard-step')
const {
  navigatePublicGateAction,
  promptPublicPathBlocked,
} = require('../../../../utils/merchant-host-public-gate')
const { fetchMerchantProfile } = require('../../../../services/merchant')

/** 答句偏短只在确认公开时提醒，不拦截。与后台 SHORT_FAQ_REMIND_LEN 一致。 */
const SHORT_FAQ_REMIND_LEN = 30

function shortFaqLabels(faq) {
  return (Array.isArray(faq) ? faq : [])
    .map((row) => ({
      q: String((row && row.q) || '').trim(),
      a: String((row && row.a) || '').trim(),
    }))
    .filter((row) => row.a && row.a.length < SHORT_FAQ_REMIND_LEN)
    .map((row) => row.q)
}

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

/** 状态机：未跑大模型/模型失败可重跑；贴码失败重贴；成功跳过；失败仍可原图上网 */
function normalizeMaskImageRow(row) {
  const url = String((row && row.url) || '').trim()
  if (!url) return null
  const outcome = String((row && row.outcome) || '').trim()
  const needsManual =
    row && typeof row.needsManual === 'boolean'
      ? Boolean(row.needsManual)
      : outcome === 'call_failed' ||
        outcome === 'llm_failed' ||
        outcome === 'ok_detect_mask_failed' ||
        outcome === 'mask_failed'
  const pending =
    row && typeof row.pending === 'boolean'
      ? Boolean(row.pending)
      : outcome === 'pending' ||
        outcome === 'not_analyzed' ||
        (!outcome && !needsManual && row.masked !== true)
  const settledOk = outcome === 'ok_no_privacy' || outcome === 'ok_masked'
  const publishSafe =
    row && typeof row.masked === 'boolean' ? Boolean(row.masked) : settledOk
  return {
    url,
    outcome:
      outcome ||
      (needsManual ? 'llm_failed' : pending ? 'not_analyzed' : 'ok_no_privacy'),
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
    repairBrief: String((ch && ch.repairBrief) || ''),
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

const {
  HOST_PRIVACY_AGREEMENT_VERSION,
  HOST_PRIVACY_AGREEMENT_TITLE,
  HOST_PRIVACY_AGREEMENT_SECTIONS,
} = require('../../../../constants/host-privacy-agreement')

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
    onPublicWeb: false,
    publicGate: null,
    listedOff: false,
    listedOffMessage: '',
    listedOffAction: '',
    listedOffActionLabel: '去处理',
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
    preparingPublicPreview: false,
    showPrivacyAgreement: false,
    privacyAgreementTitle: HOST_PRIVACY_AGREEMENT_TITLE,
    privacyAgreementVersion: HOST_PRIVACY_AGREEMENT_VERSION,
    privacyAgreementSections: HOST_PRIVACY_AGREEMENT_SECTIONS,
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
    const preferPrivate = String(options.mode || '').trim() === 'private'
    this.setData({
      albumId: this.albumId,
      hostMode: preferPrivate ? 'private' : this.data.hostMode,
    })
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
      if (!album.publicGate) {
        try {
          const profile = await fetchMerchantProfile()
          album.publicGate = profile && profile.publicGate
        } catch (_) {
          album.publicGate = null
        }
      }
      this.applyAlbum(album)
      if (this.data.hosted && this.data.hostVisibility === 'public') {
        await this.loadPublicFace({ silent: true })
      } else if (this.data.hosted && this.data.hostMode === 'public') {
        this._autoMaskTried = false
        await this.enterPublicPreview()
      } else if (this.data.hosted) {
        await this.loadPublicFace({ silent: true })
      }
    } catch (e) {
      this.setData({
        status: 'error',
        errorMessage: (e && e.message) || '加载失败',
      })
    }
  },

  applyAlbum(album, options = {}) {
    const hostMeta = album.hostMeta || {}
    const stage = String(hostMeta.publicPublishStage || '')
    const geoLayer = hostMeta.geoLayer || {}
    const geoDraft = hostMeta.geoDraft || {}
    const archiveCopy = album.archiveCopy || null
    this._archiveCopy = archiveCopy
    const hosted = Boolean(hostMeta.hosted)
    const visibility = hostMeta.visibility || 'private'
    const publicGate = album.publicGate || null
    const onPublicWeb = Boolean(hostMeta.onPublicWeb)
    const listedOff = Boolean(
      hosted &&
        visibility === 'public' &&
        !onPublicWeb &&
        (!publicGate || publicGate.ready === false),
    )
    const hostMode =
      hosted && (stage || visibility === 'public') ? 'public' : hosted ? 'private' : this.data.hostMode
    const wizardMaxStep = resolveWizardMaxStep(hostMeta)
    const livePublic = hosted && visibility === 'public'
    // 已上店页直接看档案。还没上店页的公开，打码完成前停在选方式步
    let wizardStep = resolveWizardStep(hostMeta)
    if (livePublic || (options.keepPreview && hosted)) wizardStep = 2
    else if (hosted && hostMode === 'public') wizardStep = 1
    const fromLayer = {
      summary: geoLayer.summary || '',
      highlights: geoLayer.highlights || [],
      faq: geoLayer.faq || [],
      faultDesc: geoDraft.faultDesc || '',
      inspectResult: geoDraft.inspectResult || '',
      repairPlan: geoDraft.repairPlan || '',
      resultConfirm: geoDraft.resultConfirm || '',
    }
    const hasGeoDraft =
      geoDraft &&
      (geoDraft.summary ||
        (geoDraft.highlights && geoDraft.highlights.length) ||
        (geoDraft.faq && geoDraft.faq.length))
    const draftForUi = hasGeoDraft
      ? geoDraft
      : fromLayer.summary || (fromLayer.faq && fromLayer.faq.length)
        ? fromLayer
        : {
            summary: (archiveCopy && archiveCopy.summary) || '',
            highlights: [],
            faq: (archiveCopy && archiveCopy.faq) || [],
            faultDesc: '',
            inspectResult: '',
            repairPlan: '',
            resultConfirm: '',
            source: (archiveCopy && archiveCopy.source) || '',
          }
    this.setData({
      status: 'ready',
      serviceName: album.serviceName || '服务相册',
      hosted,
      hostVisibility: visibility,
      onPublicWeb,
      publicGate,
      listedOff,
      listedOffMessage:
        listedOff
          ? (publicGate && publicGate.message) ||
            '认证或门店资料不齐，档案暂时不会出现在网站上。'
          : '',
      listedOffAction: listedOff && publicGate ? publicGate.action || '' : '',
      listedOffActionLabel:
        listedOff && publicGate && publicGate.actionLabel
          ? publicGate.actionLabel
          : '去处理',
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
    if (this.data.preparingPublicPreview || this.data.maskAutoRunning) return
    if (mode === 'public' && promptPublicPathBlocked(this.data.publicGate)) return
    this.setData({ hostMode: mode })
  },

  onFixPublicGate() {
    navigatePublicGateAction(this.data.listedOffAction)
  },

  seedGeoFromArchiveCopy() {
    if (String(this.data.geoSummary || '').trim()) return
    const copy = this._archiveCopy
    if (!copy || !String(copy.summary || '').trim()) return
    this.setData(
      applyGeoDraftToPageData({
        summary: copy.summary,
        highlights: [],
        faq: copy.faq || [],
        source: copy.source || 'repair_report',
      }),
    )
  },

  onBack() {
    if (
      this.data.hosted ||
      this.data.working ||
      this.data.preparingPublicPreview ||
      this.data.maskAutoRunning
    ) {
      return
    }
    this.setData({ wizardStep: 1 })
  },

  async onNext() {
    if (this.data.working || this.data.hosted) return
    if (this.data.preparingPublicPreview || this.data.maskAutoRunning) return
    if (this.data.hostMode === 'public') {
      if (promptPublicPathBlocked(this.data.publicGate)) return
      this._autoMaskTried = false
      await this.enterPublicPreview()
      return
    }
    this.setData({ working: true })
    try {
      await this.loadPublicFace()
      this.seedGeoFromArchiveCopy()
      this.setData({ wizardStep: 2 })
    } finally {
      this.setData({ working: false })
    }
  },

  async loadPublicFace(options = {}) {
    try {
      const face = await fetchHostPublicFace(this.albumId, {
        // 公开托管：有码用码；无须打码/重试失败允许原图（责任在商家）
        // 公开托管：有码用码；无须打码/重试失败允许原图（责任在商家）
        requireMasked: this.data.hostMode === 'public',
      })
      const stamp = Date.now()
      const bust = (u) => (u ? withCacheBust(u, stamp) : u)
      const flowChapters = normalizeArchiveChapters(
        (face.serviceFlow && face.serviceFlow.chapters) || [],
      ).map((ch) => ({
        ...ch,
        findings: (ch.findings || []).map((row) => {
          if (!row) return row
          const images = Array.isArray(row.images)
            ? row.images.map((img) =>
                img && img.url ? { ...img, url: bust(img.url) } : img,
              )
            : row.images
          return {
            ...row,
            url: row.url ? bust(row.url) : row.url,
            images,
          }
        }),
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

  async onConfirmHost() {
    if (this.data.working || this.data.hosted || this.data.wizardStep !== 2) return
    if (this.data.hostMode === 'public' && promptPublicPathBlocked(this.data.publicGate)) return
    if (this.data.hostMode !== 'public') {
      this.setData({ working: true })
      try {
        await hostMerchantAlbum(this.albumId, {
          mode: 'private',
          useDesensitizeTool: true,
        })
        const album = await fetchMerchantServiceAlbum(this.albumId)
        this.applyAlbum(album)
        wx.showToast({ title: '已托管', icon: 'success' })
      } catch (e) {
        wx.showToast({ title: (e && e.message) || '托管失败', icon: 'none' })
      } finally {
        this.setData({ working: false })
      }
      return
    }
    const summary = String(this.data.geoSummary || '').trim()
    if (!summary) {
      wx.showToast({ title: '请填写店页摘要', icon: 'none' })
      return
    }
    const short = shortFaqLabels(this.data.geoFaq)
    if (!short.length) {
      this.setData({ showPrivacyAgreement: true })
      return
    }
    const named = short.find(Boolean)
    const content =
      short.length === 1 && named
        ? `「${named.slice(0, 18)}」的回答比较短。`
        : '有回答比较短。'
    wx.showModal({
      title: '回答较短',
      content,
      confirmText: '仍要公开',
      cancelText: '回去改',
      success: (res) => {
        if (res.confirm) this.setData({ showPrivacyAgreement: true })
      },
    })
  },

  async onCancelHost() {
    if (this.data.working || !this.data.hosted) return
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '取消托管',
        content: '网站上将不再展示，档案仍留在小程序。确认？',
        success: (res) => resolve(Boolean(res.confirm)),
      })
    })
    if (!ok) return
    this.setData({ working: true })
    try {
      await unhostMerchantAlbum(this.albumId)
      const album = await fetchMerchantServiceAlbum(this.albumId)
      this._autoMaskTried = false
      this.applyAlbum(album)
      this.setData({ hostMode: 'private' })
      wx.showToast({ title: '已取消托管', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
    } finally {
      this.setData({ working: false })
    }
  },

  /** @param {{ force?: boolean }} options force=对账补漏图，不是整本重打 */
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
    // 只数「从未跑过大模型」的图：已登记失败（llm_failed / mask_failed）由本轮对账处理一次，
    // 不再触发第二轮，避免同一次预览把失败图跑两遍模型。
    return (Array.isArray(maskImages) ? maskImages : []).filter(
      (row) => row && row.pending,
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
    if (this.data.hostVisibility === 'public') return
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
   * 进入公开预览：整案对账一轮自动打码（按张复用，禁止整本重打）。
   * 已成功/无敏感跳过；仅未跑过或失败的单张补处理。
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

      // 仍有未结清：只对账补漏进任务（交车等 flow 图），再只打未结清的单张
      // force = 后端「resync 资产列表」，不是整本 albumForce 重打
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
      this.setData({
        unmaskedCount: this.data.needsManualCount,
        showMaskBanner: false,
        maskAutoFailed: false,
        maskStatusHint: '',
        maskStatusTitle: '',
      })
    } finally {
      // 必须清掉，否则「继续公开」会被静默拦住
      this.setData({ maskAutoRunning: false })
    }
  },

  /**
   * 进公开预览：先打码（仍停在存档步），完成后再进入预览步。
   * 口径：15_ §6 — 打码未完成不得展示预览页。
   */
  async enterPublicPreview() {
    if (this.data.maskAutoRunning || this.data.preparingPublicPreview) return
    this.setData({
      hostMode: 'public',
      // 打码完成前绝不停在预览步（含从历史状态恢复到 step 2 的情况）
      wizardStep: 1,
      wizardMaxStep: Math.max(2, Number(this.data.wizardMaxStep) || 1),
      preparingPublicPreview: true,
      showMaskBanner: false,
      maskStatusTitle: '',
      maskStatusHint: '',
    })
    try {
      this._autoMaskTried = false
      await this.ensureAutoMaskOnReview()
      await this.ensureGeoDraftForPreview()
      await this.loadPublicFace({ silent: true })
      this.setData({
        wizardStep: 2,
        preparingPublicPreview: false,
        showMaskBanner: false,
      })
    } catch (_) {
      this.setData({ preparingPublicPreview: false, maskAutoRunning: false })
      wx.showToast({ title: '图片处理未完成，请重试', icon: 'none' })
    }
  },

  async ensureGeoDraftForPreview() {
    if (!this.data.hosted) {
      this.seedGeoFromArchiveCopy()
      this.setData(
        decorateGeoCopyState(
          this._baseQualitySuggestions,
          this.data.geoSummary,
          this.data.geoFaq,
        ),
      )
      return
    }
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

  onDismissPrivacyAgreement() {
    if (this.data.working) return
    this.setData({ showPrivacyAgreement: false })
  },

  /** 同意协议后执行公开校验与上线 */
  async onAcceptPrivacyAgreement() {
    if (this.data.working) return
    const summary = String(this.data.geoSummary || '').trim()
    if (!summary) {
      this.setData({ showPrivacyAgreement: false })
      wx.showToast({ title: '请填写店页摘要', icon: 'none' })
      return
    }
    this.setData({ working: true })
    const createdHost = !this.data.hosted
    try {
      if (createdHost) {
        await hostMerchantAlbum(this.albumId, {
          mode: 'public',
          useDesensitizeTool: true,
        })
      }
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
        if (createdHost) {
          await unhostMerchantAlbum(this.albumId)
          this.setData({ hosted: false })
        }
        this.setData({ showPrivacyAgreement: false })
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
      this.setData({ showPrivacyAgreement: false })
      wx.showToast({ title: '已上店页', icon: 'success' })
      const album = await fetchMerchantServiceAlbum(this.albumId)
      this.applyAlbum(album, { keepPreview: true })
    } catch (e) {
      if (createdHost) {
        try {
          await unhostMerchantAlbum(this.albumId)
        } catch (_) {
          /* 撤回失败时仍提示公开失败 */
        }
        this.setData({ hosted: false, showPrivacyAgreement: false })
      }
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
