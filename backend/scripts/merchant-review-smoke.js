/**
 * B-MERCH-04 端到端冒烟：提交入驻 → 运营审核通过 → refresh-session 获得 merchant 角色
 * 用法：node scripts/merchant-review-smoke.js
 */
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { randomBytes } = require('crypto')

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const USER_TOKEN = process.env.DEV_USER_TOKEN || 'dev_user_token_change_me'
const ADMIN_TOKEN = process.env.DEV_ADMIN_TOKEN || process.env.DEV_SYSTEM_TOKEN || 'dev_system_token_change_me'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin_change_me'

const prisma = new PrismaClient()

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function api(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || (json.code != null && json.code !== 0)) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`)
  }
  return json.data
}

async function main() {
  console.log('[smoke] BASE', BASE)
  console.log('[smoke] MERCHANT_AUTO_APPROVE env =', process.env.MERCHANT_AUTO_APPROVE)

  const health = await api('GET', '/health')
  assert(health && health.ok !== false, 'health 失败')

  const suffix = Date.now().toString(36)
  const userId = `user_smoke_${suffix}`
  const phone = `139${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`

  await prisma.user.create({
    data: {
      id: userId,
      nickname: '冒烟用户',
      phone,
    },
  })
  console.log('[smoke] 创建用户', userId, phone)

  // 临时 dev token 映射：直接用 prisma + service 测 API 需 JWT。
  // 联调期用 dev auth middleware — 检查 auth 如何映射 token 到 user
  const { buildAuthSession } = require('../src/services/auth.service')
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const session = await buildAuthSession(user)
  const userJwt = session.token
  assert(userJwt, '无法签发用户 JWT')

  const demoPhoto = 'https://geo.simplewin.cn/api/v1/media/files/uploads/smoke/license.jpg'

  const submitBody = {
    storeName: `冒烟测试店-${suffix}`,
    contactName: '张测试',
    phone,
    storePhone: phone,
    address: '浙江省杭州市滨江区网商路599号',
    latitude: 30.1895,
    longitude: 120.1902,
    businessHours: '09:00-18:00',
    services: ['小保养', '刹车片更换'],
    legalName: `冒烟主体-${suffix}`,
    creditCode: '91330108MA2XXXXXX',
    licensePhotoUrl: demoPhoto,
    qualificationType: 'class_3',
    qualificationPhotoUrl: demoPhoto,
    facadePhotoUrl: demoPhoto,
    workshopPhotoUrls: [demoPhoto],
    agreed: true,
  }

  const submitRes = await api('POST', '/merchant/onboarding/submit', {
    token: userJwt,
    body: submitBody,
  })
  assert(submitRes.profile?.status === 'pending', `提交后应为 pending，实际 ${submitRes.profile?.status}`)
  assert(!submitRes.session, 'MERCHANT_AUTO_APPROVE=false 时不应返回 session')
  const merchantId = submitRes.profile.merchantId
  console.log('[smoke] 提交成功 pending', merchantId)

  const listPending = await api('GET', '/admin/merchants?tab=pending', {
    token: ADMIN_TOKEN,
    headers: { 'X-Client-Type': 'admin' },
  })
  const found = (listPending.list || []).find((r) => r.merchantId === merchantId)
  assert(found, '运营列表应包含待审商家')
  assert(found.phoneMasked && !found.phoneMasked.includes(phone.slice(-8)), '列表应脱敏手机号')
  console.log('[smoke] 运营列表命中', found.phoneMasked)

  const detail = await api('GET', `/admin/merchants/${merchantId}`, {
    token: ADMIN_TOKEN,
    headers: { 'X-Client-Type': 'admin' },
  })
  assert(detail.phoneMasked, '详情应有 phoneMasked')
  assert(!detail.phone, '详情不应返回完整 phone 字段')
  assert(detail.agreedAt, '详情应有 agreedAt')
  console.log('[smoke] 详情 phoneMasked=', detail.phoneMasked)

  const approved = await api('POST', `/admin/merchants/${merchantId}/approve`, {
    token: ADMIN_TOKEN,
    headers: { 'X-Client-Type': 'admin' },
    body: { comment: '冒烟通过' },
  })
  assert(approved.status === 'ACTIVE', `通过后应为 ACTIVE，实际 ${approved.status}`)
  assert(approved.reviewLogs?.length >= 1, '应有审核日志')
  console.log('[smoke] 运营审核通过')

  const refreshed = await api('POST', '/merchant/auth/refresh-session', { token: userJwt })
  assert(refreshed.roles?.includes('merchant'), `refresh 后应有 merchant 角色: ${JSON.stringify(refreshed.roles)}`)
  assert(refreshed.merchant?.merchantId === merchantId, 'refresh 应返回 merchantId')
  console.log('[smoke] refresh-session OK', refreshed.merchant)

  // 清理
  await prisma.merchantReviewLog.deleteMany({ where: { merchantId } })
  await prisma.merchantStaff.deleteMany({ where: { merchantId } })
  const store = await prisma.store.findFirst({ where: { merchantId } })
  if (store) await prisma.store.delete({ where: { id: store.id } })
  await prisma.merchant.delete({ where: { id: merchantId } })
  await prisma.user.delete({ where: { id: userId } })
  console.log('[smoke] ✅ B-MERCH-04 全流程通过')
}

main()
  .catch((e) => {
    console.error('[smoke] ❌', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
