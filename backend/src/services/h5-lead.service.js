const { prisma } = require('../lib/prisma')
const { newId, maskPhone } = require('../lib/ids')
const { CASE_ARTICLE_H5_PUBLISHED_STATUSES } = require('../constants/case-article-status')
const { createLead } = require('./lead.service')

const H5_LEAD_RATE_LIMIT_MS = 24 * 60 * 60 * 1000

function normalizeMobilePhone(value) {
  const phone = String(value || '').replace(/\D/g, '')
  if (phone.length !== 11 || !/^1\d{10}$/.test(phone)) return ''
  return phone
}

async function assertH5LeadTarget(storeId, caseId) {
  const store = await prisma.store.findFirst({
    where: {
      id: storeId,
      status: 'ACTIVE',
      merchant: { status: 'ACTIVE' },
    },
  })
  if (!store) {
    const err = new Error('门店不存在或暂不可咨询')
    err.status = 404
    throw err
  }

  if (caseId) {
    const caseRow = await prisma.publicCase.findFirst({
      where: {
        id: caseId,
        status: 'public_approved',
        storeId,
        articleStatus: { in: CASE_ARTICLE_H5_PUBLISHED_STATUSES },
      },
    })
    if (!caseRow) {
      const err = new Error('案例不存在或与门店不匹配')
      err.status = 404
      throw err
    }
  }

  return store
}

async function resolveH5LeadUserId(phone, name) {
  const existing = await prisma.user.findFirst({ where: { phone } })
  if (existing) return existing.id

  const userId = newId('usr')
  await prisma.user.create({
    data: {
      id: userId,
      openid: `h5_guest_${phone}`,
      phone,
      nickname: String(name || '').trim().slice(0, 32),
    },
  })
  return userId
}

async function assertH5LeadRateLimit(userId, storeId) {
  const since = new Date(Date.now() - H5_LEAD_RATE_LIMIT_MS)
  const recent = await prisma.consultLead.findFirst({
    where: {
      userId,
      storeId,
      sourcePage: { startsWith: 'h5_' },
      createdAt: { gte: since },
    },
  })
  if (recent) {
    const err = new Error('你已提交过咨询，请 24 小时后再试')
    err.status = 429
    throw err
  }
}

/**
 * H5 公开留言咨询（无需登录）
 * @param {object} payload
 */
async function createH5Lead(payload = {}) {
  const storeId = String(payload.storeId || '').trim()
  const caseId = String(payload.caseId || '').trim()
  const name = String(payload.name || payload.contactName || '').trim()
  const phone = normalizeMobilePhone(payload.phone || payload.contactPhone)
  const description = String(payload.description || '').trim()
  const platformConsent = Boolean(payload.platformConsent)

  if (!storeId) {
    const err = new Error('缺少门店信息')
    err.status = 400
    throw err
  }
  if (!phone) {
    const err = new Error('请填写有效手机号')
    err.status = 400
    throw err
  }
  if (description.length < 4 || description.length > 500) {
    const err = new Error('问题描述需 4–500 字')
    err.status = 400
    throw err
  }
  if (!platformConsent) {
    const err = new Error('请先阅读并同意说明')
    err.status = 400
    throw err
  }

  const store = await assertH5LeadTarget(storeId, caseId)
  const userId = await resolveH5LeadUserId(phone, name)
  await assertH5LeadRateLimit(userId, storeId)

  let serviceName = String(payload.serviceName || '').trim()
  if (!serviceName && caseId) {
    const caseRow = await prisma.publicCase.findUnique({
      where: { id: caseId },
      select: { serviceName: true },
    })
    serviceName = caseRow?.serviceName || ''
  }

  const lead = await createLead(userId, {
    storeId,
    storeName: store.name || '',
    storePhone: store.phone || '',
    caseId,
    serviceName,
    serviceId: payload.serviceId || '',
    sourcePage: payload.sourcePage || 'h5_case',
    leadType: 'message',
    description,
    platformConsent: true,
    contact: {
      name: name || 'H5访客',
      phone,
      phoneDisplay: maskPhone(phone),
    },
  })

  return {
    leadId: lead.id,
    status: lead.status,
    storeId: lead.storeId,
    caseId: lead.caseId || '',
  }
}

module.exports = {
  createH5Lead,
}
