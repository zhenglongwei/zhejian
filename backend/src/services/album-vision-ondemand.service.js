/**
 * PUB-GEO · 相册按需识图（VIS-01/02/03）
 * M2：上传不调用；仅「AI 对照/解读」或后续「生成案例」入口调用。
 * 只送脱敏图出域；按图缓存，图指纹未变不重跑。
 */
const { createHash, randomUUID } = require('crypto')
const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const { chatCompletion } = require('../lib/dashscope-chat')
const { resolvePlanQuoteImageSources } = require('../lib/plan-quote-image-source')
const { stripUrlQuery } = require('../lib/media-signed-url')
const { rewriteMediaUrlForCurrentBase } = require('../lib/media-storage')
const { loadAlbum, buildAlbumView } = require('./service-album.service')
const { assertMerchantAlbum } = require('../lib/merchant-album-access')
const {
  buildPreMaskUrlLookup,
  getAlbumPreMaskReadiness,
  scheduleAlbumPreMask,
} = require('./desensitize.service')
const { ROLES } = require('../lib/jwt')
const {
  buildMerchantChecklistView,
  buildOwnerProjectClusters,
} = require('./album-checklist.service')
const {
  ALBUM_VISION_PROMPT_VERSION,
  ALBUM_VISION_AUDIENCE,
  IMAGE_DESCRIBE_SYSTEM,
  CARD_SYNTHESIS_SYSTEM,
  buildImageDescribeUserPrompt,
  buildCardSynthesisUserPrompt,
} = require('../constants/album-vision-prompts')

function getAlbumVisionConfig() {
  const album = config.albumVision || {}
  const geo = config.geoVision || {}
  return {
    enabled: Boolean(album.enabled),
    dryRun: Boolean(album.dryRun),
    apiUrl: String(
      album.apiUrl ||
        geo.apiUrl ||
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    ).trim(),
    apiKey: String(album.apiKey || geo.apiKey || process.env.DASHSCOPE_API_KEY || '').trim(),
    model: String(album.model || geo.model || 'qwen-vl-plus').trim(),
    timeoutMs: Number(album.timeoutMs || geo.timeoutMs || 90000),
    maxImages: Math.max(1, Number(album.maxImages || 8)),
    promptVersion: ALBUM_VISION_PROMPT_VERSION,
  }
}

function fingerprintVisionSource(maskedUrl = '', desensitizedKey = '') {
  const raw = `${String(desensitizedKey || '').trim()}|${stripUrlQuery(String(maskedUrl || '').trim())}`
  return createHash('sha256').update(raw).digest('hex').slice(0, 40)
}

function lookupMaskedUrl(rawUrl, lookup) {
  if (!lookup || !lookup.ready) return ''
  const url = String(rawUrl || '').trim()
  if (!url) return ''
  const variants = [
    url,
    stripUrlQuery(url),
    rewriteMediaUrlForCurrentBase(url),
    stripUrlQuery(rewriteMediaUrlForCurrentBase(url)),
  ]
  for (const key of variants) {
    if (key && lookup.byRawUrl && lookup.byRawUrl.has(key)) {
      return lookup.byRawUrl.get(key)
    }
  }
  return ''
}

async function assertUserAlbumAccess(albumId, userId) {
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在或已被删除')
    err.status = 404
    throw err
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const phone = user?.phone || ''
  const allowed = album.userId === userId || (phone && album.userPhone === phone)
  if (!allowed) {
    const err = new Error('仅关联车主可查看，请确认登录手机号与门店登记一致')
    err.status = 403
    throw err
  }
  return album
}

function resolveCardMembers(album, cardKey = '', itemKeys = []) {
  const merchant = buildMerchantChecklistView(album, album.images || [])
  const items = Array.isArray(merchant.items) ? merchant.items : []
  const byKey = new Map(items.map((it) => [String(it.itemKey || ''), it]))
  const explicit = (itemKeys || []).map(String).filter(Boolean)
  if (explicit.length) {
    return explicit.map((k) => byKey.get(k)).filter(Boolean)
  }
  const key = String(cardKey || '').trim()
  if (!key) return []
  const clusters = buildOwnerProjectClusters(items)
  const hit = clusters.find((c) => String(c.rootKey) === key)
  if (hit && Array.isArray(hit.members)) return hit.members
  const single = byKey.get(key)
  return single ? [single] : []
}

function collectMemberImageRows(album, members = []) {
  const images = Array.isArray(album.images) ? album.images : []
  const memberKeys = new Set(members.map((m) => String(m.itemKey || '')).filter(Boolean))
  const rows = images.filter((img) => memberKeys.has(String(img.checklistItemKey || '')))
  const byId = new Map(images.map((img) => [String(img.id), img]))
  const seen = new Set(rows.map((r) => String(r.id)))
  members.forEach((m) => {
    const refs = Array.isArray(m.images) ? m.images : Array.isArray(m.imageIds) ? m.imageIds : []
    refs.forEach((ref) => {
      const id = typeof ref === 'string' ? ref : ref && ref.id
      if (!id || seen.has(String(id))) return
      const row = byId.get(String(id))
      if (row) {
        rows.push(row)
        seen.add(String(id))
      }
    })
  })
  return rows
}

function extractJsonObject(text = '') {
  const raw = String(text || '').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (_) {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1))
      } catch (e) {
        return null
      }
    }
  }
  return null
}

async function describeOneImage({ imageRow, maskedUrl, itemLabel, stageTitle, forceRefresh }) {
  const vision = getAlbumVisionConfig()
  const fingerprint = fingerprintVisionSource(maskedUrl, '')
  const promptVersion = vision.promptVersion

  if (!forceRefresh) {
    const cached = await prisma.albumImageVisionCache.findUnique({
      where: {
        albumImageId_promptVersion: {
          albumImageId: imageRow.id,
          promptVersion,
        },
      },
    })
    if (cached && cached.contentFingerprint === fingerprint) {
      await prisma.albumImageVisionCache.update({
        where: { id: cached.id },
        data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
      })
      return {
        imageId: imageRow.id,
        cacheHit: true,
        fingerprint,
        description: String((cached.resultJson && cached.resultJson.description) || ''),
        model: cached.model || vision.model,
      }
    }
  }

  if (!vision.enabled || vision.dryRun || !vision.apiKey) {
    return {
      imageId: imageRow.id,
      cacheHit: false,
      fingerprint,
      description: '',
      skipped: true,
      skipReason: vision.dryRun ? 'dry_run' : 'vision_disabled',
    }
  }

  let visionUrl = ''
  try {
    const resolved = await resolvePlanQuoteImageSources(maskedUrl)
    visionUrl = resolved.visionUrl
  } catch (e) {
    return {
      imageId: imageRow.id,
      cacheHit: false,
      fingerprint,
      description: '',
      error: (e && e.message) || 'image_resolve_failed',
    }
  }

  const userPrompt = buildImageDescribeUserPrompt({
    itemLabel,
    stageTitle,
    merchantCaption: String(imageRow.caption || '').trim(),
  })

  try {
    const result = await chatCompletion({
      apiUrl: vision.apiUrl,
      apiKey: vision.apiKey,
      model: vision.model,
      temperature: 0.2,
      timeoutMs: vision.timeoutMs,
      messages: [
        { role: 'system', content: IMAGE_DESCRIBE_SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: visionUrl } },
            { type: 'text', text: userPrompt },
          ],
        },
      ],
    })
    const description = String(result.text || '').trim().slice(0, 400)
    const payload = {
      description,
      describedAt: new Date().toISOString(),
    }
    await prisma.albumImageVisionCache.upsert({
      where: {
        albumImageId_promptVersion: {
          albumImageId: imageRow.id,
          promptVersion,
        },
      },
      create: {
        id: randomUUID(),
        albumImageId: imageRow.id,
        albumId: imageRow.albumId,
        contentFingerprint: fingerprint,
        promptVersion,
        model: vision.model,
        resultJson: payload,
        hitCount: 0,
        lastHitAt: new Date(),
      },
      update: {
        contentFingerprint: fingerprint,
        model: vision.model,
        resultJson: payload,
        lastHitAt: new Date(),
      },
    })
    return {
      imageId: imageRow.id,
      cacheHit: false,
      fingerprint,
      description,
      model: vision.model,
    }
  } catch (e) {
    return {
      imageId: imageRow.id,
      cacheHit: false,
      fingerprint,
      description: '',
      error: (e && e.message) || 'vision_failed',
    }
  }
}

async function synthesizeCard({
  audience,
  cardTitle,
  merchantOutcome,
  merchantNote,
  imageNotes,
}) {
  const vision = getAlbumVisionConfig()
  if (!vision.enabled || vision.dryRun || !vision.apiKey) {
    return {
      skipped: true,
      summaryForDisplay: imageNotes.filter(Boolean).join('\n') || '识图未启用，暂无综合解读。',
      imageMeaning: '',
      commonOptions: [],
      merchantPlanAssessment: '',
      aligned: null,
      evidenceGaps: [],
    }
  }

  const userPrompt = buildCardSynthesisUserPrompt({
    audience,
    cardTitle,
    merchantOutcome,
    merchantNote,
    imageNotes,
  })

  try {
    const result = await chatCompletion({
      apiUrl: vision.apiUrl,
      apiKey: vision.apiKey,
      model: vision.model,
      temperature: 0.2,
      timeoutMs: vision.timeoutMs,
      responseFormat: { type: 'json_object' },
      messages: [
        { role: 'system', content: CARD_SYNTHESIS_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
    })
    const parsed = extractJsonObject(result.text) || {}
    return {
      skipped: false,
      summaryForDisplay: String(parsed.summaryForDisplay || result.text || '').trim(),
      imageMeaning: String(parsed.imageMeaning || '').trim(),
      commonOptions: Array.isArray(parsed.commonOptions)
        ? parsed.commonOptions.map((x) => String(x || '').trim()).filter(Boolean)
        : [],
      merchantPlanAssessment: String(parsed.merchantPlanAssessment || '').trim(),
      aligned: typeof parsed.aligned === 'boolean' ? parsed.aligned : null,
      evidenceGaps: Array.isArray(parsed.evidenceGaps)
        ? parsed.evidenceGaps.map((x) => String(x || '').trim()).filter(Boolean)
        : [],
      model: vision.model,
    }
  } catch (e) {
    return {
      skipped: false,
      error: (e && e.message) || 'synthesis_failed',
      summaryForDisplay: imageNotes.filter(Boolean).join('\n'),
      imageMeaning: '',
      commonOptions: [],
      merchantPlanAssessment: '',
      aligned: null,
      evidenceGaps: [],
    }
  }
}

/**
 * 主题卡按需解读 / 对照
 * @param {{ albumId: string, audience: 'merchant'|'owner', cardKey?: string, itemKeys?: string[], forceRefresh?: boolean, storeId?: string, merchantId?: string, userId?: string }} input
 */
async function interpretAlbumThemeCard(input = {}) {
  const audience =
    input.audience === ALBUM_VISION_AUDIENCE.MERCHANT
      ? ALBUM_VISION_AUDIENCE.MERCHANT
      : ALBUM_VISION_AUDIENCE.OWNER
  const albumId = String(input.albumId || '').trim()
  if (!albumId) {
    const err = new Error('缺少相册')
    err.status = 400
    throw err
  }

  let album
  if (audience === ALBUM_VISION_AUDIENCE.MERCHANT) {
    album = await loadAlbum(albumId)
    if (!album) {
      const err = new Error('相册不存在或已被删除')
      err.status = 404
      throw err
    }
    assertMerchantAlbum(album, input.storeId, input.merchantId)
  } else {
    album = await assertUserAlbumAccess(albumId, input.userId)
  }

  const members = resolveCardMembers(album, input.cardKey, input.itemKeys)
  if (!members.length) {
    const err = new Error('未找到主题卡或检查项，请确认 cardKey / itemKeys')
    err.status = 400
    throw err
  }

  const readiness = await getAlbumPreMaskReadiness(albumId)
  if (readiness.state !== 'ready') {
    scheduleAlbumPreMask(albumId, {
      force: Boolean(readiness.needsForceRefresh),
      auth: { roles: [ROLES.SYSTEM] },
    })
    return {
      status: 'pre_mask_pending',
      message: '脱敏图尚未就绪，已开始准备。请稍后再点「AI 对照/解读」。',
      audience,
      cardKey: String(input.cardKey || members[0].itemKey || ''),
      preMask: readiness,
    }
  }

  const lookup = await buildPreMaskUrlLookup(albumId)
  if (!lookup.ready) {
    return {
      status: 'pre_mask_pending',
      message: '脱敏图尚未就绪，请稍后再试。',
      audience,
      cardKey: String(input.cardKey || members[0].itemKey || ''),
    }
  }

  const imageRows = collectMemberImageRows(album, members)
  const vision = getAlbumVisionConfig()
  const limited = imageRows.slice(0, vision.maxImages)
  const view = buildAlbumView(album)
  const nodeTitleById = new Map(
    ((view && view.nodes) || []).map((n) => [String(n.id || n.nodeId), String(n.title || '')]),
  )

  const perImage = []
  for (const row of limited) {
    const maskedUrl = lookupMaskedUrl(row.rawUrl, lookup)
    if (!maskedUrl) {
      perImage.push({
        imageId: row.id,
        cacheHit: false,
        description: '',
        skipped: true,
        skipReason: 'no_desensitized_url',
      })
      continue
    }
    const member =
      members.find((m) => String(m.itemKey) === String(row.checklistItemKey || '')) || members[0]
    const described = await describeOneImage({
      imageRow: row,
      maskedUrl,
      itemLabel: String((member && (member.label || member.itemKey)) || ''),
      stageTitle: nodeTitleById.get(String(row.nodeId || '')) || '',
      forceRefresh: Boolean(input.forceRefresh),
    })
    perImage.push(described)
  }

  const imageNotes = perImage
    .map((p) => p.description)
    .filter((t) => String(t || '').trim())
  const outcomeParts = members
    .map((m) => {
      const label = m.label || m.itemKey
      const outcome = m.outcomeLabel || m.outcome || ''
      return outcome ? `${label}：${outcome}` : ''
    })
    .filter(Boolean)
  const noteParts = members.map((m) => String(m.note || '').trim()).filter(Boolean)
  const cardTitle =
    members.length === 1
      ? String(members[0].label || members[0].itemKey)
      : members.map((m) => m.label || m.itemKey).join('、')

  const synthesis = await synthesizeCard({
    audience,
    cardTitle,
    merchantOutcome: outcomeParts.join('；'),
    merchantNote: noteParts.join('；'),
    imageNotes,
  })

  const cacheHits = perImage.filter((p) => p.cacheHit).length
  const describedCount = perImage.filter((p) => p.description).length

  try {
    const { emitCaseGeoObs } = require('../utils/case-geo-obs')
    emitCaseGeoObs('vision.interpret', {
      albumId,
      audience,
      cardKey: String(input.cardKey || members[0].itemKey || ''),
      imageCount: limited.length,
      describedCount,
      cacheHits,
      cacheMisses: Math.max(0, describedCount - cacheHits),
    })
  } catch (_) {
    /* ignore */
  }

  return {
    status: 'ok',
    audience,
    cardKey: String(input.cardKey || members[0].itemKey || ''),
    cardTitle,
    promptVersion: vision.promptVersion,
    entryLabel: audience === ALBUM_VISION_AUDIENCE.MERCHANT ? 'AI 对照' : 'AI 解读',
    images: perImage,
    stats: {
      imageCount: limited.length,
      describedCount,
      cacheHits,
      cacheMisses: Math.max(0, describedCount - cacheHits),
    },
    result: synthesis,
  }
}

/**
 * 供生成案例复用：确保若干图片已有识图缓存（只处理缺缓存的）
 */
async function ensureAlbumImageVisionCache(albumId, imageIds = [], options = {}) {
  const album = await loadAlbum(albumId)
  if (!album) {
    const err = new Error('相册不存在')
    err.status = 404
    throw err
  }
  const readiness = await getAlbumPreMaskReadiness(albumId)
  if (readiness.state !== 'ready') {
    scheduleAlbumPreMask(albumId, {
      force: Boolean(readiness.needsForceRefresh),
      auth: { roles: [ROLES.SYSTEM] },
    })
    return { status: 'pre_mask_pending', results: [] }
  }
  const lookup = await buildPreMaskUrlLookup(albumId)
  const idSet = new Set((imageIds || []).map(String).filter(Boolean))
  const rows = (album.images || []).filter((img) => !idSet.size || idSet.has(String(img.id)))
  const vision = getAlbumVisionConfig()
  const limited = rows.slice(0, vision.maxImages)
  const results = []
  for (const row of limited) {
    const maskedUrl = lookupMaskedUrl(row.rawUrl, lookup)
    if (!maskedUrl) {
      results.push({ imageId: row.id, skipped: true, skipReason: 'no_desensitized_url' })
      continue
    }
    results.push(
      await describeOneImage({
        imageRow: row,
        maskedUrl,
        itemLabel: String(row.checklistItemKey || ''),
        stageTitle: '',
        forceRefresh: Boolean(options.forceRefresh),
      }),
    )
  }
  try {
    const { emitCaseGeoObs } = require('../utils/case-geo-obs')
    const hits = results.filter((r) => r && r.cacheHit).length
    emitCaseGeoObs('vision.ensure_cache', {
      albumId,
      imageCount: limited.length,
      cacheHits: hits,
      described: results.filter((r) => r && r.description).length,
    })
  } catch (_) {
    /* ignore */
  }
  return { status: 'ok', results }
}

module.exports = {
  getAlbumVisionConfig,
  fingerprintVisionSource,
  interpretAlbumThemeCard,
  ensureAlbumImageVisionCache,
  ALBUM_VISION_PROMPT_VERSION,
  ALBUM_VISION_AUDIENCE,
}
