/**
 * MOCK — 用户端门店种子数据（V0.1 D2）
 * 联调后由 services/store.js 接 GET /api/user/merchants/{id} 替换
 */
const SEED_STORES = [
  {
    id: 'store_demo_1',
    name: '辙见示范店（杭州滨江）',
    status: 'open',
    auditStatus: 'approved',
    address: '浙江省杭州市滨江区江南大道 1888 号',
    latitude: 30.2084,
    longitude: 120.212,
    businessHours: '09:00-18:00',
    phone: '0571-88886666',
    contactName: '王店长',
    qualificationTags: ['二类维修资质'],
    specialties: ['钣喷修复', '刹车系统', '小保养', '事故车维修'],
    score: 4.8,
    caseCount: 3,
    supportsAlbum: true,
    coverImage: '/assets/home/store-cover-demo.jpg',
    environmentImages: [],
    certifications: [
      { label: '营业执照', status: 'verified', text: '已认证' },
      { label: '维修资质', status: 'verified', text: '二类维修资质 · 已认证' },
      { label: '门店真实性', status: 'verified', text: '已审核' },
    ],
    certWall: [],
    staffPublic: [
      {
        id: 'staff_demo_1',
        name: '李师傅',
        role: '维修技师',
        credentials: ['二类维修技师', '钣金修复'],
      },
      {
        id: 'staff_demo_2',
        name: '王店长',
        role: '管理员',
        credentials: ['门店管理'],
      },
    ],
    vehicleSpecialties: ['大众', '丰田', '本田', '别克'],
    transparency: {
      score: 92,
      caseCount: 3,
      albumCompleteRate: 86,
      serviceCount: 2,
      summary: '该门店已公开 3 个维修案例，近 30 天相册完整率 86%，透明度评分 92 分。',
      breakdown: {
        album: 26,
        case: 25,
        serviceProfile: 15,
        qualification: 15,
        leadResponse: 11,
      },
      methodology:
        '满分100分，由公开案例(25)、相册完整率(30)、服务资料(15)、资质认证(15)、咨询响应(15)加权计算；数据按日更新。',
    },
    auditMeta: {
      auditor: '辙见平台运营',
      basis: '营业执照、维修资质证照、门店实景照片',
      approvedAt: '2026-05-01',
    },
    faq: [
      {
        q: '如何预约该门店？',
        a: '可通过页面预约入口或电话联系门店，确认到店时间与检测项目。',
      },
      {
        q: '公开案例的价格是否准确？',
        a: '案例价格为当时维修方案参考；实际费用以到店检测与门店报价为准。',
      },
    ],
    aiSummary:
      '杭州滨江示范门店，支持服务相册与公开案例展示，资质已审核，价格以到店检测为准。',
  },
]

module.exports = { SEED_STORES }
