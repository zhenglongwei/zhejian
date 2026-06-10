/**
 * 首页服务宫格 — PRD §10.1 MVP 6 入口
 * 图标：设计师交付见 docs/00_设计规范/03_首页服务宫格图标规范.md
 * 资源：assets/home/entries/*.png（源稿 entries-src/*.svg）
 */
const HOME_PLATFORM_IDENTITY =
  '辙见提供服务相册查看与授权留痕工具。实际维修、报价、收款与售后由门店线下提供和承担。'

const HOME_ENTRY_ICON_BASE = '/assets/home/entries'

const HOME_SERVICE_ENTRIES = [
  {
    id: 'entry_brake',
    name: '刹车片/盘',
    iconPath: `${HOME_ENTRY_ICON_BASE}/entry_brake.png`,
    iconText: '刹',
    tag: '',
    tagVariant: 'default',
    accentKey: 'primary',
    targetType: 'category',
    targetId: 'cat_brake',
    status: 'enabled',
    sort: 1,
  },
  {
    id: 'entry_tire',
    name: '轮胎服务',
    iconPath: `${HOME_ENTRY_ICON_BASE}/entry_tire.png`,
    iconText: '轮',
    tag: '',
    tagVariant: 'default',
    accentKey: 'primary',
    targetType: 'category',
    targetId: 'cat_tire',
    status: 'enabled',
    sort: 2,
  },
  {
    id: 'entry_battery',
    name: '电瓶更换',
    iconPath: `${HOME_ENTRY_ICON_BASE}/entry_battery.png`,
    iconText: '电',
    tag: '',
    tagVariant: 'default',
    accentKey: 'info',
    targetType: 'category',
    targetId: 'cat_battery',
    status: 'enabled',
    sort: 3,
  },
  {
    id: 'entry_body',
    name: '钣喷修复',
    iconPath: `${HOME_ENTRY_ICON_BASE}/entry_body.png`,
    iconText: '喷',
    tag: '参考区间',
    tagVariant: 'onsite',
    accentKey: 'onsite',
    targetType: 'category',
    targetId: 'cat_body',
    status: 'enabled',
    sort: 4,
  },
  {
    id: 'entry_accident',
    name: '事故车维修',
    iconPath: `${HOME_ENTRY_ICON_BASE}/entry_accident.png`,
    iconText: '事',
    tag: '到店检测',
    tagVariant: 'accident',
    accentKey: 'accident',
    targetType: 'service',
    targetId: 'svc_seed_3',
    status: 'enabled',
    sort: 5,
  },
  {
    id: 'entry_maintenance',
    name: '小保养',
    iconPath: `${HOME_ENTRY_ICON_BASE}/entry_maintenance.png`,
    iconText: '保',
    tag: '热门',
    tagVariant: 'success',
    accentKey: 'success',
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

/** 辙见说明 — 结构化展示（首页 UI） */
const HOME_PLATFORM_INTRO_ITEMS = [
  {
    id: 'process',
    title: '维修过程看得见',
    desc: '门店可记录检测、施工、完工等阶段，你可在服务相册中查看过程与配件确认。',
    accent: 'primary',
  },
  {
    id: 'archive',
    title: '每次维修有档案',
    desc: '线下维修过程可沉淀为个人服务相册，方便后续参考（需门店创建并关联）。',
    accent: 'info',
  },
  {
    id: 'privacy',
    title: '公开案例先脱敏',
    desc: '公开展示前会隐藏车牌、人脸、VIN、手机号等隐私信息。',
    accent: 'success',
  },
]

/** 兼容 API / 旧逻辑：标题：说明 拼接串 */
const HOME_PLATFORM_INTRO = HOME_PLATFORM_INTRO_ITEMS.map(
  (item) => `${item.title}：${item.desc}`
)

/** 平台保障 — 要点卡片 + 摘要 */
const HOME_PROTECTION_ITEMS = [
  {
    id: 'audit',
    title: '门店资质审核',
    desc: '入驻门店资质已审核',
    accent: 'primary',
  },
  {
    id: 'album',
    title: '过程可查看',
    desc: '服务相册记录关键阶段',
    accent: 'info',
  },
  {
    id: 'desensitize',
    title: '案例先脱敏',
    desc: '展示前隐藏隐私信息',
    accent: 'success',
  },
]

const HOME_PROTECTION_SUMMARY =
  '复杂维修和事故车以到店检测结果为准，避免线上误导报价。'

const HOME_PROTECTION_TEXT =
  '门店资质审核，维修过程可查看，公开案例先脱敏。' + HOME_PROTECTION_SUMMARY

module.exports = {
  HOME_ENTRY_ICON_BASE,
  HOME_SERVICE_ENTRIES,
  HOME_ACCIDENT_ENTRY,
  HOME_PLATFORM_INTRO_ITEMS,
  HOME_PLATFORM_INTRO,
  HOME_PLATFORM_IDENTITY,
  HOME_PROTECTION_ITEMS,
  HOME_PROTECTION_SUMMARY,
  HOME_PROTECTION_TEXT,
}
