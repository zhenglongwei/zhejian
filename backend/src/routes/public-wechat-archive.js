/**
 * 微信群归档转案例 · 公开试用（挂在官网当获客钩子）
 *
 * 跟 internal 版共用同一套 service，区别只在门口：
 *   - 不要密钥，谁都能用；
 *   - 按 IP 限次，外加一道全局总闸（一人公司的保险丝）；
 *   - 不落库：粘贴的内容只在内存里走一圈，用完即弃。这是页面上敢写「不保存任何内容」的底气。
 *
 * 计费口径：parse 不调大模型，单独宽松计数；extract 与 compose 各算 1 次主配额，
 * 也就是跑完一整轮流程消耗 2 次。默认每 IP 每天 20 次，够试 10 轮。
 */

const express = require('express')
const { ok, fail } = require('../lib/response')
const { config } = require('../config')
const { clientIp, consumeDailyLimit, peekDailyUsage } = require('../services/geo-check-rate-limit')
const {
  parseChat,
  maskChatText,
  extractFacts,
  composeCase,
  archiveStatus,
} = require('../services/wechat-archive.service')

const router = express.Router()

const SCOPE_LLM = 'archive-llm'
const SCOPE_PARSE = 'archive-parse'
/** 全局总闸的假 IP。key 仍然以日期开头，不会干扰 buckets 的过期清理 */
const GLOBAL_KEY = '__global__'

function overQuota(res, message) {
  return fail(res, 42901, message, 429)
}

/**
 * 扣配额。解析与主流程分开算——解析不花钱，卡太死反而挡住正常试用。
 */
function takeQuota(req, res, kind) {
  const c = config.wechatArchive
  const ip = clientIp(req)

  if (kind === 'parse') {
    const r = consumeDailyLimit(ip, c.publicParsePerIpPerDay, SCOPE_PARSE)
    if (!r.allowed) return overQuota(res, `今天的解析次数用完了（${r.limit} 次/天），明天再来`)
    return null
  }

  // 先看全局总闸再扣 IP：总闸满了就别浪费这个 IP 的额度（它明天还要用）
  if (peekDailyUsage(GLOBAL_KEY, SCOPE_LLM).used >= c.publicDailyCap) {
    return overQuota(res, '今天的公开试用名额已经用完，明天再来')
  }
  const r = consumeDailyLimit(ip, c.publicPerIpPerDay, SCOPE_LLM)
  if (!r.allowed) {
    return overQuota(res, `今天的试用次数用完了（${r.limit} 次/天）。想不限次用，联系我们开一个专属入口。`)
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

function statusPayload(req) {
  const c = config.wechatArchive
  const ip = clientIp(req)
  const used = peekDailyUsage(ip, SCOPE_LLM, c.publicPerIpPerDay)
  const globalLeft = Math.max(c.publicDailyCap - peekDailyUsage(GLOBAL_KEY, SCOPE_LLM).used, 0)
  const s = archiveStatus()
  return {
    enabled: c.enabled,
    ready: c.enabled && s.ready && globalLeft > 0,
    model: s.model,
    remaining: Math.min(used.remaining, globalLeft),
    limit: c.publicPerIpPerDay,
    maxChars: c.maxChars,
    /** 页面上要写清楚：不落库。这行是给前端读的，别删 */
    retention: '不保存任何粘贴内容',
  }
}

router.get('/wechat-archive/status', (req, res) => ok(res, statusPayload(req)))

router.post('/wechat-archive/parse', (req, res) => {
  const denied = takeQuota(req, res, 'parse')
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

router.post('/wechat-archive/extract', async (req, res, next) => {
  const denied = takeQuota(req, res, 'llm')
  if (denied) return denied
  try {
    const data = await extractFacts({
      text: req.body?.text,
      messages: req.body?.messages,
      category: req.body?.category,
    })
    return ok(res, { ...data, quota: statusPayload(req) })
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
  const denied = takeQuota(req, res, 'llm')
  if (denied) return denied
  try {
    const data = await composeCase({
      facts: req.body?.facts,
      timeline: req.body?.timeline,
      city: req.body?.city,
      district: req.body?.district,
      category: req.body?.category,
    })
    return ok(res, { ...data, quota: statusPayload(req) })
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
