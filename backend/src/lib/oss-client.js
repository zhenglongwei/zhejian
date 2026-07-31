/**
 * 阿里云 OSS 客户端（B-MEDIA-01）
 * 凭证复用 aliyun-clients.getCredential（AccessKey 或 ECS RAM 角色）
 */
const crypto = require('crypto')
const { config } = require('../config')
const { getCredential } = require('./aliyun-clients')

let ossClientPromise = null
let cachedCredMeta = { accessKeyId: '', accessKeySecret: '', securityToken: '', fetchedAt: 0 }

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
  return (config.nodeEnv || 'development') === 'production'
}

async function resolveAliyunCreds() {
  const now = Date.now()
  if (
    cachedCredMeta.accessKeyId &&
    cachedCredMeta.accessKeySecret &&
    now - cachedCredMeta.fetchedAt < 5 * 60 * 1000
  ) {
    return cachedCredMeta
  }
  const cred = getCredential()
  const raw = await cred.getCredential()
  cachedCredMeta = {
    accessKeyId: raw.accessKeyId || '',
    accessKeySecret: raw.accessKeySecret || '',
    securityToken: raw.securityToken || '',
    fetchedAt: now,
  }
  if (!cachedCredMeta.accessKeyId || !cachedCredMeta.accessKeySecret) {
    const err = new Error('阿里云凭证不可用，无法访问 OSS')
    err.status = 503
    throw err
  }
  return cachedCredMeta
}

async function getOssClient() {
  if (!isOssEnabled()) {
    const err = new Error('OSS 未开启（OSS_ENABLED）')
    err.status = 503
    throw err
  }
  if (!ossClientPromise) {
    ossClientPromise = (async () => {
      // eslint-disable-next-line global-require, import/no-extraneous-dependencies
      const OSS = require('ali-oss')
      const cfg = ossConfig()
      const creds = await resolveAliyunCreds()
      const endpointHost = preferInternal()
        ? String(cfg.internalEndpoint || cfg.endpoint || '').replace(/^https?:\/\//, '')
        : String(cfg.endpoint || '').replace(/^https?:\/\//, '')
      return new OSS({
        accessKeyId: creds.accessKeyId,
        accessKeySecret: creds.accessKeySecret,
        stsToken: creds.securityToken || undefined,
        bucket: cfg.bucket,
        region: `oss-${cfg.region || 'cn-hangzhou'}`,
        endpoint: endpointHost ? `https://${endpointHost}` : undefined,
        secure: true,
        timeout: 120000,
      })
    })().catch((e) => {
      ossClientPromise = null
      throw e
    })
  }
  return ossClientPromise
}

/** 凭证轮换后丢弃缓存客户端 */
function resetOssClient() {
  ossClientPromise = null
  cachedCredMeta = { accessKeyId: '', accessKeySecret: '', securityToken: '', fetchedAt: 0 }
}

async function headObject(objectKey) {
  const client = await getOssClient()
  return client.head(objectKey)
}

async function getObjectBuffer(objectKey) {
  const client = await getOssClient()
  const result = await client.get(objectKey)
  if (Buffer.isBuffer(result.content)) return result.content
  return Buffer.from(result.content)
}

async function putObject(objectKey, body, options = {}) {
  const client = await getOssClient()
  const headers = {}
  if (options.contentType) headers['Content-Type'] = options.contentType
  return client.put(objectKey, body, { headers })
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
async function signObjectUrl(objectKey, opts = {}) {
  const client = await getOssClient()
  const cfg = ossConfig()
  const expires = Number(opts.expires || cfg.signedUrlTtlSec || 7200)
  const publicEndpoint = String(cfg.endpoint || 'oss-cn-hangzhou.aliyuncs.com').replace(
    /^https?:\/\//,
    '',
  )
  const endpointStr = String((client.options && client.options.endpoint) || '')
  let signClient = client
  if (endpointStr.includes('-internal')) {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const OSS = require('ali-oss')
    signClient = new OSS({
      accessKeyId: client.options.accessKeyId,
      accessKeySecret: client.options.accessKeySecret,
      stsToken: client.options.stsToken,
      bucket: client.options.bucket,
      region: client.options.region,
      endpoint: `https://${publicEndpoint}`,
      secure: true,
    })
  }
  return signClient.signatureUrl(objectKey, { expires })
}

/**
 * PostObject 表单字段（小程序 wx.uploadFile）
 */
async function createPostObjectToken({ objectKey, maxSize, ttlSec }) {
  const cfg = ossConfig()
  const creds = await resolveAliyunCreds()
  const expireSec = Number(ttlSec || cfg.uploadTokenTtlSec || 900)
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
  resetOssClient,
  getOssClient,
  headObject,
  getObjectBuffer,
  putObject,
  objectExists,
  signObjectUrl,
  createPostObjectToken,
  contentTypeForKey,
  resolveAliyunCreds,
}
