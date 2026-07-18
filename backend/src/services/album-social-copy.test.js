const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildRuleDraft,
  buildFacts,
  normalizeSocialPlatform,
} = require('./album-social-copy.service')

test('normalizeSocialPlatform defaults unknown to xiaohongshu', () => {
  assert.equal(normalizeSocialPlatform(''), 'xiaohongshu')
  assert.equal(normalizeSocialPlatform('zhihu'), 'zhihu')
  assert.equal(normalizeSocialPlatform('wechat_mp'), 'wechat_mp')
})

test('buildRuleDraft xiaohongshu includes service name', () => {
  const facts = buildFacts({
    serviceName: '刹车保养',
    store: { name: '示例店', city: '杭州' },
    vehicleDisplay: '某品牌轿车',
    nodes: [{ id: 'stage_2', title: '检测', note: '检查了刹车片' }],
    status: 'completed',
  })
  const draft = buildRuleDraft(facts, 'xiaohongshu')
  assert.match(draft.title || draft.body, /刹车保养/)
  assert.match(draft.body, /杭州|示例店|刹车/)
})

test('buildRuleDraft douyin stays short', () => {
  const facts = buildFacts({
    serviceName: '保养',
    store: { name: '店A', city: '宁波' },
    nodes: [],
  })
  const draft = buildRuleDraft(facts, 'douyin')
  assert.ok(composeLen(draft) < 400)
})

function composeLen(draft) {
  return `${draft.title || ''}\n${draft.body || ''}`.length
}
