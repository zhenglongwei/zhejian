/**
 * USER-PUB-B-01/B-02 · 车主多平台社交媒体长文（规则回落 + GEO_LLM）
 */
const fs = require('fs')
const path = require('path')
const { config } = require('../config')
const { getUserServiceAlbum } = require('./service-album.service')
const { SERVICE_ALBUM_STATUS } = require('../constants/v2')
const { findGeoLlmViolation, sanitizeGeoLlmText } = require('../constants/geo-llm-compliance')
const {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LIST,
  normalizeSocialPlatform,
} = require('../constants/album-social-platforms')
const { chatCompletion } = require('../lib/dashscope-chat')

const PROMPT_PATH = path.join(__dirname, '../prompts/album-social-copy.md')

const AI_TASTE_MARKERS = [
  '值得一提的是',
  '在当今',
  '作为一名车主',
  '希望对大家有所帮助',
  '干货满满',
  '赋能',
  '沉浸式',
  '绝绝子',
  '家人们谁懂啊',
]

function getSocialLlmConfig() {
  const llm = config.geoLlm || {}
  const enabled = process.env.GEO_LLM_ENABLED === 'true' || llm.enabled === true
  const dryRun =
    process.env.GEO_LLM_DRY_RUN === 'true' || (!enabled && llm.dryRun !== false && !llm.enabled)
  return {
    enabled,
    dryRun,
    apiKey: String(process.env.GEO_LLM_API_KEY || llm.apiKey || process.env.DASHSCOPE_API_KEY || '').trim(),
    model: String(process.env.GEO_LLM_MODEL || llm.model || 'qwen3.6-plus').trim(),
    timeoutMs: Number(process.env.GEO_LLM_TIMEOUT_MS || llm.timeoutMs || 90000),
  }
}

function readSystemPrompt() {
  try {
    return fs.readFileSync(PROMPT_PATH, 'utf8')
  } catch {
    return '你是普通车主写手，只输出 JSON，禁止编造事实与营销话术。'
  }
}

function assertAlbumCompleted(albumView) {
  const status = albumView && albumView.status
  const ok =
    status === SERVICE_ALBUM_STATUS.COMPLETED ||
    status === SERVICE_ALBUM_STATUS.PUBLISHED ||
    status === 'published' ||
    status === 'completed'
  if (!ok) {
    const err = new Error('相册完工后才能生成分享文案')
    err.status = 409
    throw err
  }
}

function buildFacts(albumView = {}) {
  const vehicle = albumView.vehicle || {}
  const store = albumView.store || {}
  const nodes = (albumView.nodes || [])
    .map((n) => ({
      id: n.id || n.nodeId || '',
      title: String(n.title || '').trim(),
      note: String(n.note || '').trim().slice(0, 200),
    }))
    .filter((n) => n.title || n.note)

  return {
    serviceName: albumView.serviceName || '',
    storeName: store.name || albumView.storeName || '',
    city: store.city || store.cityName || albumView.cityName || '',
    vehicleLabel: albumView.vehicleDisplay || '',
    vehicle: {
      brand: vehicle.brand || '',
      series: vehicle.series || '',
      model: vehicle.model || '',
    },
    storeNote: String(albumView.storeNote || '').trim().slice(0, 300),
    planAmount: albumView.planAmount != null ? albumView.planAmount : null,
    nodes,
    publicCaseStatus: albumView.publicCaseStatus || 'private',
  }
}

function parseLlmJson(text) {
  const raw = String(text || '').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1))
      } catch {
        return {}
      }
    }
    return {}
  }
}

function scrubAiTaste(text) {
  let value = String(text || '')
  for (const marker of AI_TASTE_MARKERS) {
    value = value.split(marker).join('')
  }
  return value.replace(/\n{3,}/g, '\n\n').trim()
}

function composeCopy(title, body) {
  const t = String(title || '').trim()
  const b = String(body || '').trim()
  if (t && b) return `${t}\n\n${b}`
  return t || b
}

function buildRuleDraft(facts, platformId) {
  const meta = SOCIAL_PLATFORMS[platformId] || SOCIAL_PLATFORMS.xiaohongshu
  const serviceName = facts.serviceName || '这次维修'
  const storeBit = [facts.city, facts.storeName].filter(Boolean).join(' · ')
  const vehicle = facts.vehicleLabel || [facts.vehicle.brand, facts.vehicle.series].filter(Boolean).join(' ')
  const notes = (facts.nodes || [])
    .filter((n) => n.note)
    .slice(0, 4)
    .map((n) => (n.title ? `${n.title}：${n.note}` : n.note))

  if (platformId === 'zhihu') {
    const body = [
      `前阵子做了一次${serviceName}${vehicle ? `（${vehicle}）` : ''}，把过程记一下，给有类似情况的人当个参考。`,
      storeBit ? `门店在${storeBit}。` : '',
      notes.length ? `当时大致情况：\n${notes.map((x) => `- ${x}`).join('\n')}` : '具体细节不多，就不硬写了。',
      facts.planAmount != null
        ? `当时方案参考费用大概 ${facts.planAmount} 元，实际以到店确认为准。`
        : '',
      '我不是修车的，内容仅个人经历。过程在辙见服务相册里留了档。',
    ]
      .filter(Boolean)
      .join('\n\n')
    return {
      title: `一次${serviceName}的个人记录`,
      body,
      tips: '可直接贴到回答或文章',
    }
  }

  if (platformId === 'toutiao') {
    const title = `${storeBit ? `${storeBit}｜` : ''}${serviceName}过程笔记`
    const body = [
      vehicle ? `车：${vehicle}` : '',
      `项目：${serviceName}`,
      notes.length ? notes.join('\n') : '门店按流程做了检查和处理，我这边主要留了过程记录。',
      facts.planAmount != null ? `当时方案参考约 ${facts.planAmount} 元（到店为准）。` : '',
      '内容已脱敏。仅供参考。',
    ]
      .filter(Boolean)
      .join('\n')
    return { title, body, tips: '适合信息流长文' }
  }

  if (platformId === 'wechat_mp') {
    const body = [
      `${serviceName}做完了${vehicle ? `，车是${vehicle}` : ''}。`,
      storeBit ? `去的是${storeBit}。` : '',
      notes.length ? `过程里我记下了这些：\n\n${notes.join('\n\n')}` : '',
      facts.storeNote ? `门店说明：${facts.storeNote}` : '',
      '公开发出去的版本会脱敏。费用和方案仍以到店沟通为准。',
    ]
      .filter(Boolean)
      .join('\n\n')
    return {
      title: `${serviceName}｜车主过程记录`,
      body,
      tips: '可作公众号草稿正文',
    }
  }

  if (platformId === 'douyin') {
    const lines = [
      `${serviceName}做完，记两句。`,
      vehicle ? `车：${vehicle}` : '',
      storeBit ? `店：${storeBit}` : '',
      notes[0] || '过程在相册留了档。',
      notes[1] || '',
      '仅个人经历，方案费用到店确认。',
    ].filter(Boolean)
    return {
      title: '',
      body: lines.join('\n'),
      tips: '可当口播提纲',
    }
  }

  // xiaohongshu default
  const title = `${serviceName}${vehicle ? `｜${vehicle}` : ''}过程记录`
  const body = [
    storeBit ? `在${storeBit}做的${serviceName}。` : `刚做完${serviceName}。`,
    notes.length ? notes.slice(0, 3).join('\n') : '过程图和说明在相册里，这里就不展开了。',
    '公开内容会脱敏。我自己也是记个参考。',
  ]
    .filter(Boolean)
    .join('\n\n')
  return {
    title,
    body,
    tips: meta.label,
  }
}

async function buildLlmDraft(facts, platformId) {
  const cfg = getSocialLlmConfig()
  const meta = SOCIAL_PLATFORMS[platformId] || SOCIAL_PLATFORMS.xiaohongshu
  if (!cfg.enabled || cfg.dryRun || !cfg.apiKey) {
    return null
  }

  const userPayload = {
    platform: platformId,
    platformLabel: meta.label,
    styleBrief: meta.styleBrief,
    maxChars: meta.maxChars,
    facts,
    task: 'owner_social_copy',
  }

  const completion = await chatCompletion({
    apiKey: cfg.apiKey,
    model: cfg.model,
    timeoutMs: cfg.timeoutMs,
    temperature: 0.75,
    enableThinking: false,
    messages: [
      { role: 'system', content: readSystemPrompt() },
      {
        role: 'user',
        content: JSON.stringify(userPayload),
      },
    ],
  })

  const parsed = parseLlmJson(completion.text)
  let title = sanitizeGeoLlmText(parsed.title || '')
  let body = sanitizeGeoLlmText(parsed.body || parsed.content || '')
  let tips = sanitizeGeoLlmText(parsed.tips || '').slice(0, 40)

  if (!body && completion.text) {
    body = sanitizeGeoLlmText(completion.text).slice(0, meta.maxChars)
  }

  title = scrubAiTaste(title)
  body = scrubAiTaste(body)
  const joined = composeCopy(title, body)
  const violation = findGeoLlmViolation(joined)
  if (violation) {
    const err = new Error(`文案含违规表述：${violation}`)
    err.status = 422
    throw err
  }

  if (joined.length > meta.maxChars) {
    body = body.slice(0, Math.max(80, meta.maxChars - (title ? title.length + 2 : 0)))
  }

  if (!composeCopy(title, body)) return null

  return {
    title,
    body,
    tips: tips || `可粘贴到${meta.label}`,
  }
}

/**
 * @returns {Promise<{
 *   status: 'ready'|'generating',
 *   message?: string,
 *   platform: string,
 *   platformLabel: string,
 *   platforms: Array<{id:string,label:string}>,
 *   title: string,
 *   body: string,
 *   text: string,
 *   tips: string,
 *   source: 'llm'|'rule'|'rule_fallback'|'cache'|'legacy_rule',
 * }>}
 */
async function generateAlbumSocialCopy(albumId, userId, platformRaw) {
  const albumView = await getUserServiceAlbum(albumId, userId)
  assertAlbumCompleted(albumView)

  const platform = normalizeSocialPlatform(platformRaw)
  const meta = SOCIAL_PLATFORMS[platform]
  const {
    CONTENT_PACKAGE_STATUS,
    GENERATING_WAIT_MESSAGE,
  } = require('../constants/album-content-package')
  const {
    readPackageFromAlbum,
    isPackageReady,
    isPackageGenerating,
    isPackageSkipped,
  } = require('./album-content-package.service')
  const { prisma } = require('../lib/prisma')

  const row = await prisma.album.findUnique({
    where: { id: albumId },
    select: { contentPackageJson: true },
  })
  const pkg = readPackageFromAlbum(row)

  if (isPackageGenerating(pkg)) {
    return {
      status: CONTENT_PACKAGE_STATUS.GENERATING,
      message: GENERATING_WAIT_MESSAGE,
      platform,
      platformLabel: meta.label,
      platforms: SOCIAL_PLATFORM_LIST,
      title: '',
      body: '',
      text: '',
      tips: '',
      source: '',
    }
  }

  if (isPackageReady(pkg) && pkg.drafts[platform]) {
    const draft = pkg.drafts[platform]
    const text = composeCopy(draft.title, draft.body)
    return {
      status: CONTENT_PACKAGE_STATUS.READY,
      platform,
      platformLabel: meta.label,
      platforms: SOCIAL_PLATFORM_LIST,
      title: draft.title || '',
      body: draft.body || '',
      text,
      tips: draft.tips || '',
      source: pkg.source || 'cache',
    }
  }

  // 无内容包 / 留痕不齐跳过 LLM / 历史完工：规则稿（不触发 LLM）
  const facts = buildFacts(albumView)
  const draft = buildRuleDraft(facts, platform)
  const text = composeCopy(draft.title, draft.body)
  return {
    status: CONTENT_PACKAGE_STATUS.READY,
    platform,
    platformLabel: meta.label,
    platforms: SOCIAL_PLATFORM_LIST,
    title: draft.title || '',
    body: draft.body || '',
    text,
    tips: draft.tips || '',
    source: isPackageSkipped(pkg) ? 'skipped_incomplete' : 'legacy_rule',
  }
}

function listSocialPlatforms() {
  return SOCIAL_PLATFORM_LIST
}

module.exports = {
  generateAlbumSocialCopy,
  listSocialPlatforms,
  buildRuleDraft,
  buildFacts,
  normalizeSocialPlatform,
  composeCopy,
  buildLlmDraft,
}

