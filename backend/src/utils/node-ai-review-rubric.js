/**
 * 类目 × 步骤检查提纲（程序可读）
 * 真源：docs/04_维修过程相册/28_ §2；itemKey 对齐 17_服务类目检测清单.md
 */
/** 单据类型 → 检查口径。全项目唯一一份，类型与权威字典
 *  STANDARD_FLOW_CHAIN（vendor/shared/constants/service-flow-nodes）对齐；
 *  漏一个类型就会出现「排了队却查不出内容」，新增类型必须同步这里。 */
const KIND_TO_STEP = {
  intake_inspection: 'intake',
  // 检测节点沿用 intake 口径（故障与外观的检查提纲）
  inspection: 'intake',
  // 接车＝留证，照片不上公网、不进车主时间线，故不排 AI 检查
  work: 'work',
  delivery_photos: 'delivery',
  inspection_report: 'quote_check',
  // 报价单据节点：单独发车主确认时也按「报价核对」查，
  // 提纲才能按类目取到 quote_check 那套写作要求
  quote_confirm: 'quote_check',
  addon_quote_confirm: 'addon_check',
  repair_report: 'delivery',
}

const TEMPLATE_TO_CATEGORY = {
  maintenance: 'maintenance',
  major_maintenance: 'major_maintenance',
  brake: 'brake',
  battery: 'battery',
  tire: 'tire',
  ac: 'ac',
  paint: 'body_paint',
  body_paint: 'body_paint',
  accident: 'accident',
  chassis_noise: 'chassis_noise',
  default: 'generic',
}

const CHASSIS_NAME = /异响|胶套|摆臂|减震|底盘响/

function photo(itemKey, part, how, keywords) {
  return {
    itemKey,
    part,
    how,
    keywords: keywords || [part],
  }
}

function textHint(field, hint) {
  return { field, hint }
}

const MECHANIC_VOICE_HINT = textHint(
  'voice',
  '检查发现和施工方案用师傅看完实车后的口吻。外观看清就写有或没有，禁止疑似；看不清整句不写。规格只写图上字样或店员已填的品牌/型号/数量，禁止适配型号；没有就不写规格。严重碰撞可写内部可能受损、需进一步拆检。不要写画面、技师正在擦拭。',
)

const COMMON_INTAKE_PHOTOS = [
  photo('odo', '仪表里程', '表盘入镜，不要导航轨迹', ['仪表', '里程', 'odo']),
  photo('walkaround', '整车/相关方位外观', '拍车身，不要微信码、名片', ['环车', '外观', 'walkaround']),
]

const COMMON_DELIVERY_PHOTOS = [
  photo('walkaround', '出场车身全貌', '拍车身，不要微信码', ['外观', '全貌', '交车']),
]

const RUBRICS = {
  maintenance: {
    intake: {
      photos: [
        ...COMMON_INTAKE_PHOTOS,
        photo('old_oil', '旧机油颜色/液位', '取样或举升观察，能看清颜色和杂质', ['机油', '旧油', 'old_oil']),
        photo('brake_fluid_level', '刹车油储罐', 'MIN–MAX 入镜', ['刹车油', 'brake_fluid']),
        photo('coolant_level', '防冻液储罐', '副水壶液位入镜', ['防冻液', 'coolant']),
        photo('tire_visual', '轮胎目视', '胎面/胎侧近景', ['轮胎', '胎面']),
      ],
      texts: [
        textHint('chiefComplaint', '写成现象句，如「到店保养，里程 ××」或具体异响/漏油，不要只写「保养」'),
      ],
      complaintExample: '到店保养，里程 {mileage}',
    },
    work: {
      photos: [
        photo('engine_oil', '新机油桶标', '规格字入镜', ['机油', '规格', 'engine_oil', '0W', '5W']),
        photo('oil_filter', '新旧机滤', '新旧滤同框或包装', ['机滤', 'oil_filter']),
        photo('oil_level_confirm', '加注后油尺/窗', '液位在标尺正常区间', ['油尺', '液位', 'oil_level']),
      ],
      texts: [
        textHint('caption', '写清规格、品牌、机滤是否一并更换'),
      ],
    },
    delivery: {
      photos: COMMON_DELIVERY_PHOTOS,
      texts: [
        textHint('warrantyPeriod', '写成时长或里程，如「5000 公里或 6 个月」'),
      ],
    },
    quote_check: {
      photos: [],
      texts: [
        textHint('chiefComplaint', '主诉与方案主项应是同一件事'),
        textHint('quoteLineName', '方案行名用部位名，如机油/机滤；巡检正常的不要预填报价行'),
        textHint('quoteLineNote', '施工方案写清做什么。机油规格、用量、品牌只写检测或包装上已经出现的；没有就不写规格，不要写适配型号。机滤是否一并更换、含不含工时与保养灯复位以本单已有内容为准'),
      ],
    },
  },
  major_maintenance: {
    intake: {
      photos: [
        ...COMMON_INTAKE_PHOTOS,
        photo('old_oil', '旧机油颜色/液位', '取样或举升观察', ['机油', '旧油']),
        photo('air_filter', '空滤盒打开', '旧件堵塞或进灰能看清', ['空滤', 'air_filter']),
        photo('drive_belt_visual', '皮带张紧段', '裂纹/毛边近景', ['皮带', 'drive_belt']),
      ],
      texts: [
        textHint('chiefComplaint', '写成到店大保或具体现象，并区分增量项'),
      ],
      complaintExample: '到店大保养，里程 {mileage}',
    },
    work: {
      photos: [
        photo('engine_oil', '新机油桶标', '规格字入镜', ['机油', '规格']),
        photo('air_filter', '空滤新旧对比', '新旧同框', ['空滤']),
        photo('spark_plugs', '火花塞新旧对比', '旧件电极入镜', ['火花塞', 'spark']),
      ],
      texts: [
        textHint('caption', '写清本次大保增加项，未做的写原因'),
      ],
    },
    delivery: {
      photos: COMMON_DELIVERY_PHOTOS,
      texts: [
        textHint('warrantyPeriod', '下次保养建议写成里程或月份'),
      ],
    },
    quote_check: {
      photos: [],
      texts: [
        textHint('quoteLineName', '增量项与检测建议一致；未做项不要出现在方案里'),
        textHint('quoteLineNote', '施工方案按项写清本次做什么。用什么件与规格只抄本单已有字样，没有就不写。基础保养与增量项分开写，增量对应检测发现的那一条'),
      ],
    },
  },
  brake: {
    intake: {
      photos: [
        ...COMMON_INTAKE_PHOTOS,
        photo('pad_thickness', '刹车片厚度', '游标/测厚读数入镜', ['片厚', '刹车片', 'pad_thickness', 'mm']),
        photo('rotor_thickness', '刹车盘厚度', '测厚读数入镜', ['盘厚', '刹车盘', 'rotor']),
        photo('rotor_condition', '盘面近景', '沟槽/发蓝能看清', ['盘面', '沟槽']),
        photo('brake_hose', '制动软管接头', '开裂/渗油近景', ['软管', 'brake_hose']),
      ],
      texts: [
        textHint('chiefComplaint', '写成异响/抖动/行程变长/常规检查'),
        textHint('findingAdvice', '片厚写前/后外侧约 ×mm；盘写剩余 ×mm、盘面状态'),
      ],
      complaintExample: '刹车异响，到店检查片厚',
    },
    work: {
      photos: [
        photo('new_parts', '新片/盘规格面', '开封规格字入镜', ['新片', '规格', 'new_parts']),
        photo('old_new_compare', '旧新同框', '旧片/旧盘与新件对照', ['新旧', '对照']),
        photo('torque_mark', '力矩扳手打卡', '防松标记入镜', ['力矩', 'torque']),
      ],
      texts: [
        textHint('caption', '写清按规范力矩；本次开/不开油路'),
      ],
    },
    delivery: {
      photos: [
        photo('fluid_level_after', '储液罐液位', '换片后液位复核入镜', ['储液', '液位']),
      ],
      texts: [
        textHint('warrantyPeriod', '试车结论 + 磨合注意；勿保证永不异响'),
      ],
    },
    quote_check: {
      photos: [],
      texts: [
        textHint('quoteLineName', '行名写「前刹车片」这类部位，不要「需处理」；盘不换要在建议里写清'),
        textHint('quoteLineNote', '施工方案写清换哪个位置（前/后、左/右）、含不含工时与制动液；盘是更换、车削还是不动要写明，并写清依据的片厚/盘厚读数'),
      ],
    },
  },
  battery: {
    intake: {
      photos: [
        ...COMMON_INTAKE_PHOTOS,
        photo('battery_test', '检测仪读数', '电压/内阻或负载入镜，VIN 勿清晰', ['电压', '内阻', '检测仪', 'battery_test']),
        photo('battery_date_code', '旧瓶日期码', '生产周号特写', ['日期', '周号']),
        photo('terminals_cables', '桩头腐蚀近景', '能看清腐蚀或松动', ['桩头', '腐蚀', 'terminals']),
      ],
      texts: [
        textHint('chiefComplaint', '写成启动困难/亏电/无法启动/启停异常'),
        textHint('findingAdvice', '写清看见什么：颜色、杂质、液位，不要只写「更换」'),
      ],
      complaintExample: '电瓶亏电打不着',
    },
    work: {
      photos: [
        photo('spec_match', '新瓶规格标签', 'AGM/EFB/铅酸与 Ah 入镜', ['Ah', 'AGM', 'EFB', '规格', 'spec_match']),
        photo('old_new_compare', '新旧电瓶同框', '旧瓶与新瓶对照', ['新旧']),
        photo('install_secure', '压板与桩头极性', '固定与接线入镜', ['压板', '桩头', '极性']),
      ],
      texts: [
        textHint('caption', '型号、容量照抄标签；标签没有就不写。不要写适配型号'),
      ],
    },
    delivery: {
      photos: COMMON_DELIVERY_PHOTOS,
      texts: [
        textHint('warrantyPeriod', '启动是否正常；质保时长与条件，禁绝对化'),
      ],
    },
    quote_check: {
      photos: [],
      texts: [
        textHint('chiefComplaint', '不要把「打不着火」直接写成一定是电瓶'),
        textHint('quoteLineName', '方案就是电瓶更换；充电系统待复查写在建议里'),
        textHint('quoteLineNote', '施工方案写清做什么。电瓶型号与容量只写标签或店员已填的，没有就不编。含不含桩头清理与装车后复核、旧件如何处理以本单已有内容为准；待复查项写进建议，不要混进这一行'),
      ],
    },
  },
  tire: {
    intake: {
      photos: [
        photo('odo', '仪表里程', '表盘入镜，不要导航轨迹', ['仪表', '里程']),
        photo('tread_wear', '胎面近景', '带参照，能看清花纹/磨损', ['花纹', '胎面', 'tread']),
        photo('sidewall_damage', '胎侧鼓包/裂纹', '损伤处特写', ['鼓包', '裂纹', '胎侧']),
      ],
      texts: [
        textHint('chiefComplaint', '写成磨损/鼓包/扎胎/偏磨/抖动'),
        textHint('findingAdvice', '写清花纹、鼓包或裂纹；哪几个位置、什么程度'),
      ],
      complaintExample: '右前胎鼓包，到店更换',
    },
    work: {
      photos: [
        photo('tire_spec', '新旧胎侧规格字', '尺寸/负荷/速度级入镜', ['规格', '225', 'tire_spec']),
        photo('dot_date', 'DOT 周号', '新胎胎侧周号特写', ['DOT', '周号']),
        photo('mount_balance', '动平衡过程或界面', '界面或过程入镜', ['动平衡', 'balance']),
        photo('pressure_set', '胎压枪读数', '设定胎压入镜', ['胎压']),
      ],
      texts: [
        textHint('caption', '写清规格、气门嘴换新或沿用、TPMS 是否学习'),
      ],
    },
    delivery: {
      photos: [photo('install_done', '装车后轮圈外观', '气门嘴/轮毂安装外观', ['轮圈', '装车'])],
      texts: [textHint('warrantyPeriod', '磨合期胎噪/路感已告知')],
    },
    quote_check: {
      photos: [],
      texts: [
        textHint('quoteLineName', '禁止「必须四条一起换」恐吓句；同轴规格不一致要写约定'),
        textHint('quoteLineNote', '施工方案写清换几条、哪几个位置、含不含动平衡与新气嘴；同轴规格与花纹须一致，不一致的把约定写清'),
      ],
    },
  },
  ac: {
    intake: {
      photos: [
        ...COMMON_INTAKE_PHOTOS,
        photo('cabin_filter_check', '抽出的旧滤特写', '脏污程度能看清', ['滤芯', '空调滤', 'cabin_filter']),
        photo('vent_temp_odor', '出风口', '出风/异味相关', ['出风', '异味']),
      ],
      texts: [
        textHint('chiefComplaint', '分清不制冷/异味/风量/换滤中的哪一种'),
        textHint('findingAdvice', '写清滤芯脏污、出风或异味，不要先写成必须洗箱'),
      ],
      complaintExample: '空调不制冷，到店检查',
    },
    work: {
      photos: [
        photo('old_new_filter', '新旧滤同框', '有更换时对照', ['滤芯', '新旧']),
        photo('refrigerant_service', '冷媒加注可见点', '勿拍金额单', ['冷媒', '加注', 'R134', 'R1234']),
      ],
      texts: [
        textHint('caption', '写清冷媒类型与已加注或未加注原因'),
      ],
    },
    delivery: {
      photos: [photo('function_recheck', '出风复查', '可选温度显示', ['出风', '制冷'])],
      texts: [textHint('warrantyPeriod', '出风变凉/异味减轻或仍在，如实写')],
    },
    quote_check: {
      photos: [],
      texts: [
        textHint('quoteLineName', '路径与诉求一致：异味单不要自动写成「必须洗箱」'),
        textHint('quoteLineNote', '施工方案写清到底做什么：补漏、加注、换滤芯还是清洗，含不含检漏工序；依据写检测时看见的现象，不要写没做过的工序'),
      ],
    },
  },
  body_paint: {
    intake: {
      photos: [
        photo('damage_far', '损伤远景定位', '部位可辨，车牌避开或待脱敏', ['远景', '定位']),
        photo('damage_near', '划痕/凹陷近景', '损伤程度能看清', ['近景', '划痕', '凹陷']),
        photo('paint_thickness', '漆膜仪读数', '损伤区 vs 邻板入镜', ['漆膜', '读数']),
      ],
      texts: [
        textHint('chiefComplaint', '写清哪块板、什么伤'),
        textHint('findingAdvice', '写清哪块板、伤到什么程度、漆膜读数。凹陷、开裂、锈蚀看清就直接写，禁止疑似；看不清整句不写。不要保证无色差'),
      ],
      complaintExample: '右前门划痕，到店钣喷',
    },
    work: {
      photos: [
        photo('prep_work', '打磨/腻子/中涂关键帧', '工序能看清', ['打磨', '腻子', '中涂']),
        photo('masking_spray', '遮蔽范围', '喷涂范围入镜', ['遮蔽', '喷涂']),
      ],
      texts: [textHint('caption', '按实际工序写；卡扣缺失须注明')],
    },
    delivery: {
      photos: [
        photo('finish_near', '完工近景', '修复区近景', ['近景', '完工']),
        photo('finish_far', '完工远景', '注意车牌', ['远景']),
        photo('color_check', '自然光过渡区', '如实拍色差', ['色差', '过渡']),
      ],
      texts: [
        textHint('warrantyPeriod', '色差/缝隙如实写；养护期与质保范围'),
      ],
    },
    quote_check: {
      photos: [],
      texts: [
        textHint('quoteLineName', '方案写清喷哪些板；不要写成「恢复原厂」'),
        textHint('quoteLineNote', '施工方案写清喷哪几块板、含哪几道工序（钣金、腻子、中涂、面漆、清漆）与是否含拆装；不要写「恢复原厂」「无色差」'),
      ],
    },
  },
  accident: {
    intake: {
      photos: [
        photo('intake_photos', '到店多方位损伤', '避无关隐私', ['损伤', '碰撞', '全貌']),
        photo('airbag_srs_status', '气囊灯/现场状态', '客观状态，勿恐吓', ['气囊', '气囊灯']),
      ],
      texts: [
        textHint('chiefComplaint', '写清碰撞方位与主要损伤'),
        textHint('findingAdvice', '损伤部位名称级清单；气囊灯等客观状态。外观能看清的直接写有或没有，禁止疑似。未拆内部不要写成已损坏，碰撞严重可写内部可能受损、需进一步拆检。不要金额'),
      ],
      complaintExample: '右前方碰撞，到店维修',
    },
    work: {
      photos: [
        photo('parts_auth', '主要更换件开箱或旧件', '保险杠/大灯等', ['开箱', '旧件']),
        photo('adas_calibration', '标定仪屏或报告', '须脱敏', ['ADAS', '标定']),
      ],
      texts: [textHint('caption', 'ADAS：已做 / 无需 / 待专项')],
    },
    delivery: {
      photos: [
        photo('finish_compare', '修后 vs 接车对照', '主要部位', ['对照', '修后']),
      ],
      texts: [
        textHint('warrantyPeriod', '抽检与注意事项；无线上报价'),
      ],
    },
    quote_check: {
      photos: [],
      texts: [
        textHint('chiefComplaint', '公开侧不要把定损金额带进说明'),
        textHint('quoteLineNote', '施工方案写清更换哪些件、是否含拆装、喷漆与 ADAS 标定；对应检测发现里哪几条要指出来。不要写金额，不要做承诺'),
      ],
    },
  },
  chassis_noise: {
    intake: {
      photos: [
        ...COMMON_INTAKE_PHOTOS,
        photo('bushing_closeup', '胶套/球头近景', '举升后开裂或磨损入镜', ['胶套', '球头', 'bushing']),
        photo('sway_bar_links', '小吊杆/稳定杆胶套', '过减速带高频项', ['吊杆', '稳定杆']),
        photo('shock_strut', '减震渗油或顶胶', '近景', ['减震', '顶胶']),
      ],
      texts: [
        textHint('chiefComplaint', '必须带场景：过减速带/转弯/刹车/冷车'),
        textHint('findingAdvice', '写清何时响、查了哪些、胶套或球头看见什么'),
      ],
      complaintExample: '过减速带底盘异响，到店检查胶套',
    },
    work: {
      photos: [
        photo('old_parts', '旧件开裂对照', '旧胶套对照', ['旧件', '开裂']),
        photo('press_torque', '压装/力矩打卡', '防松标记', ['力矩', '压装']),
      ],
      texts: [textHint('caption', '配件名称一句')],
    },
    delivery: {
      photos: COMMON_DELIVERY_PHOTOS,
      texts: [
        textHint('warrantyPeriod', '原异响场景路试：消失/减轻/仍存；动摆臂后定位做没做'),
      ],
    },
    quote_check: {
      photos: [],
      texts: [
        textHint('quoteLineName', '方案对应查出的那一件，不要写成「底盘大修」'),
        textHint('quoteLineNote', '施工方案写清换的是哪一件（哪个位置的下摆臂、球头或小吊杆）、含不含四轮定位；不要写成「底盘大修」这种笼统话'),
      ],
    },
  },
  generic: {
    intake: {
      photos: [
        ...COMMON_INTAKE_PHOTOS,
        photo('inspect_finding', '能说明结论的检测证据图', '现象对应的部位近景', ['检测', '发现']),
      ],
      texts: [
        textHint('chiefComplaint', '一句话可核实的现象，不要套用专修句式'),
      ],
      complaintExample: '到店检查，{mileage} 公里',
    },
    work: {
      photos: [
        photo('process_photos', '关键工序', '本图对应哪一步', ['工序', '施工']),
        photo('key_parts', '换件规格/包装', '有更换时留影', ['包装', '规格']),
      ],
      texts: [textHint('caption', '本图证明哪一步')],
    },
    delivery: {
      photos: [photo('finish_check', '针对诉求的复查图', '能核对主诉是否处理', ['复查', '完工'])],
      texts: [textHint('warrantyPeriod', '复查结论 + 使用注意，无绝对化')],
    },
    quote_check: {
      photos: [],
      texts: [
        textHint('quoteLineName', '方案行与发现一致'),
        textHint('quoteLineNote', '施工方案写清这一行具体做什么。用什么件只写本单已出现的品牌/型号/数量，没有就不写。对应检测发现的那一条；不要写通用套话或适配型号'),
      ],
    },
  },
}

/**
 * 工单核对口径（complete 事件）。
 * 工单是如实记录施工过程的单据，不是报价的副本，所以**不要求项目名逐字对上**，
 * 但要把三件事说出来：
 *   一、检测报告提了问题、工单里却没体现的（漏项）；
 *   二、工单做了报价范围之外的活（该走增项报价）；
 *   三、项目写得含糊，看不出做了什么、换了什么件。
 * 检测报告与报价都不可改，发现问题只能改工单文案。
 */
const WORK_SHEET_TEXT_HINTS = [
  textHint('findingCaption', '每项写清做了什么。换了什么件时，用料/品牌/数量只写包装或店员已填的，没有就不编'),
  textHint('findingAdvice', '检测报告已提而这里没做的项、或做了报价之外的项，补一句缘由'),
]

function withWorkSheetRubricStep(rubrics) {
  Object.keys(rubrics).forEach((key) => {
    const pack = rubrics[key]
    if (!pack || pack.work_sheet) return
    pack.work_sheet = {
      photos: Array.isArray(pack.work && pack.work.photos) ? pack.work.photos : [],
      texts: WORK_SHEET_TEXT_HINTS.slice(),
      complaintExample: (pack.work && pack.work.complaintExample) || '',
    }
  })
  return rubrics
}

withWorkSheetRubricStep(RUBRICS)

function resolveReviewCategory(templateId, serviceName) {
  const raw = String(templateId || '').trim()
  if (raw === 'default' || !raw) {
    if (CHASSIS_NAME.test(String(serviceName || ''))) return 'chassis_noise'
    return 'generic'
  }
  return TEMPLATE_TO_CATEGORY[raw] || 'generic'
}

function resolveReviewStep(kind) {
  return KIND_TO_STEP[kind] || ''
}

/** 执行检查时用哪个口径：优先排队时写入的，其次按单据类型推，推不出就走通用口径。
 *  必须有兜底——返回空会让执行端放弃执行，状态永远停在「正在检查」。 */
function resolveRunReviewStep(node = {}) {
  return (
    String((node.aiReview && node.aiReview.reviewStep) || '') ||
    resolveReviewStep(node.kind) ||
    'notify_check'
  )
}

/** 唯一决策入口：**查不查只由事件决定，查什么只由类型决定。**
 *  event 只有 'expose'（内容要发给车主：送达或通知确认）一种——
 *  门店内部完成动作不触发检查，因为那些内容车主当下看不到
 *  （车主端只渲染 buildOwnerFlowView 的单据节点，拍照步不镜像）。
 *  @returns {null | { step: string }} null 表示不查 */
/**
 * 统一的检查决策入口：查不查、按哪个口径查，只在这里判。
 * event: 'expose'   内容要发到车主眼前之前（通知/送达）
 *        'complete' 节点完成时。目前只认工单——工单是如实记录施工过程的单据，
 *                   定稿那一刻要跟检测报告、报价单核一遍
 */
function planNodeReview({ event, node } = {}) {
  if (!node) return null
  const kind = String(node.kind || '')
  const addon =
    kind === 'addon_quote_confirm' || String(node.insertedReason || '') === 'addon'

  if (event === 'complete') {
    // 工单＝施工记录单据：这是唯一需要在「完成」时核对的节点
    return kind === 'work' ? { step: 'work_sheet' } : null
  }
  if (event !== 'expose') return null
  // 接车＝留证步：照片不进车主时间线、不上公网，不排 AI 检查
  if (kind === 'intake') return null
  if (addon) return { step: 'addon_check' }
  return { step: resolveReviewStep(kind) || 'notify_check' }
}

function getReviewRubric(templateId, kind, serviceName, stepOverride) {
  const category = resolveReviewCategory(templateId, serviceName)
  const step = stepOverride || resolveReviewStep(kind)
  const pack = RUBRICS[category] || RUBRICS.generic
  const stepRubric = (step && pack[step]) || { photos: [], texts: [] }
  return {
    category,
    step,
    photos: Array.isArray(stepRubric.photos) ? stepRubric.photos : [],
    texts: (Array.isArray(stepRubric.texts) ? stepRubric.texts : []).concat([MECHANIC_VOICE_HINT]),
    complaintExample: stepRubric.complaintExample || pack.intake && pack.intake.complaintExample || '',
  }
}

module.exports = {
  KIND_TO_STEP,
  RUBRICS,
  resolveReviewCategory,
  resolveReviewStep,
  resolveRunReviewStep,
  planNodeReview,
  getReviewRubric,
}
