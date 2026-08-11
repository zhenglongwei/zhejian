/**
 * 检测项进入待处理后，自动解锁的施工衍生项（按类目）
 * 口径：docs/04_维修过程相册/17 §2.1、18 §6.1
 */
const WORK_FOLLOW_UPS_BY_CATEGORY = {
  maintenance: {
    old_oil: ['engine_oil', 'oil_filter', 'oil_level_confirm'],
    brake_fluid_level: ['brake_fluid_service'],
    coolant_level: ['coolant_service'],
  },
  major_maintenance: {
    old_oil: ['engine_oil', 'oil_filter', 'oil_level_confirm'],
    brake_fluid_level: ['brake_fluid_service'],
    coolant_level: ['coolant_service'],
  },
  brake: {
    pad_thickness: ['epb_mode', 'new_parts', 'old_new_compare', 'torque_mark', 'brake_bleed_note'],
    rotor_thickness: ['epb_mode', 'new_parts', 'old_new_compare', 'torque_mark', 'brake_bleed_note'],
    rotor_condition: ['epb_mode', 'new_parts', 'old_new_compare', 'torque_mark', 'brake_bleed_note'],
  },
  battery: {
    battery_test: ['spec_match', 'new_battery', 'old_new_compare', 'install_secure', 'coding_note'],
  },
  tire: {
    tread_wear: [
      'dot_date',
      'tire_spec',
      'new_tires',
      'old_new_compare',
      'valve_stem',
      'tpms',
      'mount_balance',
      'pressure_set',
      'wheel_torque',
    ],
    sidewall_damage: [
      'dot_date',
      'tire_spec',
      'new_tires',
      'old_new_compare',
      'valve_stem',
      'tpms',
      'mount_balance',
      'pressure_set',
      'wheel_torque',
    ],
  },
  ac: {
    cabin_filter_check: ['new_cabin_filter', 'old_new_filter'],
    pressure_leak: ['refrigerant_service', 'clean_process'],
    service_path: ['new_cabin_filter', 'old_new_filter', 'clean_process', 'refrigerant_service'],
  },
  body_paint: {
    repair_path: ['materials', 'prep_work', 'masking_spray', 'clips_reinstall'],
    panel_deform: ['materials', 'prep_work', 'masking_spray', 'clips_reinstall'],
  },
  accident: {
    repair_scope: ['parts_auth', 'body_repair_process', 'paint_process', 'adas_calibration'],
    damage_inventory: ['parts_auth', 'body_repair_process', 'paint_process'],
  },
  default: {
    inspect_finding: ['key_parts', 'process_photos'],
    work_scope: ['key_parts', 'process_photos'],
  },
  chassis_noise: {
    bushing_closeup: ['parts_used', 'press_torque', 'old_parts'],
    sway_bar_links: ['parts_used', 'press_torque', 'old_parts'],
    wheel_bearing: ['parts_used', 'press_torque', 'old_parts'],
    shock_strut: ['parts_used', 'press_torque', 'old_parts'],
    repair_path: ['parts_used', 'press_torque', 'old_parts'],
  },
}

function getWorkFollowUps(categoryId, itemKey) {
  const map = WORK_FOLLOW_UPS_BY_CATEGORY[String(categoryId || '')] || {}
  const keys = map[String(itemKey || '')] || []
  return keys.map(String).filter(Boolean)
}

module.exports = { WORK_FOLLOW_UPS_BY_CATEGORY, getWorkFollowUps }
