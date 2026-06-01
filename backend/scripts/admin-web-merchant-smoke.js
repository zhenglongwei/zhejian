/**
 * admin-web 商家审核联调：经 Vite 代理走与前端一致的 /api/v1 路径
 * 前置：backend :3000、admin-web :5174（npm run dev）
 * 用法：node scripts/admin-web-merchant-smoke.js
 */
require('dotenv').config()

const ADMIN_BASE = process.env.SMOKE_ADMIN_BASE || 'http://localhost:5174'
const API_BASE = `${ADMIN_BASE}/api/v1`
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin_change_me'
const { PrismaClient } = require('@prisma/client')
const { buildAuthSession } = require('../src/services/auth.service')

const prisma = new PrismaClient()

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Type': 'admin',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.code !== 0) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`)
  }
  return json.data
}

async function seedPendingMerchant() {
  const suffix = Date.now().toString(36)
  const userId = `user_adm_smoke_${suffix}`
  const merchantId = `mer_adm_smoke_${suffix}`
  const storeId = `store_adm_smoke_${suffix}`
  const phone = `138${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`
  const now = new Date()

  await prisma.user.create({
    data: { id: userId, nickname: 'admin-web联调', phone },
  })
  await prisma.merchant.create({
    data: {
      id: merchantId,
      name: `联调测试店-${suffix}`,
      ownerUserId: userId,
      contactName: '李联调',
      contactPhone: phone,
      status: 'PENDING_AUDIT',
      agreedAt: now,
      submittedAt: now,
      stores: {
        create: {
          id: storeId,
          name: `联调测试店-${suffix}`,
          address: '浙江省杭州市西湖区文三路508号',
          phone,
          servicesJson: ['小保养', '空调清洗'],
          status: 'PENDING_AUDIT',
        },
      },
    },
  })
  return { merchantId, storeId, phone, userId }
}

async function cleanup(ids) {
  await prisma.merchantReviewLog.deleteMany({ where: { merchantId: ids.merchantId } })
  await prisma.merchantStaff.deleteMany({ where: { merchantId: ids.merchantId } })
  await prisma.store.deleteMany({ where: { merchantId: ids.merchantId } })
  await prisma.merchant.deleteMany({ where: { id: ids.merchantId } })
  await prisma.user.deleteMany({ where: { id: ids.userId } })
}

async function main() {
  console.log('[admin-web-smoke] ADMIN_BASE', ADMIN_BASE)

  try {
    await fetch(`${ADMIN_BASE}/admin/`)
  } catch (e) {
    throw new Error(`admin-web 未启动，请先在 admin-web 目录执行 npm run dev（${ADMIN_BASE}）`)
  }

  const login = await api('POST', '/admin/auth/login', { body: { password: ADMIN_PASSWORD } })
  assert(login.token, '登录应返回 token')
  const token = login.token
  console.log('[admin-web-smoke] 登录 OK')

  const ids = await seedPendingMerchant()
  console.log('[admin-web-smoke] 种子待审商家', ids.merchantId)

  try {
    const list = await api('GET', '/admin/merchants?tab=pending&pageSize=50', { token })
    const row = (list.list || []).find((r) => r.merchantId === ids.merchantId)
    assert(row, '列表应包含种子商家')
    assert(row.phoneMasked.includes('****'), '列表手机号应脱敏')
    assert(row.phoneMasked !== ids.phone, '列表不应暴露完整手机号')
    console.log('[admin-web-smoke] 列表 OK', row.storeName, row.phoneMasked)

    const detail = await api('GET', `/admin/merchants/${ids.merchantId}`, { token })
    assert(detail.phoneMasked, '详情应有 phoneMasked')
    assert(detail.phone === undefined, '详情不应有 phone 字段')
    assert(detail.status === 'PENDING_AUDIT', '详情应为待审')
    assert(detail.services?.length === 2, '详情应有擅长服务')
    console.log('[admin-web-smoke] 详情 OK')

    const approved = await api('POST', `/admin/merchants/${ids.merchantId}/approve`, {
      token,
      body: { comment: 'admin-web联调通过' },
    })
    assert(approved.status === 'ACTIVE', '通过后应为 ACTIVE')
    assert(approved.reviewLogs?.length >= 1, '应有审核日志')
    console.log('[admin-web-smoke] 审核通过 OK')

    const listAfter = await api('GET', '/admin/merchants?tab=approved&pageSize=50', { token })
    assert(
      (listAfter.list || []).some((r) => r.merchantId === ids.merchantId),
      '已通过 Tab 应可见'
    )
    console.log('[admin-web-smoke] 已通过 Tab OK')

    const user = await prisma.user.findUnique({ where: { id: ids.userId } })
    const session = await buildAuthSession(user)
    assert(session.roles?.includes('merchant'), '商家用户 refresh 后应有 merchant 角色')
    console.log('[admin-web-smoke] 商家 JWT merchant 角色 OK')

    console.log('[admin-web-smoke] ✅ admin-web 商家审核 API 联调通过（经 Vite 代理）')
  } finally {
    await cleanup(ids)
  }
}

main()
  .catch((e) => {
    console.error('[admin-web-smoke] ❌', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
