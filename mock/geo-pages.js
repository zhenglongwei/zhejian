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
        a: '不同车型与配件品牌差异较大，此处仅展示参考区间。实际费用需门店检测刹车片与刹车盘后确认。',
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
        a: '与损伤程度、干燥工艺有关，门店检测后会给出预计工期，案例内容仅供参考。',
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
        a: '不可以。事故车维修方案与费用需门店现场检测或拆检后确认，线上不提供最终报价。',
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
        a: '常见包含机油机滤更换与常规检查，具体项目以门店方案为准，案例内容仅作过程参考。',
      },
      {
        q: '展示的价格是最终价吗？',
        a: '不是。公开案例与专题页仅展示参考区间或影响因素，最终费用需与门店线下确认。',
      },
    ],
    relatedCaseIds: ['case_001', 'case_003'],
    relatedStoreIds: ['store_demo_1'],
    primaryStoreId: 'store_demo_1',
    relatedServiceId: 'svc_seed_1',
    updatedAt: '2026-05-14',
  },
  {
    id: 'geo_binjiang',
    pageType: 'district_service',
    title: '滨江区钣喷与保养门店',
    summary: '聚焦杭州滨江区的钣喷修复、小保养等可咨询门店与脱敏案例。',
    city: '杭州',
    keywords: ['滨江', '钣喷', '保养'],
    scenarios: [
      '在滨江区找就近钣喷或保养门店',
      '对比滨江本地公开案例与门店能力',
    ],
    priceFactors: ['损伤面积', '配件品牌', '是否需要钣金'],
    faq: [
      {
        q: '滨江区门店价格是否一致？',
        a: '不同门店方案与配件选择不同，此处仅展示参考信息，实际费用需到店检测后确认。',
      },
    ],
    relatedCaseIds: ['case_002'],
    relatedStoreIds: ['store_demo_1'],
    primaryStoreId: 'store_demo_1',
    updatedAt: '2026-05-12',
  },
  {
    id: 'geo_ac_noise',
    pageType: 'fault_qa',
    title: '空调不制冷常见原因',
    summary: '汇总空调不制冷相关检查思路与可咨询门店，不提供线上最终报价。',
    city: '杭州',
    keywords: ['空调', '不制冷', '异响'],
    scenarios: [
      '夏季空调出风不凉，想了解常见检查项',
      '寻找可检测空调系统的本地门店',
    ],
    priceFactors: ['是否缺氟', '压缩机状态', '冷凝器清洁', '电路故障'],
    faq: [
      {
        q: '空调不制冷一定是缺氟吗？',
        a: '不一定。需门店检测确认是否缺氟、堵塞或压缩机等问题，案例内容仅作过程参考。',
      },
    ],
    relatedCaseIds: [],
    relatedStoreIds: ['store_demo_1'],
    primaryStoreId: 'store_demo_1',
    updatedAt: '2026-05-11',
  },
  {
    id: 'geo_store_demo',
    pageType: 'merchant_geo',
    title: '辙见示范店专题',
    summary: '辙见示范店（杭州滨江）服务能力、公开案例与咨询入口汇总。',
    city: '杭州',
    keywords: ['示范店', '滨江', '门店'],
    scenarios: [
      '了解示范店支持的服务项目与相册能力',
      '查看该店公开案例后预约咨询',
    ],
    priceFactors: ['服务项目', '车型', '配件品牌'],
    faq: [
      {
        q: '如何联系示范店？',
        a: '可通过专题页底栏电话咨询或留言咨询，实际方案与费用由门店线下确认。',
      },
    ],
    relatedCaseIds: ['case_001', 'case_002'],
    relatedStoreIds: ['store_demo_1'],
    primaryStoreId: 'store_demo_1',
    updatedAt: '2026-05-10',
  },
]

module.exports = {
  GEO_PAGES,
}
