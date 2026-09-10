/**
 * 托管店页 · 按服务类目预置的消费者常问（口语）
 * 口径：docs/09_…/05_FAQ生成规范.md · 16_… v0.1
 */
const FAQ_BANK = {
  maintenance: {
    label: '保养',
    questions: [
      '不同车龄、用车频率下，大概多久保养一次比较合适？',
      '这次保养一般要走哪些流程？',
      '哪些配件通常该换，哪些可以再观察？',
      '机油粘度或品牌会怎么选？本单怎么选的？',
      '保养后要注意什么？多久再来查？',
    ],
  },
  major_maintenance: {
    label: '大保养',
    questions: [
      '大保养和日常小保养差在哪？什么时候该做大保养？',
      '这次大保养一般检查和更换哪些项目？',
      '哪些是必做，哪些可以按里程再定？',
      '做完之后多久需要复查或下次保养？',
      '和只做小保养相比，本单多处理了什么？',
    ],
  },
  chassis_noise: {
    label: '底盘',
    questions: [
      '底盘异响常见原因有哪些？本单查到了什么？',
      '不及时处理可能带来什么风险？',
      '排查和维修一般怎么走？本单流程是什么？',
      '哪些件通常要换，哪些可以继续观察？',
      '修好后怎么判断有没有复发？要注意什么？',
      '同类车型这个问题常见吗？本单有没有特别点？',
    ],
  },
  brake: {
    label: '刹车',
    questions: [
      '刹车异响或变软常见原因是什么？本单结论？',
      '刹车片/盘一般多久查一次？本单做到哪一步？',
      '只换片不换盘可以吗？本单怎么判断的？',
      '维修后磨合和复查要注意什么？',
    ],
  },
  battery: {
    label: '电瓶',
    questions: [
      '电瓶多久该检测或更换？本单怎么判断的？',
      '打不着火除了电瓶还可能查什么？',
      '更换后要注意什么？保修怎么说？',
    ],
  },
  tire: {
    label: '轮胎',
    questions: [
      '什么情况该换胎，什么情况可以修补？',
      '换胎后为什么要做动平衡？本单做了吗？',
      '轮胎保养和气压要注意什么？',
    ],
  },
  ac: {
    label: '空调',
    questions: [
      '空调不冷或异味常见原因？本单查到了什么？',
      '滤芯、冷媒一般怎么处理？本单做了哪些？',
      '处理后怎么判断效果？要注意什么？',
    ],
  },
  body_paint: {
    label: '钣喷',
    questions: [
      '划痕凹陷一般怎么评估要不要钣喷？',
      '钣金喷漆大概要走哪些步骤？本单流程？',
      '色差和漆面保养要注意什么？',
    ],
  },
  accident: {
    label: '事故',
    questions: [
      '事故车到店后一般先查什么？本单检查范围？',
      '维修流程怎么走？本单做到哪一步？',
      '修好后复查和用车要注意什么？',
    ],
  },
  default: {
    label: '通用维修',
    questions: [
      '这个问题大概是什么原因？本单怎么判断的？',
      '不处理可能有什么风险？',
      '维修流程一般怎么走？本单怎么做的？',
      '哪些必须处理，哪些可以观察？',
      '修好后要注意什么？多久复查？',
    ],
  },
}

function resolveFaqBankCategoryId(categoryId = '') {
  const key = String(categoryId || '').trim()
  if (FAQ_BANK[key]) return key
  if (key === 'chassis' || key === 'chassis_repair') return 'chassis_noise'
  return 'default'
}

function getHostedStorefrontFaqBank(categoryId = '') {
  const id = resolveFaqBankCategoryId(categoryId)
  const row = FAQ_BANK[id] || FAQ_BANK.default
  return {
    categoryId: id,
    label: row.label,
    questions: (row.questions || []).slice(0, 6).map((q) => String(q).trim()).filter(Boolean),
  }
}

module.exports = {
  FAQ_BANK,
  getHostedStorefrontFaqBank,
  resolveFaqBankCategoryId,
}
