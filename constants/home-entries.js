/**
 * 首页服务宫格 — PRD §10.1 MVP 6 入口
 */
const HOME_SERVICE_ENTRIES = [
  {
    id: 'entry_accident',
    name: '事故车维修',
    iconText: '事',
    tag: '到店检测',
    tagVariant: 'accident',
    targetType: 'service',
    targetId: 'svc_seed_3',
    status: 'enabled',
    sort: 1,
  },
  {
    id: 'entry_body',
    name: '钣喷修复',
    iconText: '喷',
    tag: '参考区间',
    tagVariant: 'onsite',
    targetType: 'category',
    targetId: 'cat_body',
    status: 'enabled',
    sort: 2,
  },
  {
    id: 'entry_brake',
    name: '刹车片/盘',
    iconText: '刹',
    tag: '',
    tagVariant: 'default',
    targetType: 'category',
    targetId: 'cat_brake',
    status: 'enabled',
    sort: 3,
  },
  {
    id: 'entry_tire',
    name: '轮胎服务',
    iconText: '轮',
    tag: '',
    tagVariant: 'default',
    targetType: 'category',
    targetId: 'cat_tire',
    status: 'enabled',
    sort: 4,
  },
  {
    id: 'entry_battery',
    name: '电瓶更换',
    iconText: '电',
    tag: '',
    tagVariant: 'default',
    targetType: 'category',
    targetId: 'cat_battery',
    status: 'enabled',
    sort: 5,
  },
  {
    id: 'entry_maintenance',
    name: '小保养',
    iconText: '保',
    tag: '热门',
    tagVariant: 'success',
    targetType: 'category',
    targetId: 'cat_maintenance',
    status: 'enabled',
    sort: 6,
  },
]

const HOME_ACCIDENT_ENTRY = {
  title: '事故车维修预约',
  subtitle: '不线上估价，到店检测后报价',
  hint: '可查看类似案例，了解维修方案和费用影响因素',
  serviceId: 'svc_seed_3',
}

const HOME_PLATFORM_INTRO = [
  '维修过程看得见：门店可上传检测、施工、完工等过程图片，你可以在订单中查看维修进度。',
  '每次维修有档案：平台订单会沉淀为维修档案，方便后续复查与再次维修参考。',
  '公开案例先脱敏：公开展示前会隐藏车牌、人脸、VIN、手机号等隐私信息。',
]

const HOME_PROTECTION_TEXT =
  '门店资质审核，维修过程可查看，公开案例先脱敏。复杂维修和事故车以到店检测结果为准，避免线上误导报价。'

module.exports = {
  HOME_SERVICE_ENTRIES,
  HOME_ACCIDENT_ENTRY,
  HOME_PLATFORM_INTRO,
  HOME_PROTECTION_TEXT,
}
