/**
 * 微信群归档转案例 · 内部接口
 *
 * 这是老板自己用的内部工具，不是给门店、更不是给车主的，所以不走小程序/商家登录体系：
 * 用一道共享密钥（WECHAT_ARCHIVE_TOKEN）挡住外网。生产环境没配 token 就直接拒绝——
 * 否则等于把 dashscope 的额度挂在公网上让人随便刷。
 *
 * 页面由后端同源提供（/tools/wechat-archive.html），所以不存在跨域问题。
 */

const express = require('express')
const { ok, fail } = require('../lib/response')
const { config } = require('../config')
const {
  parseChat,
  renderMessages,
  maskChatText,
  extractFacts,
  composeCase,
  archiveStatus,
} = require('../services/wechat-archive.service')

const router = express.Router()

function checkToken(req) {
  const expected = config.wechatArchive.token
  const got = String(req.headers['x-archive-token'] || req.body?.token || '')
  if (expected) {
    return got === expected
      ? null
      : fail(req.res, 40101, '归档工具密钥不对', 401)
  }
  // 没配 token：本地开发放行，线上必须挡住
  if (config.nodeEnv === 'production') {
    return fail(req.res, 40102, '生产环境未配置 WECHAT_ARCHIVE_TOKEN，已停用', 403)
  }
  return null
}

router.get('/wechat-archive/status', (req, res) => {
  const denied = checkToken(req)
  if (denied) return denied
  return ok(res, archiveStatus())
})

/**
 * 解析 + 脱敏。这一步不上大模型，纯粹本地算，方便人先把发言人和内容改对。
 * 注意：传进来的原文只在服务端内存里走一圈，脱敏后的文本才返回，原文不落库。
 */
router.post('/wechat-archive/parse', (req, res) => {
  const denied = checkToken(req)
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
    rawStats: parsed.stats,
  })
})

/**
 * 群聊 → 事实层 / 过程层 / 存疑项。
 * 入参可以是 text（脱敏后全文），也可以是 messages（页面上改过的消息数组）。
 */
router.post('/wechat-archive/extract', async (req, res, next) => {
  const denied = checkToken(req)
  if (denied) return denied
  try {
    const data = await extractFacts({
      text: req.body?.text,
      messages: req.body?.messages,
      category: req.body?.category,
    })
    return ok(res, data)
  } catch (e) {
    if (e.code === 'EMPTY_INPUT' || e.code === 'TOO_LONG') return fail(res, 40010, e.message, 400)
    if (e.code === 'LLM_NOT_CONFIGURED') return fail(res, 50310, e.message, 503)
    // 内部版：真实原因照说，老板要靠它判断是密钥错了还是被限流
    if (e.code === 'LLM_FAILED') return fail(res, 50311, (e.cause && e.cause.message) || e.message, 503)
    if (e.code === 'LLM_TIMEOUT') return fail(res, 50410, '大模型超时了，把群聊截短一点再试', 504)
    return next(e)
  }
})

/** 人工确认过的事实 → 按《07》生成案例要素 */
router.post('/wechat-archive/compose', async (req, res, next) => {
  const denied = checkToken(req)
  if (denied) return denied
  try {
    const data = await composeCase({
      facts: req.body?.facts,
      timeline: req.body?.timeline,
      city: req.body?.city,
      district: req.body?.district,
      category: req.body?.category,
    })
    return ok(res, data)
  } catch (e) {
    if (e.code === 'EMPTY_FACTS') return fail(res, 40020, e.message, 400)
    if (e.code === 'LLM_NOT_CONFIGURED') return fail(res, 50310, e.message, 503)
    // 内部版：真实原因照说，老板要靠它判断是密钥错了还是被限流
    if (e.code === 'LLM_FAILED') return fail(res, 50311, (e.cause && e.cause.message) || e.message, 503)
    if (e.code === 'LLM_TIMEOUT') return fail(res, 50420, '大模型超时了，稍后再试', 504)
    return next(e)
  }
})

module.exports = { router, renderMessages }
