/**
 * MOCK — 用户端可见服务方案种子（V0.1 S7 / S7b）
 * 联调后由 services/service.js 接真实接口替换
 */
const { PRICE_MODE } = require('../constants/price-mode')

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
    priceMode: PRICE_MODE.FIXED,
    amount: 399,
    minAmount: null,
    maxAmount: null,
    priceFactors: [],
    storeId: 'store_demo_1',
    storeName: '透明维修示范店（杭州滨江）',
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
    priceMode: PRICE_MODE.RANGE,
    amount: null,
    minAmount: 680,
    maxAmount: 1280,
    priceFactors: ['车型与年款', '配件品牌', '刹车盘是否需更换'],
    storeId: 'store_demo_1',
    storeName: '透明维修示范店（杭州滨江）',
    onlinePaymentEnabled: false,
    status: 'published',
    publishedAt: '2026-05-12',
  },
  {
    id: 'svc_seed_3',
    serviceItemId: 'item_accident',
    categoryId: 'cat_accident',
    categoryName: '事故车维修',
    name: '事故车维修预约 · 透明维修示范店',
    summary: '事故车需到店检测或拆检后确认维修方案，不支持线上最终报价。',
    detail:
      '提供事故损伤评估与维修方案建议。实际方案和费用需门店检测或拆检后确认，你可先查看类似案例了解常见维修流程。',
    priceMode: PRICE_MODE.ACCIDENT,
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
    storeName: '透明维修示范店（杭州滨江）',
    onlinePaymentEnabled: false,
    status: 'published',
    publishedAt: '2026-05-08',
  },
]

module.exports = { SEED_SERVICES }
