/**
 * 阿里云 OSS 客户端（B-MEDIA-01）
 * 凭证复用 aliyun-clients.getCredential（AccessKey 或 ECS RAM 角色）
 */
const crypto = require('crypto')
const { config } = require('../config')
const { getCredential } = require('./aliyun-clients')

let ossClientPromise = null
let cachedCredMeta = {
  accessKeyId: '',
  accessKeySecret: '',
  securityToken: '',
  fetchedAt: 0,
  expiryMs: 0,
}

/** 凭证缓存最长时间：即使未读到过期时间，也最多用这么久 */
const CRED_MAX_AGE_MS = 5 * 60 * 1000
/** 凭证剩余有效期不足此值时提前刷新，避免签发瞬间过期的签名 URL */
const CRED_REFRESH_MARGIN_MS = 5 * 60 * 1000
/** 签名 URL 到期时间至少比凭证到期早这么多秒 */
const URL_EXPIRY_MARGIN_SEC = 60
/** 签名 URL 有效期下限，避免算出 0 或负数 */
const URL_EXPIRY_MIN_SEC = 60

function isOssEnabled() {
  return Boolean(config.media && config.media.oss && config.media.oss.enabled)
}

function ossConfig() {
  return (config.media && config.media.oss) || {}
}

function publicHost() {
  const cfg = ossConfig()
  const bucket = cfg.bucket || 'zhejianoss'
  const endpoint = String(cfg.endpoint || 'oss-cn-hangzhou.aliyuncs.com').replace(/^https?:\/\//, '')
  return `https://${bucket}.${endpoint}`
}

function preferInternal() {
  const cfg = ossConfig()
  if (typeof cfg.useInternalEndpoint === 'boolean') return cfg.useInternalEndpoint
  return (config.nodeEnv || 'development') === 'production'
}

function activeEndpointHost() {
  const cfg = ossConfig()
  const host = preferInternal()
    ? String(cfg.internalEndpoint || cfg.endpoint || '').replace(/^https?:\/\//, '')
    : String(cfg.endpoint || '').replace(/^https?:\/\//, '')
  return host || 'oss-cn-hangzhou.aliyuncs.com'
}

function withTimeout(promise, ms, label) {
  const timeoutMs = Number(ms) || 30000
  let timer
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label || 'OSS'} 超时（${timeoutMs}ms）。可尝试 OSS_USE_INTERNAL_ENDPOINT=false`)
      err.code = 'OSS_TIMEOUT'
      reject(err)
    }, timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer))
}

/**
 * 解析凭证里的过期时间（STS 临时凭证必带，长期 AK 没有）
 * 兼容 expiration / expireTime / Expiration 等字段，以及秒级时间戳与 ISO 字符串
 */
function parseCredExpiryMs(raw) {
  const value =
    raw && (raw.expiration || raw.expireTime || raw.Expiration || raw.expirationTime)
  if (!value) return 0
  if (typeof value === 'number') {
    return value > 1e12 ? value : value * 1000
  }
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : 0
}

/** 凭证剩余有效毫秒数；读不到过期时间时返回 0（表示「未知」） */
function credRemainMs(creds) {
  const expiryMs = Number(creds && creds.expiryMs) || 0
  if (!expiryMs) return 0
  return expiryMs - Date.now()
}

function isCachedCredUsable(now, creds = cachedCredMeta) {
  if (!creds || !creds.accessKeyId || !creds.accessKeySecret) return false
  if (now - (Number(creds.fetchedAt) || 0) > CRED_MAX_AGE_MS) return false
  const remain = credRemainMs(creds)
  // remain === 0 表示长期凭证（无过期时间），只受 CRED_MAX_AGE_MS 约束
  return remain === 0 || remain > CRED_REFRESH_MARGIN_MS
}

async function resolveAliyunCreds(opts = {}) {
  const now = Date.now()
  if (!opts.force && isCachedCredUsable(now)) {
    return cachedCredMeta
  }
  const cred = getCredential()
  const raw = await withTimeout(cred.getCredential(), 15000, '获取阿里云凭证')
  const expiryMs = parseCredExpiryMs(raw)
  const next = {
    accessKeyId: raw.accessKeyId || '',
    accessKeySecret: raw.accessKeySecret || '',
    securityToken: raw.securityToken || '',
    fetchedAt: now,
    expiryMs,
  }
  if (!next.accessKeyId || !next.accessKeySecret) {
    const err = new Error('阿里云凭证不可用，无法访问 OSS')
    err.status = 503
    throw err
  }
  // STS 凭证一过期，OSS 会直接报 InvalidAccessKeyId；宁可多换一次也不要用到过期的
  if (expiryMs && expiryMs - now <= CRED_REFRESH_MARGIN_MS) {
    console.warn(
      '[oss] 取到的凭证临近过期',
      `remainMs=${expiryMs - now}`,
      `akHint=${String(next.accessKeyId).slice(0, 8)}`,
    )
  }
  cachedCredMeta = next
  return cachedCredMeta
}

/** 只丢弃 OSS 客户端，保留已解析好的凭证缓存 */
function dropOssClient() {
  ossClientPromise = null
}

function buildOssOptions(creds, endpointHost) {
  const cfg = ossConfig()
  const hasSts = Boolean(creds.securityToken)
  const options = {
    accessKeyId: creds.accessKeyId,
    accessKeySecret: creds.accessKeySecret,
    stsToken: hasSts ? creds.securityToken : undefined,
    bucket: cfg.bucket,
    region: `oss-${cfg.region || 'cn-hangzhou'}`,
    endpoint: endpointHost ? `https://${endpointHost}` : undefined,
    secure: true,
    timeout: Number(process.env.OSS_REQUEST_TIMEOUT_MS || 30000),
  }
  if (hasSts) {
    options.refreshSTSTokenInterval = 10 * 60 * 1000
    options.refreshSTSToken = async () => {
      resetOssClient()
      const next = await resolveAliyunCreds()
      return {
        accessKeyId: next.accessKeyId,
        accessKeySecret: next.accessKeySecret,
        stsToken: next.securityToken,
      }
    }
  }
  return options
}

async function createOssClient() {
  if (!isOssEnabled()) {
    const err = new Error('OSS 未开启（OSS_ENABLED）')
    err.status = 503
    throw err
  }
  if (!ossClientPromise) {
    ossClientPromise = (async () => {
      // eslint-disable-next-line global-require, import/no-extraneous-dependencies
      const OSS = require('ali-oss')
      const creds = await resolveAliyunCreds()
      const endpointHost = activeEndpointHost()
      return new OSS(buildOssOptions(creds, endpointHost))
    })().catch((e) => {
      ossClientPromise = null
      throw e
    })
  }
  return ossClientPromise
}

/**
 * 取 OSS 客户端。凭证轮换后（AccessKeyId 变了）必须重建客户端，
 * 否则会继续用旧 stsToken 签发 URL —— 那种 URL 一跳到 OSS 就是 403
 */
async function getOssClient() {
  let client = await createOssClient()
  const creds = await resolveAliyunCreds()
  const clientAk = client && client.options && client.options.accessKeyId
  if (creds.accessKeyId && clientAk && clientAk !== creds.accessKeyId) {
    dropOssClient()
    client = await createOssClient()
  }
  return client
}

/** 凭证轮换后丢弃缓存客户端 */
function resetOssClient() {
  ossClientPromise = null
  cachedCredMeta = { accessKeyId: '', accessKeySecret: '', securityToken: '', fetchedAt: 0 }
}

async function headObject(objectKey) {
  const client = await getOssClient()
  return withTimeout(client.head(objectKey), client.options.timeout || 30000, `Head ${objectKey}`)
}

async function getObjectBuffer(objectKey) {
  const client = await getOssClient()
  const result = await withTimeout(
    client.get(objectKey),
    client.options.timeout || 30000,
    `Get ${objectKey}`,
  )
  if (Buffer.isBuffer(result.content)) return result.content
  return Buffer.from(result.content)
}

async function putObject(objectKey, body, options = {}) {
  const client = await getOssClient()
  const headers = {}
  if (options.contentType) headers['Content-Type'] = options.contentType
  return withTimeout(
    client.put(objectKey, body, { headers }),
    client.options.timeout || 30000,
    `Put ${objectKey}`,
  )
}

/** 连通性探测：列前缀（空前缀也行），用于迁移脚本启动自检 */
async function probeOssConnectivity() {
  const creds = await resolveAliyunCreds()
  const client = await getOssClient()
  const endpointHost = activeEndpointHost()
  const ak = creds.accessKeyId || ''
  const akHint = ak.length > 8 ? `${ak.slice(0, 4)}…${ak.slice(-4)}` : '(empty)'
  const credSource =
    process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || process.env.ALIYUN_ACCESS_KEY_ID
      ? 'env_access_key'
      : 'ecs_ram_role'
  try {
    await withTimeout(
      client.list({ 'max-keys': 1, prefix: 'uploads/' }),
      20000,
      `List uploads/ via ${endpointHost}`,
    )
  } catch (e) {
    const msg = String((e && e.message) || e)
    e.message = `${msg} | bucket=${client.options.bucket} endpoint=${endpointHost} cred=${credSource} ak=${akHint} sts=${Boolean(creds.securityToken)}`
    throw e
  }
  return {
    bucket: client.options.bucket,
    endpoint: endpointHost,
    internal: preferInternal(),
    credSource,
    accessKeyHint: akHint,
    hasStsToken: Boolean(creds.securityToken),
  }
}

async function objectExists(objectKey) {
  try {
    await headObject(objectKey)
    return true
  } catch (e) {
    const status = e && (e.status || e.statusCode)
    if (status === 404) return false
    throw e
  }
}

/**
 * 外网可读的签名 URL（小程序 / H5 / 浏览器）
 * @param {string} objectKey
 * @param {{ expires?: number }} [opts]
 */
/**
 * 签名 URL 的有效期不能超过凭证剩余有效期。
 * STS 临时凭证一旦过期，即便 URL 上的 Expires 还没到，OSS 也会返回 403（InvalidAccessKeyId）
 */
function clampUrlExpiresSec(wanted, creds) {
  const desired = Number(wanted) > 0 ? Number(wanted) : 7200
  const remainMs = credRemainMs(creds)
  if (!remainMs) return desired // 长期凭证，无过期时间
  const remainSec = Math.floor(remainMs / 1000) - URL_EXPIRY_MARGIN_SEC
  if (remainSec >= desired) return desired
  if (remainSec < URL_EXPIRY_MIN_SEC) {
    console.warn(
      '[oss] 凭证剩余有效期过短，签名 URL 可能立即失效',
      `remainMs=${remainMs}`,
    )
  }
  return Math.max(remainSec, URL_EXPIRY_MIN_SEC)
}

async function signObjectUrl(objectKey, opts = {}) {
  const client = await getOssClient()
  const cfg = ossConfig()
  const creds = await resolveAliyunCreds()
  const expires = clampUrlExpiresSec(Number(opts.expires || cfg.signedUrlTtlSec || 7200), creds)
  const publicEndpoint = String(cfg.endpoint || 'oss-cn-hangzhou.aliyuncs.com').replace(
    /^https?:\/\//,
    '',
  )
  const endpointStr = String((client.options && client.options.endpoint) || '')
  let signClient = client
  if (endpointStr.includes('-internal')) {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const OSS = require('ali-oss')
    const creds = {
      accessKeyId: client.options.accessKeyId,
      accessKeySecret: client.options.accessKeySecret,
      securityToken: client.options.stsToken || '',
    }
    signClient = new OSS(buildOssOptions(creds, publicEndpoint))
  }
  return signClient.signatureUrl(objectKey, { expires })
}

/**
 * PostObject 表单字段（小程序 wx.uploadFile）
 */
async function createPostObjectToken({ objectKey, maxSize, ttlSec }) {
  const cfg = ossConfig()
  const creds = await resolveAliyunCreds()
  const expireSec = clampUrlExpiresSec(Number(ttlSec || cfg.uploadTokenTtlSec || 900), creds)
  const sizeLimit = Number(maxSize || cfg.maxUploadBytes || 10 * 1024 * 1024)
  const expiration = new Date(Date.now() + expireSec * 1000).toISOString()
  const conditions = [
    ['content-length-range', 0, sizeLimit],
    ['eq', '$key', objectKey],
  ]
  if (creds.securityToken) {
    conditions.push(['eq', '$x-oss-security-token', creds.securityToken])
  }
  const policyText = JSON.stringify({ expiration, conditions })
  const policy = Buffer.from(policyText).toString('base64')
  const signature = crypto
    .createHmac('sha1', creds.accessKeySecret)
    .update(policy)
    .digest('base64')

  return {
    host: publicHost(),
    objectKey,
    key: objectKey,
    policy,
    signature,
    OSSAccessKeyId: creds.accessKeyId,
    success_action_status: '200',
    securityToken: creds.securityToken || '',
    expireAt: expiration,
    maxSize: sizeLimit,
  }
}

function contentTypeForKey(objectKey) {
  const lower = String(objectKey || '').toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  return 'application/octet-stream'
}

module.exports = {
  isOssEnabled,
  ossConfig,
  publicHost,
  preferInternal,
  activeEndpointHost,
  resetOssClient,
  getOssClient,
  headObject,
  getObjectBuffer,
  putObject,
  objectExists,
  probeOssConnectivity,
  signObjectUrl,
  createPostObjectToken,
  contentTypeForKey,
  resolveAliyunCreds,
  parseCredExpiryMs,
  credRemainMs,
  isCachedCredUsable,
  clampUrlExpiresSec,
}
