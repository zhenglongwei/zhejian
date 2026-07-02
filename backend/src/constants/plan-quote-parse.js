/** 报价表解析 · 商家端提示文案 */

const PLAN_QUOTE_PARSE_METHOD = {
  LLM: 'llm',
  MOCK: 'mock',
}

const PLAN_QUOTE_PARSE_HINT = {
  llm: '已通过智能解析识别报价表，请核对后再锁定。',
  mock: '演示数据，请核对后再锁定。',
}

const PLAN_QUOTE_SHEET_TYPE = {
  PARTS: 'parts',
  MIXED: 'mixed',
  LABOR_CATALOG: 'labor_catalog',
  LABOR_ONLY: 'labor_only',
  UNKNOWN: 'unknown',
}

const PLAN_QUOTE_NO_PARTS_MESSAGE = {
  labor_catalog:
    '识别为工时价目参考表（非本单配件清单）。请上传本次维修的报价单截图，或根据实际更换件手工录入配件目录。',
  labor_only:
    '本图以工时/服务项目为主，未识别到可登记的零配件行。请补充配件明细或手工录入。',
  default: '未识别到可登记的零配件行，请确认报价单含配件/物料明细，或手工录入。',
}

module.exports = {
  PLAN_QUOTE_PARSE_METHOD,
  PLAN_QUOTE_PARSE_HINT,
  PLAN_QUOTE_SHEET_TYPE,
  PLAN_QUOTE_NO_PARTS_MESSAGE,
}
