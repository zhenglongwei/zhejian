const test = require('node:test')
const assert = require('node:assert/strict')
const {
  yuanLabelFromCents,
  yuanToCents,
} = require('./merchant-plan-pricing.service')
const {
  DEFAULT_PLAN_CATALOG,
  MERCHANT_PLAN_ORDER,
  FEATURE_ROWS,
} = require('../constants/merchant-plan-catalog')

test('四档目录默认价与额度', () => {
  assert.equal(MERCHANT_PLAN_ORDER.length, 4)
  assert.equal(DEFAULT_PLAN_CATALOG.taste.priceCents, 2900)
  assert.equal(DEFAULT_PLAN_CATALOG.micro.priceCents, 8900)
  assert.equal(DEFAULT_PLAN_CATALOG.standard.priceCents, 24900)
  assert.equal(DEFAULT_PLAN_CATALOG.scale.priceCents, 49900)
  assert.equal(DEFAULT_PLAN_CATALOG.taste.caseQuotaLabel, '≤3个')
  assert.equal(DEFAULT_PLAN_CATALOG.micro.caseQuotaLabel, '≤20个')
  assert.equal(DEFAULT_PLAN_CATALOG.standard.caseQuotaLabel, '≤100个')
  assert.equal(DEFAULT_PLAN_CATALOG.scale.caseQuotaLabel, '≤200个')
})

test('对照表权益维度末项是价格（页面按版本分行，价格为末列）', () => {
  assert.equal(FEATURE_ROWS[FEATURE_ROWS.length - 1].key, 'price')
  assert.equal(FEATURE_ROWS[FEATURE_ROWS.length - 1].label, '价格')
})

test('分转元标签', () => {
  assert.equal(yuanLabelFromCents(2900), '¥29/月')
  assert.equal(yuanToCents(89), 8900)
})
