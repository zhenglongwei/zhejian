/**
 * 类目 × 步骤检查提纲（程序可读）
 * 真源：docs/04_维修过程相册/28_ §2；itemKey 对齐 17_服务类目检测清单.md
 */
const KIND_TO_STEP = {
  intake_inspection: 'intake',
  work: 'work',
  delivery_photos: 'delivery',
  inspection_report: 'quote_check',
}

const REVIEW_KINDS = new Set(Object.keys(KIND_TO_STEP))

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
        textHint('caption', '写清型号、容量；本车需要/不需要匹配'),
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
        textHint('findingAdvice', '写清哪块板、伤到什么程度、漆膜读数；不要保证无色差'),
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
        textHint('findingAdvice', '损伤部位名称级清单；气囊灯等客观状态，不要金额'),
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
      ],
    },
  },
}

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

function getReviewRubric(templateId, kind, serviceName) {
  const category = resolveReviewCategory(templateId, serviceName)
  const step = resolveReviewStep(kind)
  const pack = RUBRICS[category] || RUBRICS.generic
  const stepRubric = (step && pack[step]) || { photos: [], texts: [] }
  return {
    category,
    step,
    photos: Array.isArray(stepRubric.photos) ? stepRubric.photos : [],
    texts: Array.isArray(stepRubric.texts) ? stepRubric.texts : [],
    complaintExample: stepRubric.complaintExample || pack.intake && pack.intake.complaintExample || '',
  }
}

function isReviewKind(kind) {
  return REVIEW_KINDS.has(String(kind || ''))
}

module.exports = {
  KIND_TO_STEP,
  REVIEW_KINDS,
  RUBRICS,
  resolveReviewCategory,
  resolveReviewStep,
  getReviewRubric,
  isReviewKind,
}
