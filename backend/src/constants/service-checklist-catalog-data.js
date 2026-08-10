/** Auto-generated from 17_服务类目检测清单.md — re-run: node backend/scripts/gen-checklist-catalog.js */
const CATALOG_VERSION = '2026-08-10'

const CATEGORIES = {
  "maintenance": {
    "categoryId": "maintenance",
    "label": "小保养",
    "inheritsFrom": null,
    "items": [
      {
        "itemKey": "odo",
        "label": "里程表",
        "suggestStageId": "stage_1",
        "group": "接车建档",
        "noteExample": "到店里程 ××km；与保养周期已核对。",
        "strength": "strong",
        "linkHint": "接车拍仪表；勿拍清导航轨迹"
      },
      {
        "itemKey": "walkaround",
        "label": "环车预检",
        "suggestStageId": "stage_1",
        "group": "外观",
        "noteExample": "环车未见新增明显损伤 / 已注明既有划痕位置。",
        "strength": "tip",
        "linkHint": "接车外观；完工可补「出场外观」同项"
      },
      {
        "itemKey": "lights",
        "label": "灯光",
        "suggestStageId": "stage_2",
        "group": "电气",
        "noteExample": "近光/刹车灯/转向灯工作正常；如有不亮已注明。",
        "strength": "tip",
        "linkHint": "检测点亮拍照"
      },
      {
        "itemKey": "dtc",
        "label": "故障码 / 指示灯",
        "suggestStageId": "stage_2",
        "group": "电气",
        "noteExample": "仪表无异常灯 / 已读码：××，建议××。",
        "strength": "tip",
        "linkHint": "检测拍仪表灯或诊断仪屏幕（注意脱敏）"
      },
      {
        "itemKey": "wiper",
        "label": "雨刮器",
        "suggestStageId": "stage_2",
        "group": "外观",
        "noteExample": "刮片无硬化开裂；喷水正常。",
        "strength": "tip",
        "linkHint": "检测特写刮片"
      },
      {
        "itemKey": "battery_terminals",
        "label": "电瓶外观 / 桩头",
        "suggestStageId": "stage_2",
        "group": "电气",
        "noteExample": "桩头无严重腐蚀；固定正常。",
        "strength": "tip",
        "linkHint": "检测机舱电瓶区"
      },
      {
        "itemKey": "brake_fluid_level",
        "label": "刹车油液位",
        "suggestStageId": "stage_2",
        "group": "油液",
        "noteExample": "储液罐在 MIN–MAX 之间；液色是否发黑已注明。",
        "strength": "tip",
        "linkHint": "检测储液罐；若大保更换刹车油见增量项"
      },
      {
        "itemKey": "coolant_level",
        "label": "防冻液液位",
        "suggestStageId": "stage_2",
        "group": "油液",
        "noteExample": "副水壶液位正常；无明显渗漏。",
        "strength": "tip",
        "linkHint": "检测副水壶；更换见大保增量"
      },
      {
        "itemKey": "tire_visual",
        "label": "轮胎目视",
        "suggestStageId": "stage_2",
        "group": "底盘轮胎",
        "noteExample": "胎面磨损均匀；未见帘线/鼓包。",
        "strength": "tip",
        "linkHint": "检测胎面/胎侧；施工若动平衡仍可挂本项"
      },
      {
        "itemKey": "tire_pressure",
        "label": "胎压实测",
        "suggestStageId": "stage_2",
        "group": "底盘轮胎",
        "noteExample": "四轮胎压实测 ××；与车门标牌或约定值已核对。",
        "strength": "tip",
        "linkHint": "检测或完工胎压枪读数入镜"
      },
      {
        "itemKey": "chassis_visual",
        "label": "底盘目视",
        "suggestStageId": "stage_2",
        "group": "底盘轮胎",
        "noteExample": "举升后未见明显漏油、胶套严重开裂（如有异常已注明）。",
        "strength": "tip",
        "linkHint": "检测举升底盘；施工相关仍挂本项"
      },
      {
        "itemKey": "engine_oil",
        "label": "机油",
        "suggestStageId": "stage_2",
        "group": "机油机滤",
        "noteExample": "规格 ××（如 0W-20）；品牌××；按量加注。",
        "strength": "strong",
        "linkHint": "检测可写拟定规格；施工拍加注/桶标；完工挂液位确认"
      },
      {
        "itemKey": "oil_filter",
        "label": "机油滤芯",
        "suggestStageId": "stage_2",
        "group": "机油机滤",
        "noteExample": "机滤一并更换；品牌/型号××。",
        "strength": "strong",
        "linkHint": "施工新旧滤芯；包装可挂本项"
      },
      {
        "itemKey": "old_oil",
        "label": "旧机油状态",
        "suggestStageId": "stage_2",
        "group": "机油机滤",
        "noteExample": "放出旧油颜色/杂质简述（如发黑但仍流畅）。",
        "strength": "tip",
        "linkHint": "施工放油过程/接油盆特写最合适"
      },
      {
        "itemKey": "oil_level_confirm",
        "label": "机油液位确认",
        "suggestStageId": "stage_2",
        "group": "机油机滤",
        "noteExample": "热车/静置后液位在标尺正常区间。",
        "strength": "strong",
        "linkHint": "**完工**复查机油尺/侧视窗优先"
      },
      {
        "itemKey": "cabin_filter",
        "label": "空调滤芯",
        "suggestStageId": "stage_2",
        "group": "滤芯易损",
        "noteExample": "本次小保套餐**含**则检/换并简述脏污；**未含**则跳过并一句说明。",
        "strength": "tip",
        "linkHint": "有更换时新旧对比；与大保同 `itemKey`，大保侧不重复建项"
      },
      {
        "itemKey": "next_service_advice",
        "label": "下次保养建议",
        "suggestStageId": "stage_2",
        "group": "交付建议",
        "noteExample": "建议下次约 ××km 或 × 个月（以手册与用车环境为准）。",
        "strength": "tip",
        "linkHint": "以文字说明为主；可挂保养提示截图（脱敏）"
      }
    ]
  },
  "major_maintenance": {
    "categoryId": "major_maintenance",
    "label": "大保养",
    "inheritsFrom": "maintenance",
    "items": [
      {
        "itemKey": "air_filter",
        "label": "空气滤芯",
        "suggestStageId": "stage_2",
        "group": "滤芯易损",
        "noteExample": "空滤已检/已换；旧件堵塞或进灰情况简述。",
        "strength": "strong",
        "linkHint": "检测打开滤盒；施工新旧对比挂本项"
      },
      {
        "itemKey": "spark_plugs",
        "label": "火花塞",
        "suggestStageId": "stage_2",
        "group": "点火",
        "noteExample": "按里程检/换火花塞；电极间隙或积碳简述（如有）。",
        "strength": "tip",
        "linkHint": "施工拆下旧件特写；包装可挂"
      },
      {
        "itemKey": "fuel_filter",
        "label": "燃油滤清器",
        "suggestStageId": "stage_2",
        "group": "滤芯易损",
        "noteExample": "按手册/车型检或换；本车无独立燃油滤或本次不做则跳过并说明。",
        "strength": "tip",
        "linkHint": "施工新旧件（车型相关）"
      },
      {
        "itemKey": "brake_fluid_service",
        "label": "刹车油（更换/深度检）",
        "suggestStageId": "stage_2",
        "group": "油液",
        "noteExample": "含水量/液色超标已更换，或检测合格暂不换并说明依据。",
        "strength": "tip",
        "linkHint": "与 `brake_fluid_level` 区分：本项侧重更换或仪器检测"
      },
      {
        "itemKey": "coolant_service",
        "label": "防冻液（更换/深度检）",
        "suggestStageId": "stage_2",
        "group": "油液",
        "noteExample": "按周期更换或检测冰点/液质后建议保留并说明。",
        "strength": "tip",
        "linkHint": "与 `coolant_level` 区分；施工排空加注挂本项"
      },
      {
        "itemKey": "transmission_fluid",
        "label": "变速箱油",
        "suggestStageId": "stage_2",
        "group": "油液",
        "noteExample": "按手册检/换；形式（放油/循环）与规格简述。",
        "strength": "tip",
        "linkHint": "非所有车必做；不做则标跳过并一句原因"
      },
      {
        "itemKey": "other_fluids",
        "label": "其他油液（车型相关）",
        "suggestStageId": "stage_2",
        "group": "油液",
        "noteExample": "助力油 / 分动箱或差速器油等：已检/已换或本车无此项。",
        "strength": "tip",
        "linkHint": "非所有车；跳过须一句原因"
      },
      {
        "itemKey": "timing_service_note",
        "label": "正时皮带 / 链条周期",
        "suggestStageId": "stage_2",
        "group": "发动机舱",
        "noteExample": "已核对手册周期：未到 / 建议专项检查或更换（本项不做必换承诺）。",
        "strength": "tip",
        "linkHint": "以文字为主；有拆检则挂图"
      },
      {
        "itemKey": "drive_belt_visual",
        "label": "皮带目视",
        "suggestStageId": "stage_2",
        "group": "发动机舱",
        "noteExample": "出现裂纹/毛边/松弛已注明；正常则写未见异常。",
        "strength": "tip",
        "linkHint": "检测张紧段特写"
      },
      {
        "itemKey": "major_materials",
        "label": "本次更换材料总览",
        "suggestStageId": "stage_2",
        "group": "材料",
        "noteExample": "列出本次实际更换：空滤/空调滤/火花塞/油液等（无金额）。",
        "strength": "strong",
        "linkHint": "材料摆台合影；施工后可补"
      },
      {
        "itemKey": "old_parts_pack",
        "label": "旧件留影",
        "suggestStageId": "stage_2",
        "group": "材料",
        "noteExample": "主要旧件已拍照留存 / 已交还车主。",
        "strength": "tip",
        "linkHint": "施工旧件摆放；交付交接可挂本项"
      },
      {
        "itemKey": "cabin_function_check",
        "label": "完工功能抽检",
        "suggestStageId": "stage_2",
        "group": "交付建议",
        "noteExample": "启动、怠速、空调吹风、灯光抽检正常。",
        "strength": "tip",
        "linkHint": "**完工**阶段挂图或文字"
      }
    ]
  },
  "brake": {
    "categoryId": "brake",
    "label": "刹车片/刹车盘",
    "inheritsFrom": null,
    "items": [
      {
        "itemKey": "odo",
        "label": "里程表",
        "suggestStageId": "stage_1",
        "group": "接车建档",
        "noteExample": "到店里程 ××km。",
        "strength": "tip",
        "linkHint": "接车仪表"
      },
      {
        "itemKey": "complaint",
        "label": "到店诉求",
        "suggestStageId": "stage_1",
        "group": "接车建档",
        "noteExample": "异响 / 抖动 / 行程变长 / 常规检查（择一简述）。",
        "strength": "strong",
        "linkHint": "以文字为主"
      },
      {
        "itemKey": "walkaround",
        "label": "环车预检",
        "suggestStageId": "stage_1",
        "group": "外观",
        "noteExample": "外观未见与本次制动无关的新增磕碰。",
        "strength": "tip",
        "linkHint": "接车外观"
      },
      {
        "itemKey": "pad_thickness",
        "label": "刹车片厚度",
        "suggestStageId": "stage_2",
        "group": "制动检测",
        "noteExample": "位置：前/后；外侧剩余约 ×mm；建议更换 / 可暂缓。",
        "strength": "strong",
        "linkHint": "检测游标卡尺/测厚读数入镜"
      },
      {
        "itemKey": "rotor_thickness",
        "label": "刹车盘厚度",
        "suggestStageId": "stage_2",
        "group": "制动检测",
        "noteExample": "实测剩余厚度 ×mm；与极限厚度对比：建议换盘 / 盘可暂不换。",
        "strength": "strong",
        "linkHint": "检测测厚读数入镜"
      },
      {
        "itemKey": "rotor_condition",
        "label": "刹车盘盘面状态",
        "suggestStageId": "stage_2",
        "group": "制动检测",
        "noteExample": "沟槽/发蓝/裂纹：有或无；与厚度结论一并说明。",
        "strength": "strong",
        "linkHint": "检测盘面近景"
      },
      {
        "itemKey": "brake_hose",
        "label": "制动软管 / 管路",
        "suggestStageId": "stage_2",
        "group": "制动检测",
        "noteExample": "软管开裂、鼓包、渗油：有或无；金属管路锈蚀简述。",
        "strength": "strong",
        "linkHint": "检测软管与接头近景"
      },
      {
        "itemKey": "caliper_slide",
        "label": "卡钳 / 导销",
        "suggestStageId": "stage_2",
        "group": "制动检测",
        "noteExample": "回位与导销润滑：正常 / 卡滞已处理。",
        "strength": "tip",
        "linkHint": "检测或施工打开卡钳时"
      },
      {
        "itemKey": "epb_mode",
        "label": "电子手刹（EPB）",
        "suggestStageId": "stage_2",
        "group": "施工要点",
        "noteExample": "本车有/无 EPB；有则已进维修模式再拆装（或本车机械手刹）。",
        "strength": "strong",
        "linkHint": "文字为主；诊断仪屏幕可挂（脱敏）"
      },
      {
        "itemKey": "replace_scope",
        "label": "更换范围",
        "suggestStageId": "stage_2",
        "group": "方案要点",
        "noteExample": "仅换片 / 片+盘；轴位：前/后/四轮。",
        "strength": "strong",
        "linkHint": "文字为主；可挂拆下总成方位照"
      },
      {
        "itemKey": "new_parts",
        "label": "新配件展示",
        "suggestStageId": "stage_2",
        "group": "材料",
        "noteExample": "片/盘品牌与规格已核对。",
        "strength": "strong",
        "linkHint": "施工开封包装、规格面"
      },
      {
        "itemKey": "old_new_compare",
        "label": "新旧对比",
        "suggestStageId": "stage_2",
        "group": "材料",
        "noteExample": "旧片/旧盘与新件同框对照。",
        "strength": "strong",
        "linkHint": "施工对照图（公开价值高）"
      },
      {
        "itemKey": "torque_mark",
        "label": "安装力矩 / 防松",
        "suggestStageId": "stage_2",
        "group": "施工要点",
        "noteExample": "按规范力矩紧固；防松标记已做（如有）。",
        "strength": "strong",
        "linkHint": "**施工**力矩扳手打卡"
      },
      {
        "itemKey": "brake_bleed_note",
        "label": "排气说明",
        "suggestStageId": "stage_2",
        "group": "施工要点",
        "noteExample": "本次未开油路无需排气 / 已按规定排气。",
        "strength": "tip",
        "linkHint": "文字为主；开油路时强烈建议勾选说明"
      },
      {
        "itemKey": "fluid_level_after",
        "label": "更换后刹车油液位",
        "suggestStageId": "stage_2",
        "group": "交付建议",
        "noteExample": "换片/盘后储液罐液位已复核（新片较厚时液面变化已说明）。",
        "strength": "strong",
        "linkHint": "**完工**储液罐"
      },
      {
        "itemKey": "old_parts_return",
        "label": "旧件交接",
        "suggestStageId": "stage_2",
        "group": "交付建议",
        "noteExample": "旧件已交还车主对照 / 按门店环保回收说明。",
        "strength": "tip",
        "linkHint": "完工交接"
      },
      {
        "itemKey": "road_test",
        "label": "试车确认",
        "suggestStageId": "stage_2",
        "group": "交付建议",
        "noteExample": "短途试车：异响/踏板行程/抖动结论。",
        "strength": "strong",
        "linkHint": "**完工**文字+可选路试相关（勿拍违规画面）"
      },
      {
        "itemKey": "bedding_advice",
        "label": "磨合说明",
        "suggestStageId": "stage_2",
        "group": "交付建议",
        "noteExample": "磨合期注意点已当面告知（勿绝对化承诺）。",
        "strength": "tip",
        "linkHint": "文字为主"
      }
    ]
  },
  "battery": {
    "categoryId": "battery",
    "label": "电瓶更换",
    "inheritsFrom": null,
    "items": [
      {
        "itemKey": "odo",
        "label": "里程表",
        "suggestStageId": "stage_1",
        "group": "接车建档",
        "noteExample": "到店里程 ××km。",
        "strength": "tip",
        "linkHint": "接车仪表"
      },
      {
        "itemKey": "complaint",
        "label": "到店诉求",
        "suggestStageId": "stage_1",
        "group": "接车建档",
        "noteExample": "启动困难 / 亏电 / 无法启动 / 启停异常。",
        "strength": "strong",
        "linkHint": "文字为主"
      },
      {
        "itemKey": "walkaround",
        "label": "环车预检",
        "suggestStageId": "stage_1",
        "group": "外观",
        "noteExample": "外观未见新增磕碰。",
        "strength": "tip",
        "linkHint": "接车外观"
      },
      {
        "itemKey": "battery_test",
        "label": "电瓶检测读数",
        "suggestStageId": "stage_2",
        "group": "检测结论",
        "noteExample": "电压/内阻或负载测试结论；建议更换 / 可充电观察。",
        "strength": "strong",
        "linkHint": "检测仪屏幕（注意 VIN 脱敏）"
      },
      {
        "itemKey": "battery_date_code",
        "label": "旧电瓶日期 / 年限",
        "suggestStageId": "stage_2",
        "group": "检测结论",
        "noteExample": "生产周号或标注年限；用于说明老化依据（勿绝对化）。",
        "strength": "tip",
        "linkHint": "旧电瓶标签特写"
      },
      {
        "itemKey": "terminals_cables",
        "label": "桩头 / 线缆",
        "suggestStageId": "stage_2",
        "group": "检测结论",
        "noteExample": "腐蚀、松动：有或无；已排除接触不良。",
        "strength": "strong",
        "linkHint": "检测桩头近景"
      },
      {
        "itemKey": "charging_system_note",
        "label": "充电系统备注",
        "suggestStageId": "stage_2",
        "group": "检测结论",
        "noteExample": "发电机/充电待复查或本次未见异常（一句即可）。",
        "strength": "tip",
        "linkHint": "文字为主；有读数可挂"
      },
      {
        "itemKey": "parasitic_drain_note",
        "label": "反复亏电备注",
        "suggestStageId": "stage_2",
        "group": "检测结论",
        "noteExample": "若反复亏电：本次未测暗电流 / 建议复查用电；单次亏电可写不适用。",
        "strength": "tip",
        "linkHint": "文字为主（防「换完仍亏电」扯皮）"
      },
      {
        "itemKey": "spec_match",
        "label": "规格匹配",
        "suggestStageId": "stage_2",
        "group": "材料",
        "noteExample": "型号 AGM/EFB/铅酸；容量 ××Ah；启停车型已核对。",
        "strength": "strong",
        "linkHint": "新电瓶规格标签"
      },
      {
        "itemKey": "new_battery",
        "label": "新电瓶展示",
        "suggestStageId": "stage_2",
        "group": "材料",
        "noteExample": "品牌与包装信息已留影。",
        "strength": "strong",
        "linkHint": "施工开箱/顶面标签"
      },
      {
        "itemKey": "old_new_compare",
        "label": "新旧对比",
        "suggestStageId": "stage_2",
        "group": "材料",
        "noteExample": "旧电瓶与新电瓶同框。",
        "strength": "tip",
        "linkHint": "施工对照"
      },
      {
        "itemKey": "install_secure",
        "label": "安装固定",
        "suggestStageId": "stage_2",
        "group": "施工要点",
        "noteExample": "压板固定、桩头极性与紧固已确认；启停车 IBS/传感器插头已插好（如有）。",
        "strength": "strong",
        "linkHint": "**施工**固定与接线"
      },
      {
        "itemKey": "coding_note",
        "label": "匹配 / 编程说明",
        "suggestStageId": "stage_2",
        "group": "施工要点",
        "noteExample": "本车需要 / 不需要电瓶匹配；已处理或无需。",
        "strength": "tip",
        "linkHint": "文字为主（勿夸大）"
      },
      {
        "itemKey": "start_test",
        "label": "启动测试",
        "suggestStageId": "stage_2",
        "group": "交付建议",
        "noteExample": "更换后启动正常 / 启停功能抽检（如有）。",
        "strength": "strong",
        "linkHint": "**完工**"
      },
      {
        "itemKey": "old_battery_handover",
        "label": "旧电瓶交接",
        "suggestStageId": "stage_2",
        "group": "交付建议",
        "noteExample": "已交还 / 按环保回收说明已告知。",
        "strength": "tip",
        "linkHint": "完工"
      },
      {
        "itemKey": "warranty_note",
        "label": "质保说明",
        "suggestStageId": "stage_2",
        "group": "交付建议",
        "noteExample": "质保时长与条件已告知（无绝对化）。",
        "strength": "tip",
        "linkHint": "文字为主"
      }
    ]
  },
  "tire": {
    "categoryId": "tire",
    "label": "轮胎更换",
    "inheritsFrom": null,
    "items": [
      {
        "itemKey": "odo",
        "label": "里程表",
        "suggestStageId": "stage_1",
        "group": "接车建档",
        "noteExample": "到店里程 ××km。",
        "strength": "tip",
        "linkHint": "接车仪表"
      },
      {
        "itemKey": "complaint",
        "label": "到店诉求",
        "suggestStageId": "stage_1",
        "group": "接车建档",
        "noteExample": "磨损更换 / 鼓包 / 扎胎 / 偏磨 / 抖动。",
        "strength": "strong",
        "linkHint": "文字为主"
      },
      {
        "itemKey": "walkaround",
        "label": "环车预检",
        "suggestStageId": "stage_1",
        "group": "外观",
        "noteExample": "相关轮胎方位已确认；勿强求全车清晰车牌照。",
        "strength": "tip",
        "linkHint": "接车相关方位"
      },
      {
        "itemKey": "tread_wear",
        "label": "花纹 / 磨损",
        "suggestStageId": "stage_2",
        "group": "轮胎检测",
        "noteExample": "花纹深度或磨损标记；均匀 / 偏磨简述。",
        "strength": "strong",
        "linkHint": "检测胎面近景+参照物"
      },
      {
        "itemKey": "sidewall_damage",
        "label": "胎侧 / 鼓包裂纹",
        "suggestStageId": "stage_2",
        "group": "轮胎检测",
        "noteExample": "鼓包、裂纹、帘线外露：有或无。",
        "strength": "strong",
        "linkHint": "检测胎侧"
      },
      {
        "itemKey": "rim_damage",
        "label": "轮毂 / 轮圈",
        "suggestStageId": "stage_2",
        "group": "轮胎检测",
        "noteExample": "变形、裂纹、严重腐蚀：有或无（拆装时发现须注明）。",
        "strength": "tip",
        "linkHint": "检测或施工轮圈近景"
      },
      {
        "itemKey": "dot_date",
        "label": "轮胎周号（DOT）",
        "suggestStageId": "stage_2",
        "group": "材料",
        "noteExample": "新胎生产周号已核对；陈年胎风险已如实说明（如有）。",
        "strength": "tip",
        "linkHint": "新胎胎侧 DOT 特写"
      },
      {
        "itemKey": "replace_count",
        "label": "更换条数与位置",
        "suggestStageId": "stage_2",
        "group": "方案要点",
        "noteExample": "更换 × 条；位置：两前/两后/四轮；同轴规格一致说明。",
        "strength": "strong",
        "linkHint": "文字为主"
      },
      {
        "itemKey": "alignment_advice",
        "label": "四轮定位建议",
        "suggestStageId": "stage_2",
        "group": "方案要点",
        "noteExample": "因偏磨建议定位 / 本次不做定位及原因。",
        "strength": "tip",
        "linkHint": "文字为主（非强制捆绑）"
      },
      {
        "itemKey": "tire_spec",
        "label": "轮胎规格",
        "suggestStageId": "stage_2",
        "group": "材料",
        "noteExample": "尺寸/负荷指数/速度级与原车或约定规格。",
        "strength": "strong",
        "linkHint": "旧胎+新胎胎侧规格字"
      },
      {
        "itemKey": "new_tires",
        "label": "新胎展示",
        "suggestStageId": "stage_2",
        "group": "材料",
        "noteExample": "品牌花纹已留影。",
        "strength": "strong",
        "linkHint": "施工新胎"
      },
      {
        "itemKey": "old_new_compare",
        "label": "新旧对比",
        "suggestStageId": "stage_2",
        "group": "材料",
        "noteExample": "旧胎与新胎花纹/磨损对照。",
        "strength": "strong",
        "linkHint": "施工对照（公开价值高）"
      },
      {
        "itemKey": "valve_stem",
        "label": "气门嘴",
        "suggestStageId": "stage_2",
        "group": "施工要点",
        "noteExample": "已换新嘴 / 沿用原嘴及原因；真空嘴或带传感器嘴已区分。",
        "strength": "tip",
        "linkHint": "**施工**气门嘴"
      },
      {
        "itemKey": "tpms",
        "label": "胎压监测（TPMS）",
        "suggestStageId": "stage_2",
        "group": "施工要点",
        "noteExample": "传感器：转移旧件 / 换新；是否已学习/复位；本车无 TPMS 则注明。",
        "strength": "strong",
        "linkHint": "文字+可选仪表胎压显示"
      },
      {
        "itemKey": "mount_balance",
        "label": "拆装 / 动平衡",
        "suggestStageId": "stage_2",
        "group": "施工要点",
        "noteExample": "已完成动平衡（或说明未做原因）。",
        "strength": "strong",
        "linkHint": "**施工**动平衡界面或过程"
      },
      {
        "itemKey": "pressure_set",
        "label": "胎压确认",
        "suggestStageId": "stage_2",
        "group": "施工要点",
        "noteExample": "胎压按门店/车型建议设定为 ××。",
        "strength": "strong",
        "linkHint": "施工或完工胎压枪读数"
      },
      {
        "itemKey": "wheel_torque",
        "label": "轮毂螺栓力矩",
        "suggestStageId": "stage_2",
        "group": "施工要点",
        "noteExample": "按规范力矩紧固；防松标记已做（如有）。",
        "strength": "strong",
        "linkHint": "**施工**力矩扳手打卡"
      },
      {
        "itemKey": "install_done",
        "label": "装车完成外观",
        "suggestStageId": "stage_2",
        "group": "交付建议",
        "noteExample": "气门嘴/轮毂安装外观正常。",
        "strength": "tip",
        "linkHint": "**完工**装车后"
      },
      {
        "itemKey": "road_feel_note",
        "label": "路感 / 磨合提醒",
        "suggestStageId": "stage_2",
        "group": "交付建议",
        "noteExample": "磨合期胎噪与路感变化已告知。",
        "strength": "tip",
        "linkHint": "文字为主"
      }
    ]
  },
  "ac": {
    "categoryId": "ac",
    "label": "空调服务",
    "inheritsFrom": null,
    "items": [
      {
        "itemKey": "odo",
        "label": "里程表",
        "suggestStageId": "stage_1",
        "group": "接车建档",
        "noteExample": "到店里程 ××km。",
        "strength": "tip",
        "linkHint": "接车仪表"
      },
      {
        "itemKey": "complaint",
        "label": "到店诉求",
        "suggestStageId": "stage_1",
        "group": "接车建档",
        "noteExample": "不制冷 / 异味 / 风量小 / 定期换滤。",
        "strength": "strong",
        "linkHint": "文字为主"
      },
      {
        "itemKey": "walkaround",
        "label": "环车预检",
        "suggestStageId": "stage_1",
        "group": "外观",
        "noteExample": "外观未见新增磕碰。",
        "strength": "tip",
        "linkHint": "接车外观"
      },
      {
        "itemKey": "cabin_filter_check",
        "label": "空调滤芯状态",
        "suggestStageId": "stage_2",
        "group": "空调检测",
        "noteExample": "滤芯脏污/发黑程度；建议更换 / 暂可继续用。",
        "strength": "strong",
        "linkHint": "检测抽出旧滤特写"
      },
      {
        "itemKey": "vent_temp_odor",
        "label": "出风 / 异味初检",
        "suggestStageId": "stage_2",
        "group": "空调检测",
        "noteExample": "出风温度体感；异味有无及大概来源判断。",
        "strength": "strong",
        "linkHint": "检测出风口；可选温度显示"
      },
      {
        "itemKey": "blower_airflow",
        "label": "鼓风机 / 风量",
        "suggestStageId": "stage_2",
        "group": "空调检测",
        "noteExample": "各档风量是否正常；诉求为风量小时须勾选结论。",
        "strength": "tip",
        "linkHint": "检测；风量小诉求时强烈建议"
      },
      {
        "itemKey": "condenser_visual",
        "label": "冷凝器外观",
        "suggestStageId": "stage_2",
        "group": "空调检测",
        "noteExample": "散热片脏堵、变形、撞伤：有或无（不制冷时优先留证）。",
        "strength": "strong",
        "linkHint": "检测中网内侧/冷凝器正面"
      },
      {
        "itemKey": "evaporator_drain",
        "label": "蒸发箱排水",
        "suggestStageId": "stage_2",
        "group": "空调检测",
        "noteExample": "排水口通畅 / 堵塞或车内渗水迹象已注明。",
        "strength": "tip",
        "linkHint": "检测排水口或地毯受潮说明"
      },
      {
        "itemKey": "pressure_leak",
        "label": "压力 / 检漏",
        "suggestStageId": "stage_2",
        "group": "空调检测",
        "noteExample": "系统压力结论；有无泄漏迹象；建议路径。",
        "strength": "strong",
        "linkHint": "检测压力表（注意脱敏）；仅换滤/异味且不做冷媒作业时可跳过并说明"
      },
      {
        "itemKey": "service_path",
        "label": "处理路径",
        "suggestStageId": "stage_2",
        "group": "方案要点",
        "noteExample": "换滤 / 清洗 / 检漏补冷媒 / 暂不拆蒸发箱等。",
        "strength": "strong",
        "linkHint": "文字为主"
      },
      {
        "itemKey": "new_cabin_filter",
        "label": "新空调滤芯",
        "suggestStageId": "stage_2",
        "group": "材料",
        "noteExample": "规格匹配；包装已留影。",
        "strength": "tip",
        "linkHint": "有更换时施工挂图"
      },
      {
        "itemKey": "old_new_filter",
        "label": "滤芯新旧对比",
        "suggestStageId": "stage_2",
        "group": "材料",
        "noteExample": "旧新滤芯同框。",
        "strength": "strong",
        "linkHint": "有更换时（公开价值高）"
      },
      {
        "itemKey": "clean_process",
        "label": "清洗过程",
        "suggestStageId": "stage_2",
        "group": "施工要点",
        "noteExample": "风道/蒸发箱清洗已做或本次未做及原因。",
        "strength": "tip",
        "linkHint": "**施工**过程（若有）"
      },
      {
        "itemKey": "refrigerant_service",
        "label": "冷媒相关操作",
        "suggestStageId": "stage_2",
        "group": "施工要点",
        "noteExample": "冷媒类型（如 R134a / R1234yf）已核对；已检漏并按规定加注 / 本次未加注及原因。",
        "strength": "strong",
        "linkHint": "**施工**加注可见点；勿拍金额单；类型须写明"
      },
      {
        "itemKey": "function_recheck",
        "label": "完工制冷 / 异味复查",
        "suggestStageId": "stage_2",
        "group": "交付建议",
        "noteExample": "出风变凉；异味减轻或消失。",
        "strength": "strong",
        "linkHint": "**完工**"
      },
      {
        "itemKey": "usage_advice",
        "label": "使用与保养建议",
        "suggestStageId": "stage_2",
        "group": "交付建议",
        "noteExample": "建议更换滤芯周期；长时间停放可定期开空调等。",
        "strength": "tip",
        "linkHint": "文字为主"
      }
    ]
  },
  "body_paint": {
    "categoryId": "body_paint",
    "label": "钣喷修复",
    "inheritsFrom": null,
    "items": [
      {
        "itemKey": "odo",
        "label": "里程表",
        "suggestStageId": "stage_1",
        "group": "接车建档",
        "noteExample": "到店里程 ××km（可选）。",
        "strength": "tip",
        "linkHint": "接车"
      },
      {
        "itemKey": "damage_far",
        "label": "损伤远景定位",
        "suggestStageId": "stage_1",
        "group": "损伤取证",
        "noteExample": "部位：如右前门；整车方位可辨、车牌尽量避开或后期脱敏。",
        "strength": "strong",
        "linkHint": "接车远景"
      },
      {
        "itemKey": "damage_near",
        "label": "损伤近景",
        "suggestStageId": "stage_1",
        "group": "损伤取证",
        "noteExample": "划痕/凹陷/破损程度简述。",
        "strength": "strong",
        "linkHint": "接车近景；检测可补多角"
      },
      {
        "itemKey": "damage_multi_angle",
        "label": "多角度损伤",
        "suggestStageId": "stage_2",
        "group": "损伤取证",
        "noteExample": "斜侧/端面补充，便于判断变形范围。",
        "strength": "tip",
        "linkHint": "检测"
      },
      {
        "itemKey": "panel_deform",
        "label": "钣金变形判断",
        "suggestStageId": "stage_2",
        "group": "检测结论",
        "noteExample": "漆下有无钣金变形；凹陷可否吸拔等。",
        "strength": "strong",
        "linkHint": "文字+近景"
      },
      {
        "itemKey": "paint_thickness",
        "label": "漆膜厚度",
        "suggestStageId": "stage_2",
        "group": "检测结论",
        "noteExample": "漆膜仪读数：损伤区 / 相邻原厂板对比（如实记录）。",
        "strength": "tip",
        "linkHint": "检测仪读数入镜；完工可复测挂同项"
      },
      {
        "itemKey": "repair_path",
        "label": "修复路径",
        "suggestStageId": "stage_2",
        "group": "方案要点",
        "noteExample": "局部补漆 / 整面喷 / 钣金+喷漆；拆件或遮蔽。",
        "strength": "strong",
        "linkHint": "文字为主"
      },
      {
        "itemKey": "blend_range",
        "label": "过渡 / 喷涂范围",
        "suggestStageId": "stage_2",
        "group": "方案要点",
        "noteExample": "喷到本板 / 延伸相邻板；过渡方式已说明（无绝对无色差承诺）。",
        "strength": "strong",
        "linkHint": "文字为主；可挂遮蔽范围"
      },
      {
        "itemKey": "color_process_note",
        "label": "漆种 / 调色说明",
        "suggestStageId": "stage_2",
        "group": "方案要点",
        "noteExample": "素色/金属/珍珠；需过渡或调色要点。",
        "strength": "tip",
        "linkHint": "文字；可挂色板比对"
      },
      {
        "itemKey": "materials",
        "label": "漆与辅料",
        "suggestStageId": "stage_2",
        "group": "材料",
        "noteExample": "色漆/清漆/腻子等包装或批次留影（无金额）。",
        "strength": "tip",
        "linkHint": "施工材料区"
      },
      {
        "itemKey": "prep_work",
        "label": "打磨 / 腻子 / 中涂",
        "suggestStageId": "stage_2",
        "group": "施工工序",
        "noteExample": "已完成打磨与中涂等前序（按实际勾选描述）。",
        "strength": "strong",
        "linkHint": "**施工**关键帧"
      },
      {
        "itemKey": "masking_spray",
        "label": "遮蔽 / 喷涂",
        "suggestStageId": "stage_2",
        "group": "施工工序",
        "noteExample": "遮蔽与喷涂过程要点。",
        "strength": "tip",
        "linkHint": "**施工**"
      },
      {
        "itemKey": "clips_reinstall",
        "label": "卡扣 / 饰条 / 密封条",
        "suggestStageId": "stage_2",
        "group": "施工工序",
        "noteExample": "拆下件已复位；缺失卡扣已注明补齐或待补。",
        "strength": "tip",
        "linkHint": "**施工**或完工细节"
      },
      {
        "itemKey": "finish_near",
        "label": "完工近景",
        "suggestStageId": "stage_2",
        "group": "交付验收",
        "noteExample": "修复区近景效果。",
        "strength": "strong",
        "linkHint": "**完工**近景"
      },
      {
        "itemKey": "finish_far",
        "label": "完工远景",
        "suggestStageId": "stage_2",
        "group": "交付验收",
        "noteExample": "部位整体效果（注意车牌）。",
        "strength": "strong",
        "linkHint": "**完工**远景"
      },
      {
        "itemKey": "panel_gap",
        "label": "板件缝隙 / 面差",
        "suggestStageId": "stage_2",
        "group": "交付验收",
        "noteExample": "相关缝隙与面差目视结论（如实写偏差如有）。",
        "strength": "strong",
        "linkHint": "**完工**缝隙近景"
      },
      {
        "itemKey": "color_check",
        "label": "自然光色差复查",
        "suggestStageId": "stage_2",
        "group": "交付验收",
        "noteExample": "自然光下过渡区复查结论（如实写轻微色差如有）。",
        "strength": "strong",
        "linkHint": "**完工**"
      },
      {
        "itemKey": "care_warranty",
        "label": "养护与质保",
        "suggestStageId": "stage_2",
        "group": "交付建议",
        "noteExample": "养护期（如暂勿高压水枪）与质保范围已告知。",
        "strength": "tip",
        "linkHint": "文字为主"
      }
    ]
  },
  "accident": {
    "categoryId": "accident",
    "label": "事故车维修",
    "inheritsFrom": null,
    "items": [
      {
        "itemKey": "odo",
        "label": "里程表",
        "suggestStageId": "stage_1",
        "group": "接车建档",
        "noteExample": "到店里程 ××km。",
        "strength": "tip",
        "linkHint": "接车仪表"
      },
      {
        "itemKey": "intake_photos",
        "label": "到店损伤全貌",
        "suggestStageId": "stage_1",
        "group": "事故取证",
        "noteExample": "碰撞方位与主要损伤面已拍照（多图挂本项）。",
        "strength": "strong",
        "linkHint": "接车多方位；避无关隐私"
      },
      {
        "itemKey": "damage_inventory",
        "label": "损伤部位清单",
        "suggestStageId": "stage_2",
        "group": "事故取证",
        "noteExample": "列出主要钣金/饰件/灯光等受损部位（名称级）。",
        "strength": "strong",
        "linkHint": "文字+可附定位图"
      },
      {
        "itemKey": "structure_check",
        "label": "结构 / 安全件初判",
        "suggestStageId": "stage_2",
        "group": "检测结论",
        "noteExample": "是否涉及纵梁/安全件等（仅客观描述，不作恐吓）。",
        "strength": "strong",
        "linkHint": "检测；有举升/测量则挂图"
      },
      {
        "itemKey": "airbag_srs_status",
        "label": "气囊 / 安全带系统",
        "suggestStageId": "stage_2",
        "group": "检测结论",
        "noteExample": "气囊是否起爆；仪表气囊灯是否亮；安全带预紧等客观状态（勿恐吓话术）。",
        "strength": "strong",
        "linkHint": "检测仪表灯+现场状态；敏感图私域"
      },
      {
        "itemKey": "impact_dtc",
        "label": "碰撞相关读码",
        "suggestStageId": "stage_2",
        "group": "检测结论",
        "noteExample": "已读安全气囊/车身等模块：无码 / 有码简述（脱敏仪屏）。",
        "strength": "strong",
        "linkHint": "检测诊断仪；公开慎用"
      },
      {
        "itemKey": "estimate_doc",
        "label": "定损 / 方案单据",
        "suggestStageId": "stage_2",
        "group": "单据留档",
        "noteExample": "已留存定损或维修项目清单影像（**私域**；勿在说明写金额）。",
        "strength": "strong",
        "linkHint": "接车或检测单据槽；公开慎用"
      },
      {
        "itemKey": "repair_scope",
        "label": "维修范围确认",
        "suggestStageId": "stage_2",
        "group": "方案要点",
        "noteExample": "更换件 / 修复件范围已与约定一致（无价格）。",
        "strength": "strong",
        "linkHint": "文字为主"
      },
      {
        "itemKey": "parts_auth",
        "label": "配件与旧件",
        "suggestStageId": "stage_2",
        "group": "材料",
        "noteExample": "主要更换件开箱或旧件对照（如保险杠、大灯）。",
        "strength": "strong",
        "linkHint": "施工材料与旧件"
      },
      {
        "itemKey": "body_repair_process",
        "label": "钣金 / 校正过程",
        "suggestStageId": "stage_2",
        "group": "施工工序",
        "noteExample": "关键校正或钣金工序已留影。",
        "strength": "tip",
        "linkHint": "**施工**"
      },
      {
        "itemKey": "paint_process",
        "label": "涂装过程",
        "suggestStageId": "stage_2",
        "group": "施工工序",
        "noteExample": "打磨喷涂等关键帧（可与钣喷类项类似，按实际）。",
        "strength": "tip",
        "linkHint": "**施工**"
      },
      {
        "itemKey": "adas_calibration",
        "label": "ADAS / 辅助驾驶标定",
        "suggestStageId": "stage_2",
        "group": "施工要点",
        "noteExample": "涉及保险杠/挡风/雷达/摄像头等：需标定已做 / 本车无需 / 待专项。",
        "strength": "strong",
        "linkHint": "文字+标定报告或仪屏（脱敏）；不涉及可跳过并说明"
      },
      {
        "itemKey": "alignment_after",
        "label": "事故后四轮定位",
        "suggestStageId": "stage_2",
        "group": "交付验收",
        "noteExample": "有底盘/悬挂/结构相关作业：已定位 / 建议定位未做及原因。",
        "strength": "strong",
        "linkHint": "**完工**定位单或结果（无金额）；不涉及可跳过"
      },
      {
        "itemKey": "finish_compare",
        "label": "完工前后对照",
        "suggestStageId": "stage_2",
        "group": "交付验收",
        "noteExample": "主要损伤部位修后效果；可与接车图对照。",
        "strength": "strong",
        "linkHint": "**完工**；适合对比挂图"
      },
      {
        "itemKey": "function_safety_check",
        "label": "灯光 / 开合 / 基本功能",
        "suggestStageId": "stage_2",
        "group": "交付验收",
        "noteExample": "相关灯光、车门开合、玻璃升降、气囊灯熄灭等抽检；板件缝隙简述。",
        "strength": "strong",
        "linkHint": "**完工**"
      },
      {
        "itemKey": "handover_docs",
        "label": "交车说明",
        "suggestStageId": "stage_2",
        "group": "交付建议",
        "noteExample": "质保与后续注意事项已告知（无线上报价表述）。",
        "strength": "tip",
        "linkHint": "文字为主"
      }
    ]
  },
  "default": {
    "categoryId": "default",
    "label": "通用",
    "inheritsFrom": null,
    "items": [
      {
        "itemKey": "odo",
        "label": "里程表",
        "suggestStageId": "stage_1",
        "group": "接车建档",
        "noteExample": "到店里程 ××km。",
        "strength": "strong",
        "linkHint": "接车仪表"
      },
      {
        "itemKey": "complaint",
        "label": "到店诉求",
        "suggestStageId": "stage_1",
        "group": "接车建档",
        "noteExample": "用一句话写清客户诉求（中性、可核实）。",
        "strength": "strong",
        "linkHint": "文字为主"
      },
      {
        "itemKey": "walkaround",
        "label": "环车预检",
        "suggestStageId": "stage_1",
        "group": "外观",
        "noteExample": "外观要点；既有损伤已注明。",
        "strength": "tip",
        "linkHint": "接车"
      },
      {
        "itemKey": "inspect_finding",
        "label": "检测发现",
        "suggestStageId": "stage_2",
        "group": "检测结论",
        "noteExample": "现象 + 检查手段 + 结论（排除了什么）。",
        "strength": "strong",
        "linkHint": "检测证据图"
      },
      {
        "itemKey": "work_scope",
        "label": "本次作业范围",
        "suggestStageId": "stage_2",
        "group": "方案要点",
        "noteExample": "实际进行的检查/维修项目清单（无金额）。",
        "strength": "strong",
        "linkHint": "文字为主"
      },
      {
        "itemKey": "key_parts",
        "label": "关键配件 / 材料",
        "suggestStageId": "stage_2",
        "group": "材料",
        "noteExample": "如有更换：名称与规格一句；包装可留影。",
        "strength": "tip",
        "linkHint": "施工材料"
      },
      {
        "itemKey": "process_photos",
        "label": "关键工序",
        "suggestStageId": "stage_2",
        "group": "施工要点",
        "noteExample": "关键步骤已留影并简要说明。",
        "strength": "tip",
        "linkHint": "**施工**多图挂本项"
      },
      {
        "itemKey": "finish_check",
        "label": "完工确认",
        "suggestStageId": "stage_2",
        "group": "交付验收",
        "noteExample": "针对诉求的复查结论。",
        "strength": "strong",
        "linkHint": "**完工**"
      },
      {
        "itemKey": "handover_note",
        "label": "交车说明",
        "suggestStageId": "stage_2",
        "group": "交付建议",
        "noteExample": "使用注意或复查建议（无绝对化承诺）。",
        "strength": "tip",
        "linkHint": "文字为主"
      }
    ]
  },
  "chassis_noise": {
    "categoryId": "chassis_noise",
    "label": "底盘异响/胶套",
    "inheritsFrom": null,
    "items": [
      {
        "itemKey": "odo",
        "label": "里程表",
        "suggestStageId": "stage_1",
        "group": "接车建档",
        "noteExample": "到店里程 ××km。",
        "strength": "tip",
        "linkHint": "接车仪表"
      },
      {
        "itemKey": "complaint",
        "label": "异响场景",
        "suggestStageId": "stage_1",
        "group": "接车建档",
        "noteExample": "何时响：过减速带 / 转弯 / 刹车 / 冷车等。",
        "strength": "strong",
        "linkHint": "文字为主"
      },
      {
        "itemKey": "walkaround",
        "label": "环车预检",
        "suggestStageId": "stage_1",
        "group": "外观",
        "noteExample": "外观未见与本次无关的新增磕碰。",
        "strength": "tip",
        "linkHint": "接车"
      },
      {
        "itemKey": "road_test_before",
        "label": "试车复现",
        "suggestStageId": "stage_2",
        "group": "检测结论",
        "noteExample": "已复现 / 未稳定复现；方位判断。",
        "strength": "tip",
        "linkHint": "文字为主"
      },
      {
        "itemKey": "bushing_closeup",
        "label": "胶套 / 球头近景",
        "suggestStageId": "stage_2",
        "group": "底盘检测",
        "noteExample": "开裂、渗油、磨损：有或无；部位名称。",
        "strength": "strong",
        "linkHint": "检测举升近景"
      },
      {
        "itemKey": "sway_bar_links",
        "label": "稳定杆连杆 / 胶套",
        "suggestStageId": "stage_2",
        "group": "底盘检测",
        "noteExample": "小吊杆与稳定杆胶套：松旷/开裂有或无（过减速带异响高频项）。",
        "strength": "strong",
        "linkHint": "检测近景"
      },
      {
        "itemKey": "wheel_bearing",
        "label": "轮毂轴承",
        "suggestStageId": "stage_2",
        "group": "底盘检测",
        "noteExample": "转动异响/晃动旷量：有或无；已排除或需更换。",
        "strength": "strong",
        "linkHint": "检测举升转动检查"
      },
      {
        "itemKey": "shock_strut",
        "label": "减震器 / 顶胶",
        "suggestStageId": "stage_2",
        "group": "底盘检测",
        "noteExample": "减震渗油、顶胶开裂或异响：有或无。",
        "strength": "strong",
        "linkHint": "检测减震与顶胶近景"
      },
      {
        "itemKey": "pry_play_check",
        "label": "撬动 / 旷量检查",
        "suggestStageId": "stage_2",
        "group": "底盘检测",
        "noteExample": "球头/摆臂旷量：有或无；已排除项。",
        "strength": "strong",
        "linkHint": "检测过程"
      },
      {
        "itemKey": "exclude_list",
        "label": "已排除项",
        "suggestStageId": "stage_2",
        "group": "检测结论",
        "noteExample": "如：排气管松旷已排除；轮胎异响已排除等。",
        "strength": "strong",
        "linkHint": "文字为主（避坑价值高）"
      },
      {
        "itemKey": "repair_path",
        "label": "处理路径",
        "suggestStageId": "stage_2",
        "group": "方案要点",
        "noteExample": "压胶套 / 换摆臂总成等；为何选轻量或总成方案。",
        "strength": "strong",
        "linkHint": "文字为主"
      },
      {
        "itemKey": "parts_used",
        "label": "配件信息",
        "suggestStageId": "stage_2",
        "group": "材料",
        "noteExample": "胶套/摆臂名称与品质说明一句。",
        "strength": "tip",
        "linkHint": "施工包装或零件"
      },
      {
        "itemKey": "press_torque",
        "label": "压装 / 力矩",
        "suggestStageId": "stage_2",
        "group": "施工要点",
        "noteExample": "专用工具压装；力矩与防松标记。",
        "strength": "strong",
        "linkHint": "**施工**"
      },
      {
        "itemKey": "old_parts",
        "label": "旧件留影",
        "suggestStageId": "stage_2",
        "group": "材料",
        "noteExample": "旧胶套/旧件开裂对照。",
        "strength": "strong",
        "linkHint": "施工旧件（公开价值高）"
      },
      {
        "itemKey": "alignment_advice",
        "label": "换件后四轮定位",
        "suggestStageId": "stage_2",
        "group": "交付建议",
        "noteExample": "动摆臂/胶套后：已定位 / 建议定位本次未做及原因。",
        "strength": "strong",
        "linkHint": "文字或定位结果（无金额）"
      },
      {
        "itemKey": "road_test_after",
        "label": "完工路试",
        "suggestStageId": "stage_2",
        "group": "交付验收",
        "noteExample": "原异响场景路试：消失 / 减轻 / 仍存。",
        "strength": "strong",
        "linkHint": "**完工**文字"
      },
      {
        "itemKey": "handover_note",
        "label": "交车说明",
        "suggestStageId": "stage_2",
        "group": "交付建议",
        "noteExample": "复查建议或关联件注意点已告知。",
        "strength": "tip",
        "linkHint": "文字为主"
      }
    ]
  }
}

module.exports = { CATALOG_VERSION, CATEGORIES }
