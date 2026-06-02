require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { LEAD_STATUS } = require('../src/constants/v2')
const { SEED_SERVICES } = require('../src/constants/content-seed')
const {
  PLAN_AUDIT_STATUS,
  PLAN_SALE_STATUS,
} = require('../src/constants/service-plan')

const prisma = new PrismaClient()

const ORDER_ID = 'ord_demo_completed_album'
const LEGACY_ALBUM_ID = `alb_${ORDER_ID}`
const SERVICE_ALBUM_ID = 'alb_svc_demo_completed'
const USER_ID = 'user_demo_1'
const MERCHANT_ID = 'merchant_demo_1'
const STORE_ID = 'store_demo_1'
const USER_PHONE = '13812345678'

function mockImageUrl(albumId, nodeId, index) {
  return `https://geo.simplewin.cn/media/raw/${albumId}/${nodeId}/${index}.jpg`
}

const STAGE_NODES = [
  { nodeId: 'stage_1', title: '接车记录', sortOrder: 0, status: 'completed', note: '车辆已登记。' },
  { nodeId: 'stage_2', title: '检测诊断', sortOrder: 1, status: 'completed', note: '机油液位正常。' },
  { nodeId: 'stage_3', title: '方案与报价', sortOrder: 2, status: 'completed', note: '参考总价 ¥380–480。' },
  { nodeId: 'stage_4', title: '配件告知', sortOrder: 3, status: 'completed', note: '使用原厂机油机滤。' },
  { nodeId: 'stage_5', title: '施工记录', sortOrder: 4, status: 'completed', note: '更换机油机滤完成。' },
  { nodeId: 'stage_6', title: '完工交付', sortOrder: 5, status: 'completed', note: '完工检查通过。' },
]

async function seedServiceAlbum(albumId, options = {}) {
  const imageDefs = [
    { nodeId: 'stage_1', count: 2 },
    { nodeId: 'stage_2', count: 1 },
    { nodeId: 'stage_5', count: 2 },
    { nodeId: 'stage_6', count: 1 },
  ]
  let imageCount = 0
  const images = []
  imageDefs.forEach((def) => {
    for (let i = 0; i < def.count; i += 1) {
      images.push({
        id: `img_${albumId}_${def.nodeId}_${i}`,
        albumId,
        nodeId: def.nodeId,
        idx: i,
        rawUrl: mockImageUrl(albumId, def.nodeId, i),
      })
      imageCount += 1
    }
  })

  await prisma.album.upsert({
    where: { id: albumId },
    create: {
      id: albumId,
      orderId: options.orderId || null,
      userId: USER_ID,
      merchantId: MERCHANT_ID,
      storeId: STORE_ID,
      storeName: '辙见示范店（杭州滨江）',
      serviceId: options.serviceId || 'svc_seed_1',
      serviceName: options.serviceName || '小保养套餐',
      userPhone: USER_PHONE,
      complexityLevel: 'L1',
      vehicleJson: {
        brand: '大众',
        series: '朗逸',
        plateDisplay: '浙A****8',
      },
      priceMode: 'range',
      minAmount: 380,
      maxAmount: 480,
      partsJson: [],
      pendingConfirmsJson: [],
      status: options.status || 'completed',
      templateId: 'maintenance',
      templateName: '保养服务',
      publicCaseStatus: 'private',
      imageCount,
      completedAt: new Date(),
      nodes: { create: STAGE_NODES },
    },
    update: {
      userId: USER_ID,
      merchantId: MERCHANT_ID,
      storeId: STORE_ID,
      storeName: '辙见示范店（杭州滨江）',
      serviceName: options.serviceName || '小保养套餐',
      userPhone: USER_PHONE,
      status: options.status || 'completed',
      imageCount,
      completedAt: new Date(),
      nodes: { deleteMany: {}, create: STAGE_NODES },
    },
  })

  await prisma.albumImage.deleteMany({ where: { albumId } })
  if (images.length) {
    await prisma.albumImage.createMany({ data: images })
  }
}

async function seedLeads() {
  const leads = [
    {
      id: 'lead_demo_submitted',
      status: LEAD_STATUS.SUBMITTED,
      serviceId: 'svc_seed_1',
      serviceName: '小保养套餐',
      description: '近期保养到期，想了解套餐包含项目和预约时间。',
      appointmentJson: { dateLabel: '明天', slot: '09:00-10:00' },
    },
    {
      id: 'lead_demo_contacted',
      status: LEAD_STATUS.CONTACTED,
      serviceId: 'svc_seed_2',
      serviceName: '刹车片更换',
      description: '刹车有异响，想先咨询是否需要更换。',
      appointmentJson: { dateLabel: '后天', slot: '14:00-15:00' },
    },
  ]

  for (const item of leads) {
    await prisma.consultLead.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        userId: USER_ID,
        status: item.status,
        serviceId: item.serviceId,
        serviceName: item.serviceName,
        storeId: STORE_ID,
        storeName: '辙见示范店（杭州滨江）',
        storePhone: '0571-88886666',
        leadType: 'service',
        vehicleJson: { brand: '大众', series: '帕萨特' },
        description: item.description,
        imagesJson: [],
        appointmentJson: item.appointmentJson,
        contactJson: {
          name: '演示用户',
          phone: USER_PHONE,
          phoneDisplay: '138****5678',
        },
        priceMode: 'fixed',
        platformConsent: true,
        statusLogs: {
          create: {
            fromStatus: null,
            toStatus: LEAD_STATUS.SUBMITTED,
            operatorType: 'user',
            operatorId: USER_ID,
          },
        },
      },
      update: {
        status: item.status,
        description: item.description,
      },
    })
  }
}

async function seedServicePlans() {
  for (const seed of SEED_SERVICES) {
    await prisma.merchantServicePlan.upsert({
      where: { id: seed.id },
      create: {
        id: seed.id,
        merchantId: MERCHANT_ID,
        storeId: seed.storeId,
        serviceItemId: seed.serviceItemId,
        categoryId: seed.categoryId,
        name: seed.name,
        summary: seed.summary,
        detail: seed.detail,
        priceMode: seed.priceMode,
        amount: seed.amount,
        minAmount: seed.minAmount,
        maxAmount: seed.maxAmount,
        priceFactors: seed.priceFactors || [],
        includedItems: [],
        excludedItems: [],
        appointmentJson: {},
        auditStatus: PLAN_AUDIT_STATUS.APPROVED,
        saleStatus: PLAN_SALE_STATUS.ONLINE,
        acceptAppointment: true,
        approvedAt: new Date('2026-05-15'),
        publishedAt: new Date(seed.publishedAt || '2026-05-15'),
        submittedAt: new Date('2026-05-14'),
      },
      update: {
        merchantId: MERCHANT_ID,
        storeId: seed.storeId,
        name: seed.name,
        summary: seed.summary,
        detail: seed.detail,
        priceMode: seed.priceMode,
        amount: seed.amount,
        minAmount: seed.minAmount,
        maxAmount: seed.maxAmount,
        priceFactors: seed.priceFactors || [],
        auditStatus: PLAN_AUDIT_STATUS.APPROVED,
        saleStatus: PLAN_SALE_STATUS.ONLINE,
        acceptAppointment: true,
        publishedAt: new Date(seed.publishedAt || '2026-05-15'),
      },
    })
  }
}

async function main() {
  await prisma.user.upsert({
    where: { id: USER_ID },
    create: {
      id: USER_ID,
      openid: 'dev_openid_demo_1',
      nickname: '演示用户',
      phone: USER_PHONE,
    },
    update: {
      openid: 'dev_openid_demo_1',
      nickname: '演示用户',
      phone: USER_PHONE,
    },
  })

  await prisma.merchant.upsert({
    where: { id: MERCHANT_ID },
    create: {
      id: MERCHANT_ID,
      name: '辙见示范商家',
      status: 'ACTIVE',
      ownerUserId: USER_ID,
      contactName: '演示负责人',
      contactPhone: USER_PHONE,
      approvedAt: new Date(),
    },
    update: {
      name: '辙见示范商家',
      status: 'ACTIVE',
      ownerUserId: USER_ID,
      contactName: '演示负责人',
      contactPhone: USER_PHONE,
    },
  })

  await prisma.store.upsert({
    where: { id: STORE_ID },
    create: {
      id: STORE_ID,
      merchantId: MERCHANT_ID,
      name: '辙见示范店（杭州滨江）',
      address: '杭州市滨江区演示路 1 号',
      phone: USER_PHONE,
      servicesJson: ['小保养', '刹车片更换'],
      status: 'ACTIVE',
    },
    update: {
      merchantId: MERCHANT_ID,
      name: '辙见示范店（杭州滨江）',
      address: '杭州市滨江区演示路 1 号',
      phone: USER_PHONE,
      servicesJson: ['小保养', '刹车片更换'],
      status: 'ACTIVE',
    },
  })

  await prisma.merchantStaff.upsert({
    where: {
      merchantId_userId: {
        merchantId: MERCHANT_ID,
        userId: USER_ID,
      },
    },
    create: {
      id: 'staff_demo_1',
      merchantId: MERCHANT_ID,
      userId: USER_ID,
      storeId: STORE_ID,
      role: 'owner',
      status: 'ACTIVE',
    },
    update: {
      storeId: STORE_ID,
      role: 'owner',
      status: 'ACTIVE',
    },
  })

  await prisma.order.upsert({
    where: { id: ORDER_ID },
    create: {
      id: ORDER_ID,
      userId: USER_ID,
      status: 'COMPLETED',
      serviceName: '刹车片更换',
      storeId: STORE_ID,
      storeName: '辙见演示门店',
      vehicleJson: {
        brand: '大众',
        series: '帕萨特',
        plateDisplay: '浙A·DEMO1',
      },
    },
    update: {
      status: 'COMPLETED',
      serviceName: '刹车片更换',
    },
  })

  const legacyNodes = [
    { nodeId: 'before', title: '施工前', sortOrder: 0, status: 'completed', note: '制动异响，待拆检确认。' },
    { nodeId: 'fault', title: '故障点', sortOrder: 1, status: 'completed', note: '前刹车片磨损接近极限。' },
    { nodeId: 'parts', title: '配件确认', sortOrder: 2, status: 'completed', note: '已更换前刹车片与刹车盘。' },
    { nodeId: 'process', title: '施工中', sortOrder: 3, status: 'completed', note: '安装后已进行路试检查。' },
    { nodeId: 'done', title: '完工检查', sortOrder: 4, status: 'completed', note: '完工检查通过。' },
  ]

  const legacyImages = []
  const legacyDefs = [
    { nodeId: 'before', count: 2 },
    { nodeId: 'fault', count: 3 },
    { nodeId: 'parts', count: 3 },
    { nodeId: 'process', count: 3 },
    { nodeId: 'done', count: 1 },
  ]
  let legacyImageCount = 0
  legacyDefs.forEach((def) => {
    for (let i = 0; i < def.count; i += 1) {
      legacyImages.push({
        id: `img_${LEGACY_ALBUM_ID}_${def.nodeId}_${i}`,
        albumId: LEGACY_ALBUM_ID,
        nodeId: def.nodeId,
        idx: i,
        rawUrl: mockImageUrl(ORDER_ID, def.nodeId, i),
      })
      legacyImageCount += 1
    }
  })

  await prisma.album.upsert({
    where: { id: LEGACY_ALBUM_ID },
    create: {
      id: LEGACY_ALBUM_ID,
      orderId: ORDER_ID,
      userId: USER_ID,
      merchantId: MERCHANT_ID,
      storeId: STORE_ID,
      storeName: '辙见演示门店',
      serviceName: '刹车片更换',
      userPhone: USER_PHONE,
      vehicleJson: { brand: '大众', series: '帕萨特', plateDisplay: '浙A·DEMO1' },
      partsJson: [],
      pendingConfirmsJson: [],
      status: 'completed',
      templateId: 'brake',
      templateName: '刹车维修',
      publicCaseStatus: 'private',
      imageCount: legacyImageCount,
      nodes: { create: legacyNodes },
    },
    update: {
      userId: USER_ID,
      merchantId: MERCHANT_ID,
      storeId: STORE_ID,
      userPhone: USER_PHONE,
      status: 'completed',
      imageCount: legacyImageCount,
      publicCaseStatus: 'private',
      nodes: { deleteMany: {}, create: legacyNodes },
    },
  })

  await prisma.albumImage.deleteMany({ where: { albumId: LEGACY_ALBUM_ID } })
  await prisma.albumImage.createMany({ data: legacyImages })

  await seedServiceAlbum(SERVICE_ALBUM_ID, {
    serviceName: '小保养套餐',
    status: 'completed',
  })

  await prisma.publicCase.upsert({
    where: { albumId: SERVICE_ALBUM_ID },
    create: {
      id: 'case_svc_demo_completed',
      albumId: SERVICE_ALBUM_ID,
      status: 'public_approved',
      authorizationTier: 'named',
      title: '杭州大众朗逸 · 小保养套餐',
      summary: '该案例经车主授权，记录了小保养维修过程。图片已脱敏并通过平台审核。',
      coverImage: '',
      contentJson: {
        vehicleText: '大众朗逸（已脱敏）',
        tags: ['authorized', 'desensitized', 'audited'],
        nodes: [],
      },
      storeId: STORE_ID,
      storeName: '辙见示范店（杭州滨江）',
      serviceName: '小保养套餐',
      city: '杭州',
      minAmount: 380,
      maxAmount: 480,
      priceMode: 'range',
      publishedAt: new Date(),
    },
    update: {
      status: 'public_approved',
      title: '杭州大众朗逸 · 小保养套餐',
      summary: '该案例经车主授权，记录了小保养维修过程。图片已脱敏并通过平台审核。',
      storeId: STORE_ID,
      storeName: '辙见示范店（杭州滨江）',
      serviceName: '小保养套餐',
      minAmount: 380,
      maxAmount: 480,
      priceMode: 'range',
      publishedAt: new Date(),
    },
  })

  await seedLeads()
  await seedServicePlans()

  console.log('[seed] legacy order album:', ORDER_ID, LEGACY_ALBUM_ID)
  console.log('[seed] service album:', SERVICE_ALBUM_ID)
  console.log('[seed] service plans:', SEED_SERVICES.map((s) => s.id).join(', '))
  console.log('[seed] consult leads: lead_demo_submitted, lead_demo_contacted')
  console.log('[seed] dev user token -> userId:', USER_ID, 'phone:', USER_PHONE)
  console.log('[seed] merchant staff:', USER_ID, '->', MERCHANT_ID, STORE_ID)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
