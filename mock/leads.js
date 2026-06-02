/**
 * MOCK: 用户咨询线索 — R2
 * 联调后由 services/lead.js 接 /api/user/leads
 *
 * 图片字段存本地 tempFilePath，仅咨询私密上下文；不上传至公开/H5。
 * 联调后须使用私有 bucket / consult 专用存储，与公开案例、服务相册 CDN 隔离。
 */
const { LEAD_STATUS } = require('../constants/lead-status')
const { LEAD_CLOSE_REASON } = require('../constants/lead-close-reason')
const { PRICE_MODE } = require('../constants/price-mode')
const { buildBookingDates } = require('../constants/booking-slots')
const { getSession } = require('../utils/auth')
const { maskPhone } = require('../utils/auth')
const { MERCHANT_LEAD_TAB_STATUS_MAP } = require('../constants/merchant-lead-tabs')
const { findStore } = require('../services/store')
const { findRawService } = require('../services/service')

const STORAGE_KEY = 'user_leads_v1'
const SEED_VERSION = 1
const SEED_VERSION_KEY = 'user_leads_seed_version'

function delay(ms = 320) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadLeads() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || []
  } catch (e) {
    return []
  }
}

function saveLeads(list) {
  wx.setStorageSync(STORAGE_KEY, list)
}

function getCurrentUserId() {
  const session = getSession()
  const user = session.user || {}
  return user.userId || 'usr_mock_001'
}

function isStoreBookable(store) {
  if (!store) return false
  return store.status === 'open'
}

function buildDemoLeads(userId) {
  const now = Date.now()
  const iso = (offsetMin) => new Date(now - offsetMin * 60000).toISOString()
  return [
    {
      id: 'lead_demo_submitted',
      userId,
      status: LEAD_STATUS.SUBMITTED,
      serviceId: 'svc_seed_1',
      serviceName: '小保养套餐',
      storeId: 'store_demo_1',
      storeName: '辙见示范店（杭州滨江）',
      storePhone: '0571-88886666',
      vehicle: { brand: '宝马', series: '3 系' },
      description: '近期保养到期，想了解套餐包含项目和预约时间。',
      images: [],
      appointment: { dateLabel: '明天', slot: '09:00-10:00', date: 'demo-date' },
      contact: { name: '张先生', phone: '13812345678', phoneDisplay: '138****5678' },
      isAccident: false,
      priceMode: PRICE_MODE.FIXED,
      platformConsent: true,
      createdAt: iso(120),
      updatedAt: iso(120),
      statusLogs: [
        {
          fromStatus: null,
          toStatus: LEAD_STATUS.SUBMITTED,
          operatorType: 'user',
          createdAt: iso(120),
        },
      ],
    },
    {
      id: 'lead_demo_contacted',
      userId,
      status: LEAD_STATUS.CONTACTED,
      serviceId: 'svc_seed_2',
      serviceName: '刹车片更换',
      storeId: 'store_demo_1',
      storeName: '辙见示范店（杭州滨江）',
      storePhone: '0571-88886666',
      vehicle: { brand: '大众', series: '帕萨特' },
      description: '刹车有异响，想先咨询是否需要更换。',
      images: [],
      appointment: { dateLabel: '后天', slot: '14:00-15:00', date: 'demo-date-2' },
      contact: { name: '李女士', phone: '13912341234', phoneDisplay: '139****1234' },
      isAccident: false,
      priceMode: PRICE_MODE.RANGE,
      platformConsent: true,
      createdAt: iso(3600),
      updatedAt: iso(1800),
      statusLogs: [
        {
          fromStatus: null,
          toStatus: LEAD_STATUS.SUBMITTED,
          operatorType: 'user',
          createdAt: iso(3600),
        },
        {
          fromStatus: LEAD_STATUS.SUBMITTED,
          toStatus: LEAD_STATUS.VIEWED,
          operatorType: 'merchant',
          createdAt: iso(3000),
        },
        {
          fromStatus: LEAD_STATUS.VIEWED,
          toStatus: LEAD_STATUS.CONTACTED,
          operatorType: 'merchant',
          createdAt: iso(1800),
        },
      ],
    },
  ]
}

function loadLeadsWithSeed() {
  const userId = getCurrentUserId()
  let list = loadLeads()
  const version = wx.getStorageSync(SEED_VERSION_KEY) || 0
  if (version < SEED_VERSION) {
    const existingIds = new Set(list.map((l) => l.id))
    const demos = buildDemoLeads(userId).filter((d) => !existingIds.has(d.id))
    if (demos.length) {
      list = demos.concat(list)
      saveLeads(list)
    }
    wx.setStorageSync(SEED_VERSION_KEY, SEED_VERSION)
  }
  return list
}

function appendStatusLog(lead, toStatus, operatorType = 'user', reason = '') {
  const log = {
    fromStatus: lead.status,
    toStatus,
    operatorType,
    reason,
    createdAt: new Date().toISOString(),
  }
  lead.statusLogs = (lead.statusLogs || []).concat(log)
  lead.status = toStatus
  lead.updatedAt = log.createdAt
}

async function mockFetchLeadConfirm({ serviceId, storeId, caseId, sourcePage }) {
  await delay()

  if (serviceId) {
    const record = findRawService(serviceId, 'user')
    if (!record || record.status !== 'published') {
      const err = new Error('该服务已下架，请查看其他服务')
      err.code = 404
      throw err
    }

    const sid = storeId || record.storeId
    const store = sid ? findStore(sid) : null
    if (!store) {
      const err = new Error('门店不存在')
      err.code = 404
      throw err
    }
    if (!isStoreBookable(store)) {
      const err = new Error('该门店暂不可预约')
      err.code = 409
      throw err
    }

    const session = getSession()
    const user = session.user || {}
    const bookingDates = buildBookingDates(7)
    const isAccident = record.priceMode === PRICE_MODE.ACCIDENT

    return {
      mode: 'service',
      service: {
        id: record.id,
        name: record.name,
        categoryName: record.categoryName,
        summary: record.summary,
        priceMode: record.priceMode,
        amount: record.amount,
        minAmount: record.minAmount,
        maxAmount: record.maxAmount,
        bookable: true,
      },
      store: buildStoreConfirm(store),
      isAccident,
      bookingDates,
      defaultContact: buildDefaultContact(user),
      storeInfoRows: buildStoreInfoRows(store),
      caseContext: caseId ? { caseId } : null,
      sourcePage: sourcePage || 'service',
    }
  }

  if (!storeId) {
    const err = new Error('缺少门店信息')
    err.code = 400
    throw err
  }

  const store = findStore(storeId)
  if (!store) {
    const err = new Error('门店不存在')
    err.code = 404
    throw err
  }
  if (!isStoreBookable(store)) {
    const err = new Error('该门店暂不可留言')
    err.code = 409
    throw err
  }

  const session = getSession()
  const user = session.user || {}
  const bookingDates = buildBookingDates(7)

  return {
    mode: 'message',
    service: null,
    store: buildStoreConfirm(store),
    isAccident: false,
    bookingDates,
    defaultContact: buildDefaultContact(user),
    storeInfoRows: buildStoreInfoRows(store),
    caseContext: caseId ? { caseId } : null,
    sourcePage: sourcePage || 'store',
    descriptionHint: caseId
      ? '可参考你浏览的案例，简要描述车辆问题或咨询需求'
      : '简要描述车辆问题或咨询需求',
  }
}

function buildStoreConfirm(store) {
  return {
    id: store.id,
    name: store.name,
    address: store.address,
    businessHours: store.businessHours || '—',
    phone: store.phone || '',
    bookable: isStoreBookable(store),
  }
}

function buildDefaultContact(user) {
  const phone = user.phone || ''
  return {
    name: '',
    phone,
    phoneDisplay: user.phoneDisplay || (phone ? maskPhone(phone) : ''),
    isPhoneBound: Boolean(user.isPhoneBound || phone),
  }
}

function buildStoreInfoRows(store) {
  return [
    { label: '门店名称', value: store.name },
    { label: '地址', value: store.address },
    { label: '营业时间', value: store.businessHours || '—' },
  ]
}

async function mockCreateLead(payload) {
  await delay(400)
  const userId = getCurrentUserId()
  const session = getSession()
  const user = session.user || {}
  const contactPhone = user.phone || payload.contact?.phone || ''
  const id = `lead_${Date.now()}`
  const now = new Date().toISOString()
  const lead = {
    id,
    userId,
    status: LEAD_STATUS.SUBMITTED,
    serviceId: payload.serviceId || '',
    serviceName: payload.serviceName || '',
    storeId: payload.storeId,
    storeName: payload.storeName,
    storePhone: payload.storePhone || '',
    caseId: payload.caseId || '',
    sourcePage: payload.sourcePage || '',
    leadType: payload.leadType || (payload.serviceId ? 'service' : 'message'),
    vehicle: payload.vehicle || {},
    description: payload.description || '',
    images: payload.images || [],
    appointment: payload.appointment || {},
    contact: {
      name: payload.contact?.name || '',
      phone: contactPhone,
      phoneDisplay:
        user.phoneDisplay ||
        payload.contact?.phoneDisplay ||
        (contactPhone ? maskPhone(contactPhone) : ''),
    },
    isAccident: Boolean(payload.isAccident),
    priceMode: payload.priceMode || '',
    platformConsent: Boolean(payload.platformConsent),
    createdAt: now,
    updatedAt: now,
    statusLogs: [
      {
        fromStatus: null,
        toStatus: LEAD_STATUS.SUBMITTED,
        operatorType: 'user',
        createdAt: now,
      },
    ],
  }
  const list = loadLeadsWithSeed()
  list.unshift(lead)
  saveLeads(list)
  return lead
}

async function mockFetchUserLeads() {
  await delay(200)
  const userId = getCurrentUserId()
  return loadLeadsWithSeed()
    .filter((l) => l.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

async function mockGetLeadById(leadId) {
  await delay(180)
  const userId = getCurrentUserId()
  const lead = loadLeadsWithSeed().find((l) => l.id === leadId)
  if (!lead) {
    const err = new Error('咨询记录不存在')
    err.code = 404
    throw err
  }
  if (lead.userId !== userId) {
    const err = new Error('无权查看该咨询')
    err.code = 403
    throw err
  }
  return lead
}

async function mockCancelLead(leadId) {
  await delay(280)
  const userId = getCurrentUserId()
  const list = loadLeadsWithSeed()
  const index = list.findIndex((l) => l.id === leadId && l.userId === userId)
  if (index < 0) {
    const err = new Error('咨询记录不存在')
    err.code = 404
    throw err
  }
  const lead = list[index]
  if (![LEAD_STATUS.SUBMITTED, LEAD_STATUS.VIEWED].includes(lead.status)) {
    const err = new Error('当前状态不可取消')
    err.code = 409
    throw err
  }
  appendStatusLog(lead, LEAD_STATUS.CANCELLED, 'user', 'USER_CANCELLED')
  list[index] = lead
  saveLeads(list)
  return lead
}

function filterMerchantLeads(list, storeId, tab) {
  let filtered = list.filter((l) => l.storeId === storeId)
  const allowed = MERCHANT_LEAD_TAB_STATUS_MAP[tab]
  if (allowed) {
    filtered = filtered.filter((item) => allowed.includes(item.status))
  }
  return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

function findMerchantLeadIndex(list, leadId, storeId) {
  return list.findIndex((l) => l.id === leadId && l.storeId === storeId)
}

async function mockFetchMerchantLeads({ storeId, tab } = {}) {
  await delay(200)
  if (!storeId) {
    const err = new Error('缺少门店信息')
    err.code = 400
    throw err
  }
  return filterMerchantLeads(loadLeadsWithSeed(), storeId, tab || 'pending')
}

async function mockGetMerchantLeadById(leadId, storeId) {
  await delay(180)
  if (!storeId) {
    const err = new Error('缺少门店信息')
    err.code = 400
    throw err
  }
  const lead = loadLeadsWithSeed().find((l) => l.id === leadId && l.storeId === storeId)
  if (!lead) {
    const err = new Error('咨询线索不存在')
    err.code = 404
    throw err
  }
  return lead
}

async function mockMarkLeadViewed(leadId, storeId) {
  await delay(160)
  const list = loadLeadsWithSeed()
  const index = findMerchantLeadIndex(list, leadId, storeId)
  if (index < 0) {
    const err = new Error('咨询线索不存在')
    err.code = 404
    throw err
  }
  const lead = list[index]
  if (lead.status !== LEAD_STATUS.SUBMITTED) {
    return lead
  }
  appendStatusLog(lead, LEAD_STATUS.VIEWED, 'merchant')
  list[index] = lead
  saveLeads(list)
  return lead
}

async function mockMarkLeadContacted(leadId, storeId, note = '') {
  await delay(220)
  const list = loadLeadsWithSeed()
  const index = findMerchantLeadIndex(list, leadId, storeId)
  if (index < 0) {
    const err = new Error('咨询线索不存在')
    err.code = 404
    throw err
  }
  const lead = list[index]
  if (![LEAD_STATUS.SUBMITTED, LEAD_STATUS.VIEWED, LEAD_STATUS.CONTACTED].includes(lead.status)) {
    const err = new Error('当前状态不可标记已联系')
    err.code = 409
    throw err
  }
  if (lead.status !== LEAD_STATUS.CONTACTED) {
    appendStatusLog(lead, LEAD_STATUS.CONTACTED, 'merchant', note)
    if (note) lead.contactNote = note
    list[index] = lead
    saveLeads(list)
  }
  return lead
}

async function mockCloseLead(leadId, storeId, { reason, note = '' } = {}) {
  await delay(260)
  if (!reason) {
    const err = new Error('请选择关闭原因')
    err.code = 400
    throw err
  }
  if (reason === LEAD_CLOSE_REASON.OTHER && !note.trim()) {
    const err = new Error('请填写关闭说明')
    err.code = 400
    throw err
  }
  const list = loadLeadsWithSeed()
  const index = findMerchantLeadIndex(list, leadId, storeId)
  if (index < 0) {
    const err = new Error('咨询线索不存在')
    err.code = 404
    throw err
  }
  const lead = list[index]
  if ([LEAD_STATUS.CANCELLED, LEAD_STATUS.CLOSED].includes(lead.status)) {
    const err = new Error('线索已关闭')
    err.code = 409
    throw err
  }
  appendStatusLog(lead, LEAD_STATUS.CLOSED, 'merchant', reason)
  lead.closeReason = reason
  if (note.trim()) lead.closeNote = note.trim()
  list[index] = lead
  saveLeads(list)
  return lead
}

async function mockFetchMerchantLeadStats(storeId) {
  await delay(120)
  if (!storeId) {
    return { pending: 0, contacted: 0, closed: 0 }
  }
  const list = loadLeadsWithSeed().filter((l) => l.storeId === storeId)
  const pendingStatuses = MERCHANT_LEAD_TAB_STATUS_MAP.pending
  const contactedStatuses = MERCHANT_LEAD_TAB_STATUS_MAP.contacted
  const closedStatuses = MERCHANT_LEAD_TAB_STATUS_MAP.closed
  return {
    pending: list.filter((l) => pendingStatuses.includes(l.status)).length,
    contacted: list.filter((l) => contactedStatuses.includes(l.status)).length,
    closed: list.filter((l) => closedStatuses.includes(l.status)).length,
  }
}

module.exports = {
  mockFetchLeadConfirm,
  mockCreateLead,
  mockFetchUserLeads,
  mockGetLeadById,
  mockCancelLead,
  mockFetchMerchantLeads,
  mockGetMerchantLeadById,
  mockMarkLeadViewed,
  mockMarkLeadContacted,
  mockCloseLead,
  mockFetchMerchantLeadStats,
  loadLeads: loadLeadsWithSeed,
}
