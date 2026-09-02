/**
 * 微信群归档转案例 · 公开试用（挂在官网当获客钩子）
 *
 * 跟已删除的 internal 版共用同一套 service，区别只在门口——配额按账户等级（2026-09-02 老板定）：
 *   - 游客（未登录）按 IP，每天 publicPerIpPerDay 次（默认 1）；
 *   - 登录用户按账号，每天 loggedInPerUserPerDay 次（默认 3）——
 *     官网手机号验证码登录即注册，复用辙见账号体系（路由见 public-web-auth.js）；
 *   - 白名单手机号（WECHAT_ARCHIVE_UNLIMITED_PHONES，老板自己干活用）登录后不限次、不占总闸。
 *   外加一道全局总闸（一人公司的保险丝），登录用户的消耗同样计入。
 *   - 不落库：粘贴的内容只在内存里走一圈，用完即弃。这是页面上敢写「不保存任何内容」的底气。
 *
 * 计费口径：generate 一步（内部 extract + compose 两次大模型调用）算 1 次配额；
 * extract / compose 保留单点调用（旧前端兼容 + 排障用），各算 1 次；
 * parse 不调大模型，单独宽松计数。
 */

const express = require('express')
const { ok, fail } = require('../lib/response')
const { config } = require('../config')
const { ROLES } = require('../lib/jwt')
const { prisma } = require('../lib/prisma')
const { clientIp, consumeDailyLimit, peekDailyUsage } = require('../services/geo-check-rate-limit')
const { optionalAuth, hasRole } = require('../middleware/auth')
const {
  parseChat,
  maskChatText,
  extractFacts,
  composeCase,
  generateCase,
  archiveStatus,
} = require('../services/wechat-archive.service')

const router = express.Router()

const SCOPE_LLM = 'archive-llm'
const SCOPE_PARSE = 'archive-parse'
/** 全局总闸的假身份。key 仍然以日期开头，不会干扰 buckets 的过期清理 */
const GLOBAL_KEY = '__global__'

function overQuota(res, message) {
  return fail(res, 42901, message, 429)
}

/** 手机号缓存：userId → { phone, at }。白名单判定要查库，不能每个请求都查一遍 */
const phoneCache = new Map()
const PHONE_CACHE_TTL_MS = 10 * 60 * 1000

async function isUnlimitedPhone(userId) {
  const phones = config.wechatArchive.unlimitedPhones
  if (!phones.length) return false
  const hit = phoneCache.get(userId)
  if (hit && Date.now() - hit.at < PHONE_CACHE_TTL_MS) return phones.includes(hit.phone)
  let phone = ''
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } })
    phone = (user && user.phone) || ''
  } catch (e) {
    // 查库失败就当不在白名单——配额系统不能跟着数据库一起挂
    phone = ''
  }
  phoneCache.set(userId, { phone, at: Date.now() })
  return phones.includes(phone)
}

/**
 * 身份分级，决定配额按哪本账算：
 *   unlimited（system 角色 / 白名单手机号）> user（已登录）> guest（游客）
 */
async function resolveIdentity(req) {
  const auth = req.auth || {}
  if (!auth.token || !auth.userId) return { level: 'guest', userId: null }
  if (hasRole(auth, ROLES.SYSTEM)) return { level: 'unlimited', userId: auth.userId }
  if (await isUnlimitedPhone(auth.userId)) return { level: 'unlimited', userId: auth.userId }
  return { level: 'user', userId: auth.userId }
}

/** 配额身份 key：登录按账号，游客按 IP */
function quotaKey(identity, req) {
  if (identity.level === 'user') return `user:${identity.userId}`
  return clientIp(req)
}

/**
 * 扣配额。解析与主流程分开算——解析不花钱，卡太死反而挡住正常试用。
 */
async function takeQuota(req, res, kind) {
  const c = config.wechatArchive

  // 解析不花钱：对所有人（含老板）按 IP 防脚本，不跟身份走
  if (kind === 'parse') {
    const r = consumeDailyLimit(clientIp(req), c.publicParsePerIpPerDay, SCOPE_PARSE)
    if (!r.allowed) return overQuota(res, `今天的解析次数用完了（${r.limit} 次/天），明天再来`)
    return null
  }

  const identity = await resolveIdentity(req)
  if (identity.level === 'unlimited') return null

  // 先看全局总闸再扣个人：总闸满了就别浪费个人的额度（它明天还要用）
  if (peekDailyUsage(GLOBAL_KEY, SCOPE_LLM).used >= c.publicDailyCap) {
    return overQuota(res, '今天的公开试用名额已经用完，明天再来')
  }

  const limit = identity.level === 'user' ? c.loggedInPerUserPerDay : c.publicPerIpPerDay
  const r = consumeDailyLimit(quotaKey(identity, req), limit, SCOPE_LLM)
  if (!r.allowed) {
    return overQuota(
      res,
      identity.level === 'user'
        ? `今天 ${limit} 次已经用完，明天再来`
        : `今天的免费次数用完了（游客每天 ${limit} 次）。手机号登录后每天 ${c.loggedInPerUserPerDay} 次。`,
    )
  }
  consumeDailyLimit(GLOBAL_KEY, c.publicDailyCap, SCOPE_LLM)
  return null
}

/**
 * 总闸。默认开着，真出事（比如被刷、模型账单爆了）把 WECHAT_ARCHIVE_PUBLIC_ENABLED=false
 * 一改、重启就能整体停掉，不用改代码。
 * status 要放行——页面得先问一句才知道该显示「已关闭」，否则用户只会看到白屏。
 */
router.use((req, res, next) => {
  if (!config.wechatArchive.enabled && req.path !== '/wechat-archive/status') {
    return fail(res, 40301, '公开试用已关闭', 403)
  }
  return next()
})

// 身份解析挂在总闸之后、业务路由之前：所有 archive 接口都按账户等级算账
router.use(optionalAuth)

async function statusPayload(req) {
  const c = config.wechatArchive
  const identity = await resolveIdentity(req)
  const globalLeft = Math.max(c.publicDailyCap - peekDailyUsage(GLOBAL_KEY, SCOPE_LLM).used, 0)
  const s = archiveStatus()
  let limit = null
  let remaining = null
  if (identity.level !== 'unlimited') {
    limit = identity.level === 'user' ? c.loggedInPerUserPerDay : c.publicPerIpPerDay
    const used = peekDailyUsage(quotaKey(identity, req), SCOPE_LLM, limit)
    remaining = Math.min(used.remaining, globalLeft)
  }
  return {
    enabled: c.enabled,
    ready: c.enabled && s.ready && (identity.level === 'unlimited' || globalLeft > 0),
    model: s.model,
    /** 当前身份：guest（游客）/ user（已登录）/ unlimited（白名单，不限次） */
    identity: identity.level,
    limit,
    remaining,
    maxChars: c.maxChars,
    /** 页面上要写清楚：不落库。这行是给前端读的，别删 */
    retention: '不保存任何粘贴内容',
  }
}

router.get('/wechat-archive/status', async (req, res) => ok(res, await statusPayload(req)))

router.post('/wechat-archive/parse', async (req, res) => {
  const denied = await takeQuota(req, res, 'parse')
  if (denied) return denied

  const raw = String(req.body?.text || '')
  if (!raw.trim()) return fail(res, 40001, '先粘贴群聊文本', 400)

  const parsed = parseChat(raw)
  const masked = maskChatText(raw, { senders: parsed.senders })
  const after = parseChat(masked.text)

  return ok(res, {
    messages: after.messages,
    stats: after.stats,
    senders: after.senders || [],
    maskedText: masked.text,
    maskHits: masked.hits,
    senderMapping: masked.senderMapping,
  })
})

/**
 * 一步生成：粘贴的群聊（或脱敏后的消息）→ 案例。
 * 内部先抽事实再写案例，两次大模型调用、算 1 次配额。
 */
router.post('/wechat-archive/generate', async (req, res, next) => {
  const denied = await takeQuota(req, res, 'llm')
  if (denied) return denied
  try {
    const data = await generateCase({
      text: req.body?.text,
      messages: req.body?.messages,
      category: req.body?.category,
      city: req.body?.city,
      district: req.body?.district,
    })
    return ok(res, { ...data, quota: await statusPayload(req) })
  } catch (e) {
    if (e.code === 'EMPTY_INPUT' || e.code === 'TOO_LONG') return fail(res, 40010, e.message, 400)
    if (e.code === 'LLM_NOT_CONFIGURED' || e.code === 'LLM_FAILED') {
      return fail(res, 50310, '服务暂时不可用，稍后再试', 503)
    }
    if (e.code === 'LLM_TIMEOUT') return fail(res, 50410, '处理超时了，把群聊截短一点再试', 504)
    return next(e)
  }
})

router.post('/wechat-archive/extract', async (req, res, next) => {
  const denied = await takeQuota(req, res, 'llm')
  if (denied) return denied
  try {
    const data = await extractFacts({
      text: req.body?.text,
      messages: req.body?.messages,
      category: req.body?.category,
    })
    return ok(res, { ...data, quota: await statusPayload(req) })
  } catch (e) {
    if (e.code === 'EMPTY_INPUT' || e.code === 'TOO_LONG') return fail(res, 40010, e.message, 400)
    if (e.code === 'LLM_NOT_CONFIGURED' || e.code === 'LLM_FAILED') {
      return fail(res, 50310, '服务暂时不可用，稍后再试', 503)
    }
    if (e.code === 'LLM_TIMEOUT') return fail(res, 50410, '处理超时了，把群聊截短一点再试', 504)
    return next(e)
  }
})

router.post('/wechat-archive/compose', async (req, res, next) => {
  const denied = await takeQuota(req, res, 'llm')
  if (denied) return denied
  try {
    const data = await composeCase({
      facts: req.body?.facts,
      timeline: req.body?.timeline,
      city: req.body?.city,
      district: req.body?.district,
      category: req.body?.category,
    })
    return ok(res, { ...data, quota: await statusPayload(req) })
  } catch (e) {
    if (e.code === 'EMPTY_FACTS') return fail(res, 40020, e.message, 400)
    if (e.code === 'LLM_NOT_CONFIGURED' || e.code === 'LLM_FAILED') {
      return fail(res, 50310, '服务暂时不可用，稍后再试', 503)
    }
    if (e.code === 'LLM_TIMEOUT') return fail(res, 50420, '处理超时了，稍后再试', 504)
    return next(e)
  }
})

module.exports = { router, statusPayload }
