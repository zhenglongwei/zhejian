/**
 * MOCK — 用户端公开案例种子数据（V0.1）
 * 联调后由 services/case.js 接真实接口替换
 */
const { CASE_SOURCE } = require('../constants/case-source')
const { PRICE_MODE } = require('../constants/price-mode')

const MOCK_COVER = {
  case_003: 'mock://desensitized/case_003/before/0',
  case_001: 'mock://desensitized/case_001/before/0',
  case_002: 'mock://desensitized/case_002/before/0',
}

const SEED_CASES = [
  {
    id: 'case_003',
    source: CASE_SOURCE.PLATFORM_ORDER,
    orderId: 'ord_demo_seed_platform',
    serviceItemId: 'svc_seed_1',
    coverImage: MOCK_COVER.case_003,
    coverImageDesensitized: MOCK_COVER.case_003,
    title: '大众朗逸 · 小保养',
    vehicleText: '大众朗逸（已脱敏）',
    serviceName: '小保养',
    summary: '平台订单履约记录，按标准流程更换机油机滤并完成常规检查。',
    priceMode: PRICE_MODE.RANGE,
    minAmount: 399,
    maxAmount: 599,
    storeId: 'store_demo_1',
    storeName: '透明维修示范店（杭州滨江）',
    city: '杭州',
    viewCount: 210,
    publishedAt: '2026-05-12',
    tags: ['desensitized', 'audited'],
    aiSummary:
      '本案例为平台订单案例，用户授权公开，展示标准保养流程与节点记录。',
    keyInfo: [
      { label: '城市', value: '杭州' },
      { label: '服务项目', value: '小保养' },
      { label: '案例来源', value: '平台订单案例' },
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
    source: CASE_SOURCE.MERCHANT_HISTORY,
    serviceItemId: 'svc_seed_2',
    coverImage: MOCK_COVER.case_001,
    coverImageDesensitized: MOCK_COVER.case_001,
    title: '宝马 3 系 · 刹车片更换',
    vehicleText: '宝马 3 系（已脱敏）',
    serviceName: '刹车片更换',
    summary: '行驶异响，到店检测后更换前刹车片与刹车盘，完工试车正常。',
    priceMode: PRICE_MODE.RANGE,
    minAmount: 680,
    maxAmount: 1280,
    storeId: 'store_demo_1',
    storeName: '透明维修示范店（杭州滨江）',
    city: '杭州',
    viewCount: 128,
    publishedAt: '2026-05-10',
    tags: ['desensitized', 'audited', 'reference'],
    aiSummary:
      '本案例为商家历史案例，展示刹车系统异响的检测与更换过程，价格区间为参考值。',
    keyInfo: [
      { label: '城市', value: '杭州' },
      { label: '服务项目', value: '刹车片更换' },
      { label: '案例来源', value: '商家历史案例' },
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
      {
        id: 'parts',
        title: '新旧配件对比',
        images: [],
        note: '',
      },
      {
        id: 'done',
        title: '完工结果',
        images: [],
        note: '试车无异响',
      },
    ],
  },
  {
    id: 'case_002',
    source: CASE_SOURCE.MERCHANT_HISTORY,
    coverImage: MOCK_COVER.case_002,
    coverImageDesensitized: MOCK_COVER.case_002,
    title: '奥迪 A4 · 钣金喷漆',
    vehicleText: '奥迪 A4（已脱敏）',
    serviceName: '钣金喷漆',
    summary: '右后门刮擦变形，钣金修复后局部喷漆，色差控制在可接受范围。',
    priceMode: PRICE_MODE.RANGE,
    minAmount: 1200,
    maxAmount: 2800,
    storeId: 'store_demo_1',
    storeName: '透明维修示范店（杭州滨江）',
    city: '杭州',
    viewCount: 86,
    publishedAt: '2026-05-08',
    tags: ['desensitized', 'audited', 'reference'],
    aiSummary: '钣喷修复过程记录，含损伤评估、钣金与完工对比节点。',
    keyInfo: [
      { label: '城市', value: '杭州' },
      { label: '服务项目', value: '钣金喷漆' },
      { label: '案例来源', value: '商家历史案例' },
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
