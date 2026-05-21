require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const ORDER_ID = 'ord_demo_completed_album'
const ALBUM_ID = `alb_${ORDER_ID}`
const USER_ID = 'user_demo_1'

function mockImageUrl(orderId, nodeId, index) {
  return `https://geo.simplewin.cn/media/raw/${orderId}/${nodeId}/${index}.jpg`
}

async function main() {
  await prisma.user.upsert({
    where: { id: USER_ID },
    create: { id: USER_ID, nickname: '演示用户' },
    update: { nickname: '演示用户' },
  })

  await prisma.order.upsert({
    where: { id: ORDER_ID },
    create: {
      id: ORDER_ID,
      userId: USER_ID,
      status: 'COMPLETED',
      serviceName: '刹车片更换',
      storeId: 'store_demo_1',
      storeName: '浙检演示门店',
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

  const nodes = [
    { nodeId: 'before', title: '施工前', sortOrder: 0, status: 'completed', note: '制动异响，待拆检确认。' },
    { nodeId: 'fault', title: '故障点', sortOrder: 1, status: 'completed', note: '前刹车片磨损接近极限。' },
    { nodeId: 'parts', title: '配件确认', sortOrder: 2, status: 'completed', note: '已更换前刹车片与刹车盘。' },
    { nodeId: 'process', title: '施工中', sortOrder: 3, status: 'completed', note: '安装后已进行路试检查。' },
    { nodeId: 'done', title: '完工检查', sortOrder: 4, status: 'completed', note: '完工检查通过。' },
  ]

  const nodeDefs = [
    { nodeId: 'before', count: 2 },
    { nodeId: 'fault', count: 3 },
    { nodeId: 'parts', count: 3 },
    { nodeId: 'process', count: 3 },
    { nodeId: 'done', count: 1 },
  ]

  let imageCount = 0
  const images = []
  nodeDefs.forEach((def) => {
    for (let i = 0; i < def.count; i += 1) {
      images.push({
        id: `img_${ALBUM_ID}_${def.nodeId}_${i}`,
        albumId: ALBUM_ID,
        nodeId: def.nodeId,
        idx: i,
        rawUrl: mockImageUrl(ORDER_ID, def.nodeId, i),
      })
      imageCount += 1
    }
  })

  await prisma.album.upsert({
    where: { id: ALBUM_ID },
    create: {
      id: ALBUM_ID,
      orderId: ORDER_ID,
      status: 'completed',
      templateId: 'brake',
      templateName: '刹车维修',
      publicCaseStatus: 'private',
      imageCount,
      nodes: {
        create: nodes,
      },
    },
    update: {
      status: 'completed',
      imageCount,
      publicCaseStatus: 'private',
      nodes: {
        deleteMany: {},
        create: nodes,
      },
    },
  })

  await prisma.albumImage.deleteMany({ where: { albumId: ALBUM_ID } })
  await prisma.albumImage.createMany({ data: images })

  console.log('[seed] demo order/album ready:', ORDER_ID, ALBUM_ID)
  console.log('[seed] dev user token -> userId:', USER_ID)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
