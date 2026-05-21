/**
 * MOCK — 用户端门店种子数据（V0.1 D2）
 * 联调后由 services/store.js 接 GET /api/user/merchants/{id} 替换
 */
const SEED_STORES = [
  {
    id: 'store_demo_1',
    name: '透明维修示范店（杭州滨江）',
    status: 'open',
    auditStatus: 'approved',
    address: '浙江省杭州市滨江区江南大道 1888 号',
    latitude: 30.2084,
    longitude: 120.212,
    businessHours: '09:00-18:00',
    phone: '0571-88886666',
    qualificationTags: ['二类维修资质'],
    specialties: ['钣喷修复', '刹车系统', '小保养', '事故车维修'],
    score: 4.8,
    caseCount: 3,
    supportsAlbum: true,
    coverImage: '',
    environmentImages: [],
    certifications: [
      { label: '营业执照', status: 'verified', text: '已认证' },
      { label: '维修资质', status: 'verified', text: '二类维修资质 · 已认证' },
      { label: '门店真实性', status: 'verified', text: '已审核' },
    ],
    aiSummary:
      '杭州滨江示范门店，支持维修相册与公开案例展示，资质已审核，价格以到店检测为准。',
  },
]

module.exports = { SEED_STORES }
