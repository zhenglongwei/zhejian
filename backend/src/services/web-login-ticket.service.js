/**
 * 官网扫码登录票据（小程序码）· 2026-09-25
 *
 * 背景：账号主键是 userId（由微信 openid 确定），手机号只是联系方式。手机号登录在
 * 号码被运营商回收后，新号主人能直接登进原主人账号——所以已绑微信的账号在官网改用
 * 微信登录：web 拿一张小程序码 → 微信扫码 → 小程序里确认 → web 轮询拿到会话。
 *
 * 为什么不用开放平台网站应用扫码：要另外申请并备案；小程序码零成本，且与小程序共用
 * 同一个 openid/unionid，天然就是同一个账号。
 *
 * 票据存内存（同 sms-code.service）：5 分钟过期、确认一次即消费。多实例部署要换 Redis。
 *
 * 版本：v1 2026-09-25
 * 更新：2026-09-25 初版。action=login 用于登录，action=bind 用于给已登录的
 *       phone-only 账号绑定微信（绑定即把旧账号资产迁到微信账号并作废）
 */

const { randomBytes } = require('crypto')
const { prisma } = require('../lib/prisma')
const { config } = require('../config')
const { getWxaCodeUnlimited } = require('../lib/wechat')
const { buildAuthSession } = require('./auth.service')
const { mergePhoneOnlyAccount } = require('./account-merge.service')

const TICKET_TTL_MS = 5 * 60 * 1000
/** 小程序端承接扫码的页面（在 app.json 里注册） */
const LOGIN_PAGE = 'pages/web-login/index'

const ACTION = { LOGIN: 'login', BIND: 'bind' }
const STATUS = { PENDING: 'pending', CONFIRMED: 'confirmed', EXPIRED: 'expired' }

/** ticket → { action, webUserId, status, expiresAt, resultUserId }。只存内存。 */
const ticketStore = new Map()

function fail(message, status) {
  const err = new Error(message)
  err.status = status
  return err
}

function sweepExpired() {
  const now = Date.now()
  for (const [key, value] of ticketStore) {
    if (value.expiresAt < now) ticketStore.delete(key)
  }
}

/** 小程序码 scene 只放得下 32 字符，取 12 位 */
function newTicketToken() {
  return randomBytes(9).toString('base64url')
}

function toDataUrl(buffer) {
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50
  return `data:${isPng ? 'image/png' : 'image/jpeg'};base64,${buffer.toString('base64')}`
}

/**
 * 建票据 + 生成小程序码。
 * @param {{ action?: string, userId?: string }} input userId 仅 bind 需要（当前 web 账号）
 * @returns {Promise<{ ticket: string, codeImage: string, expiresIn: number }>}
 */
async function createTicket({ action = ACTION.LOGIN, userId = '' } = {}) {
  if (!config.wechat.configured) {
    throw fail('扫码登录未配置，请先在服务器 backend/.env 设置 WECHAT_APP_SECRET', 503)
  }
  if (action === ACTION.BIND && !userId) throw fail('绑定微信需要先登录', 401)

  const ticket = newTicketToken()
  ticketStore.set(ticket, {
    action,
    webUserId: userId,
    status: STATUS.PENDING,
    expiresAt: Date.now() + TICKET_TTL_MS,
    resultUserId: '',
  })
  if (ticketStore.size > 500) sweepExpired()

  const buffer = await getWxaCodeUnlimited({
    page: LOGIN_PAGE,
    scene: ticket,
    width: 280,
    envVersion: config.nodeEnv === 'production' ? 'release' : 'develop',
  })

  return {
    ticket,
    codeImage: toDataUrl(buffer),
    expiresIn: Math.floor(TICKET_TTL_MS / 1000),
  }
}

/**
 * 小程序端确认。bind 会把 web 那个 phone-only 账号的资产迁到当前微信账号。
 * @param {string} ticket 码里的 scene
 * @param {string} miniappUserId 小程序当前登录用户
 * @returns {Promise<{ ok: true, action: string }>}
 */
async function confirmTicket(ticket, miniappUserId) {
  const record = ticketStore.get(String(ticket || '').trim())
  if (!record || Date.now() > record.expiresAt) {
    ticketStore.delete(ticket)
    throw fail('二维码已过期，请在网页上刷新后重扫', 410)
  }
  if (record.status === STATUS.CONFIRMED) throw fail('这个码已经确认过了', 409)
  if (!miniappUserId) throw fail('未登录', 401)

  if (record.action === ACTION.BIND) {
    await mergePhoneOnlyAccount({ fromUserId: record.webUserId, toUserId: miniappUserId })
  }

  record.status = STATUS.CONFIRMED
  record.resultUserId = miniappUserId
  ticketStore.set(ticket, record)
  return { ok: true, action: record.action }
}

/**
 * web 轮询。确认后一次消费：签发会话并删掉票据，避免同一个码被反复换 token。
 * @param {string} ticket
 * @returns {Promise<{ status: string, session?: object }>}
 */
async function consumeTicket(ticket) {
  const record = ticketStore.get(String(ticket || '').trim())
  if (!record) return { status: STATUS.EXPIRED }
  if (Date.now() > record.expiresAt) {
    ticketStore.delete(ticket)
    return { status: STATUS.EXPIRED }
  }
  if (record.status !== STATUS.CONFIRMED) return { status: STATUS.PENDING }

  ticketStore.delete(ticket)
  const user = await prisma.user.findUnique({ where: { id: record.resultUserId } })
  if (!user) return { status: STATUS.EXPIRED }
  const session = await buildAuthSession(user)
  return { status: STATUS.CONFIRMED, session }
}

module.exports = {
  ACTION,
  STATUS,
  createTicket,
  confirmTicket,
  consumeTicket,
  // 仅供冒烟测试检视内部状态
  _ticketStore: ticketStore,
}
