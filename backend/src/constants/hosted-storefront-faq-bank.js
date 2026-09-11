/**
 * 托管店页 · 按服务类目预置的消费者常问（口语）
 * 对齐：docs/04/07_案例生成规则 §10.2（保养/维修问法）
 *      + 案例信源讨论（车主痛点：次日用车、是否换总成、质保等）
 *      + 05_FAQ（答案须有信息增量）
 */
const FAQ_BANK = {
  maintenance: {
    label: '保养',
    questions: [
      '这次保养具体做了哪些项目？',
      '哪些项目这次没做、之后再做？',
      '不同车龄和用车习惯下，大概多久保养一次比较合适？本单怎么判断的？',
      '机油和滤芯这类，一般怎么选？本单怎么选的？',
      '做完要注意什么？质保或复查怎么说？',
    ],
  },
  major_maintenance: {
    label: '大保养',
    questions: [
      '大保养和日常小保养差在哪？本单属于哪一类？',
      '这次大保养检查和更换了哪些项目？',
      '哪些是必做，哪些可以按里程再定？本单怎么取舍的？',
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
      '哪些件通常要换，哪些可以继续观察？本单怎么定的？',
      '修好后能不能正常开？怎么判断有没有复发？',
      '修完质保怎么说？要注意什么？',
    ],
  },
  brake: {
    label: '刹车',
    questions: [
      '刹车异响或变软常见原因是什么？本单结论？',
      '只换片不换盘可以吗？本单怎么判断的？',
      '修好后磨合和复查要注意什么？能不能马上正常开？',
      '这次质保怎么说？',
    ],
  },
  battery: {
    label: '电瓶',
    questions: [
      '电瓶多久该检测或更换？本单怎么判断的？',
      '打不着火除了电瓶还可能查什么？本单查了哪些？',
      '更换后要注意什么？保修怎么说？',
    ],
  },
  tire: {
    label: '轮胎',
    questions: [
      '什么情况该换胎，什么情况可以修补？本单怎么定的？',
      '换胎后为什么要做动平衡？本单做了吗？',
      '修好后用车和气压要注意什么？',
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
      '划痕凹陷一般怎么评估要不要钣喷？本单怎么定的？',
      '钣金喷漆大概要走哪些步骤？本单流程？',
      '修好后色差和用车要注意什么？质保怎么说？',
    ],
  },
  accident: {
    label: '事故',
    questions: [
      '事故车到店后一般先查什么？本单检查范围？',
      '要不要换总成、能不能尽快开走？本单怎么判断的？',
      '修好后复查和用车要注意什么？质保怎么说？',
    ],
  },
  default: {
    label: '通用维修',
    questions: [
      '这次查出了什么、怎么处理的？',
      '不处理可能有什么风险？',
      '为什么有的件这次没换（比如总成或相关件）？',
      '修好后能不能正常开？要注意什么？',
      '这次质保怎么说？旧件怎么处理？',
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
