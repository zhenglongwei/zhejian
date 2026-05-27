const { prisma } = require('../lib/prisma')
const { newId, maskPhone, toIso } = require('../lib/ids')
const {
  LEAD_STATUS,
  LEAD_USER_CANCELLABLE,
  LEAD_CLOSE_REASON,
} = require('../constants/v2')

function mapLeadRecord(lead) {
  const contact = lead.contactJson || {}
  return {
    id: lead.id,
    userId: lead.userId,
    status: lead.status,
    serviceId: lead.serviceId,
    serviceName: lead.serviceName,
    storeId: lead.storeId,
    storeName: lead.storeName,
    storePhone: lead.storePhone,
    caseId: lead.caseId,
    sourcePage: lead.sourcePage,
    leadType: lead.leadType,
    vehicle: lead.vehicleJson || {},
    description: lead.description,
    images: lead.imagesJson || [],
    appointment: lead.appointmentJson || {},
    contact: {
      ...contact,
      phoneDisplay: contact.phoneDisplay || maskPhone(contact.phone || ''),
    },
    isAccident: lead.isAccident,
    priceMode: lead.priceMode,
    platformConsent: lead.platformConsent,
    closeReason: lead.closeReason || '',
    closeNote: lead.closeNote || '',
    createdAt: toIso(lead.createdAt),
    updatedAt: toIso(lead.updatedAt),
    statusLogs: (lead.statusLogs || []).map((log) => ({
      fromStatus: log.fromStatus,
      toStatus: log.toStatus,
      operatorType: log.operatorType,
      reason: log.reason,
      createdAt: toIso(log.createdAt),
    })),
  }
}

async function appendLeadStatus(leadId, fromStatus, toStatus, operatorType, operatorId = '', reason = '') {
  await prisma.leadStatusLog.create({
    data: {
      leadId,
      fromStatus,
      toStatus,
      operatorType,
      operatorId,
      reason,
    },
  })
  return prisma.consultLead.update({
    where: { id: leadId },
    data: { status: toStatus },
    include: { statusLogs: { orderBy: { createdAt: 'asc' } } },
  })
}

async function createLead(userId, payload = {}) {
  if (!payload.storeId) {
    const err = new Error('缺少门店信息')
    err.status = 400
    throw err
  }
  if (!payload.platformConsent) {
    const err = new Error('请先阅读并同意平台说明')
    err.status = 400
    throw err
  }

  const id = newId('lead')
  const contact = payload.contact || {}
  const lead = await prisma.consultLead.create({
    data: {
      id,
      userId,
      status: LEAD_STATUS.SUBMITTED,
      serviceId: payload.serviceId || '',
      serviceName: payload.serviceName || '',
      storeId: payload.storeId,
      storeName: payload.storeName || '',
      storePhone: payload.storePhone || '',
      caseId: payload.caseId || '',
      sourcePage: payload.sourcePage || '',
      leadType: payload.leadType || (payload.serviceId ? 'service' : 'message'),
      vehicleJson: payload.vehicle || {},
      description: payload.description || '',
      imagesJson: payload.images || [],
      appointmentJson: payload.appointment || {},
      contactJson: {
        name: contact.name || '',
        phone: contact.phone || '',
        phoneDisplay: contact.phoneDisplay || maskPhone(contact.phone || ''),
      },
      isAccident: Boolean(payload.isAccident),
      priceMode: payload.priceMode || '',
      platformConsent: true,
      statusLogs: {
        create: {
          fromStatus: null,
          toStatus: LEAD_STATUS.SUBMITTED,
          operatorType: 'user',
          operatorId: userId,
        },
      },
    },
    include: { statusLogs: { orderBy: { createdAt: 'asc' } } },
  })
  return mapLeadRecord(lead)
}

async function listUserLeads(userId, tab) {
  const where = { userId }
  if (tab === 'active') {
    where.status = { in: [LEAD_STATUS.SUBMITTED, LEAD_STATUS.VIEWED, LEAD_STATUS.CONTACTED] }
  } else if (tab === 'closed') {
    where.status = { in: [LEAD_STATUS.CANCELLED, LEAD_STATUS.CLOSED] }
  }
  const leads = await prisma.consultLead.findMany({
    where,
    include: { statusLogs: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })
  return leads.map(mapLeadRecord)
}

async function getUserLeadById(userId, leadId) {
  const lead = await prisma.consultLead.findUnique({
    where: { id: leadId },
    include: { statusLogs: { orderBy: { createdAt: 'asc' } } },
  })
  if (!lead) {
    const err = new Error('咨询记录不存在')
    err.status = 404
    throw err
  }
  if (lead.userId !== userId) {
    const err = new Error('无权查看该咨询')
    err.status = 403
    throw err
  }
  return mapLeadRecord(lead)
}

async function cancelUserLead(userId, leadId) {
  const lead = await getUserLeadById(userId, leadId)
  if (!LEAD_USER_CANCELLABLE.includes(lead.status)) {
    const err = new Error('当前状态不可取消')
    err.status = 409
    throw err
  }
  await appendLeadStatus(
    leadId,
    lead.status,
    LEAD_STATUS.CANCELLED,
    'user',
    userId,
    'USER_CANCELLED'
  )
  return getUserLeadById(userId, leadId)
}

async function listMerchantLeads(storeId, tab) {
  const where = { storeId }
  if (tab === 'pending') {
    where.status = { in: [LEAD_STATUS.SUBMITTED, LEAD_STATUS.VIEWED] }
  } else if (tab === 'contacted') {
    where.status = LEAD_STATUS.CONTACTED
  } else if (tab === 'closed') {
    where.status = { in: [LEAD_STATUS.CANCELLED, LEAD_STATUS.CLOSED] }
  }
  const leads = await prisma.consultLead.findMany({
    where,
    include: { statusLogs: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })
  return leads.map(mapLeadRecord)
}

async function getMerchantLeadById(leadId, storeId) {
  const lead = await prisma.consultLead.findUnique({
    where: { id: leadId },
    include: { statusLogs: { orderBy: { createdAt: 'asc' } } },
  })
  if (!lead || lead.storeId !== storeId) {
    const err = new Error('线索不存在')
    err.status = 404
    throw err
  }
  return mapLeadRecord(lead)
}

async function markLeadViewed(leadId, storeId, merchantId) {
  const lead = await getMerchantLeadById(leadId, storeId)
  if (lead.status !== LEAD_STATUS.SUBMITTED) {
    return lead
  }
  const updated = await appendLeadStatus(
    leadId,
    lead.status,
    LEAD_STATUS.VIEWED,
    'merchant',
    merchantId
  )
  const fresh = await prisma.consultLead.findUnique({
    where: { id: leadId },
    include: { statusLogs: { orderBy: { createdAt: 'asc' } } },
  })
  return mapLeadRecord(fresh)
}

async function markLeadContacted(leadId, storeId, merchantId, note = '') {
  const lead = await getMerchantLeadById(leadId, storeId)
  if (![LEAD_STATUS.SUBMITTED, LEAD_STATUS.VIEWED, LEAD_STATUS.CONTACTED].includes(lead.status)) {
    const err = new Error('当前状态不可标记已联系')
    err.status = 409
    throw err
  }
  if (lead.status === LEAD_STATUS.CONTACTED) {
    return lead
  }
  await appendLeadStatus(leadId, lead.status, LEAD_STATUS.CONTACTED, 'merchant', merchantId, note)
  const fresh = await prisma.consultLead.findUnique({
    where: { id: leadId },
    include: { statusLogs: { orderBy: { createdAt: 'asc' } } },
  })
  return mapLeadRecord(fresh)
}

async function closeMerchantLead(leadId, storeId, merchantId, payload = {}) {
  const lead = await getMerchantLeadById(leadId, storeId)
  if ([LEAD_STATUS.CANCELLED, LEAD_STATUS.CLOSED].includes(lead.status)) {
    return lead
  }
  const reason = payload.reason || LEAD_CLOSE_REASON.OTHER
  if (!Object.values(LEAD_CLOSE_REASON).includes(reason)) {
    const err = new Error('关闭原因无效')
    err.status = 400
    throw err
  }
  await prisma.consultLead.update({
    where: { id: leadId },
    data: {
      closeReason: reason,
      closeNote: payload.note || '',
    },
  })
  await appendLeadStatus(leadId, lead.status, LEAD_STATUS.CLOSED, 'merchant', merchantId, reason)
  const fresh = await prisma.consultLead.findUnique({
    where: { id: leadId },
    include: { statusLogs: { orderBy: { createdAt: 'asc' } } },
  })
  return mapLeadRecord(fresh)
}

async function fetchMerchantLeadStats(storeId) {
  const [pending, contacted, closed] = await Promise.all([
    prisma.consultLead.count({
      where: { storeId, status: { in: [LEAD_STATUS.SUBMITTED, LEAD_STATUS.VIEWED] } },
    }),
    prisma.consultLead.count({ where: { storeId, status: LEAD_STATUS.CONTACTED } }),
    prisma.consultLead.count({
      where: { storeId, status: { in: [LEAD_STATUS.CANCELLED, LEAD_STATUS.CLOSED] } },
    }),
  ])
  return { pending, contacted, closed, total: pending + contacted + closed }
}

/** 联调期简化：返回固定门店信息 */
async function fetchLeadConfirm(_userId, params = {}) {
  const { serviceId, storeId, caseId, sourcePage } = params
  const demoStore = {
    id: storeId || 'store_demo_1',
    name: '辙见示范店（杭州滨江）',
    address: '杭州市滨江区江南大道 100 号',
    businessHours: '09:00-18:00',
    phone: '0571-88886666',
    bookable: true,
  }
  if (serviceId) {
    return {
      mode: 'service',
      service: {
        id: serviceId,
        name: '演示服务',
        categoryName: '保养',
        summary: '联调期演示服务',
        priceMode: 'fixed',
        amount: 399,
        bookable: true,
      },
      store: demoStore,
      isAccident: false,
      bookingDates: [],
      defaultContact: { name: '演示用户', phoneDisplay: '138****5678', isPhoneBound: true },
      storeInfoRows: [
        { label: '门店名称', value: demoStore.name },
        { label: '地址', value: demoStore.address },
      ],
      caseContext: caseId ? { caseId } : null,
      sourcePage: sourcePage || 'service',
    }
  }
  return {
    mode: 'message',
    service: null,
    store: demoStore,
    isAccident: false,
    bookingDates: [],
    defaultContact: { name: '演示用户', phoneDisplay: '138****5678', isPhoneBound: true },
    storeInfoRows: [
      { label: '门店名称', value: demoStore.name },
      { label: '地址', value: demoStore.address },
    ],
    caseContext: caseId ? { caseId } : null,
    sourcePage: sourcePage || 'store',
    descriptionHint: '简要描述车辆问题或咨询需求',
  }
}

module.exports = {
  createLead,
  listUserLeads,
  getUserLeadById,
  cancelUserLead,
  listMerchantLeads,
  getMerchantLeadById,
  markLeadViewed,
  markLeadContacted,
  closeMerchantLead,
  fetchMerchantLeadStats,
  fetchLeadConfirm,
}
