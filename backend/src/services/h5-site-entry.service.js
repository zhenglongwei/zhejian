const { listCases } = require('./content.service')
const { getWxaCodeUnlimited } = require('../lib/wechat')
const { toShelfStatus } = require('./h5-site-entry-status')

const MINIPROGRAM_PAGE = 'pages/case/index'
const MINIPROGRAM_SCENE = 'from=web'
const CODE_TTL_MS = 6 * 60 * 60 * 1000

/** @type {{ buf: Buffer, at: number } | null} */
let codeCache = null

async function getCaseShelfStatus() {
  const data = await listCases({ limit: 1 })
  return toShelfStatus(data && data.total)
}

async function getMiniprogramCodePng() {
  if (codeCache && codeCache.buf && Date.now() - codeCache.at < CODE_TTL_MS) {
    return codeCache.buf
  }
  const buf = await getWxaCodeUnlimited({
    page: MINIPROGRAM_PAGE,
    scene: MINIPROGRAM_SCENE,
    width: 280,
    envVersion: 'release',
  })
  codeCache = { buf, at: Date.now() }
  return buf
}

module.exports = {
  toShelfStatus,
  getCaseShelfStatus,
  getMiniprogramCodePng,
}
