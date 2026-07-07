/**
 * 配件标准类型 — 对齐 04/10_配件告知确认规则.md §3
 */
const PART_TYPE = {
  OEM: '原厂件',
  HOMOGENEOUS: '同质配件',
  BRAND: '品牌件',
  AFTERMARKET: '副厂件',
  REMANUFACTURED: '再制造件',
  USED: '拆车件',
  REPAIRED: '修复件',
  REFURBISHED: '翻新件',
  REPAIR_INSTEAD_REPLACE: '以修代换',
}

/** 须车主确认的类型 */
const PART_TYPE_REQUIRES_CONFIRM = [
  PART_TYPE.HOMOGENEOUS,
  PART_TYPE.BRAND,
  PART_TYPE.AFTERMARKET,
  PART_TYPE.REMANUFACTURED,
  PART_TYPE.USED,
  PART_TYPE.REPAIRED,
  PART_TYPE.REFURBISHED,
  PART_TYPE.REPAIR_INSTEAD_REPLACE,
]

const PART_TYPE_VARIANT = {
  [PART_TYPE.OEM]: 'success',
  [PART_TYPE.HOMOGENEOUS]: 'info',
  [PART_TYPE.BRAND]: 'info',
  [PART_TYPE.AFTERMARKET]: 'warning',
  [PART_TYPE.REMANUFACTURED]: 'warning',
  [PART_TYPE.USED]: 'warning',
  [PART_TYPE.REPAIRED]: 'warning',
  [PART_TYPE.REFURBISHED]: 'warning',
  [PART_TYPE.REPAIR_INSTEAD_REPLACE]: 'warning',
}

const NON_OEM_CONFIRM_COPY = {
  title: '非原厂件确认',
  body:
    '该配件并非主机厂原厂件。\n\n请确认你已了解：\n1. 该配件与原厂件在品牌、渠道、包装或规格上可能存在差异；\n2. 后续年检、二手车检测、保险理赔或质保判断中，可能被识别为非原厂件；\n3. 本次选择是基于维修方案、价格和适配情况后的确认。\n\n如你不同意，请选择原厂件或联系门店重新报价。',
  checkbox: '我已阅读并理解上述非原厂件风险提示。',
  confirmButton: '我已知晓并同意使用该配件',
}

const PLAN_CONFIRM_COPY = {
  title: '维修方案确认',
  checkbox: '我已阅读维修方案，理解费用构成与配件类型说明。',
  confirmButton: '确认维修方案',
}

module.exports = {
  PART_TYPE,
  PART_TYPE_REQUIRES_CONFIRM,
  PART_TYPE_VARIANT,
  NON_OEM_CONFIRM_COPY,
  PLAN_CONFIRM_COPY,
}
