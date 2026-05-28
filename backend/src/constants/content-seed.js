/** 用户端浏览读 API — 门店/服务展示种子（MVP：DB 门店 + 常量服务详情） */

const SEED_SERVICES = [
  {
    id: 'svc_seed_1',
    serviceItemId: 'item_maintenance',
    categoryId: 'cat_maintenance',
    categoryName: '保养服务',
    name: '小保养套餐',
    summary: '更换机油机滤，含常规检查，适用多数家用燃油车。',
    detail:
      '含机油、机滤及标准工时；具体机油标号以到店检测为准。如超出套餐范围，门店会与你确认新增项目。',
    priceMode: 'fixed',
    amount: 399,
    minAmount: null,
    maxAmount: null,
    priceFactors: [],
    storeId: 'store_demo_1',
    storeName: '辙见示范店（杭州滨江）',
    onlinePaymentEnabled: true,
    status: 'published',
    publishedAt: '2026-05-15',
  },
  {
    id: 'svc_seed_2',
    serviceItemId: 'item_brake_pad',
    categoryId: 'cat_brake',
    categoryName: '刹车系统',
    name: '刹车片更换',
    summary: '到店检测后确认是否需要更换刹车盘，含试车。',
    detail:
      '含前/后刹车片检测与更换工时；配件品牌可选。如检测发现刹车盘需更换，门店会与你确认方案和费用。',
    priceMode: 'range',
    amount: null,
    minAmount: 680,
    maxAmount: 1280,
    priceFactors: ['车型与年款', '配件品牌', '刹车盘是否需更换'],
    storeId: 'store_demo_1',
    storeName: '辙见示范店（杭州滨江）',
    onlinePaymentEnabled: false,
    status: 'published',
    publishedAt: '2026-05-12',
  },
  {
    id: 'svc_seed_3',
    serviceItemId: 'item_accident',
    categoryId: 'cat_accident',
    categoryName: '事故车维修',
    name: '事故车维修预约 · 辙见示范店',
    summary: '事故车需到店检测或拆检后确认维修方案，不支持线上最终报价。',
    detail:
      '提供事故损伤评估与维修方案建议。实际方案和费用需门店检测或拆检后确认，你可先查看类似案例了解常见维修流程。',
    priceMode: 'accident',
    amount: null,
    minAmount: null,
    maxAmount: null,
    priceFactors: [
      '是否涉及结构件',
      '是否涉及安全气囊',
      '是否需要拆检',
      '是否涉及保险定损',
    ],
    storeId: 'store_demo_1',
    storeName: '辙见示范店（杭州滨江）',
    onlinePaymentEnabled: false,
    status: 'published',
    publishedAt: '2026-05-08',
  },
]

const STORE_EXTRAS = {
  store_demo_1: {
    status: 'open',
    auditStatus: 'approved',
    latitude: 30.2084,
    longitude: 120.212,
    businessHours: '09:00-18:00',
    qualificationTags: ['二类维修资质'],
    specialties: ['钣喷修复', '刹车系统', '小保养', '事故车维修'],
    score: 4.8,
    supportsAlbum: true,
    coverImage: '/assets/home/store-cover-demo.jpg',
    environmentImages: [],
    certifications: [
      { label: '营业执照', status: 'verified', text: '已认证' },
      { label: '维修资质', status: 'verified', text: '二类维修资质 · 已认证' },
      { label: '门店真实性', status: 'verified', text: '已审核' },
    ],
    aiSummary:
      '杭州滨江示范门店，支持服务相册与公开案例展示，资质已审核，价格以到店检测为准。',
  },
}

const SEARCH_HOTWORDS = [
  '小保养',
  '补漆',
  '轮胎更换',
  '电瓶更换',
  '空调不制冷',
  '事故车检测',
  '刹车片更换',
  '钣金修复',
]

const SERVICE_ITEM_NAME_MAP = {
  item_maintenance: '小保养',
  item_brake_pad: '刹车片更换',
  item_accident: '事故车维修',
}

/** DB 无公开案例时的兜底（与 home.service 一致） */
const FALLBACK_PUBLIC_CASES = [
  {
    id: 'case_svc_demo_completed',
    albumId: 'alb_svc_demo_completed',
    authorizationTier: 'named',
    coverImage: '',
    title: '杭州大众朗逸 · 小保养套餐',
    serviceName: '小保养套餐',
    summary: '该案例经车主授权，记录了小保养维修过程。图片已脱敏并通过平台审核。',
    priceMode: 'range',
    minAmount: 380,
    maxAmount: 480,
    storeId: 'store_demo_1',
    storeName: '辙见示范店（杭州滨江）',
    city: '杭州',
    viewCount: 128,
    publishedAt: '2026-05-28',
    tags: ['authorized', 'desensitized', 'audited'],
  },
]

module.exports = {
  SEED_SERVICES,
  STORE_EXTRAS,
  SEARCH_HOTWORDS,
  SERVICE_ITEM_NAME_MAP,
  FALLBACK_PUBLIC_CASES,
}
