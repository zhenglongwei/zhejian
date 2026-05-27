require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { LEAD_STATUS } = require('../src/constants/v2')

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

async function main() {
  await prisma.user.upsert({
    where: { id: USER_ID },
    create: { id: USER_ID, nickname: '演示用户', phone: USER_PHONE },
    update: { nickname: '演示用户', phone: USER_PHONE },
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

  await seedLeads()

  console.log('[seed] legacy order album:', ORDER_ID, LEGACY_ALBUM_ID)
  console.log('[seed] service album:', SERVICE_ALBUM_ID)
  console.log('[seed] consult leads: lead_demo_submitted, lead_demo_contacted')
  console.log('[seed] dev user token -> userId:', USER_ID, 'phone:', USER_PHONE)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
