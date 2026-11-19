/**
 * 案例托管状态（15_案例档案与托管状态机 · 二期）
 * hostMeta 落在 album.contentPackageJson.hostMeta
 */

const { prisma } = require('../lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')
const { CASE_ARTICLE_STATUS } = require('../constants/case-article-status')
const { publicCaseIdForAlbum } = require('../utils/public-case-id')
const { isPublicCaseH5Visible } = require('../utils/public-case-visibility')
const { resolveCaseCanonicalPath } = require('../utils/case-slug')
const { hostPublicTitle } = require('../utils/host-public-title')
const {
  readHostPreviewCache,
  patchHostPreviewCache,
  backfillHostPreviewCache,
  readHostPreviewView,
  buildHostPreviewEdits,
  buildDeliveryPhotoFingerprint,
} = require('./host-preview-cache.service')

function readHostMeta(album) {
  const pkg =
    album && album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  const meta = pkg.hostMeta && typeof pkg.hostMeta === 'object' ? pkg.hostMeta : {}
  const published =
    album &&
    album.publicCase &&
    album.publicCase.status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED &&
    !album.publicCase.storefrontHidden &&
    !album.publicCase.ownerBlockedAt
  return {
    hosted: Boolean(meta.hosted) || published,
    visibility: published ? 'public' : meta.visibility === 'public' ? 'public' : 'private',
    useDesensitizeTool: meta.useDesensitizeTool !== false,
    sourceLabel: meta.sourceLabel || '商家上传',
    overview: meta.overview || '',
    faq: Array.isArray(meta.faq) ? meta.faq : [],
    updatedAt: meta.updatedAt || null,
    hostedAt: meta.hostedAt || null,
    factLayerLocked: Boolean(meta.factLayerLocked),
    archiveSnapshot: meta.archiveSnapshot || null,
    publicPublishStage: String(meta.publicPublishStage || ''),
    privacyAuditPassedAt: meta.privacyAuditPassedAt || null,
    privacyAgreementAcceptedAt: meta.privacyAgreementAcceptedAt || null,
    privacyAgreementVersion: meta.privacyAgreementVersion || '',
    geoDraft: meta.geoDraft || null,
    geoLayer: meta.geoLayer || null,
    revisions: Array.isArray(meta.revisions) ? meta.revisions : [],
    confirmedDocs: Array.isArray(meta.confirmedDocs) ? meta.confirmedDocs : [],
  }
}

/** 托管时冻结门店展示快照（主档在 store 表，此处只读副本） */
async function resolveStoreSnapshot(album = {}) {
  const { buildPublisherTrustBadge } = require('../utils/merchant-trust')
  const base = {
    storeId: album.storeId || '',
    name: album.storeName || '',
    city: '',
    address: '',
    snapshotAt: new Date().toISOString(),
    publisherTrust: null,
  }
  if (!album.storeId) return base
  try {
    const store = await prisma.store.findUnique({
      where: { id: album.storeId },
      select: {
        name: true,
        address: true,
        merchant: {
          select: {
            accountType: true,
            authStatus: true,
            profileCompleteness: true,
            name: true,
            legalName: true,
          },
        },
      },
    })
    if (store) {
      base.name = store.name || base.name
      base.address = store.address || ''
      if (store.merchant) {
        base.publisherTrust = buildPublisherTrustBadge(store.merchant, store)
      }
    }
  } catch (_) {
    /* 快照允许仅相册冗余字段 */
  }
  return base
}

/** 托管时冻结的原始服务档案（不含 merchantCaseDraft 优化文稿） */
function buildHostedArchiveSnapshot(album = {}, storeSnapshot = null) {
  const pkg =
    album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  const flowNodes = Array.isArray(pkg.flowNodes) ? pkg.flowNodes : []
  const confirmedDocs = []
  flowNodes.forEach((node) => {
    const doc = node && node.document
    const content =
      node && node.content && typeof node.content === 'object' ? node.content : {}
    if (!doc || doc.status !== 'confirmed' || !Object.keys(content).length) return
    confirmedDocs.push({
      nodeId: node.id,
      kind: node.kind,
      confirmedAt: doc.confirmedAt || '',
      confirmedBy: doc.confirmedBy || '',
      content,
    })
  })
  return {
    frozenAt: new Date().toISOString(),
    albumId: album.id,
    serviceName: album.serviceName || '',
    vehicle: album.vehicleJson || {},
    storeId: album.storeId || '',
    storeSnapshot:
      storeSnapshot && typeof storeSnapshot === 'object'
        ? storeSnapshot
        : {
            storeId: album.storeId || '',
            name: album.storeName || '',
            city: '',
            address: '',
            snapshotAt: new Date().toISOString(),
          },
    // 预留：若将来开放车主交档，可另写 storeAttribution（选店 / 非平台店），不替代本快照
    nodes: (album.nodes || []).map((n) => ({
      id: n.id,
      title: n.title || '',
      status: n.status || '',
      note: n.note || '',
      images: (n.images || []).map((img) => ({
        url: typeof img === 'string' ? img : (img && img.url) || '',
        caption: typeof img === 'object' && img ? img.caption || '' : '',
      })),
    })),
    flowNodes: flowNodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title || '',
      status: n.status || '',
      // 单据人工文本真源在 content；不冻结 content 会让公网案例只剩模板句
      content: n.content || null,
      document: n.document
        ? {
            status: n.document.status || '',
            confirmedAt: n.document.confirmedAt || '',
            payload: {},
          }
        : null,
    })),
    confirmedDocs,
  }
}

async function writeHostMeta(albumId, patch) {
  const album = await prisma.album.findUnique({ where: { id: albumId } })
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  const pkg =
    album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? { ...album.contentPackageJson }
      : {}
  const prev = pkg.hostMeta && typeof pkg.hostMeta === 'object' ? { ...pkg.hostMeta } : {}
  const next = {
    ...prev,
    ...patch,
    sourceLabel: '商家上传',
    updatedAt: new Date().toISOString(),
  }
  pkg.hostMeta = next
  await prisma.album.update({
    where: { id: albumId },
    data: { contentPackageJson: pkg },
  })
  return readHostMeta({ ...album, contentPackageJson: pkg, publicCase: album.publicCase })
}

async function hostAlbum(
  albumId,
  { storeId, merchantId, mode = 'private', useDesensitizeTool = true } = {},
) {
  const { assertMerchantAlbum, loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)
  const status = String(album.status || '')
  const { isServiceAlbumRepairDone } = require('../constants/v2')
  if (!isServiceAlbumRepairDone(status) && status !== 'completed') {
    const err = new Error('请先完成服务流程并整单完工后再托管')
    err.status = 409
    err.code = 'ALBUM_NOT_COMPLETED'
    throw err
  }

  const prev = readHostMeta(album)
  const intentPublic = String(mode || 'private') === 'public'

  if (prev.hosted && !intentPublic && prev.visibility !== 'public') {
    return { albumId, ...prev, message: '已在私密托管', nextStep: 'done' }
  }
  if (prev.hosted && intentPublic && prev.visibility === 'public') {
    return { albumId, ...prev, message: '已在店页公开', nextStep: 'done' }
  }

  const storeSnapshot = await resolveStoreSnapshot(album)
  const archiveSnapshot =
    prev.archiveSnapshot && prev.factLayerLocked
      ? prev.archiveSnapshot
      : buildHostedArchiveSnapshot(album, storeSnapshot)

  let publicPublishStage = ''
  if (intentPublic) {
    if (prev.privacyAuditPassedAt && prev.geoLayer?.confirmedAt) {
      publicPublishStage = 'published'
    } else if (prev.privacyAuditPassedAt && prev.geoDraft?.summary) {
      publicPublishStage = 'awaiting_geo_confirm'
    } else if (prev.privacyAuditPassedAt) {
      publicPublishStage = 'awaiting_geo'
    } else {
      publicPublishStage = 'awaiting_privacy'
    }
  }

  const meta = await writeHostMeta(albumId, {
    hosted: true,
    visibility: prev.visibility === 'public' ? 'public' : 'private',
    factLayerLocked: true,
    archiveSnapshot,
    hostedAt: prev.hostedAt || new Date().toISOString(),
    useDesensitizeTool: useDesensitizeTool !== false,
    publicPublishStage: intentPublic ? publicPublishStage : prev.hosted ? prev.publicPublishStage || '' : '',
    privacyAuditPassedAt: intentPublic ? prev.privacyAuditPassedAt || null : null,
    geoDraft: intentPublic ? prev.geoDraft || null : null,
    geoLayer: intentPublic ? prev.geoLayer || null : null,
  })

  if (intentPublic) {
    const nextStep =
      publicPublishStage === 'awaiting_geo_confirm'
        ? 'geo_confirm'
        : publicPublishStage === 'awaiting_geo'
          ? 'geo'
          : 'privacy'
    return {
      albumId,
      ...meta,
      message:
        prev.hosted && prev.visibility !== 'public'
          ? '已设为公开托管；请完成隐私校验并确认 GEO'
          : '已托管；请完成隐私校验后再确认 GEO 并公开',
      nextStep,
    }
  }
  return { albumId, ...meta, message: '已托管到案例站（私密）', nextStep: 'done' }
}

/** 公开托管：隐私规则校验（责任在门店；工具未改且通过可 autoPassed） */
async function auditHostedPublicPrivacy(albumId, { storeId, merchantId } = {}) {
  const { assertMerchantAlbum, loadAlbum, buildMerchantView } = require('./service-album.service')
  const { assessPublicCaseQuality } = require('./public-case-quality.service')
  const { assessHostPublicContent } = require('../utils/host-public-content-check')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)
  const prev = readHostMeta(album)
  if (!prev.hosted) {
    const err = new Error('请先托管到案例站')
    err.status = 409
    throw err
  }

  const view = buildMerchantView(album)
  const quality = assessPublicCaseQuality(view)
  const hardBlocks = (quality.privacyBlocks || []).map((block) => ({
    kind: block.kind || 'privacy',
    issue: block.issue || block.field || 'privacy',
    message: block.message || '存在隐私风险，请处理后再公开',
  }))
  const passed = hardBlocks.length === 0
  const autoPassed = passed && prev.useDesensitizeTool !== false

  let meta = prev
  if (passed) {
    meta = await writeHostMeta(albumId, {
      privacyAuditPassedAt: new Date().toISOString(),
      publicPublishStage: 'awaiting_geo',
    })
  }

  return {
    albumId,
    passed,
    autoPassed,
    hardBlocks,
    qualitySuggestions: assessHostPublicContent({ album, view }).suggestions,
    ...meta,
    message: passed ? '隐私校验已通过' : hardBlocks[0]?.message || '隐私校验未通过',
  }
}

function buildRuleHostedGeoDraft(view, album) {
  const { buildAlbumGeoPreview } = require('./album-geo-preview.service')
  const { buildRuleMerchantCaseDraft } = require('./merchant-case-draft.service')
  const { buildHostedStorefrontFaq } = require('../utils/hosted-storefront-faq')
  const hasOwner =
    Boolean(String(album.userId || '').trim()) ||
    Boolean(String(album.userPhone || '').trim())
  const preview = buildAlbumGeoPreview(view, { coldStart: !hasOwner })
  const geo = preview.geo || {}
  const ruleDraft = buildRuleMerchantCaseDraft(view)
  const faqPack = buildHostedStorefrontFaq({
    serviceName: view.serviceName || album.serviceName,
    templateId: view.templateId || album.templateId,
    geo,
    view,
    answeredFaq: ruleDraft.faq || [],
  })
  return {
    geoDraft: {
      summary: String(preview.aiSummaryPreview || geo.faultDesc || '').trim(),
      highlights: Array.isArray(geo.keyInfo) ? geo.keyInfo : [],
      nodeStories: [],
      chapterNarratives: [],
      faq: faqPack.faq,
      faqCategoryId: faqPack.categoryId,
      faqCategoryLabel: faqPack.categoryLabel,
      faqHasMaterial: faqPack.hasMaterial,
      faultDesc: geo.faultDesc || '',
      inspectResult: geo.inspectResult || '',
      repairPlan: geo.repairPlan || '',
      resultConfirm: geo.resultConfirm || '',
      generatedAt: new Date().toISOString(),
      source: 'rule',
    },
    preview,
    faqPack,
  }
}

function buildHostedStorefrontLlmInput(view, hostMeta, ruleGeo) {
  const snap =
    (hostMeta && hostMeta.archiveSnapshot && hostMeta.archiveSnapshot.storeSnapshot) || {}
  const geo = (ruleGeo && ruleGeo.preview && ruleGeo.preview.geo) || {}
  const faqPack = ruleGeo.faqPack || {
    faqQuestions: (ruleGeo.geoDraft && ruleGeo.geoDraft.faq || []).map((r) => r.q).filter(Boolean),
    hasMaterial: Boolean(ruleGeo.geoDraft && ruleGeo.geoDraft.faqHasMaterial),
    categoryLabel: (ruleGeo.geoDraft && ruleGeo.geoDraft.faqCategoryLabel) || '',
  }
  return {
    task: 'hosted_storefront_copy_v0',
    city: snap.city || view.store?.city || view.city || '',
    storeName: snap.name || view.storeName || view.store?.name || '',
    serviceName: view.serviceName || '',
    vehicleDisplay: view.vehicleDisplay || '',
    faultDesc: geo.faultDesc || '',
    inspectResult: geo.inspectResult || '',
    repairPlan: geo.repairPlan || '',
    resultConfirm: geo.resultConfirm || '',
    ruleSummary: (ruleGeo.geoDraft && ruleGeo.geoDraft.summary) || '',
    ruleHighlights: (ruleGeo.geoDraft && ruleGeo.geoDraft.highlights) || [],
    faqCategory: faqPack.categoryLabel || '',
    faqHasMaterial: Boolean(faqPack.hasMaterial),
    faqQuestions: faqPack.faqQuestions || [],
    faqCandidates: (ruleGeo.geoDraft && ruleGeo.geoDraft.faq) || [],
  }
}

function normalizeHostedGeoDraftFromLlm(parsed, fallback) {
  const { buildHostedStorefrontFaq } = require('../utils/hosted-storefront-faq')
  const base = fallback && fallback.geoDraft ? fallback.geoDraft : {}
  const highlightsRaw = Array.isArray(parsed.highlights) ? parsed.highlights : base.highlights || []
  const highlights = highlightsRaw
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const label = String(row.label || row.key || '').trim()
      const value = String(row.value || '').trim()
      if (!label && !value) return null
      return { label: label || '要点', value: value.slice(0, 40) }
    })
    .filter(Boolean)
    .slice(0, 6)
  const categoryId =
    (fallback && fallback.faqPack && fallback.faqPack.categoryId) || base.faqCategoryId || ''
  const finalFaq = buildHostedStorefrontFaq({
    categoryId,
    serviceName: '',
    geo: {
      faultDesc: base.faultDesc,
      inspectResult: base.inspectResult,
      repairPlan: base.repairPlan,
      resultConfirm: base.resultConfirm,
    },
    answeredFaq: Array.isArray(parsed.faq) ? parsed.faq : base.faq || [],
  })
  const summary = String(parsed.summary || base.summary || '').trim()
  const nodeStories = sanitizeHostedNodeStories(parsed.nodeStories)
  const chapterNarratives = sanitizeHostedChapterNarratives(parsed.chapterNarratives)
  return {
    ...base,
    summary,
    highlights,
    nodeStories: nodeStories.length ? nodeStories : sanitizeHostedNodeStories(base.nodeStories),
    chapterNarratives: chapterNarratives.length
      ? chapterNarratives
      : sanitizeHostedChapterNarratives(base.chapterNarratives),
    faq: finalFaq.faq,
    faqCategoryId: finalFaq.categoryId,
    faqCategoryLabel: finalFaq.categoryLabel,
    faqHasMaterial: finalFaq.hasMaterial,
    generatedAt: new Date().toISOString(),
    source: summary ? 'llm_v0' : base.source || 'rule',
  }
}

/** 维修实录：只收事实短段，宁缺勿滥 */
function sanitizeHostedNodeStories(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((row) => String((row && typeof row === 'object' ? row.text : row) || '').trim())
    .filter((text) => text.length >= 8 && text.length <= 200)
    .slice(0, 5)
}

/**
 * 章节衔接语：把节点讲成人话。只做衔接，不改项目名/文案。
 * 传 allowedIds 时丢弃对不上章节的 id（防止旧内容残留串位）。
 */
function sanitizeHostedChapterNarratives(raw, allowedIds) {
  const allow =
    Array.isArray(allowedIds) && allowedIds.length ? new Set(allowedIds.map(String)) : null
  const seen = new Set()
  return (Array.isArray(raw) ? raw : [])
    .map((row) => {
      const obj = row && typeof row === 'object' ? row : null
      if (!obj) return null
      const id = String(obj.id || '').trim()
      const text = String(obj.text || '').trim()
      if (!id || !text) return null
      if (allow && !allow.has(id)) return null
      if (text.length < 8 || text.length > 140) return null
      if (seen.has(id)) return null
      seen.add(id)
      return { id, text }
    })
    .filter(Boolean)
    .slice(0, 12)
}

/** 给模型看的章节清单：只给结构与已确认的项名，供它写衔接语 */
function buildChapterBriefs(chapters) {
  return (Array.isArray(chapters) ? chapters : []).map((ch) => ({
    id: String((ch && ch.id) || ''),
    kind: String((ch && ch.kind) || ''),
    title: String((ch && ch.title) || ''),
    chiefComplaint: String((ch && ch.chiefComplaint) || ''),
    findings: (Array.isArray(ch && ch.findings) ? ch.findings : [])
      .map((row) => [row && row.partName, row && row.result].filter(Boolean).join('·'))
      .filter(Boolean)
      .slice(0, 12),
    items: (Array.isArray(ch && ch.items) ? ch.items : [])
      .map((row) => String((row && row.name) || '').trim())
      .filter(Boolean)
      .slice(0, 12),
    acceptance: (Array.isArray(ch && ch.acceptanceItems) ? ch.acceptanceItems : [])
      .map((row) => String((row && row.name) || '').trim())
      .filter(Boolean)
      .slice(0, 12),
  }))
}

/** 兜底衔接语：模型漏写某章节时，用已确认的项目名拼一句，不引入任何新事实 */
function buildFallbackChapterNarrative(chapter) {
  const names = (Array.isArray(chapter && chapter.items) ? chapter.items : [])
    .map((row) => String((row && row.name) || '').trim())
    .filter(Boolean)
  const findings = (Array.isArray(chapter && chapter.findings) ? chapter.findings : [])
    .map((row) => String((row && row.partName) || '').trim())
    .filter(Boolean)
  const list = (arr, max) => arr.slice(0, max).join('、')
  const kind = String((chapter && chapter.kind) || '')
  const title = String((chapter && chapter.title) || '')
  if (kind === 'inspection_report') {
    if (!findings.length) return ''
    return `接车后先做了检查，主要看了${list(findings, 3)}。`
  }
  if (kind === 'quote_confirm') {
    if (!names.length) return ''
    if (title === '施工中新发现' || title === '交车时补充') {
      return `${list(names, 3)}是后续检查中发现的，和车主确认后追加处理。`
    }
    return `根据检测结果，确定了对${list(names, 3)}的处理方案。`
  }
  if (kind === 'work') {
    if (!names.length) return ''
    return `接着按确认的方案完成了${list(names, 3)}的施工。`
  }
  if (kind === 'repair_report') {
    return '全部项目完成后做了路试和验收，确认正常后交车。'
  }
  return ''
}

/** 模型衔接语 + 兜底补齐：保证每个有内容的章节都有导语，且不覆盖模型原文 */
function mergeChapterNarratives(chapters, list) {
  const chaptersSafe = Array.isArray(chapters) ? chapters : []
  const existing = sanitizeHostedChapterNarratives(
    list,
    chaptersSafe.map((ch) => ch && ch.id).filter(Boolean),
  )
  const byId = new Map(existing.map((row) => [row.id, row.text]))
  chaptersSafe.forEach((ch) => {
    const id = String((ch && ch.id) || '')
    if (!id || byId.has(id)) return
    const fallback = buildFallbackChapterNarrative(ch)
    if (fallback) byId.set(id, fallback)
  })
  return Array.from(byId, ([id, text]) => ({ id, text }))
}

/** 按相册流程构建公开章节（衔接语校验/渲染共用） */
function buildHostedPublicChapters(album, view, roles) {
  const { buildPublicServiceFlow } = require('../utils/public-service-flow')
  const { readHostDeliveryPhotoRoles } = require('../utils/host-delivery-photo-roles')
  const pkg =
    album && album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  return buildPublicServiceFlow({
    flowNodes: Array.isArray(pkg.flowNodes) ? pkg.flowNodes : [],
    album,
    contentNodes: (view && view.nodes) || [],
    allowPrivateFallback: true,
    // 交车节点补传图只有被模型判为施工证据的才并进施工章
    deliveryPhotoRoles: Array.isArray(roles) ? roles : readHostDeliveryPhotoRoles(album),
  }).chapters
}

const DELIVERY_ROLE_SYSTEM =
  '你是汽车维修档案的照片归档助手。判断交车环节上传的每张照片属于哪一类：施工证据（施工过程、拆装/更换部位特写、验收特写）或整车外观（车身全貌、外观与内饰全景）。只输出 JSON。'

function parseJsonObject(raw) {
  const body = String(raw || '')
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch (_) {
    return null
  }
}

/** 模型可选的项目名：施工章项目 + 报价章项目（施工漏拍、验收照补传到交车节点的情况） */
function collectDeliveryRoleItemNames(chapters) {
  const names = []
  const seen = new Set()
  ;(Array.isArray(chapters) ? chapters : []).forEach((chapter) => {
    const kind = String((chapter && chapter.kind) || '')
    if (kind !== 'work' && kind !== 'quote_confirm' && kind !== 'addon_quote_confirm') return
    ;(Array.isArray(chapter.items) ? chapter.items : []).forEach((item) => {
      const name = String((item && item.name) || '').trim()
      if (!name || seen.has(name)) return
      seen.add(name)
      names.push(name)
    })
  })
  return names
}

/**
 * 托管生成时由模型判断交车节点图片归属。
 * 交车节点只有一个整车照上传入口，门店可能把施工验收照也传到这里；
 * 判为施工并给出项目名的图在公开预览/公开页并进施工章，其余仍按外观留档。
 * 判定按交车图集合指纹进预览缓存：判过即复用，「全判外观」也算判过，不再重看图。
 */
async function resolveDeliveryPhotoRoles(album, view, geoDraft, options = {}) {
  const {
    forceRegen = false,
    judged = false,
    judgedRoles = [],
    photoFingerprint = '',
  } = options
  if (judged && !forceRegen) return Array.isArray(judgedRoles) ? judgedRoles : []
  const existing = geoDraft && Array.isArray(geoDraft.deliveryPhotoRoles) ? geoDraft.deliveryPhotoRoles : []
  if (existing.length && !forceRegen) return existing
  const { chatCompletion } = require('../lib/dashscope-chat')
  const { getAlbumVisionConfig } = require('./album-vision-ondemand.service')
  const {
    collectDeliveryEntryPhotos,
    normalizeDeliveryPhotoRoles,
  } = require('../utils/host-delivery-photo-roles')
  const vision = getAlbumVisionConfig()
  if (!vision.enabled || vision.dryRun || !vision.apiKey) return existing
  const pkg =
    album && album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  const photos = collectDeliveryEntryPhotos(Array.isArray(pkg.flowNodes) ? pkg.flowNodes : [])
  if (!photos.length) return existing
  const chapters = buildHostedPublicChapters(album, view)
  const itemNames = collectDeliveryRoleItemNames(chapters)
  if (!itemNames.length) return existing
  const candidates = photos.slice(0, Math.max(1, Number(vision.maxImages) || 8))
  const itemLines = itemNames.map((name, idx) => `${idx + 1}. ${name}`).join('\n')
  const content = [
    {
      type: 'text',
      text: `本单施工项目（"项目"只能从中选，不能新造）：\n${itemLines}\n\n下面按顺序给出交车环节上传的 ${candidates.length} 张照片。\n逐张判断：\n- "施工"：能看到具体施工部位、拆装或更换的配件、施工过程或验收特写\n- "外观"：整车、车身外观、内饰全景等交车留档照\n- "其他"：无法判断或与两者都无关\n判为"施工"时，从上面的施工项目里选最匹配的一项填入"项目"；匹配不上就留空字符串。\n只输出 JSON：{"photos":[{"图":1,"归属":"施工","项目":"项目名"}]}`,
    },
  ]
  candidates.forEach((photo, idx) => {
    content.push({ type: 'text', text: `图${idx + 1}` })
    content.push({ type: 'image_url', image_url: { url: photo.url } })
  })
  try {
    const res = await chatCompletion({
      apiUrl: vision.apiUrl,
      apiKey: vision.apiKey,
      model: vision.model,
      temperature: 0.1,
      timeoutMs: vision.timeoutMs,
      responseFormat: { type: 'json_object' },
      messages: [
        { role: 'system', content: DELIVERY_ROLE_SYSTEM },
        { role: 'user', content },
      ],
    })
    const parsed = parseJsonObject(res && res.text)
    const answered = Array.isArray(parsed && parsed.photos)
    const roles = normalizeDeliveryPhotoRoles(parsed && parsed.photos, candidates, itemNames)
    // 模型答过就记账（含全判外观的空结果）；没答上不留记，下次再看图
    if (answered && photoFingerprint) {
      await patchHostPreviewCache(album.id, {
        photos: { deliveryPhotoRoles: roles },
        photoFingerprint,
      })
    }
    console.info('[case-hosting] delivery photo roles', {
      albumId: album && album.id,
      photos: candidates.length,
      roles: roles.length,
      cached: answered,
    })
    return roles.length ? roles : existing
  } catch (error) {
    console.warn('[case-hosting] delivery photo roles failed', {
      albumId: album && album.id,
      error: String((error && error.message) || error).slice(0, 200),
    })
    return existing
  }
}

async function tryGenerateHostedGeoDraftWithLlm(view, hostMeta, ruleGeo, album) {
  const fs = require('fs')
  const path = require('path')
  const { config } = require('../config')
  const { chatCompletion } = require('../lib/dashscope-chat')
  const { scrubPiiDeep } = require('../utils/scrub-pii-text')
  const { buildCaseFactPack } = require('../utils/case-geo-factpack')
  const llm = config.geoLlm || {}
  const enabled = process.env.GEO_LLM_ENABLED === 'true' || llm.enabled === true
  const dryRun =
    process.env.GEO_LLM_DRY_RUN === 'true' || (!enabled && llm.dryRun !== false && !llm.enabled)
  const apiKey = String(
    process.env.GEO_LLM_API_KEY || llm.apiKey || process.env.DASHSCOPE_API_KEY || '',
  ).trim()
  if (!enabled || dryRun || !apiKey) return null

  const promptPath = path.join(__dirname, '../prompts/hosted-storefront-copy-v0.md')
  let systemPrompt = ''
  try {
    systemPrompt = fs.readFileSync(promptPath, 'utf8')
  } catch (_) {
    return null
  }
  const pkg =
    album && album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  const factPack = buildCaseFactPack(pkg.flowNodes)
  const chapters = buildHostedPublicChapters(album, view)
  const userPayload = scrubPiiDeep({
    ...buildHostedStorefrontLlmInput(view, hostMeta, ruleGeo),
    chapters: buildChapterBriefs(chapters),
    facts: factPack && factPack.hasFlow
      ? {
          chiefComplaint: factPack.chiefComplaint,
          vehicle: factPack.vehicle,
          findings: factPack.findings,
          quoteItems: factPack.quoteItems,
          quotePricing: factPack.quotePricing,
          addonQuoteItems: factPack.addonQuoteItems,
          addonQuotePricing: factPack.addonQuotePricing,
          workItems: factPack.workItems,
          finish: factPack.finish,
          missing: factPack.missing,
        }
      : null,
  })
  try {
    const completion = await chatCompletion({
      apiKey,
      model: String(process.env.GEO_LLM_MODEL || llm.model || 'qwen3.7-flash').trim(),
      timeoutMs: Number(process.env.GEO_LLM_TIMEOUT_MS || llm.timeoutMs || 90000),
      temperature: 0.2,
      responseFormat: { type: 'json_object' },
      enableThinking: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
    })
    const raw = String(completion && completion.text ? completion.text : '').trim()
    let parsed = {}
    try {
      parsed = JSON.parse(raw)
    } catch (_) {
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(raw.slice(start, end + 1))
        } catch (e) {
          parsed = {}
        }
      }
    }
    const geoDraft = normalizeHostedGeoDraftFromLlm(parsed, ruleGeo)
    if (!geoDraft.summary) return null
    geoDraft.highlights = []
    geoDraft.chapterNarratives = sanitizeHostedChapterNarratives(
      geoDraft.chapterNarratives,
      chapters.map((ch) => ch && ch.id).filter(Boolean),
    )
    return geoDraft
  } catch (e) {
    console.warn('[case-hosting] storefront LLM failed, fallback rule', e && e.message)
    return null
  }
}

/**
 * 托管文案的事实指纹：人工文本没变就不重跑模型
 * 原料与 LLM 输入同源（buildCaseFactPack），只取"有没有变"，不参与展示
 */
function buildHostedFactFingerprint(album) {
  const crypto = require('crypto')
  const { buildCaseFactPack } = require('../utils/case-geo-factpack')
  const pkg =
    album && album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  const pack = buildCaseFactPack(pkg.flowNodes)
  return crypto.createHash('sha1').update(JSON.stringify(pack)).digest('hex').slice(0, 16)
}

/**
 * 公开托管：店页说明草稿
 * 先复用预览缓存（大模型文案 + 商家人工覆盖稿），只有全都没有才跑模型。
 * 规则拼句仅兜底。真源：15_ §6.1 · 17_ §0 · docs/changes/20261119-托管预览独立缓存.md
 */
async function generateHostedGeoDraft(albumId, { storeId, merchantId, forceRegen = false } = {}) {
  const { assertMerchantAlbum, loadAlbum, buildMerchantView } = require('./service-album.service')
  const { mergeArchiveCopyIntoPackage, readPublicCopyFromAlbum } = require('../utils/album-archive-copy')
  const { isServiceAlbumRepairDone } = require('../constants/v2')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)
  const status = String(album.status || '')
  if (!isServiceAlbumRepairDone(status) && status !== 'completed') {
    const err = new Error('请先完成服务流程并整单完工')
    err.status = 409
    err.code = 'ALBUM_NOT_COMPLETED'
    throw err
  }
  const prev = readHostMeta(album)
  // 两步托管：预览步即可拉店页草稿；隐私协议与校验在「继续公开」时完成，此处不再要求 privacyAuditPassedAt

  const pkg =
    album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  // 复用优先级：预览缓存的人工稿/文案产物（host_preview_caches）→ archiveCopy → 模型
  // 文档口径：15_§6.1 + docs/changes/20261119-托管预览独立缓存.md
  const factFingerprint = buildHostedFactFingerprint(album)
  const photoFingerprint = buildDeliveryPhotoFingerprint(Array.isArray(pkg.flowNodes) ? pkg.flowNodes : [])
  const cacheRow =
    (await readHostPreviewCache(albumId)) ||
    (await backfillHostPreviewCache(albumId, {
      hostMeta: prev,
      storeId,
      merchantId,
      copyFingerprint: factFingerprint,
      photoFingerprint,
    }))
  const previewCache = readHostPreviewView(cacheRow, {
    copyFingerprint: factFingerprint,
    photoFingerprint,
  })

  const reusableDraft = forceRegen
    ? null
    : previewCache.copy
      ? { ...previewCache.copy, factFingerprint }
      : null
  const existingCopy = forceRegen ? null : readPublicCopyFromAlbum(album)

  const view = buildMerchantView(album)
  const ruleGeo = buildRuleHostedGeoDraft(view, album)
  let geoDraft = null
  let message = '已按整单记录整理出院摘要与问答，请核对后公开'

  let cached = false
  if (reusableDraft) {
    // 预览缓存里的文案产物：整份复用，不跑模型
    geoDraft = reusableDraft
    cached = true
    message =
      previewCache.effective && previewCache.effective.humanEdited
        ? '已复用上次托管的店页内容（含你的修改）'
        : '已复用上次托管的店页内容'
    console.info('[case-hosting] generate-geo reuse cache', {
      albumId,
      source: geoDraft.source,
      factFingerprint,
    })
  } else if (existingCopy && existingCopy.summary) {
    // 有现成的交车报告摘要/问答 → 直接用，不跑 LLM
    geoDraft = {
      summary: existingCopy.summary,
      faq: existingCopy.faq || [],
      highlights: [],
      nodeStories: [],
      chapterNarratives: [],
      source: existingCopy.source || 'repair_report',
      factFingerprint,
    }
    console.info('[case-hosting] generate-geo use existing copy', { albumId, source: geoDraft.source })
  } else {
    // 没有现成说明 → 跑 LLM 生成（兜底）。上下文只给店员确认过的项目文本
    const llmDraft = await tryGenerateHostedGeoDraftWithLlm(view, prev, ruleGeo, album)
    geoDraft = {
      ...(llmDraft || {
        ...ruleGeo.geoDraft,
        highlights: [],
        source: 'rule_fallback',
      }),
      factFingerprint,
    }
    if (geoDraft && geoDraft.summary) {
      try {
        const nextPkg = mergeArchiveCopyIntoPackage(pkg, {
          summary: geoDraft.summary,
          faq: geoDraft.faq,
          source: forceRegen ? 'host_regen' : geoDraft.source || 'host_regen',
        })
        const { prisma } = require('../lib/prisma')
        await prisma.album.update({
          where: { id: albumId },
          data: { contentPackageJson: nextPkg },
        })
      } catch (_) {
        /* 草稿落相册失败不挡托管 */
      }
    }
    if (!llmDraft) {
      message = '自动说明暂不可用，以下为简要草稿，请自行改写'
    }
  }

  if (!geoDraft) geoDraft = ruleGeo.geoDraft
  // 模型/规则产物是缓存里的「文案层」，人工稿另存一层，重新生成时才动它
  const modelCopy = geoDraft
  if (!cached) {
    await patchHostPreviewCache(albumId, {
      storeId,
      merchantId,
      copy: modelCopy,
      copyFingerprint: factFingerprint,
      // 「AI 生成」是商家确认过的覆盖动作，人工稿到此作废
      ...(forceRegen ? { edits: null } : {}),
    })
  }
  // 人工覆盖稿优先：改过的摘要/问答压在模型稿之上展示，离开页面再回来不丢
  if (!forceRegen && previewCache.effective) {
    const humanSummary = String(previewCache.effective.summary || '').trim()
    const humanFaqEdited = Boolean(previewCache.edits && previewCache.edits.faqEdited)
    geoDraft = {
      ...geoDraft,
      ...(humanSummary ? { summary: humanSummary } : {}),
      ...(humanFaqEdited
        ? {
            faq: Array.isArray(previewCache.effective.faq)
              ? previewCache.effective.faq
              : [],
          }
        : {}),
      humanEdited: Boolean(previewCache.effective.humanEdited),
    }
  }
  // 交车节点补传图归属：托管生成时由模型判定；施工证据图并进施工章，流程与节点 AI 不变
  const deliveryPhotoRoles = await resolveDeliveryPhotoRoles(album, view, geoDraft, {
    forceRegen,
    judged: previewCache.photoJudged,
    judgedRoles: previewCache.deliveryPhotoRoles,
    photoFingerprint,
  })
  if (deliveryPhotoRoles.length) {
    geoDraft = { ...geoDraft, deliveryPhotoRoles }
  }
  // 章节衔接语按当前章节校验并补齐：复用旧草稿/公开内容时，节点变了的 id 丢弃、缺的补兜底
  {
    const chapters = buildHostedPublicChapters(album, view, deliveryPhotoRoles)
    geoDraft = {
      ...geoDraft,
      chapterNarratives: mergeChapterNarratives(chapters, geoDraft.chapterNarratives),
    }
  }

  const { assessHostPublicContent } = require('../utils/host-public-content-check')

  // 已公开状态不回退：仅复用已上线内容时停在 published；手动重生成需重新确认
  const published =
    !forceRegen &&
    (Boolean(prev.geoLayer && prev.geoLayer.confirmedAt) || prev.publicPublishStage === 'published')
  const nextStage = published
    ? 'published'
    : prev.hosted && prev.privacyAuditPassedAt
      ? 'awaiting_geo_confirm'
      : prev.publicPublishStage || (prev.hosted ? 'awaiting_privacy' : '')
  const meta = await writeHostMeta(albumId, {
    geoDraft,
    publicPublishStage: nextStage,
  })
  return {
    albumId,
    geoDraft,
    cached,
    preview: ruleGeo.preview,
    qualitySuggestions: assessHostPublicContent({ album, view, geoDraft }).suggestions,
    ...meta,
    message,
  }
}

/**
 * 预览缓存读取：进页时回显用，人工稿优先。
 * hostMeta 里的草稿只作冷启动回填来源，回填之后一律以缓存表为准。
 */
async function getHostPreviewCache(albumId, { storeId, merchantId } = {}) {
  const { assertMerchantAlbum, loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)
  const prev = readHostMeta(album)
  const pkg =
    album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  const flowNodes = Array.isArray(pkg.flowNodes) ? pkg.flowNodes : []
  const copyFingerprint = buildHostedFactFingerprint(album)
  const photoFingerprint = buildDeliveryPhotoFingerprint(flowNodes)
  const existing = await readHostPreviewCache(albumId)
  const row =
    existing ||
    (await backfillHostPreviewCache(albumId, {
      hostMeta: prev,
      storeId: album.storeId || storeId,
      merchantId: album.merchantId || merchantId,
      copyFingerprint,
      photoFingerprint,
    }))
  const view = readHostPreviewView(row, { copyFingerprint, photoFingerprint })
  return {
    albumId,
    hasCache: Boolean(row),
    cacheSource: existing ? 'preview_cache' : row ? 'host_meta' : 'none',
    copy: view.copy,
    edits: view.edits,
    effective: view.effective,
    deliveryPhotoRoles: view.deliveryPhotoRoles,
    photoJudged: view.photoJudged,
    copyFingerprint,
    photoFingerprint,
  }
}

/**
 * 人工覆盖稿落缓存：摘要 / 问答在失焦与离页时保存，下次进页优先回显这份。
 * 只写 edits 分区，模型文案层与打码结论都不动；未带分区的旧编辑保留，
 * 免得摘要失焦把「问答全删光」这个决定冲掉。
 */
async function saveHostPreviewEdit(albumId, { storeId, merchantId, summary, faq } = {}) {
  const { assertMerchantAlbum, loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)
  const hasSummary = summary != null
  const hasFaq = Array.isArray(faq)
  const row = await readHostPreviewCache(albumId)
  const prevEdits = row && row.editsJson && typeof row.editsJson === 'object' ? row.editsJson : null
  if (!hasSummary && !hasFaq) {
    return { albumId, saved: false, edits: prevEdits }
  }
  const edits = buildHostPreviewEdits({
    summary: hasSummary ? summary : prevEdits && prevEdits.summary,
    faq: hasFaq ? faq : prevEdits && prevEdits.faqEdited ? prevEdits.faq : undefined,
  })
  await patchHostPreviewCache(albumId, {
    storeId: album.storeId || storeId || '',
    merchantId: album.merchantId || merchantId || '',
    edits,
  })
  return { albumId, saved: Boolean(edits), edits }
}

/**
 * 改回仅私密：清空公开进度；若已上店页则先下线，档案仍托管。
 */
async function cancelPublicHostIntent(albumId, { storeId, merchantId } = {}) {
  const { assertMerchantAlbum, loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)
  const prev = readHostMeta(album)
  if (!prev.hosted) {
    const err = new Error('尚未托管')
    err.status = 409
    throw err
  }

  if (prev.visibility === 'public' || (album.publicCase && album.publicCase.id)) {
    try {
      await unpublishHostedCase(albumId, { storeId, merchantId })
    } catch (_) {
      /* 未公开也可清空意图 */
    }
  }

  const meta = await writeHostMeta(albumId, {
    hosted: true,
    visibility: 'private',
    publicPublishStage: '',
    privacyAuditPassedAt: null,
    privacyAgreementAcceptedAt: null,
    privacyAgreementVersion: '',
    geoDraft: null,
    geoLayer: null,
  })
  return { albumId, ...meta, message: '已改回仅私密托管', nextStep: 'done' }
}

function annotateMaskImageRow(url, outcomeIndex) {
  const { isDesensitizedMediaUrl } = require('../lib/media-url')
  const { classifyHostMaskOutcome, HOST_MASK_OUTCOME } = require('../utils/host-mask-outcome')
  const {
    lookupHostMaskOutcomeRow,
  } = require('./hosted-public-mask.service')
  const hit = lookupHostMaskOutcomeRow(outcomeIndex, url)
  let classified
  if (hit) {
    classified = classifyHostMaskOutcome(hit)
  } else if (isDesensitizedMediaUrl(url)) {
    classified = classifyHostMaskOutcome({
      maskedUrl: url,
      maskOutcome: 'ok_masked',
      riskTags: [],
    })
  } else {
    // 无落痕 → 未跑大模型（对账时重跑模型；展示允许原图）
    classified = classifyHostMaskOutcome({ maskOutcome: 'not_analyzed' })
  }
  const showingRaw = Boolean(url) && !isDesensitizedMediaUrl(url)
  if (showingRaw && !classified.maskSucceeded && !hit) {
    classified = classifyHostMaskOutcome({ maskOutcome: HOST_MASK_OUTCOME.NOT_ANALYZED })
  }
  return {
    url,
    outcome: classified.outcome,
    needsManual: Boolean(classified.needsManual),
    needsRemask: Boolean(classified.needsRemask),
    // masked=已成功处理；失败态仍 publishSafe，预览可出原图
    masked: Boolean(classified.maskSucceeded),
    // pending 只表示「从未跑过大模型」；已登记失败由本轮对账处理，不再触发第二轮
    pending:
      classified.outcome === HOST_MASK_OUTCOME.NOT_ANALYZED ||
      classified.outcome === HOST_MASK_OUTCOME.PENDING,
  }
}

function collectReviewMaskImages(docs, outcomeIndex) {
  const { stripUrlQuery } = require('../lib/media-signed-url')
  const rows = []
  const seen = new Set()
  const push = (raw) => {
    const url = String(typeof raw === 'object' && raw ? raw.url || raw.src || '' : raw || '').trim()
    if (!url) return
    const key = stripUrlQuery(url)
    if (!key || seen.has(key)) return
    seen.add(key)
    rows.push(annotateMaskImageRow(url, outcomeIndex))
  }
  ;(Array.isArray(docs) ? docs : []).forEach((doc) => {
    if (!doc || doc.locked) return
    ;(Array.isArray(doc.photos) ? doc.photos : []).forEach(push)
    ;(Array.isArray(doc.findings) ? doc.findings : []).forEach((row) => {
      push(row)
      ;(Array.isArray(row && row.images) ? row.images : []).forEach(push)
    })
    ;(Array.isArray(doc.lines) ? doc.lines : []).forEach((row) => {
      if (!row) return
      push(row.evidenceUrl)
      ;(Array.isArray(row.evidenceUrls) ? row.evidenceUrls : []).forEach(push)
    })
    ;(Array.isArray(doc.items) ? doc.items : []).forEach((row) => {
      ;(Array.isArray(row && row.images) ? row.images : []).forEach(push)
      if (row) push(row.evidenceUrl)
    })
    ;(Array.isArray(doc.acceptanceItems) ? doc.acceptanceItems : []).forEach((row) => {
      ;(Array.isArray(row && row.images) ? row.images : []).forEach(push)
    })
    ;(Array.isArray(doc.discoveryImages) ? doc.discoveryImages : []).forEach(push)
  })
  return rows
    .slice()
    .sort((a, b) => Number(Boolean(b.needsManual)) - Number(Boolean(a.needsManual)))
}

/** 从公开档案章节收集图，并按状态树标注是否需手工 */
function collectMaskImagesFromChapters(chapters, outcomeIndex) {
  const { stripUrlQuery } = require('../lib/media-signed-url')
  const rows = []
  const seen = new Set()
  const push = (raw) => {
    const url = String(typeof raw === 'object' && raw ? raw.url || raw.src || '' : raw || '').trim()
    if (!url) return
    const key = stripUrlQuery(url)
    if (!key || seen.has(key)) return
    seen.add(key)
    rows.push(annotateMaskImageRow(url, outcomeIndex))
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
    .slice()
    .sort((a, b) => Number(Boolean(b.needsManual)) - Number(Boolean(a.needsManual)))
}

/** 将公开的图文预览（供核对页展示；脱敏图优先） */
async function getHostPublicFacePreview(albumId, { storeId, merchantId, requireMasked = false } = {}) {
  const {
    assertMerchantAlbum,
    loadAlbum,
    buildMerchantView,
    mapNodesForView,
  } = require('./service-album.service')
  const { assessPublicCaseQuality } = require('./public-case-quality.service')
  const { assessHostPublicContent } = require('../utils/host-public-content-check')
  const { buildHostContentReviewDocs } = require('./service-flow.service')
  const { buildPublicServiceFlow } = require('../utils/public-service-flow')

  let album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)
  const prev = readHostMeta(album)
  const view = buildMerchantView(album)
  const quality = assessPublicCaseQuality(view)
  const hardBlocks = (quality.privacyBlocks || []).map((block) => ({
    kind: block.kind || 'privacy',
    issue: block.issue || block.field || 'privacy',
    message: block.message || '存在隐私风险，请处理后再公开',
  }))

  let outcomeIndex = new Map()
  let unanalyzedCount = 0
  try {
    const {
      loadHostMaskOutcomeIndex,
      countUnanalyzedNodeImages,
    } = require('./hosted-public-mask.service')
    outcomeIndex = await loadHostMaskOutcomeIndex(albumId)
    unanalyzedCount = await countUnanalyzedNodeImages(albumId, outcomeIndex)
  } catch (_) {
    /* 无节点结论也可预览原图（门店自认） */
  }

  // 公开托管预览：只认节点结论。有码用码；无须打码 / 失败态用原图（责任在商家）。
  const mustMask = Boolean(requireMasked)
  const { resolveHostDisplayUrl } = require('../utils/host-mask-outcome')
  const { lookupHostMaskOutcomeRow } = require('./hosted-public-mask.service')
  const resolveImageUrl = (rawInput) => {
    const raw = String(rawInput || '').trim()
    if (!raw) return ''
    if (!mustMask) return raw
    const nodeRow = lookupHostMaskOutcomeRow(outcomeIndex, raw) || {}
    return resolveHostDisplayUrl({ ...nodeRow, url: raw }, raw)
  }

  const albumNodes = mapNodesForView(album)
  // 质量检查仍用单据链；界面预览改为公开档案章节
  const reviewDocs = buildHostContentReviewDocs(album, albumNodes, { resolveImageUrl })
  // 打码清单要留得住「还没打上的原图」，否则公开预览藏原图后店员没法点图改码
  const resolveImageUrlForMaskList = (rawInput) => String(rawInput || '').trim()
  const reviewDocsForMaskList = mustMask
    ? buildHostContentReviewDocs(album, albumNodes, {
        resolveImageUrl: resolveImageUrlForMaskList,
      })
    : reviewDocs
  const pkg =
    album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  // 交车补传图归属：只认预览缓存；hostMeta 仅作冷启动来源，缓存不可用时不退化
  const hostMetaDeliveryRoles =
    (prev.geoLayer && Array.isArray(prev.geoLayer.deliveryPhotoRoles) && prev.geoLayer.deliveryPhotoRoles) ||
    (prev.geoDraft && Array.isArray(prev.geoDraft.deliveryPhotoRoles) && prev.geoDraft.deliveryPhotoRoles) ||
    []
  let cachedDeliveryPhotoRoles = hostMetaDeliveryRoles
  try {
    const photoFingerprint = buildDeliveryPhotoFingerprint(
      Array.isArray(pkg.flowNodes) ? pkg.flowNodes : [],
    )
    const cacheRow =
      (await readHostPreviewCache(albumId)) ||
      (await backfillHostPreviewCache(albumId, {
        hostMeta: prev,
        storeId: album.storeId || storeId,
        merchantId: album.merchantId || merchantId,
        photoFingerprint,
      }))
    if (cacheRow) {
      cachedDeliveryPhotoRoles = readHostPreviewView(cacheRow, { photoFingerprint })
        .deliveryPhotoRoles
    }
  } catch (_) {
    /* 读不到缓存仍按 hostMeta，公开预览不能因缓存缺一档就少并图 */
  }
  const serviceFlow = buildPublicServiceFlow({
    flowNodes: Array.isArray(pkg.flowNodes) ? pkg.flowNodes : [],
    album,
    contentNodes: view.nodes || [],
    // 公开托管：只读节点写回的打码图；有码用码，失败/无须打码允许原图
    requireDesensitized: false,
    allowPrivateFallback: true,
    // 交车节点补传图：只有托管生成时判为施工证据的才并进施工章
    deliveryPhotoRoles: cachedDeliveryPhotoRoles,
  })
  const maskImages = (() => {
    const fromList = collectReviewMaskImages(reviewDocsForMaskList, outcomeIndex)
    if (fromList.length) return fromList
    const fromChapters = collectMaskImagesFromChapters(serviceFlow.chapters, outcomeIndex)
    return fromChapters
  })()
  const needsManualCount = maskImages.filter((row) => row.needsManual).length
  const pendingMaskCount = maskImages.filter((row) => row.pending).length

  const texts = []
  const ruleGeo = buildRuleHostedGeoDraft(view, album)
  const geo = (ruleGeo.preview && ruleGeo.preview.geo) || {}
  ;[
    { label: '现象', value: geo.faultDesc },
    { label: '检测', value: geo.inspectResult },
    { label: '方案', value: geo.repairPlan },
    { label: '结果', value: geo.resultConfirm },
  ].forEach((row) => {
    const value = String(row.value || '').trim()
    if (value) texts.push(row)
  })

  const images = []
  ;(view.nodes || []).forEach((node) => {
    ;(node.images || []).forEach((img, idx) => {
      const raw = String(img.url || img.rawUrl || '').trim()
      if (!raw) return
      const display = resolveImageUrl(raw) || (mustMask ? '' : raw)
      if (!display) return
      const annotated = annotateMaskImageRow(display, outcomeIndex)
      images.push({
        nodeId: node.id,
        nodeTitle: node.title || '',
        idx,
        url: display,
        caption: String(img.caption || ''),
        masked: annotated.masked,
        outcome: annotated.outcome,
        needsManual: annotated.needsManual,
      })
    })
  })

  return {
    albumId,
    hosted: prev.hosted,
    publicPublishStage: prev.publicPublishStage,
    privacyPassed: Boolean(prev.privacyAuditPassedAt),
    serviceFlow,
    // 章节衔接语：已公开优先，其次预览草稿；已有衔接语时才为漏写章节补兜底
    chapterNarratives:
      (prev.geoLayer && prev.geoLayer.chapterNarratives && prev.geoLayer.chapterNarratives.length) ||
      (prev.geoDraft && prev.geoDraft.chapterNarratives && prev.geoDraft.chapterNarratives.length)
        ? mergeChapterNarratives(
            serviceFlow.chapters,
            (prev.geoLayer && prev.geoLayer.chapterNarratives) ||
              (prev.geoDraft && prev.geoDraft.chapterNarratives) ||
              [],
          )
        : [],
    reviewDocs,
    maskImages,
    /** 仅 call_failed / ok_detect_mask_failed；未检出隐私不算 */
    needsManualCount,
    pendingMaskCount,
    /** @deprecated 兼容旧前端：等同 needsManualCount */
    unmaskedCount: needsManualCount,
    texts,
    images: images.slice(0, 48),
    imageCount: images.length,
    hardBlocks,
    qualitySuggestions: assessHostPublicContent({
      album,
      view,
      reviewDocs,
      geoDraft: prev.geoDraft || {},
    }).suggestions,
    // 就绪 = 节点上没有「还没跑过大模型」的图；失败态不挡预览
    desensitizeReady: unanalyzedCount === 0,
  }
}

/**
 * 确保托管可编辑脱敏任务（支持一键 AI / 手工打码）。
 * force：只对账补漏进任务，禁止整本重打已成功图。
 */
async function ensureHostDesensitizeTask(albumId, { storeId, merchantId, force = false } = {}) {
  const { assertMerchantAlbum, loadAlbum } = require('./service-album.service')
  const { ensureHostMerchantMaskTask } = require('./desensitize.service')
  const { ROLES } = require('../lib/jwt')

  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)

  const data = await ensureHostMerchantMaskTask(albumId, {
    force: Boolean(force),
    auth: {
      roles: [ROLES.MERCHANT],
      merchantId,
    },
  })
  return {
    albumId,
    taskId: data.taskId,
    preMaskStatus: data.preMaskStatus || '',
    fromPreMask: true,
    assetCount: data.assetCount || 0,
  }
}

const HOST_PRIVACY_AGREEMENT_VERSION = 'host_privacy_v3'

/** 确认店页文案并公开（须隐私已过 + 门店同意隐私责任协议） */
async function confirmHostedPublicPublish(
  albumId,
  {
    storeId,
    merchantId,
    summary,
    highlights,
    nodeStories,
    chapterNarratives,
    faq,
    privacyAgreementAccepted,
    privacyAgreementVersion,
  } = {},
) {
  const { assertMerchantAlbum, loadAlbum, buildMerchantView } = require('./service-album.service')
  const { commitPublicCaseGoLive } = require('./public-case.service')
  const { PUBLIC_CASE_STATUS } = require('../constants/v2')
  const { prisma } = require('../lib/prisma')

  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)
  const prev = readHostMeta(album)
  if (!prev.hosted || !prev.privacyAuditPassedAt) {
    const err = new Error('请先完成托管与隐私校验')
    err.status = 409
    throw err
  }
  {
    const { assertPublicHostQuotaAvailable } = require('./merchant-plan-quota.service')
    await assertPublicHostQuotaAvailable(merchantId || album.merchantId, albumId)
  }
  if (!privacyAgreementAccepted) {
    const err = new Error('请先同意隐私责任协议')
    err.status = 400
    err.code = 'PRIVACY_AGREEMENT_REQUIRED'
    throw err
  }
  const agreementVersion = String(privacyAgreementVersion || HOST_PRIVACY_AGREEMENT_VERSION).trim()
  if (agreementVersion !== HOST_PRIVACY_AGREEMENT_VERSION) {
    const err = new Error('协议版本已更新，请重新确认')
    err.status = 400
    err.code = 'PRIVACY_AGREEMENT_VERSION'
    throw err
  }

  const draft = prev.geoDraft || {}
  const { filterPublishableFaq } = require('../utils/hosted-storefront-faq')
  const rawFaq = Array.isArray(faq) ? faq : Array.isArray(draft.faq) ? draft.faq : []
  const rawStories = Array.isArray(nodeStories)
    ? nodeStories
    : Array.isArray(draft.nodeStories)
      ? draft.nodeStories
      : []
  const rawNarratives = Array.isArray(chapterNarratives)
    ? chapterNarratives
    : Array.isArray(draft.chapterNarratives)
      ? draft.chapterNarratives
      : []
  const view = buildMerchantView(album)
  // 施工章取图与预览同口径：认预览缓存的归属判定，空数组也是判定结论
  let deliveryPhotoRoles = Array.isArray(draft.deliveryPhotoRoles)
    ? draft.deliveryPhotoRoles
    : (prev.geoLayer && Array.isArray(prev.geoLayer.deliveryPhotoRoles) && prev.geoLayer.deliveryPhotoRoles) || []
  try {
    const pkg =
      album.contentPackageJson && typeof album.contentPackageJson === 'object'
        ? album.contentPackageJson
        : {}
    const cacheRow = await readHostPreviewCache(albumId)
    if (cacheRow) {
      deliveryPhotoRoles = readHostPreviewView(cacheRow, {
        photoFingerprint: buildDeliveryPhotoFingerprint(
          Array.isArray(pkg.flowNodes) ? pkg.flowNodes : [],
        ),
      }).deliveryPhotoRoles
    }
  } catch (_) {
    /* 缓存不可用时退回草稿 / 已公开层 */
  }
  const chapters = buildHostedPublicChapters(album, view, deliveryPhotoRoles)
  const geoLayer = {
    summary: String(summary != null ? summary : draft.summary || '').trim(),
    highlights: Array.isArray(highlights)
      ? highlights
      : Array.isArray(draft.highlights)
        ? draft.highlights
        : [],
    nodeStories: sanitizeHostedNodeStories(rawStories),
    chapterNarratives: mergeChapterNarratives(chapters, rawNarratives),
    faq: filterPublishableFaq(rawFaq),
    // 交车节点补传图的模型判定：公开页据此把施工证据图并进施工章
    deliveryPhotoRoles,
    confirmedAt: new Date().toISOString(),
  }
  if (!geoLayer.summary) {
    const err = new Error('请填写摘要后再公开')
    err.status = 400
    throw err
  }
  // 商家确认公开的这一版就是人工稿真源：同步进缓存，预览不会再端出旧修订
  // 问答存确认前的原列表（含未答的问法），回来才和屏幕上一样
  await patchHostPreviewCache(albumId, {
    storeId: album.storeId || storeId || '',
    merchantId: album.merchantId || merchantId || '',
    edits: buildHostPreviewEdits({ summary: geoLayer.summary, faq: rawFaq }),
  })

  const overview = geoLayer.summary
  const faqList = geoLayer.faq
  const agreedAt = new Date().toISOString()
  await writeHostMeta(albumId, {
    hosted: true,
    visibility: 'public',
    geoLayer,
    overview,
    faq: faqList,
    publicPublishStage: 'published',
    privacyAgreementAcceptedAt: agreedAt,
    privacyAgreementVersion: agreementVersion,
  })

  let pc = album.publicCase
  const alreadyLive =
    Boolean(pc) &&
    pc.status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED &&
    !pc.storefrontHidden &&
    !pc.ownerBlockedAt
  if (!pc) {
    pc = await prisma.publicCase.create({
      data: {
        id: publicCaseIdForAlbum(albumId),
        albumId,
        storeId: album.storeId || '',
        storeName: album.storeName || '',
        serviceName: album.serviceName || '',
        city: album.city || '',
        title: hostPublicTitle(album, overview),
        summary: overview,
        status: PUBLIC_CASE_STATUS.AUDIT_PASSED,
        contentJson: {
          hostedArchive: true,
          hostGeoLayer: geoLayer,
          faq: geoLayer.faq,
        },
      },
    })
  } else if (!alreadyLive) {
    await prisma.publicCase.update({
      where: { id: pc.id },
      data: {
        title: hostPublicTitle(album, overview),
        summary: overview,
        status: PUBLIC_CASE_STATUS.AUDIT_PASSED,
        contentJson: {
          ...(pc.contentJson && typeof pc.contentJson === 'object' ? pc.contentJson : {}),
          hostedArchive: true,
          hostGeoLayer: geoLayer,
          faq: geoLayer.faq,
        },
        storefrontHidden: false,
      },
    })
  } else if (alreadyLive) {
    await prisma.publicCase.update({
      where: { id: pc.id },
      data: {
        title: hostPublicTitle(album, overview),
        summary: overview,
        contentJson: {
          ...(pc.contentJson && typeof pc.contentJson === 'object' ? pc.contentJson : {}),
          hostedArchive: true,
          hostGeoLayer: geoLayer,
          faq: geoLayer.faq,
        },
      },
    })
  }

  await prisma.album.update({
    where: { id: albumId },
    data: { publicCaseStatus: alreadyLive ? PUBLIC_CASE_STATUS.PUBLIC_APPROVED : PUBLIC_CASE_STATUS.AUDIT_PASSED },
  })

  let published
  if (alreadyLive) {
    published = {
      caseItem: { id: pc.id, albumId, status: pc.status },
      status: pc.status,
    }
  } else {
    published = await commitPublicCaseGoLive(albumId, {
      authorizationTier: 'merchant_published',
      hostedGeoPublish: true,
    })
  }

  await prisma.publicCase.update({
    where: { albumId },
    data: { articleStatus: CASE_ARTICLE_STATUS.PUBLISHED_H5 },
  })

  try {
    const { markAlbumPublicHostConsumed } = require('./merchant-plan-quota.service')
    await markAlbumPublicHostConsumed(albumId)
  } catch (e) {
    console.warn('[case-hosting] mark public host quota', e && e.message)
  }

  return {
    albumId,
    ...readHostMeta(await loadAlbum(albumId)),
    publicCase: published,
    message: '已上店页',
  }
}

async function unhostAlbum(albumId, { storeId, merchantId }) {
  const { assertMerchantAlbum, loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)

  if (album.publicCase && album.publicCase.id) {
    const { hideCaseFromStorefront } = require('./case-publish-window.service')
    try {
      await hideCaseFromStorefront(album.publicCase.id, { storeId, merchantId })
    } catch (_) {
      /* 未公开也可取消托管 */
    }
    await prisma.publicCase.update({
      where: { id: album.publicCase.id },
      data: { storefrontHidden: true, seoNoindex: true },
    })
  }

  const meta = await writeHostMeta(albumId, {
    hosted: false,
    visibility: 'private',
  })
  return { albumId, ...meta, message: '已取消托管；网站已下线，档案仍在小程序' }
}

async function unpublishHostedCase(albumId, { storeId, merchantId }) {
  const { assertMerchantAlbum, loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)
  if (album.publicCase && album.publicCase.id) {
    const { hideCaseFromStorefront } = require('./case-publish-window.service')
    await hideCaseFromStorefront(album.publicCase.id, { storeId, merchantId })
  }
  const meta = await writeHostMeta(albumId, {
    hosted: true,
    visibility: 'private',
    publicPublishStage: '',
    privacyAuditPassedAt: null,
    geoDraft: null,
    geoLayer: null,
  })
  return { albumId, ...meta, message: '已取消公开，仍作为私密档案托管' }
}

/**
 * 保存概况/FAQ 公开稿修订（不覆盖确认件）
 */
async function saveHostedPublicCopy(albumId, { storeId, merchantId, overview, faq }) {
  const { assertMerchantAlbum, loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)
  const prev = readHostMeta(album)
  const revision = {
    at: new Date().toISOString(),
    overview: String(overview != null ? overview : prev.overview || ''),
    faq: Array.isArray(faq) ? faq : prev.faq,
    kind: 'merchant_revision',
  }
  const revisions = [...(prev.revisions || []), revision].slice(-50)
  const meta = await writeHostMeta(albumId, {
    hosted: true,
    overview: revision.overview,
    faq: revision.faq,
    // 人工改过 FAQ：生效稿就是这一份，不再回退到机器草稿（对齐摘要的覆盖语义）
    faqOverridden: true,
    revisions,
  })
  // 概况 / 问法在公开后另有编辑入口：改完必须更新缓存人工层，否则再次预览端出旧稿
  await patchHostPreviewCache(albumId, {
    storeId: album.storeId || storeId || '',
    merchantId: album.merchantId || merchantId || '',
    edits: buildHostPreviewEdits({ summary: revision.overview, faq: revision.faq }),
  })

  if (album.publicCase) {
    const cj =
      album.publicCase.contentJson && typeof album.publicCase.contentJson === 'object'
        ? { ...album.publicCase.contentJson }
        : {}
    cj.hostPublicCopy = {
      overview: revision.overview,
      faq: revision.faq,
      updatedAt: revision.at,
    }
    await prisma.publicCase.update({
      where: { id: album.publicCase.id },
      data: {
        summary: revision.overview || album.publicCase.summary,
        contentJson: cj,
      },
    })
  }

  return { albumId, ...meta, message: '公开稿已更新（修订另存）' }
}

/**
 * 冻结车主确认件（不可静默覆盖）
 */
async function freezeConfirmedDoc(albumId, { storeId, merchantId, docType, payload }) {
  const { assertMerchantAlbum, loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)
  const prev = readHostMeta(album)
  const entry = {
    id: `conf_${Date.now()}`,
    docType: String(docType || 'report'),
    confirmedAt: new Date().toISOString(),
    payload: payload && typeof payload === 'object' ? payload : { text: String(payload || '') },
    immutable: true,
  }
  const confirmedDocs = [...(prev.confirmedDocs || []), entry]
  const meta = await writeHostMeta(albumId, { confirmedDocs })
  return { albumId, confirmedDoc: entry, ...meta }
}

async function listHostedCasesForStore(storeId) {
  const albums = await prisma.album.findMany({
    where: { storeId },
    include: { publicCase: true },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  })
  const { isStorePubliclyVisible } = require('./content.service')
  const storePublicReady = await isStorePubliclyVisible(storeId)
  return albums.map((album) => mapHostedCaseListItem(album, storePublicReady)).filter(Boolean)
}

function mapHostedCaseListItem(album, storePublicReady = true) {
  const meta = readHostMeta(album)
  const pc = album.publicCase
  const live = isPublicCaseH5Visible(pc)
  if (!meta.hosted && !live) return null
  const visibility = live || meta.visibility === 'public' ? 'public' : 'private'
  const caseId = pc && pc.id ? pc.id : ''
  const { isPublicCaseOnPublicWeb, merchantHostedTag } = require('../utils/public-case-visibility')
  const onPublicWeb = isPublicCaseOnPublicWeb(pc, storePublicReady)
  return {
    albumId: album.id,
    caseId,
    id: caseId,
    title: (pc && pc.title) || album.serviceName || '未命名案例',
    serviceName: album.serviceName || '',
    coverImage: (pc && pc.coverImage) || '',
    hosted: meta.hosted || live,
    visibility,
    onPublicWeb,
    hostedTag: merchantHostedTag({
      hosted: meta.hosted || live,
      visibility,
      onPublicWeb,
    }),
    overview: meta.overview || (pc && pc.summary) || '',
    updatedAt: meta.updatedAt || album.updatedAt,
    sourceLabel: '商家上传',
    publicPath:
      caseId && onPublicWeb
        ? resolveCaseCanonicalPath({ slug: pc && pc.slug, caseId })
        : '',
  }
}

/** 导出档案包（元数据 JSON；媒体 URL 清单） */
async function exportAlbumArchive(albumId, { storeId, merchantId }) {
  const { assertMerchantAlbum, loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)
  const meta = readHostMeta(album)
  const { collectPublicizableFlowPhotos } = require('../utils/flow-public-media')
  const images = collectPublicizableFlowPhotos(album).map((row, idx) => ({
    id: `flow_${row.nodeId}_${idx}`,
    url: row.url || '',
    desensitizedUrl: row.maskedUrl || '',
    nodeId: row.nodeId || '',
  }))
  return {
    exportedAt: new Date().toISOString(),
    albumId,
    serviceName: album.serviceName || '',
    hostMeta: meta,
    publicCase: album.publicCase
      ? {
          id: album.publicCase.id,
          title: album.publicCase.title,
          status: album.publicCase.status,
          summary: album.publicCase.summary,
        }
      : null,
    images,
    sourceLabel: '商家上传',
  }
}

/**
 * 硬删：二次确认后公域净空并删相册（审计日志先写入 content 操作痕迹）
 * confirmText 必须为 DELETE
 */
async function hardDeleteAlbum(albumId, { storeId, merchantId, confirmText }) {
  if (String(confirmText || '') !== 'DELETE') {
    const err = new Error('请传入 confirmText: DELETE 以确认硬删')
    err.status = 400
    err.code = 'HARD_DELETE_CONFIRM'
    throw err
  }
  const { assertMerchantAlbum, loadAlbum } = require('./service-album.service')
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  assertMerchantAlbum(album, storeId, merchantId)
  const flowNodes = album.contentPackageJson && Array.isArray(album.contentPackageJson.flowNodes)
    ? album.contentPackageJson.flowNodes
    : []
  const waitingDelivery = flowNodes.some((node) => {
    if (!node || node.kind !== 'repair_report') return false
    return String((node.document && node.document.status) || '') === 'pending_confirm'
  })
  if (waitingDelivery) {
    const err = new Error('等车主确认交车，不能删除')
    err.status = 409
    throw err
  }

  try {
    await unhostAlbum(albumId, { storeId, merchantId })
  } catch (_) {
    /* continue */
  }

  const audit = {
    action: 'hard_delete_album',
    albumId,
    storeId,
    merchantId,
    at: new Date().toISOString(),
    serviceName: album.serviceName || '',
  }
  // 轻量审计：写入独立表前先落 system 风格日志
  try {
    // eslint-disable-next-line no-console
    console.info('[HARD_DELETE_AUDIT]', JSON.stringify(audit))
  } catch (_) {
    /* ignore */
  }

  await prisma.album.delete({ where: { id: albumId } })
  return { deleted: true, audit }
}

module.exports = {
  HOST_PRIVACY_AGREEMENT_VERSION,
  readHostMeta,
  writeHostMeta,
  resolveStoreSnapshot,
  buildHostedArchiveSnapshot,
  hostAlbum,
  auditHostedPublicPrivacy,
  generateHostedGeoDraft,
  getHostPreviewCache,
  saveHostPreviewEdit,
  buildHostedFactFingerprint,
  confirmHostedPublicPublish,
  cancelPublicHostIntent,
  getHostPublicFacePreview,
  mergeChapterNarratives,
  ensureHostDesensitizeTask,
  unhostAlbum,
  unpublishHostedCase,
  saveHostedPublicCopy,
  freezeConfirmedDoc,
  listHostedCasesForStore,
  mapHostedCaseListItem,
  exportAlbumArchive,
  hardDeleteAlbum,
}
