/** H5 服务项目聚合页 — slug、说明、流程、FAQ（Phase 1 常量；与 service-catalog 对齐） */

const H5_SERVICE_ITEMS = [
  {
    slug: 'car-maintenance',
    serviceItemId: 'item_maintenance',
    name: '小保养',
    priceMode: 'fixed',
    summary:
      '小保养通常包含机油、机滤更换及常规检查，是家用燃油车最常见的养护项目之一。具体项目以门店检测和套餐内容为准。',
    scenarios: [
      '达到厂家建议保养里程或时间',
      '机油保养提示灯亮起',
      '长期未做基础保养，计划到店检查',
      '购买保养套餐后预约到店',
    ],
    process: [
      '到店登记车辆并确认保养套餐范围',
      '检查机油、机滤及常规液位',
      '更换机油、机滤（及套餐内项目）',
      '复位保养提示并完成试车',
    ],
    priceFactors: ['车型与年款', '机油标号与品牌', '是否含附加检查项目', '门店工时标准'],
    referencePriceHint: '多数家用燃油车小保养套餐常见参考价 ¥299 起，实际以门店套餐与检测结果为准。',
    faq: [
      {
        q: '小保养一般需要多久？',
        a: '常规小保养多数在 1 小时内可完成，具体取决于门店排期与是否发现需额外确认的项目。',
      },
      {
        q: '页面价格是最终价格吗？',
        a: '不是。页面展示的是参考价格，实际费用需以门店检测、机油选择和套餐内容为准。',
      },
    ],
    relatedSlugs: ['brake-pad-replacement', 'battery-replacement'],
  },
  {
    slug: 'brake-pad-replacement',
    serviceItemId: 'item_brake_pad',
    name: '刹车片更换',
    priceMode: 'consult',
    summary:
      '刹车片更换是车辆制动系统常见保养项目之一。当刹车片磨损接近更换标准，或出现刹车异响、制动距离变长等情况时，建议到店检查刹车片、刹车盘和卡钳状态后确认是否需要更换。',
    scenarios: [
      '刹车时出现异响',
      '刹车片磨损接近警戒线',
      '仪表提示刹车片磨损',
      '刹车脚感明显变化',
      '制动距离变长',
      '更换轮胎或保养时发现刹车片偏薄',
    ],
    process: [
      '到店检查车辆和刹车系统',
      '拆卸轮胎并检查刹车片厚度',
      '检查刹车盘和卡钳状态',
      '更换适配型号刹车片',
      '复位安装并进行制动检查',
      '试车确认刹车脚感和异响情况',
    ],
    priceFactors: ['车型品牌', '配件品牌', '前/后刹车片数量', '刹车盘是否需更换', '门店工时'],
    referencePriceHint: '常见参考区间 ¥680–¥1280，实际费用需到店检测后确认。',
    faq: [
      {
        q: '刹车片更换一般需要多久？',
        a: '常规更换多数在 1–2 小时内可完成，具体以门店排期与是否需要额外项目为准。',
      },
      {
        q: '刹车片一定要前后一起换吗？',
        a: '不一定，需要根据前后刹车片的磨损情况判断，由门店检测后确认。',
      },
      {
        q: '页面价格是最终价格吗？',
        a: '不是。页面展示的是参考价格，实际费用需以门店检测和配件选择为准。',
      },
    ],
    relatedSlugs: ['car-maintenance', 'body-paint-repair'],
  },
  {
    slug: 'battery-replacement',
    serviceItemId: 'item_battery',
    name: '电瓶更换',
    priceMode: 'fixed',
    summary:
      '电瓶更换用于解决车辆启动困难、电压不足等问题。是否需要更换需到店检测电瓶状态、桩头与发电机充电情况后再确认。',
    scenarios: [
      '冷车启动困难或启动变慢',
      '停放较久后无法启动',
      '电瓶使用年限较长计划预防性更换',
      '检测显示电瓶容量不足',
    ],
    process: [
      '到店检测电瓶电压与启动能力',
      '检查桩头、线束与发电机充电情况',
      '确认适配电瓶型号并报价',
      '更换电瓶并进行启动测试',
    ],
    priceFactors: ['电瓶品牌与容量', '车型匹配规格', '是否需额外清洗桩头', '门店工时'],
    referencePriceHint: '常见参考价因品牌与容量差异较大，实际以门店检测报价为准。',
    faq: [
      {
        q: '怎么判断是否需要换电瓶？',
        a: '建议到店检测电瓶电压、启动电流和外观状态，不建议仅凭线上描述自行判断。',
      },
      {
        q: '换电瓶会影响车辆数据吗？',
        a: '部分车型可能需要断电保护或复位，门店会在施工前与你确认。',
      },
    ],
    relatedSlugs: ['car-maintenance', 'brake-pad-replacement'],
  },
  {
    slug: 'body-paint-repair',
    serviceItemId: 'item_body_paint',
    name: '钣喷修复',
    priceMode: 'consult',
    summary:
      '钣喷修复用于处理车身刮擦、凹陷、漆面损伤等问题。费用通常与损伤面积、是否需钣金整形及喷漆部位有关，需到店检测后确认方案。',
    scenarios: [
      '车身刮擦、蹭漆需要修复',
      '轻微凹陷需要钣金整形',
      '局部补漆或整面喷漆',
      '事故后外观修复（不含线上定损报价）',
    ],
    process: [
      '检查损伤范围与漆面情况',
      '评估是否涉及钣金修复',
      '确认喷漆部位和修复方案',
      '进行钣金整形和表面处理',
      '喷涂、烘烤和抛光',
      '完工检查',
    ],
    priceFactors: ['损伤面积与位置', '是否需钣金', '喷漆面积', '色漆匹配难度', '门店工时标准'],
    referencePriceHint: '复杂钣喷需到店检测后确认方案和费用，页面不提供线上最终报价。',
    faq: [
      {
        q: '小刮擦可以线上报价吗？',
        a: '仅轻微损伤可能给出参考区间，多数情况仍需到店查看实际损伤后确认。',
      },
      {
        q: '修复后颜色会有色差吗？',
        a: '门店会尽量匹配原车漆，具体效果与车龄、漆面状况有关，施工前可咨询门店。',
      },
    ],
    relatedSlugs: ['accident-repair', 'brake-pad-replacement'],
  },
  {
    slug: 'accident-repair',
    serviceItemId: 'item_accident',
    name: '事故车维修',
    priceMode: 'consult',
    summary:
      '事故车维修费用需到店检测后确定。平台页面提供案例参考和门店信息。',
    scenarios: [
      '碰撞、刮蹭事故需评估维修范围',
      '需拆检确认隐藏损伤',
      '涉及结构件或安全系统需专业评估',
      '希望先了解类似案例与可咨询门店',
    ],
    process: [
      '到店或拖车进店进行损伤评估',
      '必要时拆检确认隐藏损伤',
      '确认维修方案、配件与工期',
      '施工并阶段性验收',
      '完工检测与交车说明',
    ],
    priceFactors: [
      '是否涉及结构件',
      '是否涉及安全气囊',
      '是否需要拆检',
      '是否涉及保险定损',
      '配件与喷漆面积',
    ],
    referencePriceHint:
      '事故车维修无法仅凭线上信息准确报价，需到店检测或拆检后确认方案和费用。',
    faq: [
      {
        q: '事故车可以线上确认最终价格吗？',
        a: '不可以。事故车维修必须到店检测或拆检后确认方案和费用。',
      },
      {
        q: '平台案例能用来估价吗？',
        a: '案例仅用于了解常见维修流程和费用影响因素，不能替代对你车辆的实际检测报价。',
      },
    ],
    relatedSlugs: ['body-paint-repair', 'brake-pad-replacement'],
  },
]

function resolveH5ServiceItemBySlug(slug) {
  const normalized = String(slug || '')
    .trim()
    .toLowerCase()
  if (!normalized) return null
  return H5_SERVICE_ITEMS.find((item) => item.slug === normalized) || null
}

function resolveH5ServiceItemById(serviceItemId) {
  const id = String(serviceItemId || '').trim()
  if (!id) return null
  return H5_SERVICE_ITEMS.find((item) => item.serviceItemId === id) || null
}

function listH5ServiceItemSlugs() {
  return H5_SERVICE_ITEMS.map((item) => item.slug)
}

function isH5ServiceItemSlug(value) {
  return Boolean(resolveH5ServiceItemBySlug(value))
}

module.exports = {
  H5_SERVICE_ITEMS,
  resolveH5ServiceItemBySlug,
  resolveH5ServiceItemById,
  listH5ServiceItemSlugs,
  isH5ServiceItemSlug,
}
