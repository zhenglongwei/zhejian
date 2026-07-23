/**
 * PKG-COACH · 相册教练规则包（通用 + 分服务类型）
 * 真源：docs/04_维修过程相册/15_公域知识包与相册教练规则引擎.md §9
 * 内容映射：docs/04_维修过程相册/16_相册教练内容映射_钣喷样板.md
 * 域内规则，不调用外部大模型看图。
 *
 * 约定：COMMON_* 必须真正中性，禁止某一类维修的专属示例（胶套/减速带等）。
 * 专属示例只放在 SERVICE_PACKS 对应包内。
 */

const COMMON_AVOID = [
  {
    code: 'plate_full',
    title: '少拍清晰车牌',
    detail: '需整车时注意角度，少拍清晰车牌特写。',
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
    detail: '遥控、钥匙串等与故障无关。',
    severity: 'warn',
  },
  {
    code: 'cabin_privacy',
    title: '避免私人物品特写',
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
    title: '单据金额勿入镜',
    detail: '工单/结算单含金额、姓名时勿作展示素材。',
    severity: 'warn',
  },
]

/** 真正中性的阶段底稿；专属话术见 SERVICE_PACKS */
const COMMON_STAGES = {
  stage_1: {
    shoot_prefer: [
      {
        code: 'arrival_overview',
        title: '到店外观与诉求相关部位',
        detail: '拍清到店相关部位即可。',
        strength: 'tip',
      },
    ],
    note_hints: [
      {
        title: '备注怎么写',
        example: '到店诉求一句话；外观未见新增异常。',
        bullets: ['到店诉求一句话', '异常外观点'],
      },
    ],
    geo_angle: [],
  },
  stage_2: {
    shoot_prefer: [
      {
        code: 'fault_closeup',
        title: '问题点近景',
        detail: '优先损伤/故障部位特写，少拍整车。',
        strength: 'strong',
      },
      {
        code: 'measure',
        title: '可读的检测依据',
        detail: '有读数、对比、诊断结果时尽量拍清。',
        strength: 'tip',
      },
    ],
    note_hints: [
      {
        title: '备注怎么写',
        example: '现象 + 检查手段 + 结论（排除了什么）。',
        bullets: ['现象', '检测手段', '结论'],
      },
    ],
    geo_angle: ['avoid_pitfall'],
  },
  stage_3: {
    shoot_prefer: [
      {
        code: 'plan_fields',
        title: '填方案文字与项目名',
        detail: '方案要点写进备注；报价单可附图。',
        strength: 'strong',
      },
    ],
    note_hints: [
      {
        title: '备注怎么写',
        example: '方案要点；为何不采用过度方案。',
        bullets: ['方案要点', '为何不做过度维修'],
      },
    ],
    geo_angle: ['avoid_pitfall'],
  },
  stage_4: {
    shoot_prefer: [
      {
        code: 'part_closeup',
        title: '配件/材料包装或标签特写',
        detail: '名称清晰即可。',
        strength: 'strong',
      },
    ],
    note_hints: [
      {
        title: '备注怎么写',
        example: '材料或配件名称 · 用途一句。',
        bullets: ['名称', '用途说明'],
      },
    ],
    geo_angle: ['liability'],
  },
  stage_5: {
    shoot_prefer: [
      {
        code: 'protect',
        title: '防护与现场规范',
        detail: '遮蔽、防护垫、工具摆放等。',
        strength: 'tip',
      },
      {
        code: 'key_process',
        title: '关键工序打卡',
        detail: '本服务类型的关键步骤特写。',
        strength: 'strong',
      },
    ],
    note_hints: [
      {
        title: '备注怎么写',
        example: '已完成关键工序；质检关注点一句。',
        bullets: ['关键工序', '质检关注'],
      },
    ],
    geo_angle: ['standard_5s'],
  },
  stage_6: {
    shoot_prefer: [
      {
        code: 'result_local',
        title: '完工局部与复查',
        detail: '修复/更换部位近景；少拍整车全景。',
        strength: 'strong',
      },
    ],
    note_hints: [
      {
        title: '备注怎么写',
        example: '验收项已查；交接情况一句。',
        bullets: ['质检项', '交接说明'],
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
    templates: ['maintenance', 'major_maintenance'],
  },
  {
    id: 'brake',
    keywords: ['刹车', '制动', '刹车片', '刹车盘'],
    templates: ['brake'],
  },
  {
    id: 'body_paint',
    keywords: ['钣喷', '钣金', '喷漆', '凹陷', '划痕', '补漆'],
    templates: ['body_paint'],
  },
]

const SERVICE_PACKS = {
  chassis_noise: {
    id: 'chassis_noise',
    label: '底盘异响 / 胶套',
    stages: {
      stage_1: {
        note_hints: [
          {
            title: '备注怎么写',
            example: '到店诉求：过减速带异响；外观未见新增损伤。',
            bullets: ['异响场景', '外观异常点（如有）'],
          },
        ],
      },
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
      stage_4: {
        note_hints: [
          {
            title: '备注怎么写',
            example: '下摆臂胶套 · 品质说明一句。',
            bullets: ['配件名称', '品质说明'],
          },
        ],
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
        note_hints: [
          {
            title: '备注怎么写',
            example: '按原厂力矩紧固，螺丝做防松标记。',
            bullets: ['力矩标准', '防松标记'],
          },
        ],
        geo_angle: ['standard_5s'],
      },
      stage_6: {
        note_hints: [
          {
            title: '备注怎么写',
            example: '旧件已交还；路试异响消失。',
            bullets: ['旧件交接', '路试结论'],
          },
        ],
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
      stage_5: {
        shoot_prefer: [
          {
            code: 'torque',
            title: '安装扭矩打卡',
            detail: '力矩读数、管路规范操作可见点。',
            strength: 'strong',
          },
        ],
        note_hints: [
          {
            title: '备注怎么写',
            example: '按规范力矩紧固；磨合建议已告知（无绝对化承诺）。',
            bullets: ['力矩', '磨合/排气说明（如有）'],
          },
        ],
        geo_angle: ['standard_5s'],
      },
    },
    geoPyramidHint: 'avoid_pitfall',
  },
  /** 对齐 16_相册教练内容映射_钣喷样板.md §3 */
  body_paint: {
    id: 'body_paint',
    label: '钣喷修复',
    stages: {
      stage_1: {
        replace_shoot_prefer: true,
        shoot_prefer: [
          {
            code: 'damage_far',
            title: '损伤部位远景（一处一图）',
            detail: '拍清位置即可；近景放到检测记录。',
            strength: 'strong',
          },
        ],
        note_hints: [
          {
            title: '备注怎么写',
            example: '右前门、右后视镜壳划痕到店；外观未见新增磕碰。',
            bullets: ['到店诉求一句话', '损伤部位清单'],
          },
        ],
        geo_angle: [],
      },
      stage_2: {
        replace_shoot_prefer: true,
        shoot_prefer: [
          {
            code: 'damage_closeup',
            title: '各损伤点近景/特写',
            detail: '顺序与完工对照一一对应。',
            strength: 'strong',
          },
          {
            code: 'damage_multi_angle',
            title: '多角度损伤',
            detail: '侧面、斜角有助于判断深度。',
            strength: 'tip',
          },
        ],
        note_hints: [
          {
            title: '备注怎么写',
            example: '右前门中度划痕，漆下未见钣金变形；建议局部补漆，不必整面喷。',
            bullets: ['现象', '检查手段', '结论'],
          },
        ],
        geo_angle: ['avoid_pitfall'],
      },
      stage_3: {
        note_hints: [
          {
            title: '备注怎么写',
            example: '局部补漆不拆件；珍珠漆需调色过渡；工期视天气与烤漆排程。',
            bullets: ['修复方式', '是否拆件'],
          },
        ],
        geo_angle: ['avoid_pitfall'],
      },
      stage_4: {
        replace_shoot_prefer: true,
        shoot_prefer: [
          {
            code: 'paint_material',
            title: '漆与辅料包装/标签',
            detail: '色漆、清漆、腻子等凭证特写。',
            strength: 'strong',
          },
        ],
        note_hints: [
          {
            title: '备注怎么写',
            example: '本次使用色漆+清漆；包装批号已拍照，可按品牌官网核对。',
            bullets: ['材料名称', '用途一句'],
          },
        ],
        geo_angle: ['liability'],
      },
      stage_5: {
        replace_shoot_prefer: true,
        shoot_prefer: [
          {
            code: 'mask_protect',
            title: '遮蔽与防护',
            detail: '展示规范防护；避免车牌入镜。',
            strength: 'strong',
          },
          {
            code: 'paint_process',
            title: '关键工序（打磨/腻子/调色/喷涂）',
            detail: '对齐钣金点→腻子/中涂/遮蔽→面漆/抛光可见点。',
            strength: 'strong',
          },
        ],
        note_hints: [
          {
            title: '备注怎么写',
            example: '已打磨并完成调色比对；按工序喷涂，交车前自然光复查色差。',
            bullets: ['关键工序', '质检关注（避免「100% 无色差」）'],
          },
        ],
        geo_angle: ['standard_5s', 'avoid_pitfall'],
      },
      stage_6: {
        replace_shoot_prefer: true,
        shoot_prefer: [
          {
            code: 'paint_result',
            title: '完工近景（与检测同序同角）',
            detail: '便于车主对比；少拍整车全景。',
            strength: 'strong',
          },
          {
            code: 'color_check',
            title: '色差检查（自然光）',
            detail: '邻板过渡区复查过程可拍。',
            strength: 'tip',
          },
        ],
        note_hints: [
          {
            title: '备注怎么写',
            example: '自然光下过渡区复查；养护期内避免高压水枪；质保以门店说明为准。',
            bullets: ['验收项', '养护/质保'],
          },
        ],
        geo_angle: ['standard_5s', 'liability'],
      },
    },
    geoPyramidHint: 'standard_5s',
  },
}

const COMPLETE_CHECKLIST = [
  { code: 'stage_2_note', stageId: 'stage_2', title: '建议补充检测结论备注', strength: 'strong' },
  { code: 'stage_3_note', stageId: 'stage_3', title: '建议补充方案说明', strength: 'strong' },
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
