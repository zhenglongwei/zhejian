/** 报价表解析 · 商家端提示文案 */

const PLAN_QUOTE_PARSE_METHOD = {
  LLM: 'llm',
  MOCK: 'mock',
}

const PLAN_QUOTE_PARSE_HINT = {
  llm: '已通过智能解析识别报价表，请核对后再锁定。',
  mock: '演示数据，请核对后再锁定。',
}

module.exports = {
  PLAN_QUOTE_PARSE_METHOD,
  PLAN_QUOTE_PARSE_HINT,
}
