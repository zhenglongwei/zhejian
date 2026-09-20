const { listCases } = require('./content.service')
const { getWxaCodeUnlimited } = require('../lib/wechat')
const { toShelfStatus } = require('./h5-site-entry-status')
const { resolveMiniprogramCodeTarget } = require('./h5-miniprogram-code-target')

const CODE_TTL_MS = 6 * 60 * 60 * 1000

/** @type {Map<string, { buf: Buffer, at: number }>} */
const codeCache = new Map()

async function getCaseShelfStatus() {
  const data = await listCases({ limit: 1 })
  return toShelfStatus(data && data.total)
}

async function getMiniprogramCodePng(entry) {
  const target = resolveMiniprogramCodeTarget(entry)
  const cacheKey = `${target.page}|${target.scene}`
  const cached = codeCache.get(cacheKey)
  if (cached && cached.buf && Date.now() - cached.at < CODE_TTL_MS) {
    return cached.buf
  }
  const buf = await getWxaCodeUnlimited({
    page: target.page,
    scene: target.scene,
    width: 280,
    envVersion: 'release',
  })
  codeCache.set(cacheKey, { buf, at: Date.now() })
  return buf
}

module.exports = {
  toShelfStatus,
  resolveMiniprogramCodeTarget,
  getCaseShelfStatus,
  getMiniprogramCodePng,
}
