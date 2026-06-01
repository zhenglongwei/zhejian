require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
;(async () => {
  const s = Date.now().toString(36)
  const userId = `user_ui_smoke_${s}`
  const merchantId = `mer_ui_smoke_${s}`
  const storeId = `store_ui_smoke_${s}`
  const phone = '13800138099'
  const now = new Date()
  await p.user.create({ data: { id: userId, nickname: 'UI联调', phone } })
  await p.merchant.create({
    data: {
      id: merchantId,
      name: 'UI联调测试店',
      ownerUserId: userId,
      contactName: '王测试',
      contactPhone: phone,
      status: 'PENDING_AUDIT',
      agreedAt: now,
      submittedAt: now,
      stores: {
        create: {
          id: storeId,
          name: 'UI联调测试店',
          address: '杭州市滨江区联调路1号',
          phone,
          servicesJson: ['小保养'],
          status: 'PENDING_AUDIT',
        },
      },
    },
  })
  console.log(JSON.stringify({ merchantId, userId, storeId }))
})()
  .finally(() => p.$disconnect())
