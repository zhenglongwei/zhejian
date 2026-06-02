/**
 * M-LEAD-07 咨询线索 prod 冒烟：
 * 用户提交 → 商家 stats/列表/详情 → 已查看 → 已联系 → 关闭 → 用户端状态同步
 *
 * 用法：
 *   node scripts/merchant-leads-smoke.js
 *   SMOKE_BASE_URL=https://geo.simplewin.cn node scripts/merchant-leads-smoke.js
 *
 * 依赖：API 已启动；本地需 db:seed（store_demo_1 / merchant_demo_1）；JWT_SECRET 或 DEV_AUTH_ENABLED
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { LEAD_STATUS } = require('../src/constants/v2')

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const STORE_ID = process.env.SMOKE_STORE_ID || 'store_demo_1'
const MERCHANT_OWNER_ID = process.env.SMOKE_MERCHANT_USER_ID || 'user_demo_1'
const DEV_USER_TOKEN = process.env.DEV_USER_TOKEN || 'dev_user_token_change_me'

const prisma = new PrismaClient()

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function api(method, path, { token, body, query } = {}) {
  const qs =
    query && Object.keys(query).length
      ? `?${new URLSearchParams(query).toString()}`
      : ''
  const res = await fetch(`${BASE}/api/v1${path}${qs}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || (json.code != null && json.code !== 0)) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`)
  }
  return json.data
}

function assertMaskedPhone(display, rawPhone) {
  assert(display && typeof display === 'string', '缺少 phoneDisplay')
  assert(/\*{2,}/.test(display), `手机号应脱敏展示: ${display}`)
  if (rawPhone && rawPhone.length >= 7) {
    assert(display.startsWith(rawPhone.slice(0, 3)), '脱敏应保留前三位')
    assert(display.endsWith(rawPhone.slice(-4)), '脱敏应保留后四位')
    assert(display !== rawPhone, '不应返回完整明文手机号字段到 phoneDisplay')
  }
}

async function resolveMerchantToken() {
  const { buildAuthSession } = require('../src/services/auth.service')
  const owner = await prisma.user.findUnique({ where: { id: MERCHANT_OWNER_ID } })
  assert(owner, `商家账号不存在: ${MERCHANT_OWNER_ID}，请先 db:seed`)
  const session = await buildAuthSession(owner)
  if (session.roles?.includes('merchant')) {
    return { token: session.token, merchantId: session.merchant.merchantId }
  }
  if (process.env.DEV_AUTH_ENABLED === 'true' || process.env.NODE_ENV !== 'production') {
    return { token: DEV_USER_TOKEN, merchantId: 'merchant_demo_1', viaDev: true }
  }
  throw new Error('商家 JWT 无 merchant 角色，且未启用 dev token')
}

async function cleanupLead(leadId, userId) {
  if (!leadId) return
  await prisma.leadStatusLog.deleteMany({ where: { leadId } })
  await prisma.consultLead.deleteMany({ where: { id: leadId } })
  if (userId) {
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {})
  }
}

async function main() {
  console.log('[smoke] BASE', BASE)
  console.log('[smoke] STORE', STORE_ID)

  const health = await api('GET', '/health')
  assert(health && health.ok !== false, 'health 失败')

  const store = await prisma.store.findUnique({ where: { id: STORE_ID } })
  assert(store && store.status === 'ACTIVE', `门店 ${STORE_ID} 不可用，请 db:seed`)

  const suffix = Date.now().toString(36)
  const submitterId = `user_lead_smoke_${suffix}`
  const submitterPhone = `137${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`

  await prisma.user.create({
    data: {
      id: submitterId,
      nickname: '线索冒烟用户',
      phone: submitterPhone,
    },
  })

  const { buildAuthSession } = require('../src/services/auth.service')
  const submitter = await prisma.user.findUnique({ where: { id: submitterId } })
  const submitterSession = await buildAuthSession(submitter)
  const submitterToken = submitterSession.token
  assert(submitterToken, '无法签发提交用户 JWT')

  const merchantAuth = await resolveMerchantToken()
  console.log('[smoke] 商家 token', merchantAuth.viaDev ? 'dev' : 'jwt')

  let leadId = null

  try {
    const confirm = await api('GET', '/user/leads/confirm', {
      token: submitterToken,
      query: { storeId: STORE_ID, sourcePage: 'service' },
    })
    assert(confirm.mode === 'message' || confirm.store?.id === STORE_ID, 'confirm 门店不匹配')
    console.log('[smoke] GET /user/leads/confirm OK')

    const created = await api('POST', '/user/leads', {
      token: submitterToken,
      body: {
        storeId: STORE_ID,
        storeName: store.name,
        storePhone: store.phone || '',
        sourcePage: 'service',
        leadType: 'message',
        description: `M-LEAD-07 冒烟 ${suffix}`,
        platformConsent: true,
        contact: {
          name: '冒烟联系人',
          phone: submitterPhone,
        },
        vehicle: { brand: '测试品牌', series: '测试车系' },
        appointment: { dateLabel: '明天', slot: '10:00-11:00' },
      },
    })
    leadId = created.id
    assert(created.status === LEAD_STATUS.SUBMITTED, `提交后应为 SUBMITTED，实际 ${created.status}`)
    assertMaskedPhone(created.contact?.phoneDisplay, submitterPhone)
    console.log('[smoke] POST /user/leads', leadId)

    const userList = await api('GET', '/user/leads', { token: submitterToken })
    assert((userList.list || []).some((l) => l.id === leadId), '用户列表应含新线索')

    const statsBefore = await api('GET', '/merchant/leads/stats', {
      token: merchantAuth.token,
    })
    assert(statsBefore.pending >= 1, `待处理角标应 ≥1，实际 ${statsBefore.pending}`)
    console.log('[smoke] GET /merchant/leads/stats pending=', statsBefore.pending)

    const pendingList = await api('GET', '/merchant/leads', {
      token: merchantAuth.token,
      query: { tab: 'pending' },
    })
    const inPending = (pendingList.list || []).find((l) => l.id === leadId)
    assert(inPending, '商家待处理列表应含新线索')
    assertMaskedPhone(inPending.contact?.phoneDisplay, submitterPhone)
    console.log('[smoke] GET /merchant/leads?tab=pending OK')

    const detail = await api('GET', `/merchant/leads/${leadId}`, {
      token: merchantAuth.token,
    })
    assert(detail.id === leadId, '详情 id 不一致')
    assertMaskedPhone(detail.contact?.phoneDisplay, submitterPhone)
    console.log('[smoke] GET /merchant/leads/:id OK')

    const viewed = await api('POST', `/merchant/leads/${leadId}/view`, {
      token: merchantAuth.token,
    })
    assert(viewed.status === LEAD_STATUS.VIEWED, `view 后应为 VIEWED，实际 ${viewed.status}`)
    console.log('[smoke] POST .../view OK')

    const contacted = await api('POST', `/merchant/leads/${leadId}/contact`, {
      token: merchantAuth.token,
      body: { note: '冒烟已电话联系' },
    })
    assert(
      contacted.status === LEAD_STATUS.CONTACTED,
      `contact 后应为 CONTACTED，实际 ${contacted.status}`
    )
    console.log('[smoke] POST .../contact OK')

    const contactedList = await api('GET', '/merchant/leads', {
      token: merchantAuth.token,
      query: { tab: 'contacted' },
    })
    assert(
      (contactedList.list || []).some((l) => l.id === leadId),
      '已联系 Tab 应含该线索'
    )

    const closed = await api('POST', `/merchant/leads/${leadId}/close`, {
      token: merchantAuth.token,
      body: { reason: 'VISITED', note: '冒烟闭环' },
    })
    assert(closed.status === LEAD_STATUS.CLOSED, `close 后应为 CLOSED，实际 ${closed.status}`)
    assert(closed.closeReason === 'VISITED', '关闭原因应落库')
    console.log('[smoke] POST .../close OK')

    const userDetail = await api('GET', `/user/leads/${leadId}`, {
      token: submitterToken,
    })
    assert(userDetail.status === LEAD_STATUS.CLOSED, '用户端详情应同步为 CLOSED')
    console.log('[smoke] 用户端状态同步 OK')

    const closedList = await api('GET', '/merchant/leads', {
      token: merchantAuth.token,
      query: { tab: 'closed' },
    })
    assert(
      (closedList.list || []).some((l) => l.id === leadId),
      '已关闭 Tab 应含该线索'
    )

    console.log('[smoke] ✅ M-LEAD-07 线索全流程通过')
  } finally {
    await cleanupLead(leadId, submitterId)
    console.log('[smoke] 清理测试数据', leadId || '(无)')
  }
}

main()
  .catch((e) => {
    console.error('[smoke] ❌', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
