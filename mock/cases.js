/**
 * MOCK — 用户端公开案例种子数据
 * Phase 1：统一服务相册授权公开，按匿名/实名档位区分
 */
const { PUBLIC_AUTH_TIER } = require('../constants/case-authorization')
const { PRICE_MODE } = require('../constants/price-mode')

const MOCK_COVER = {
  case_003: 'mock://desensitized/case_003/before/0',
  case_001: 'mock://desensitized/case_001/before/0',
  case_002: 'mock://desensitized/case_002/before/0',
}

const SEED_CASES = [
  {
    id: 'case_003',
    albumId: 'album_demo_seed_1',
    authorizationTier: PUBLIC_AUTH_TIER.NAMED,
    coverImage: MOCK_COVER.case_003,
    coverImageDesensitized: MOCK_COVER.case_003,
    title: '杭州大众朗逸 · 小保养',
    vehicleText: '大众朗逸（已脱敏）',
    serviceName: '小保养',
    summary:
      '该案例经车主实名授权，记录了大众朗逸进行小保养的维修过程。图片已脱敏并通过平台审核。',
    priceMode: PRICE_MODE.FIXED,
    amount: 499,
    planAmount: 499,
    minAmount: null,
    maxAmount: null,
    storeId: 'store_demo_1',
    storeName: '辙见示范店（杭州滨江）',
    city: '杭州',
    viewCount: 210,
    publishedAt: '2026-05-12',
    tags: ['authorized', 'desensitized', 'audited'],
    aiSummary:
      '本页展示杭州大众朗逸小保养维修案例，包含常规检查、机油机滤更换与完工检查。图片已脱敏，实际费用需以门店检测为准。',
    keyInfo: [
      { label: '城市', value: '杭州' },
      { label: '服务项目', value: '小保养' },
      { label: '公开方式', value: '实名授权' },
    ],
    faultDesc: '到达保养里程，机油老化。',
    inspectResult: '机油液位正常，滤清器建议更换。',
    repairPlan: '更换机油、机滤，检查灯光与胎压。',
    priceFactors: ['机油标号', '滤清器品牌', '是否含空调滤'],
    nodes: [
      {
        id: 'before',
        title: '维修前状态',
        images: [MOCK_COVER.case_003],
        imagesDesensitized: [MOCK_COVER.case_003],
        note: '',
      },
      { id: 'parts', title: '新旧配件对比', images: [], note: '' },
      { id: 'done', title: '完工结果', images: [], note: '' },
    ],
  },
  {
    id: 'case_001',
    albumId: 'album_demo_seed_2',
    authorizationTier: PUBLIC_AUTH_TIER.NAMED,
    coverImage: MOCK_COVER.case_001,
    coverImageDesensitized: MOCK_COVER.case_001,
    title: '杭州宝马 3 系 · 刹车片更换',
    vehicleText: '宝马 3 系（已脱敏）',
    serviceName: '刹车片更换',
    summary:
      '该案例经车主实名授权，记录了宝马 3 系刹车片更换过程。图片已脱敏，展示门店本次方案参考报价。',
    priceMode: PRICE_MODE.FIXED,
    amount: 980,
    planAmount: 980,
    minAmount: null,
    maxAmount: null,
    storeId: 'store_demo_1',
    storeName: '辙见示范店（杭州滨江）',
    city: '杭州',
    viewCount: 128,
    publishedAt: '2026-05-10',
    tags: ['authorized', 'desensitized', 'audited'],
    aiSummary:
      '本页展示杭州宝马 3 系刹车片更换维修案例，包含异响检查、旧件磨损与完工试车。图片已脱敏，实际费用需以门店检测为准。',
    keyInfo: [
      { label: '城市', value: '杭州' },
      { label: '服务项目', value: '刹车片更换' },
      { label: '公开方式', value: '实名授权' },
    ],
    faultDesc: '低速转向时前轮区域有金属摩擦声。',
    inspectResult: '前刹车片磨损至极限，刹车盘有划痕。',
    repairPlan: '更换前刹车片、前刹车盘，清洁卡钳并试车。',
    priceFactors: ['车型与年款', '配件品牌', '刹车盘是否需更换'],
    nodes: [
      {
        id: 'before',
        title: '维修前状态',
        images: [MOCK_COVER.case_001],
        imagesDesensitized: [MOCK_COVER.case_001],
        note: '刹车片厚度接近极限',
      },
      { id: 'parts', title: '新旧配件对比', images: [], note: '' },
      { id: 'done', title: '完工结果', images: [], note: '试车无异响' },
    ],
  },
  {
    id: 'case_002',
    albumId: 'album_demo_seed_3',
    authorizationTier: PUBLIC_AUTH_TIER.ANONYMOUS,
    coverImage: MOCK_COVER.case_002,
    coverImageDesensitized: MOCK_COVER.case_002,
    title: '杭州德系轿车 · 钣喷修复',
    vehicleText: '德系轿车（已脱敏）',
    serviceName: '钣喷修复',
    summary:
      '该案例经车主匿名授权，展示钣喷修复过程摘要。仅保留车辆部分信息，图片已脱敏并通过平台审核。',
    priceMode: PRICE_MODE.FIXED,
    amount: 1800,
    planAmount: 1800,
    minAmount: null,
    maxAmount: null,
    storeId: 'store_demo_1',
    storeName: '辙见示范店（杭州滨江）',
    city: '杭州',
    viewCount: 86,
    publishedAt: '2026-05-08',
    tags: ['authorized', 'desensitized', 'audited'],
    aiSummary:
      '本页展示杭州钣喷修复维修案例，含损伤评估、修复过程与完工对比。匿名公开，不展示门店名称。',
    keyInfo: [
      { label: '城市', value: '杭州' },
      { label: '服务项目', value: '钣喷修复' },
      { label: '公开方式', value: '匿名授权' },
    ],
    faultDesc: '右后门刮擦，门板轻微变形。',
    inspectResult: '漆面破损面积约 30cm，需钣金校正。',
    repairPlan: '钣金校正、原子灰找平、底漆与面漆喷涂。',
    priceFactors: ['损伤面积', '是否需要钣金', '漆面色号匹配'],
    nodes: [
      {
        id: 'before',
        title: '损伤状态',
        images: [MOCK_COVER.case_002],
        imagesDesensitized: [MOCK_COVER.case_002],
        note: '',
      },
      { id: 'compare', title: '前后对比', images: [], note: '' },
    ],
  },
]

module.exports = { SEED_CASES }
