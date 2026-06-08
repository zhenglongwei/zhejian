const { prisma } = require('../lib/prisma')
const { newId, toIso } = require('../lib/ids')
const { config } = require('../config')
const { sendSubscribeMessage } = require('../lib/wechat')
const {
  SUBSCRIBE_TEMPLATE_KEYS,
  getSubscribeTemplateId,
  buildSubscribePayload,
} = require('../constants/notification-templates')

const RECEIVER = {
  USER: 'user',
  MERCHANT: 'merchant',
}

const DEDUP_MS = 24 * 60 * 60 * 1000

function notificationRepo() {
  return prisma.notificationMessage
}

function subscriptionRepo() {
  return prisma.notificationSubscription
}

function sendLogRepo() {
  return prisma.notificationSendLog
}

function truncate(text, max = 120) {
  const value = String(text || '').trim()
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

function mapNotification(row) {
  return {
    id: row.id,
    messageType: row.messageType,
    title: row.title,
    content: row.content,
    refType: row.refType,
    refId: row.refId,
    jumpPath: row.jumpPath,
    read: Boolean(row.readAt),
    readAt: toIso(row.readAt),
    createdAt: toIso(row.createdAt),
  }
}

async function shouldDedupe({ receiverType, receiverId, messageType, refType, refId }) {
  const repo = notificationRepo()
  if (!repo) return false
  const since = new Date(Date.now() - DEDUP_MS)
  const existing = await repo.findFirst({
    where: {
      receiverType,
      receiverId,
      messageType,
      refType: refType || '',
      refId: refId || '',
      createdAt: { gte: since },
    },
    select: { id: true },
  })
  return Boolean(existing)
}

async function resolveUserIdByPhone(phone) {
  if (!phone) return ''
  const user = await prisma.user.findFirst({ where: { phone } })
  return user?.id || ''
}

async function resolveAlbumUserId(album) {
  if (!album) return ''
  if (album.userId) return album.userId
  return resolveUserIdByPhone(album.userPhone)
}

async function resolveMerchantOwnerUserId(merchantId) {
  if (!merchantId) return ''
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { ownerUserId: true },
  })
  return merchant?.ownerUserId || ''
}

async function resolveStoreOwnerUserId(storeId) {
  if (!storeId) return ''
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { merchantId: true },
  })
  if (!store?.merchantId) return ''
  return resolveMerchantOwnerUserId(store.merchantId)
}

async function getUserOpenId(userId) {
  if (!userId) return ''
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { openid: true },
  })
  return user?.openid || ''
}

async function hasActiveSubscription(userId, templateKey) {
  const repo = subscriptionRepo()
  if (!repo || !userId || !templateKey) return false
  const row = await repo.findUnique({
    where: {
      userId_templateKey: { userId, templateKey },
    },
  })
  return row?.status === 'accept'
}

async function trySendWechatSubscribe({
  userId,
  templateKey,
  page,
  payload,
  messageId,
}) {
  if (!config.wechat.configured || !userId || !templateKey) return
  const templateId = getSubscribeTemplateId(templateKey)
  if (!templateId) return
  const subscribed = await hasActiveSubscription(userId, templateKey)
  if (!subscribed) return
  const openid = await getUserOpenId(userId)
  if (!openid) return

  const logRepo = sendLogRepo()
  const logId = newId('nslog')
  if (logRepo && messageId) {
    await logRepo.create({
      data: {
        id: logId,
        messageId,
        channel: 'wechat',
        templateId,
        sendStatus: 'pending',
      },
    })
  }

  try {
    await sendSubscribeMessage({
      openid,
      templateId,
      page,
      data: buildSubscribePayload(templateKey, payload),
    })
    if (logRepo) {
      await logRepo.update({
        where: { id: logId },
        data: { sendStatus: 'success', sentAt: new Date() },
      })
    }
  } catch (e) {
    if (logRepo) {
      await logRepo.update({
        where: { id: logId },
        data: {
          sendStatus: 'failed',
          failReason: truncate(e.message || 'send failed', 500),
          sentAt: new Date(),
        },
      })
    }
    console.warn('[notification] wechat subscribe failed', e && e.message)
  }
}

async function createNotification(input = {}) {
  const repo = notificationRepo()
  if (!repo) {
    console.warn('[notification] notificationMessage 表未就绪，跳过写入')
    return null
  }

  const {
    receiverType,
    receiverId,
    messageType,
    title,
    content,
    refType = '',
    refId = '',
    jumpPath = '',
    wechatTemplateKey = '',
    wechatPage = '',
    wechatPayload = {},
  } = input

  if (!receiverType || !receiverId || !messageType || !title) return null

  if (
    await shouldDedupe({
      receiverType,
      receiverId,
      messageType,
      refType,
      refId,
    })
  ) {
    return null
  }

  const row = await repo.create({
    data: {
      id: newId('msg'),
      receiverType,
      receiverId,
      messageType,
      title: truncate(title, 80),
      content: truncate(content, 500),
      refType,
      refId,
      jumpPath,
      channel: 'in_app',
      status: 'sent',
    },
  })

  if (wechatTemplateKey) {
    trySendWechatSubscribe({
      userId: receiverId,
      templateKey: wechatTemplateKey,
      page: wechatPage || jumpPath,
      payload: {
        title: row.title,
        content: row.content,
        time: row.createdAt,
        ...wechatPayload,
      },
      messageId: row.id,
    }).catch(() => {})
  }

  return mapNotification(row)
}

async function notifyUser(input = {}) {
  return createNotification({ receiverType: RECEIVER.USER, ...input })
}

async function notifyMerchantOwner(input = {}) {
  const ownerUserId = input.receiverId
    || (input.merchantId ? await resolveMerchantOwnerUserId(input.merchantId) : '')
    || (input.storeId ? await resolveStoreOwnerUserId(input.storeId) : '')
  if (!ownerUserId) return null
  const payload = { ...input }
  delete payload.merchantId
  delete payload.storeId
  return createNotification({
    receiverType: RECEIVER.MERCHANT,
    receiverId: ownerUserId,
    ...payload,
  })
}

async function listNotifications(receiverType, receiverId, query = {}) {
  const repo = notificationRepo()
  if (!repo) return { list: [], total: 0, unreadCount: 0 }
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20))
  const where = { receiverType, receiverId }
  if (query.unreadOnly === '1' || query.unreadOnly === true) {
    where.readAt = null
  }
  const [total, unreadCount, rows] = await Promise.all([
    repo.count({ where }),
    repo.count({ where: { receiverType, receiverId, readAt: null } }),
    repo.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])
  return {
    list: rows.map(mapNotification),
    total,
    unreadCount,
    page,
    pageSize,
  }
}

async function getUnreadCount(receiverType, receiverId) {
  const repo = notificationRepo()
  if (!repo || !receiverId) return 0
  return repo.count({
    where: { receiverType, receiverId, readAt: null },
  })
}

async function markNotificationsRead(receiverType, receiverId, ids = []) {
  const repo = notificationRepo()
  if (!repo || !receiverId) return { updated: 0 }
  const where = {
    receiverType,
    receiverId,
    readAt: null,
  }
  if (Array.isArray(ids) && ids.length) {
    where.id = { in: ids }
  }
  const result = await repo.updateMany({
    where,
    data: { readAt: new Date() },
  })
  return { updated: result.count }
}

async function saveSubscribeResults(userId, results = {}) {
  const repo = subscriptionRepo()
  if (!repo || !userId) return { saved: 0 }
  let saved = 0
  const entries = Object.entries(results || {})
  for (let i = 0; i < entries.length; i += 1) {
    const [templateId, status] = entries[i]
    const templateKey = SUBSCRIBE_TEMPLATE_KEYS.byTemplateId[templateId]
    if (!templateKey) continue
    await repo.upsert({
      where: { userId_templateKey: { userId, templateKey } },
      create: {
        id: newId('nsub'),
        userId,
        templateKey,
        templateId,
        status: status === 'accept' ? 'accept' : status === 'reject' ? 'reject' : 'ban',
      },
      update: {
        templateId,
        status: status === 'accept' ? 'accept' : status === 'reject' ? 'reject' : 'ban',
      },
    })
    saved += 1
  }
  return { saved }
}

function listSubscribeTemplateIds(scene = 'default') {
  const keys = SUBSCRIBE_TEMPLATE_KEYS.byScene[scene] || SUBSCRIBE_TEMPLATE_KEYS.byScene.default
  return keys
    .map((key) => ({
      key,
      templateId: getSubscribeTemplateId(key),
    }))
    .filter((item) => item.templateId)
}

async function notifyLeadContacted(lead) {
  if (!lead?.userId) return null
  return notifyUser({
    receiverId: lead.userId,
    messageType: 'consult',
    title: '门店已联系你的咨询',
    content: `${lead.storeName || '门店'}已查看并联系你的咨询，请留意来电或留言回复。`,
    refType: 'lead',
    refId: lead.id,
    jumpPath: `/pages/consult/detail/index?id=${lead.id}`,
    wechatTemplateKey: 'consult',
    wechatPage: `pages/consult/detail/index?id=${lead.id}`,
    wechatPayload: { storeName: lead.storeName, serviceName: lead.serviceName },
  })
}

async function notifyLeadClosed(lead) {
  if (!lead?.userId) return null
  return notifyUser({
    receiverId: lead.userId,
    messageType: 'consult',
    title: '咨询已关闭',
    content: `${lead.storeName || '门店'}已关闭本次咨询记录。`,
    refType: 'lead',
    refId: lead.id,
    jumpPath: `/pages/consult/detail/index?id=${lead.id}`,
    wechatTemplateKey: 'consult',
    wechatPage: `pages/consult/detail/index?id=${lead.id}`,
  })
}

async function notifyNewLead(lead) {
  return notifyMerchantOwner({
    storeId: lead.storeId,
    messageType: 'lead',
    title: '有新的咨询线索',
    content: `${lead.serviceName || '咨询'} · ${lead.storeName || '门店'}`,
    refType: 'lead',
    refId: lead.id,
    jumpPath: `/packageMerchant/pages/lead/detail/index?id=${lead.id}`,
    wechatTemplateKey: 'lead',
    wechatPage: `packageMerchant/pages/lead/detail/index?id=${lead.id}`,
    wechatPayload: { storeName: lead.storeName, serviceName: lead.serviceName },
  })
}

async function notifyAlbumCompleted(album) {
  const userId = await resolveAlbumUserId(album)
  if (!userId) return null
  return notifyUser({
    receiverId: userId,
    messageType: 'album',
    title: '服务相册已完工',
    content: `${album.storeName || '门店'}的服务相册已更新，可查看完整留档。`,
    refType: 'album',
    refId: album.id,
    jumpPath: `/pages/album/detail/index?id=${album.id}`,
    wechatTemplateKey: 'album',
    wechatPage: `pages/album/detail/index?id=${album.id}`,
    wechatPayload: { storeName: album.storeName, serviceName: album.serviceName },
  })
}

async function notifyAuthorizationSubmitted(albumId, agreed) {
  const album = await prisma.album.findUnique({ where: { id: albumId } })
  if (!album) return null
  const userId = await resolveAlbumUserId(album)
  if (userId) {
    await notifyUser({
      receiverId: userId,
      messageType: 'authorize',
      title: agreed ? '公开授权已提交' : '已拒绝公开授权',
      content: agreed
        ? '你的授权已提交，案例脱敏后将进入平台审核。'
        : '你已拒绝将本次服务相册公开为案例。',
      refType: 'album',
      refId: album.id,
      jumpPath: `/pages/album/authorize/index`,
      wechatTemplateKey: 'audit',
      wechatPage: 'pages/album/authorize/index',
    })
  }
  if (agreed) {
    await notifyMerchantOwner({
      merchantId: album.merchantId,
      messageType: 'authorize',
      title: '车主已提交公开授权',
      content: `${album.serviceName || '服务相册'}等待平台审核。`,
      refType: 'album',
      refId: album.id,
      jumpPath: `/packageMerchant/pages/album/edit/index?id=${album.id}`,
      wechatTemplateKey: 'audit',
      wechatPage: `packageMerchant/pages/album/edit/index?id=${album.id}`,
    })
  }
  return null
}

async function notifyAuthorizationWithdrawn(albumId) {
  const album = await prisma.album.findUnique({ where: { id: albumId } })
  if (!album) return null
  const userId = await resolveAlbumUserId(album)
  if (userId) {
    await notifyUser({
      receiverId: userId,
      messageType: 'authorize',
      title: '已撤回公开授权',
      content: '你已撤回公开授权，案例将不再公开展示。',
      refType: 'album',
      refId: album.id,
      jumpPath: '/pages/album/authorize/index',
    })
  }
  return notifyMerchantOwner({
    merchantId: album.merchantId,
    messageType: 'authorize',
    title: '车主已撤回公开授权',
    content: `${album.serviceName || '服务相册'}不再公开展示。`,
    refType: 'album',
    refId: album.id,
    jumpPath: `/packageMerchant/pages/album/edit/index?id=${album.id}`,
  })
}

async function notifyCaseAuditResult({ album, approved, comment = '' }) {
  const userId = await resolveAlbumUserId(album)
  const title = approved ? '案例审核已通过' : '案例审核未通过'
  const content = approved
    ? '你的案例已完成脱敏审核并公开展示。'
    : truncate(comment || '案例未通过审核，私密相册仍可查看。', 120)
  if (userId) {
    await notifyUser({
      receiverId: userId,
      messageType: 'case_audit',
      title,
      content,
      refType: 'album',
      refId: album.id,
      jumpPath: approved && album.publicCase?.id
        ? `/pages/case/detail/index?id=${album.publicCase.id}`
        : '/pages/album/authorize/index',
      wechatTemplateKey: 'audit',
      wechatPage: 'pages/album/authorize/index',
    })
  }
  return notifyMerchantOwner({
    merchantId: album.merchantId,
    messageType: 'case_audit',
    title,
    content,
    refType: 'album',
    refId: album.id,
    jumpPath: `/packageMerchant/pages/album/edit/index?id=${album.id}`,
    wechatTemplateKey: 'audit',
    wechatPage: `packageMerchant/pages/album/edit/index?id=${album.id}`,
  })
}

async function notifyMerchantAuditResult({ merchant, approved, needModify = false, comment = '' }) {
  return notifyMerchantOwner({
    merchantId: merchant.id,
    messageType: 'audit',
    title: approved
      ? '入驻审核已通过'
      : needModify
        ? '入驻资料需修改'
        : '入驻审核未通过',
    content: truncate(
      comment ||
        (approved
          ? '你已进入商家工作台，可创建服务相册与服务方案。'
          : '请按审核意见修改后重新提交。'),
      120
    ),
    refType: 'merchant',
    refId: merchant.id,
    jumpPath: '/packageMerchant/pages/workbench/index',
    wechatTemplateKey: 'audit',
    wechatPage: 'packageMerchant/pages/workbench/index',
  })
}

module.exports = {
  RECEIVER,
  createNotification,
  notifyUser,
  notifyMerchantOwner,
  listNotifications,
  getUnreadCount,
  markNotificationsRead,
  saveSubscribeResults,
  listSubscribeTemplateIds,
  notifyLeadContacted,
  notifyLeadClosed,
  notifyNewLead,
  notifyAlbumCompleted,
  notifyAuthorizationSubmitted,
  notifyAuthorizationWithdrawn,
  notifyCaseAuditResult,
  notifyMerchantAuditResult,
}
