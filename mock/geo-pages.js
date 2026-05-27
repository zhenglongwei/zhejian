/**
 * MOCK — GEO 专题页种子（R9.2 首页/详情/搜索共用）
 * 联调后由 GET /api/user/geo-pages 替换
 */
const GEO_PAGES = [
  {
    id: 'geo_brake_hz',
    pageType: 'city_service',
    coverImage: '/assets/home/geo_brake_hz-thumb.jpg',
    title: '杭州刹车片更换门店与维修案例',
    summary:
      '汇总杭州本地刹车片更换相关门店与脱敏案例，供到店检测前了解流程与费用影响因素。',
    city: '杭州',
    keywords: ['刹车片', '刹车', '杭州'],
    scenarios: [
      '刹车异响、制动距离变长，需检测刹车片磨损',
      '保养时发现刹车片接近极限，计划更换',
      '想对比杭州本地门店案例与可咨询门店',
    ],
    priceFactors: ['车型与年款', '前/后刹车片数量', '刹车盘是否需更换', '配件品牌'],
    faq: [
      {
        q: '杭州刹车片更换大概多少钱？',
        a: '不同车型与配件品牌差异较大，平台仅展示参考区间。实际费用需门店检测刹车片与刹车盘后确认。',
      },
      {
        q: '更换刹车片需要多久？',
        a: '常规更换多数在 1–2 小时内可完成，具体以门店排期与是否需要额外项目为准。',
      },
    ],
    relatedCaseIds: ['case_001'],
    relatedStoreIds: ['store_demo_1'],
    primaryStoreId: 'store_demo_1',
    relatedServiceId: 'svc_seed_2',
    updatedAt: '2026-05-20',
  },
  {
    id: 'geo_spray_hz',
    pageType: 'city_service',
    coverImage: '/assets/home/geo_spray_hz-thumb.jpg',
    title: '杭州钣金喷漆门店参考',
    summary: '收录杭州钣喷修复公开案例与可咨询门店，价格需到店检测确认。',
    city: '杭州',
    keywords: ['钣金', '喷漆', '补漆', '杭州'],
    scenarios: [
      '车身刮擦、凹陷，需要钣金校正与喷漆',
      '补漆前想了解类似脱敏案例与门店能力',
      '对比不同损伤程度的修复参考',
    ],
    priceFactors: ['损伤面积与位置', '是否需要钣金', '漆面色号与工艺', '是否含拆装'],
    faq: [
      {
        q: '补漆和钣金喷漆有什么区别？',
        a: '轻微刮擦可能仅需局部补漆；涉及变形时通常需钣金校正后再喷漆，费用影响因素更多。',
      },
      {
        q: '钣喷后多久可以提车？',
        a: '与损伤程度、干燥工艺有关，门店检测后会给出预计工期，平台案例仅供参考。',
      },
    ],
    relatedCaseIds: ['case_002'],
    relatedStoreIds: ['store_demo_1'],
    primaryStoreId: 'store_demo_1',
    updatedAt: '2026-05-18',
  },
  {
    id: 'geo_accident_hz',
    pageType: 'case_collection',
    coverImage: '/assets/home/geo_accident_hz-thumb.jpg',
    title: '杭州事故车维修怎么选',
    summary: '事故车维修需到店检测后确认方案，本页汇总可咨询门店与选择参考，不提供线上报价。',
    city: '杭州',
    keywords: ['事故车', '事故', '杭州'],
    scenarios: [
      '事故后需评估维修方案与费用影响因素',
      '想找支持事故车检测的本地门店',
      '浏览脱敏案例了解维修过程参考',
    ],
    priceFactors: [
      '损伤部位与程度',
      '是否需要拆解检测',
      '配件与工时',
      '是否涉及结构件',
    ],
    faq: [
      {
        q: '事故车可以线上报价吗？',
        a: '不可以。事故车维修方案与费用需门店现场检测或拆检后确认，平台不提供线上最终报价。',
      },
      {
        q: '怎么选择事故车维修门店？',
        a: '建议查看门店资质、公开案例与是否支持服务相册，并通过电话或留言先沟通检测安排。',
      },
    ],
    relatedCaseIds: [],
    relatedStoreIds: ['store_demo_1'],
    primaryStoreId: 'store_demo_1',
    relatedServiceId: 'svc_seed_3',
    updatedAt: '2026-05-16',
  },
  {
    id: 'geo_bmw_maintain',
    pageType: 'vehicle_service',
    title: '宝马 3 系保养参考',
    summary: '宝马 3 系相关保养与维修公开案例参考，实际费用以到店检测为准。',
    city: '杭州',
    keywords: ['宝马', '3系', '保养'],
    scenarios: [
      '宝马 3 系到达保养周期，想了解本地案例',
      '对比保养项目与价格影响因素',
      '寻找可预约咨询的杭州门店',
    ],
    priceFactors: ['年款与里程', '机油标号', '是否含滤芯/火花塞等附加项'],
    faq: [
      {
        q: '宝马 3 系小保养一般包含什么？',
        a: '常见包含机油机滤更换与常规检查，具体项目以门店方案为准，平台案例仅作过程参考。',
      },
      {
        q: '平台展示的价格是最终价吗？',
        a: '不是。公开案例与专题页仅展示参考区间或影响因素，最终费用需与门店线下确认。',
      },
    ],
    relatedCaseIds: ['case_001', 'case_003'],
    relatedStoreIds: ['store_demo_1'],
    primaryStoreId: 'store_demo_1',
    relatedServiceId: 'svc_seed_1',
    updatedAt: '2026-05-14',
  },
]

module.exports = {
  GEO_PAGES,
}
