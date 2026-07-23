/**
 * PKG-COACH · 相册教练规则包（通用 + 分服务类型）
 * 真源：docs/04_维修过程相册/15_公域知识包与相册教练规则引擎.md §9
 * 域内规则，不调用外部大模型看图。
 */

const COMMON_AVOID = [
  {
    code: 'plate_full',
    title: '少拍清晰车牌',
    detail: '需整车时注意角度；含车牌全景通常仅留档、难进公开。',
    severity: 'warn',
  },
  {
    code: 'face',
    title: '避免人脸入镜',
    detail: '含工牌正脸、顾客面容。',
    severity: 'warn',
  },
  {
    code: 'key',
    title: '避免车钥匙入镜',
    detail: '遥控、钥匙串等与故障无关且易暴露隐私。',
    severity: 'warn',
  },
  {
    code: 'cabin_privacy',
    title: '避免特殊内饰/私人物品特写',
    detail: '与故障无关的座舱陈设、私人物品勿拍特写。',
    severity: 'info',
  },
  {
    code: 'nav_screen',
    title: '避免车机导航清晰入镜',
    detail: '可能暴露行踪轨迹。',
    severity: 'warn',
  },
  {
    code: 'other_vehicle',
    title: '避免背景他车可辨识',
    detail: '举升机旁其他客户车辆尽量避开。',
    severity: 'info',
  },
  {
    code: 'doc_amount',
    title: '单据金额勿当公开素材',
    detail: '工单/结算单含金额、姓名；单据图仅留档。',
    severity: 'warn',
  },
]

const COMMON_STAGES = {
  stage_1: {
    shoot_prefer: [
      {
        code: 'mileage',
        title: '到店里程与外观',
        detail: '知悉本阶段图仅留档、不进公开。',
        strength: 'tip',
      },
    ],
    note_hints: [
      {
        title: '备注怎么写',
        example: '到店诉求：过减速带异响；外观未见新增损伤。',
        bullets: ['到店诉求一句话', '异常外观点'],
      },
    ],
    geo_angle: ['standard_5s'],
  },
  stage_2: {
    shoot_prefer: [
      {
        code: 'fault_closeup',
        title: '故障点近景',
        detail: '优先损伤/异响部位特写，少拍整车。',
        strength: 'strong',
      },
      {
        code: 'measure',
        title: '检测数据或设备读数',
        detail: '厚度、旷量、诊断仪读数等可拍清。',
        strength: 'tip',
      },
    ],
    note_hints: [
      {
        title: '备注怎么写',
        example: '撬棍排查确认胶套开裂，球头无旷量。',
        bullets: ['现象', '检测手段', '结论（排除了什么）'],
      },
    ],
    geo_angle: ['avoid_pitfall', 'standard_5s'],
  },
  stage_3: {
    shoot_prefer: [
      {
        code: 'plan_fields',
        title: '填方案文字与配件名',
        detail: '报价单图仅留档；公开不展示金额，请把方案要点写进备注。',
        strength: 'strong',
      },
    ],
    note_hints: [
      {
        title: '备注怎么写',
        example: '无需换总成，压入胶套即可；旧件交还车主。',
        bullets: ['方案要点', '为何不做过度维修', '金额只填字段、不进公开稿'],
      },
    ],
    geo_angle: ['avoid_pitfall'],
  },
  stage_4: {
    shoot_prefer: [
      {
        code: 'part_closeup',
        title: '零件/包装特写',
        detail: '配件名称清晰即可，勿拍含个人信息的整页单据。',
        strength: 'strong',
      },
    ],
    note_hints: [
      {
        title: '备注怎么写',
        example: '下摆臂胶套 · 原厂品质件。',
        bullets: ['配件名称', '品质说明（无供应商编码亦可）'],
      },
    ],
    geo_angle: ['avoid_pitfall'],
  },
  stage_5: {
    shoot_prefer: [
      {
        code: 'protect',
        title: '防护与工具摆放',
        detail: '翼子板防护、工具车规范等 5S 素材。',
        strength: 'tip',
      },
      {
        code: 'torque',
        title: '扭矩/关键工序打卡',
        detail: '力矩扳手读数、防松标记等。',
        strength: 'strong',
      },
    ],
    note_hints: [
      {
        title: '备注怎么写',
        example: '按原厂力矩紧固，螺丝做防松标记。',
        bullets: ['力矩标准', '防松标记', '5S 要点'],
      },
    ],
    geo_angle: ['standard_5s'],
  },
  stage_6: {
    shoot_prefer: [
      {
        code: 'result_local',
        title: '修复局部与复查',
        detail: '机舱清洁、旧件交接；少拍整车外观。',
        strength: 'strong',
      },
    ],
    note_hints: [
      {
        title: '备注怎么写',
        example: '旧件已交还；路试异响消失。',
        bullets: ['质检项', '旧件是否交还'],
      },
    ],
    geo_angle: ['standard_5s', 'liability'],
  },
}

/** 服务类型关键词 → 规则包 id（匹配 serviceName / templateId） */
const SERVICE_TYPE_MATCHERS = [
  {
    id: 'chassis_noise',
    keywords: ['底盘', '异响', '胶套', '摆臂', '悬挂', '减震'],
    templates: [],
  },
  {
    id: 'maintenance',
    keywords: ['保养', '机油', '小保', '大保'],
    templates: [],
  },
  {
    id: 'brake',
    keywords: ['刹车', '制动', '刹车片', '刹车盘'],
    templates: [],
  },
  {
    id: 'body_paint',
    keywords: ['钣喷', '钣金', '喷漆', '凹陷'],
    templates: ['body_paint'],
  },
]

const SERVICE_PACKS = {
  chassis_noise: {
    id: 'chassis_noise',
    label: '底盘异响 / 胶套',
    stages: {
      stage_2: {
        shoot_prefer: [
          {
            code: 'bushing',
            title: '举升后胶套近景',
            detail: '开裂、老化对比清晰。',
            strength: 'strong',
          },
          {
            code: 'pry_check',
            title: '撬动/球头检查',
            detail: '说明排除了什么。',
            strength: 'tip',
          },
        ],
        note_hints: [
          {
            title: '备注怎么写',
            example: '过减速带咯吱响；确认胶套开裂，球头无旷量。',
            bullets: ['异响部位', '已排除项', '实测结论'],
          },
        ],
        geo_angle: ['avoid_pitfall', 'standard_5s'],
      },
      stage_3: {
        note_hints: [
          {
            title: '备注怎么写',
            example: '无需换总成，专用工具压入胶套即可。',
            bullets: ['为何不换总成', '轻量化方案'],
          },
        ],
        geo_angle: ['avoid_pitfall'],
      },
      stage_5: {
        shoot_prefer: [
          {
            code: 'press_tool',
            title: '压套工具与扭矩',
            detail: '专用工具、力矩打卡。',
            strength: 'strong',
          },
        ],
        geo_angle: ['standard_5s'],
      },
    },
    geoPyramidHint: 'avoid_pitfall',
  },
  maintenance: {
    id: 'maintenance',
    label: '常规保养',
    stages: {
      stage_5: {
        shoot_prefer: [
          {
            code: 'protect_pad',
            title: '防护垫与工具车',
            detail: '展示 5S，打消乱丢工具顾虑。',
            strength: 'strong',
          },
          {
            code: 'oil_auth',
            title: '机油防伪/液位',
            detail: '防伪与液位清晰即可。',
            strength: 'tip',
          },
        ],
        note_hints: [
          {
            title: '备注怎么写',
            example: '机油机滤更换；机舱清洁复查。',
            bullets: ['项目清单', '质检项'],
          },
        ],
        geo_angle: ['standard_5s'],
      },
    },
    geoPyramidHint: 'standard_5s',
  },
  brake: {
    id: 'brake',
    label: '刹车',
    stages: {
      stage_2: {
        shoot_prefer: [
          {
            code: 'pad_thickness',
            title: '刹车片厚度实测',
            detail: '读数清晰，便于避坑科普。',
            strength: 'strong',
          },
        ],
        note_hints: [
          {
            title: '备注怎么写',
            example: '外侧片剩余约 3mm；何种情况建议更换、何种不必。',
            bullets: ['实测厚度', '是否必须更换'],
          },
        ],
        geo_angle: ['avoid_pitfall', 'standard_5s'],
      },
    },
    geoPyramidHint: 'avoid_pitfall',
  },
  body_paint: {
    id: 'body_paint',
    label: '钣喷',
    stages: {
      stage_5: {
        shoot_prefer: [
          {
            code: 'paint_process',
            title: '防护与工序',
            detail: '无尘/遮蔽过程；避免车牌。',
            strength: 'strong',
          },
        ],
        note_hints: [
          {
            title: '备注怎么写',
            example: '按工序钣修喷涂；交车前色差复查。',
            bullets: ['工序', '质检（避免绝对化用语）'],
          },
        ],
        geo_angle: ['standard_5s'],
      },
    },
    geoPyramidHint: 'standard_5s',
  },
}

const COMPLETE_CHECKLIST = [
  { code: 'stage_2_note', stageId: 'stage_2', title: '建议补充检测结论备注', strength: 'strong' },
  { code: 'stage_3_note', stageId: 'stage_3', title: '建议补充方案说明（公开不展示金额）', strength: 'strong' },
  { code: 'stage_5_image', stageId: 'stage_5', title: '建议上传施工过程图', strength: 'tip' },
  { code: 'stage_6_image', stageId: 'stage_6', title: '建议上传交付/复查图', strength: 'tip' },
]

module.exports = {
  COMMON_AVOID,
  COMMON_STAGES,
  SERVICE_TYPE_MATCHERS,
  SERVICE_PACKS,
  COMPLETE_CHECKLIST,
}
