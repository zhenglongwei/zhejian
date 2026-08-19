/**
 * PUB-RIGHT-05 · 审核通过后通知窗口、阻止、到期公开、改通知手机号
 */
const crypto = require('crypto')
const { prisma } = require('../lib/prisma')
const { PUBLIC_CASE_STATUS, SERVICE_ALBUM_STATUS } = require('../constants/v2')
const { config } = require('../config')
const { isChinaMobilePhone, sendCaseNotifySms } = require('../lib/sms')
const { AUTHORIZATION_CONSENT, COMPLIANCE_COPY } = require('../../vendor/shared/constants/compliance-copy')

const BLOCKED_FROM_RESUBMIT = new Set([
  PUBLIC_CASE_STATUS.OWNER_BLOCKED,
  PUBLIC_CASE_STATUS.USER_REJECTED,
])

function windowHours() {
  const n = Number(config.sms.windowHours || 48)
  return Number.isFinite(n) && n > 0 ? n : 48
}

function windowMs() {
  return windowHours() * 60 * 60 * 1000
}

function isOwnerBlockedStatus(status) {
  return BLOCKED_FROM_RESUBMIT.has(String(status || ''))
}

function canMerchantGenerateCase(album) {
  if (!album) return { ok: false, code: 'NOT_FOUND', message: '相册不存在' }
  const completed =
    album.status === SERVICE_ALBUM_STATUS.COMPLETED ||
    album.status === SERVICE_ALBUM_STATUS.PUBLISHED ||
    album.status === 'published'
  if (!completed) {
    return { ok: false, code: 'ALBUM_NOT_COMPLETED', message: '请先确认完工后再生成案例' }
  }
  const pc = album.publicCase || {}
  const status = pc.status || album.publicCaseStatus || ''
  if (pc.ownerBlockedAt || isOwnerBlockedStatus(status)) {
    return { ok: false, code: 'OWNER_BLOCKED', message: '车主已阻止公开，本相册不得再提交' }
  }
  if (status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED) {
    return { ok: false, code: 'ALREADY_PUBLIC', message: '该案例已公开展示' }
  }
  if (status === PUBLIC_CASE_STATUS.NOTIFY_WINDOW) {
    return { ok: false, code: 'NOTIFY_WINDOW', message: '案例即将公开，请稍候' }
  }
  // D14：机审过线待确认可重新生成；仅旧人审/脱敏排队中才锁
  if (
    status === PUBLIC_CASE_STATUS.PENDING_REVIEW ||
    status === PUBLIC_CASE_STATUS.PENDING_DESENSITIZE
  ) {
    return { ok: false, code: 'IN_REVIEW', message: '案例审核中，请耐心等待' }
  }
  if (status === PUBLIC_CASE_STATUS.OFFLINE) {
    return { ok: false, code: 'TAKEN_DOWN', message: '该记录已下架，不能再发一版' }
  }
  if (!isChinaMobilePhone(album.userPhone)) {
    return { ok: false, code: 'NOTIFY_PHONE_REQUIRED', message: '请先关联车主手机号' }
  }
  return { ok: true }
}

function isCaseDraftEditable(album) {
  const pc = album && album.publicCase
  const status = (pc && pc.status) || (album && album.publicCaseStatus) || ''
  if (pc && pc.ownerBlockedAt) return false
  if (isOwnerBlockedStatus(status)) return false
  if (
    status === PUBLIC_CASE_STATUS.PENDING_DESENSITIZE ||
    status === PUBLIC_CASE_STATUS.PENDING_REVIEW ||
    status === PUBLIC_CASE_STATUS.NOTIFY_WINDOW ||
    status === PUBLIC_CASE_STATUS.REVIEW_PASSED ||
    status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED ||
    status === PUBLIC_CASE_STATUS.OFFLINE
  ) {
    return false
  }
  // audit_passed / need_modify / rejected：可改措辞或回相册补证后再生成
  return true
}

function signOwnerRightsToken(albumId, expiresAtMs) {
  const secret = config.jwt.secret || 'dev_jwt_secret_change_me'
  const payload = `${albumId}.${expiresAtMs}`
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32)
  return Buffer.from(`${payload}.${sig}`).toString('base64url')
}

function verifyOwnerRightsToken(token) {
  const raw = String(token || '').trim()
  if (!raw) return null
  let decoded = ''
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8')
  } catch (_) {
    return null
  }
  const parts = decoded.split('.')
  if (parts.length !== 3) return null
  const [albumId, expStr, sig] = parts
  const expiresAtMs = Number(expStr)
  if (!albumId || !Number.isFinite(expiresAtMs)) return null
  if (Date.now() > expiresAtMs) return null
  const expected = signOwnerRightsToken(albumId, expiresAtMs)
  if (expected !== raw) return null
  return { albumId, expiresAtMs }
}

function buildOwnerRightsLink(albumId) {
  const expiresAtMs = Date.now() + 90 * 24 * 60 * 60 * 1000
  const token = signOwnerRightsToken(albumId, expiresAtMs)
  const base = String(config.publicBaseUrl || '').replace(/\/$/, '')
  const path = `/pages/album/detail/index?albumId=${encodeURIComponent(albumId)}&rightsToken=${encodeURIComponent(token)}`
  return { token, path, url: `${base}${path}` }
}

async function loadAlbumWithCase(albumId) {
  return prisma.album.findUnique({
    where: { id: albumId },
    include: {
      publicCase: true,
      authorization: true,
    },
  })
}

function httpError(message, status, code) {
  const err = new Error(message)
  err.status = status
  err.code = code
  return err
}

async function assertOwnerOrToken(album, { userId, rightsToken }) {
  if (rightsToken) {
    const parsed = verifyOwnerRightsToken(rightsToken)
    if (parsed && parsed.albumId === album.id) return { via: 'token' }
  }
  if (userId) {
    const { canUserAccessAlbum } = require('./service-album.service')
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (canUserAccessAlbum(album, userId, user?.phone || '')) return { via: 'user' }
  }
  throw httpError('无权操作该相册', 403, 'FORBIDDEN')
}

async function sendNotifyAndOpenWindow(album, { resetClock = true } = {}) {
  const pc = album.publicCase
  if (!pc) throw httpError('案例不存在', 404, 'NOT_FOUND')
  if (pc.ownerBlockedAt || isOwnerBlockedStatus(pc.status)) {
    throw httpError('车主已阻止公开', 409, 'OWNER_BLOCKED')
  }
  if (pc.status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED) {
    throw httpError('该案例已公开展示', 409, 'ALREADY_PUBLIC')
  }

  const phone = String(album.userPhone || '').trim()
  if (!isChinaMobilePhone(phone)) {
    throw httpError('通知手机号无效，不能进入异议窗口', 409, 'NOTIFY_PHONE_REQUIRED')
  }

  const { token, path } = buildOwnerRightsLink(album.id)
  const hours = windowHours()
  const sms = await sendCaseNotifySms({
    phone,
    storeName: album.storeName || '门店',
    serviceName: album.serviceName || '维修',
    hours,
    link: path,
  })
  if (!sms.ok) {
    await prisma.publicCase.update({
      where: { id: pc.id },
      data: {
        status: PUBLIC_CASE_STATUS.REVIEW_PASSED,
        notifyWindowEndsAt: null,
        notifySmsSentAt: null,
      },
    })
    await prisma.album.update({
      where: { id: album.id },
      data: { publicCaseStatus: PUBLIC_CASE_STATUS.REVIEW_PASSED },
    })
    throw httpError('短信未发出，不能进入异议窗口，请核对通知手机号后重发', 409, 'SMS_NOT_SENT')
  }

  const endsAt = resetClock ? new Date(Date.now() + windowMs()) : pc.notifyWindowEndsAt || new Date(Date.now() + windowMs())
  await prisma.publicCase.update({
    where: { id: pc.id },
    data: {
      status: PUBLIC_CASE_STATUS.NOTIFY_WINDOW,
      notifyWindowEndsAt: endsAt,
      notifySmsSentAt: new Date(),
    },
  })
  await prisma.album.update({
    where: { id: album.id },
    data: { publicCaseStatus: PUBLIC_CASE_STATUS.NOTIFY_WINDOW },
  })

  const { notifyCaseAuditResult } = require('./notification.service')
  notifyCaseAuditResult({
    album: { ...album, publicCase: { ...pc, status: PUBLIC_CASE_STATUS.NOTIFY_WINDOW } },
    approved: true,
    comment: COMPLIANCE_COPY.notifyWindowOwner,
    reviewPassedOnly: false,
    notifyWindow: true,
  }).catch((e) => console.warn('[notification] notify window', e && e.message))

  return {
    status: PUBLIC_CASE_STATUS.NOTIFY_WINDOW,
    notifyWindowEndsAt: endsAt.toISOString(),
    smsSkipped: Boolean(sms.skipped),
    rightsToken: token,
  }
}

async function openNotifyWindowAfterApprove(albumId) {
  const album = await loadAlbumWithCase(albumId)
  if (!album) throw httpError('相册不存在', 404, 'NOT_FOUND')
  const { commitPublicCaseGoLive } = require('./public-case.service')
  return commitPublicCaseGoLive(albumId, {
    authorizationTier: 'merchant_published',
    hasUserAuthorization: false,
    reviewAction: 'approve',
    comment: 'admin_approve_go_live',
  })
}

async function resendNotifyWindow(albumId, { storeId, merchantId } = {}) {
  const album = await loadAlbumWithCase(albumId)
  if (!album) throw httpError('相册不存在', 404, 'NOT_FOUND')
  const { assertMerchantAlbum } = require('./service-album.service')
  assertMerchantAlbum(album, storeId, merchantId)
  const status = album.publicCase?.status || album.publicCaseStatus
  if (
    status !== PUBLIC_CASE_STATUS.REVIEW_PASSED &&
    status !== PUBLIC_CASE_STATUS.NOTIFY_WINDOW
  ) {
    throw httpError('当前状态不能重发通知', 409, 'INVALID_STATUS')
  }
  return sendNotifyAndOpenWindow(album, { resetClock: true })
}

async function updateAlbumNotifyPhone(albumId, { storeId, merchantId, phone } = {}) {
  const album = await loadAlbumWithCase(albumId)
  if (!album) throw httpError('相册不存在', 404, 'NOT_FOUND')
  const { assertMerchantAlbum } = require('./service-album.service')
  assertMerchantAlbum(album, storeId, merchantId)
  const completed =
    album.status === SERVICE_ALBUM_STATUS.COMPLETED ||
    album.status === SERVICE_ALBUM_STATUS.PUBLISHED ||
    album.status === 'published'
  if (!completed) {
    throw httpError('完工后才能只改通知手机号', 409, 'ALBUM_NOT_COMPLETED')
  }
  const next = String(phone || '').trim()
  if (!isChinaMobilePhone(next)) {
    throw httpError('请填写有效的中国大陆手机号', 400, 'INVALID_PHONE')
  }
  const pcStatus = album.publicCase?.status || ''
  if (pcStatus === PUBLIC_CASE_STATUS.PUBLIC_APPROVED) {
    throw httpError('已公开，不能再改通知手机号', 409, 'ALREADY_PUBLIC')
  }
  if (album.publicCase?.ownerBlockedAt || isOwnerBlockedStatus(pcStatus)) {
    throw httpError('车主已阻止公开', 409, 'OWNER_BLOCKED')
  }

  const user = await prisma.user.findFirst({ where: { phone: next } })
  await prisma.album.update({
    where: { id: albumId },
    data: {
      userPhone: next,
      ...(user ? { userId: user.id } : {}),
    },
  })
  return { userPhone: next, userPhoneDisplay: `${next.slice(0, 3)}****${next.slice(-4)}` }
}

async function blockPublicCaseByOwner(albumId, { userId, rightsToken } = {}) {
  const album = await loadAlbumWithCase(albumId)
  if (!album) throw httpError('相册不存在', 404, 'NOT_FOUND')
  await assertOwnerOrToken(album, { userId, rightsToken })
  const pc = album.publicCase
  const status = pc?.status || album.publicCaseStatus
  if (status === PUBLIC_CASE_STATUS.PUBLIC_APPROVED) {
    throw httpError('已经放到店页了，要撤下请选「从店页撤下」', 409, 'ALREADY_PUBLIC')
  }
  if (status !== PUBLIC_CASE_STATUS.NOTIFY_WINDOW && status !== PUBLIC_CASE_STATUS.REVIEW_PASSED) {
    throw httpError('现在不用处理，或已经过了可以先看的那两天', 409, 'NOT_IN_WINDOW')
  }
  const now = new Date()
  if (pc) {
    await prisma.publicCase.update({
      where: { id: pc.id },
      data: {
        status: PUBLIC_CASE_STATUS.OWNER_BLOCKED,
        ownerBlockedAt: now,
        notifyWindowEndsAt: pc.notifyWindowEndsAt,
        publishedAt: null,
      },
    })
  }
  await prisma.album.update({
    where: { id: albumId },
    data: { publicCaseStatus: PUBLIC_CASE_STATUS.OWNER_BLOCKED },
  })
  if (userId) {
    const { recordAuthorizationLog } = require('./authorization-log.service')
    const consent = AUTHORIZATION_CONSENT.case_block
    recordAuthorizationLog(
      userId,
      {
        authType: consent.authType,
        businessId: albumId,
        authTextVersion: consent.version,
        authTextSnapshot: consent.text,
      },
      {},
    ).catch(() => {})
  }
  return { status: PUBLIC_CASE_STATUS.OWNER_BLOCKED, ownerBlockedAt: now.toISOString() }
}

async function takedownPublicCaseByOwner(albumId, { userId, rightsToken } = {}) {
  const album = await loadAlbumWithCase(albumId)
  if (!album) throw httpError('相册不存在', 404, 'NOT_FOUND')
  await assertOwnerOrToken(album, { userId, rightsToken })
  const pc = album.publicCase
  const status = pc?.status || album.publicCaseStatus
  if (status !== PUBLIC_CASE_STATUS.PUBLIC_APPROVED) {
    throw httpError('这条还没放到店页', 409, 'NOT_PUBLIC')
  }
  await prisma.$transaction(async (tx) => {
    if (pc) {
      await tx.publicCase.update({
        where: { id: pc.id },
        data: {
          status: PUBLIC_CASE_STATUS.OFFLINE,
          publishedAt: null,
          seoNoindex: true,
        },
      })
      await tx.caseReviewLog.create({
        data: {
          id: require('../lib/ids').newId('crl'),
          caseId: pc.id,
          reviewerId: userId || 'rights_token',
          reviewAction: 'owner_takedown',
          reviewComment: '车主下架公开记录',
          beforeStatus: status,
          afterStatus: PUBLIC_CASE_STATUS.OFFLINE,
        },
      })
    }
    await tx.album.update({
      where: { id: albumId },
      data: {
        publicCaseStatus: PUBLIC_CASE_STATUS.OFFLINE,
        status: SERVICE_ALBUM_STATUS.COMPLETED,
      },
    })
  })
  if (userId) {
    const { recordAuthorizationLog } = require('./authorization-log.service')
    const consent = AUTHORIZATION_CONSENT.case_revoke
    recordAuthorizationLog(
      userId,
      {
        authType: consent.authType,
        businessId: albumId,
        authTextVersion: consent.version,
        authTextSnapshot: consent.text,
      },
      {},
    ).catch(() => {})
  }
  return { status: PUBLIC_CASE_STATUS.OFFLINE }
}

async function hideCaseFromStorefront(caseId, { storeId, merchantId } = {}) {
  const row = await prisma.publicCase.findUnique({ where: { id: caseId } })
  if (!row) throw httpError('案例不存在', 404, 'NOT_FOUND')
  const album = await loadAlbumWithCase(row.albumId)
  const { assertMerchantAlbum } = require('./service-album.service')
  assertMerchantAlbum(album, storeId, merchantId)
  if (row.status !== PUBLIC_CASE_STATUS.PUBLIC_APPROVED) {
    throw httpError('仅已公开记录可从店页隐藏', 409, 'NOT_PUBLIC')
  }
  await prisma.publicCase.update({
    where: { id: caseId },
    data: { storefrontHidden: true, seoNoindex: true },
  })
  return { storefrontHidden: true }
}

async function expireDueNotifyWindows({ limit = 50 } = {}) {
  const due = await prisma.publicCase.findMany({
    where: {
      status: { in: [PUBLIC_CASE_STATUS.NOTIFY_WINDOW, PUBLIC_CASE_STATUS.REVIEW_PASSED] },
      ownerBlockedAt: null,
    },
    take: limit,
    orderBy: { updatedAt: 'asc' },
  })
  const { commitPublicCaseGoLive } = require('./public-case.service')
  const results = []
  for (const row of due) {
    try {
      const published = await commitPublicCaseGoLive(row.albumId, {
        authorizationTier: 'merchant_published',
        hasUserAuthorization: false,
        reviewAction: 'notify_window_elapsed',
        comment: 'notify_window_elapsed',
      })
      results.push({ albumId: row.albumId, ok: true, status: published.status })
    } catch (err) {
      results.push({
        albumId: row.albumId,
        ok: false,
        error: (err && err.message) || 'publish_failed',
      })
    }
  }
  return results
}

async function expireNotifyWindowIfDue(albumId) {
  const album = await loadAlbumWithCase(albumId)
  if (!album || !album.publicCase) return null
  const pc = album.publicCase
  if (
    pc.status !== PUBLIC_CASE_STATUS.NOTIFY_WINDOW &&
    pc.status !== PUBLIC_CASE_STATUS.REVIEW_PASSED
  ) {
    return pc.status
  }
  if (pc.ownerBlockedAt) return pc.status
  const { commitPublicCaseGoLive } = require('./public-case.service')
  await commitPublicCaseGoLive(albumId, {
    authorizationTier: 'merchant_published',
    hasUserAuthorization: false,
    reviewAction: 'notify_window_elapsed',
    comment: 'go_live_after_review',
  })
  return PUBLIC_CASE_STATUS.PUBLIC_APPROVED
}

module.exports = {
  windowHours,
  canMerchantGenerateCase,
  isCaseDraftEditable,
  isOwnerBlockedStatus,
  signOwnerRightsToken,
  verifyOwnerRightsToken,
  buildOwnerRightsLink,
  openNotifyWindowAfterApprove,
  resendNotifyWindow,
  updateAlbumNotifyPhone,
  blockPublicCaseByOwner,
  takedownPublicCaseByOwner,
  hideCaseFromStorefront,
  expireDueNotifyWindows,
  expireNotifyWindowIfDue,
}
