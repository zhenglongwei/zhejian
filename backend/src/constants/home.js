/** 首页聚合静态配置 — 与小程序 constants/home-entries.js 对齐 */
const HOME_SERVICE_ENTRIES = [
  {
    id: 'entry_brake',
    name: '刹车片/盘',
    iconPath: '/assets/home/entries/entry_brake.png',
    tag: '',
    tagVariant: 'default',
    targetType: 'category',
    targetId: 'cat_brake',
    status: 'enabled',
    sort: 1,
  },
  {
    id: 'entry_tire',
    name: '轮胎服务',
    iconPath: '/assets/home/entries/entry_tire.png',
    tag: '',
    tagVariant: 'default',
    targetType: 'category',
    targetId: 'cat_tire',
    status: 'enabled',
    sort: 2,
  },
  {
    id: 'entry_battery',
    name: '电瓶更换',
    iconPath: '/assets/home/entries/entry_battery.png',
    tag: '',
    tagVariant: 'default',
    targetType: 'category',
    targetId: 'cat_battery',
    status: 'enabled',
    sort: 3,
  },
  {
    id: 'entry_body',
    name: '钣喷修复',
    iconPath: '/assets/home/entries/entry_body.png',
    tag: '参考区间',
    tagVariant: 'onsite',
    targetType: 'category',
    targetId: 'cat_body',
    status: 'enabled',
    sort: 4,
  },
  {
    id: 'entry_accident',
    name: '事故车维修',
    iconPath: '/assets/home/entries/entry_accident.png',
    tag: '到店检测',
    tagVariant: 'accident',
    targetType: 'service',
    targetId: 'svc_seed_3',
    status: 'enabled',
    sort: 5,
  },
  {
    id: 'entry_maintenance',
    name: '小保养',
    iconPath: '/assets/home/entries/entry_maintenance.png',
    tag: '热门',
    tagVariant: 'success',
    targetType: 'category',
    targetId: 'cat_maintenance',
    status: 'enabled',
    sort: 6,
  },
]

const HOME_ACCIDENT_ENTRY = {
  title: '事故车维修咨询',
  subtitle: '不线上估价，到店检测后报价',
  hint: '可查看类似案例，了解维修方案和费用影响因素',
  serviceId: 'svc_seed_3',
}

const HOME_PLATFORM_INTRO = [
  '维修过程看得见：门店可记录检测、施工、完工等阶段，你可在服务相册中查看过程与配件确认。',
  '每次维修有档案：线下维修过程可沉淀为个人服务相册，方便后续参考（需门店创建并关联）。',
  '公开案例先脱敏：公开展示前会隐藏车牌、人脸、VIN、手机号等隐私信息。',
]

const HOME_PLATFORM_IDENTITY =
  '辙见提供案例展示、服务相册与咨询预约工具。实际维修、报价、收款与售后由门店线下提供和承担。'

const HOME_PROTECTION_TEXT =
  '门店资质审核，维修过程可查看，公开案例先脱敏。复杂维修和事故车以到店检测结果为准，避免线上误导报价。'

const HOME_GEO_TOPICS = [
  {
    id: 'geo_brake_hz',
    title: '杭州刹车片更换门店与维修案例',
    summary:
      '汇总杭州本地刹车片更换相关门店与脱敏案例，供到店检测前了解流程与费用影响因素。',
    coverImage: '/assets/home/geo_brake_hz-thumb.jpg',
    updatedAt: '2026-05-20',
  },
  {
    id: 'geo_spray_hz',
    title: '杭州钣金喷漆门店参考',
    summary: '收录杭州钣喷修复公开案例与可咨询门店，价格需到店检测确认。',
    coverImage: '/assets/home/geo_spray_hz-thumb.jpg',
    updatedAt: '2026-05-18',
  },
  {
    id: 'geo_accident_hz',
    title: '杭州事故车维修怎么选',
    summary: '事故车维修需到店检测后确认方案，本页汇总可咨询门店与选择参考，不提供线上报价。',
    coverImage: '/assets/home/geo_accident_hz-thumb.jpg',
    updatedAt: '2026-05-16',
  },
]

const HOME_RECOMMENDED_MERCHANTS = [
  {
    id: 'store_demo_1',
    name: '辙见示范店（杭州滨江）',
    status: 'open',
    address: '浙江省杭州市滨江区江南大道 1888 号',
    businessHours: '09:00-18:00',
    caseCount: 3,
    coverImage: '/assets/home/store-cover-demo.jpg',
    qualificationTags: ['二类维修资质'],
    specialties: ['钣喷修复', '刹车系统', '小保养', '事故车维修'],
    supportsAlbum: true,
  },
]

module.exports = {
  HOME_SERVICE_ENTRIES,
  HOME_ACCIDENT_ENTRY,
  HOME_PLATFORM_INTRO,
  HOME_PLATFORM_IDENTITY,
  HOME_PROTECTION_TEXT,
  HOME_GEO_TOPICS,
  HOME_RECOMMENDED_MERCHANTS,
}
