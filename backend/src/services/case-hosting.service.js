/**
 * 案例托管状态（15_案例档案与托管状态机 · 二期）
 * hostMeta 落在 album.contentPackageJson.hostMeta
 */

const { prisma } = require('../lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')

function readHostMeta(album) {
  const pkg =
    album && album.contentPackageJson && typeof album.contentPackageJson === 'object'
      ? album.contentPackageJson
      : {}
  const meta = pkg.hostMeta && typeof pkg.hostMeta === 'object' ? pkg.hostMeta : {}
  const published =
    album &&
    album.publicCase &&
    album.publicCase.status === PUBLIC_CASE_STATUS.PUBLISHED &&
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
    geoDraft: meta.geoDraft || null,
    geoLayer: meta.geoLayer || null,
    revisions: Array.isArray(meta.revisions) ? meta.revisions : [],
    confirmedDocs: Array.isArray(meta.confirmedDocs) ? meta.confirmedDocs : [],
  }
}

/** 托管时冻结门店展示快照（主档在 store 表，此处只读副本） */
async function resolveStoreSnapshot(album = {}) {
  const base = {
    storeId: album.storeId || '',
    name: album.storeName || '',
    city: '',
    address: '',
    snapshotAt: new Date().toISOString(),
  }
  if (!album.storeId) return base
  try {
    const store = await prisma.store.findUnique({
      where: { id: album.storeId },
      select: { name: true, city: true, address: true },
    })
    if (store) {
      base.name = store.name || base.name
      base.city = store.city || ''
      base.address = store.address || ''
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
    if (!doc || doc.status !== 'confirmed' || !doc.payload) return
    confirmedDocs.push({
      nodeId: node.id,
      kind: node.kind,
      confirmedAt: doc.confirmedAt || '',
      confirmedBy: doc.confirmedBy || '',
      payload: doc.payload,
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
      photoDraft: n.photoDraft || null,
      document: n.document
        ? {
            status: n.document.status || '',
            confirmedAt: n.document.confirmedAt || '',
            payload: n.document.payload || null,
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
    ...meta,
    message: passed ? '隐私校验已通过' : hardBlocks[0]?.message || '隐私校验未通过',
  }
}

function buildRuleHostedGeoDraft(view, album) {
  const { buildAlbumGeoPreview } = require('./album-geo-preview.service')
  const { buildRuleMerchantCaseDraft } = require('./merchant-case-draft.service')
  const hasOwner =
    Boolean(String(album.userId || '').trim()) ||
    Boolean(String(album.userPhone || '').trim())
  const preview = buildAlbumGeoPreview(view, { coldStart: !hasOwner })
  const geo = preview.geo || {}
  const ruleDraft = buildRuleMerchantCaseDraft(view)
  return {
    geoDraft: {
      summary: String(preview.aiSummaryPreview || geo.faultDesc || '').trim(),
      highlights: Array.isArray(geo.keyInfo) ? geo.keyInfo : [],
      faq: Array.isArray(ruleDraft.faq) ? ruleDraft.faq : [],
      faultDesc: geo.faultDesc || '',
      inspectResult: geo.inspectResult || '',
      repairPlan: geo.repairPlan || '',
      resultConfirm: geo.resultConfirm || '',
      generatedAt: new Date().toISOString(),
      source: 'rule',
    },
    preview,
  }
}

function buildHostedStorefrontLlmInput(view, hostMeta, ruleGeo) {
  const snap =
    (hostMeta && hostMeta.archiveSnapshot && hostMeta.archiveSnapshot.storeSnapshot) || {}
  const geo = (ruleGeo && ruleGeo.preview && ruleGeo.preview.geo) || {}
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
    faqCandidates: (ruleGeo.geoDraft && ruleGeo.geoDraft.faq) || [],
  }
}

function normalizeHostedGeoDraftFromLlm(parsed, fallback) {
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
  const faqRaw = Array.isArray(parsed.faq) ? parsed.faq : base.faq || []
  const faq = faqRaw
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const q = String(row.q || row.question || '').trim()
      const a = String(row.a || row.answer || '').trim()
      if (!q || !a) return null
      return { q, a }
    })
    .filter(Boolean)
    .slice(0, 6)
  const summary = String(parsed.summary || base.summary || '').trim()
  return {
    ...base,
    summary,
    highlights,
    faq,
    generatedAt: new Date().toISOString(),
    source: summary ? 'llm_v0' : base.source || 'rule',
  }
}

async function tryGenerateHostedGeoDraftWithLlm(view, hostMeta, ruleGeo) {
  const fs = require('fs')
  const path = require('path')
  const { config } = require('../config')
  const { chatCompletion } = require('../lib/dashscope-chat')
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
  const userPayload = buildHostedStorefrontLlmInput(view, hostMeta, ruleGeo)
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
    return geoDraft
  } catch (e) {
    console.warn('[case-hosting] storefront LLM failed, fallback rule', e && e.message)
    return null
  }
}

/** 公开托管：基于可公开面生成店页文案草稿（须先过隐私；优先 LLM 并集 v0） */
async function generateHostedGeoDraft(albumId, { storeId, merchantId } = {}) {
  const { assertMerchantAlbum, loadAlbum, buildMerchantView } = require('./service-album.service')
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
  if (!prev.privacyAuditPassedAt) {
    const err = new Error('请先核对将公开的内容')
    err.status = 409
    err.code = 'PRIVACY_REQUIRED'
    throw err
  }

  const view = buildMerchantView(album)
  const ruleGeo = buildRuleHostedGeoDraft(view, album)
  const llmDraft = await tryGenerateHostedGeoDraftWithLlm(view, prev, ruleGeo)
  const geoDraft = llmDraft || ruleGeo.geoDraft

  const meta = await writeHostMeta(albumId, {
    geoDraft,
    publicPublishStage: 'awaiting_geo_confirm',
  })
  return {
    albumId,
    geoDraft,
    preview: ruleGeo.preview,
    ...meta,
    message: '店页说明已生成，请核对后公开',
  }
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
    geoDraft: null,
    geoLayer: null,
  })
  return { albumId, ...meta, message: '已改回仅私密托管', nextStep: 'done' }
}

/** 将公开的图文预览（供核对页展示；脱敏图优先） */
async function getHostPublicFacePreview(albumId, { storeId, merchantId } = {}) {
  const {
    assertMerchantAlbum,
    loadAlbum,
    buildMerchantView,
    mapNodesForView,
  } = require('./service-album.service')
  const { assessPublicCaseQuality } = require('./public-case-quality.service')
  const { buildPreMaskUrlLookup } = require('./desensitize.service')
  const { rewriteMediaUrlForCurrentBase } = require('../lib/media-storage')
  const { buildHostContentReviewDocs } = require('./service-flow.service')

  const album = await loadAlbum(albumId)
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

  let lookup = { byRawUrl: new Map(), byNodeIdx: new Map(), ready: false }
  try {
    lookup = await buildPreMaskUrlLookup(albumId)
  } catch (_) {
    /* 无预脱敏也可预览原图（门店自认） */
  }

  const resolveImageUrl = (rawInput) => {
    const raw = String(rawInput || '').trim()
    if (!raw) return ''
    if (lookup.byRawUrl) {
      const hit =
        lookup.byRawUrl.get(raw) ||
        lookup.byRawUrl.get(rewriteMediaUrlForCurrentBase(raw))
      if (hit) return hit
    }
    return raw
  }

  const albumNodes = mapNodesForView(album)
  const reviewDocs = buildHostContentReviewDocs(album, albumNodes, { resolveImageUrl })

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
      const display = resolveImageUrl(raw) || raw
      images.push({
        nodeId: node.id,
        nodeTitle: node.title || '',
        idx,
        url: display,
        caption: String(img.caption || ''),
        masked: display !== raw,
      })
    })
  })

  return {
    albumId,
    hosted: prev.hosted,
    publicPublishStage: prev.publicPublishStage,
    privacyPassed: Boolean(prev.privacyAuditPassedAt),
    reviewDocs,
    texts,
    images: images.slice(0, 48),
    imageCount: images.length,
    hardBlocks,
    desensitizeReady: Boolean(lookup.ready),
  }
}

/** 确保托管可编辑脱敏任务（支持一键 AI / 手工打码） */
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

/** 确认 GEO 并公开（须隐私已过） */
async function confirmHostedPublicPublish(
  albumId,
  { storeId, merchantId, summary, highlights, faq } = {},
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

  const draft = prev.geoDraft || {}
  const geoLayer = {
    summary: String(summary != null ? summary : draft.summary || '').trim(),
    highlights: Array.isArray(highlights)
      ? highlights
      : Array.isArray(draft.highlights)
        ? draft.highlights
        : [],
    faq: Array.isArray(faq) ? faq : Array.isArray(draft.faq) ? draft.faq : [],
    confirmedAt: new Date().toISOString(),
  }
  if (!geoLayer.summary) {
    const err = new Error('请填写摘要后再公开')
    err.status = 400
    throw err
  }

  const overview = geoLayer.summary
  const faqList = geoLayer.faq
  await writeHostMeta(albumId, {
    hosted: true,
    visibility: 'public',
    geoLayer,
    overview,
    faq: faqList,
    publicPublishStage: 'published',
  })

  let pc = album.publicCase
  if (!pc) {
    const { newId } = require('../lib/ids')
    pc = await prisma.publicCase.create({
      data: {
        id: newId('case'),
        albumId,
        storeId: album.storeId,
        merchantId: album.merchantId,
        title: album.serviceName || '维修案例',
        summary: overview,
        status: PUBLIC_CASE_STATUS.AUDIT_PASSED,
        contentJson: {
          hostedArchive: true,
          hostGeoLayer: geoLayer,
        },
      },
    })
  } else {
    await prisma.publicCase.update({
      where: { id: pc.id },
      data: {
        title: album.serviceName || pc.title,
        summary: overview,
        status: PUBLIC_CASE_STATUS.AUDIT_PASSED,
        contentJson: {
          ...(pc.contentJson && typeof pc.contentJson === 'object' ? pc.contentJson : {}),
          hostedArchive: true,
          hostGeoLayer: geoLayer,
        },
      },
    })
  }

  await prisma.album.update({
    where: { id: albumId },
    data: { publicCaseStatus: PUBLIC_CASE_STATUS.AUDIT_PASSED },
  })

  const published = await commitPublicCaseGoLive(albumId, {
    authorizationTier: 'merchant_published',
    hostedGeoPublish: true,
  })

  return {
    albumId,
    ...readHostMeta(await loadAlbum(albumId)),
    publicCase: published,
    message: '已确认 GEO 并公开',
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
  return { albumId, ...meta, message: '已取消托管；公域已下线，档案仍在小程序' }
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
    revisions,
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
  return albums
    .map((album) => {
      const meta = readHostMeta(album)
      if (!meta.hosted && !(album.publicCase && album.publicCase.status === PUBLIC_CASE_STATUS.PUBLISHED)) {
        return null
      }
      return {
        albumId: album.id,
        caseId: album.publicCase && album.publicCase.id,
        title:
          (album.publicCase && album.publicCase.title) ||
          album.serviceName ||
          '未命名案例',
        serviceName: album.serviceName || '',
        hosted: meta.hosted,
        visibility:
          album.publicCase &&
          album.publicCase.status === PUBLIC_CASE_STATUS.PUBLISHED &&
          !album.publicCase.storefrontHidden
            ? 'public'
            : 'private',
        overview: meta.overview || (album.publicCase && album.publicCase.summary) || '',
        updatedAt: meta.updatedAt || album.updatedAt,
        sourceLabel: '商家上传',
        publicPath:
          album.publicCase && album.publicCase.slug
            ? `/case/${album.publicCase.slug}.html`
            : album.publicCase
              ? `/case/?id=${album.publicCase.id}`
              : '',
      }
    })
    .filter(Boolean)
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
  const images = (album.images || []).map((img) => ({
    id: img.id,
    url: img.url || '',
    desensitizedUrl: img.desensitizedUrl || '',
    nodeId: img.nodeId || '',
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
  readHostMeta,
  writeHostMeta,
  resolveStoreSnapshot,
  buildHostedArchiveSnapshot,
  hostAlbum,
  auditHostedPublicPrivacy,
  generateHostedGeoDraft,
  confirmHostedPublicPublish,
  cancelPublicHostIntent,
  getHostPublicFacePreview,
  ensureHostDesensitizeTask,
  unhostAlbum,
  unpublishHostedCase,
  saveHostedPublicCopy,
  freezeConfirmedDoc,
  listHostedCasesForStore,
  exportAlbumArchive,
  hardDeleteAlbum,
}
