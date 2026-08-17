const test = require('node:test')
const assert = require('node:assert/strict')
const { shouldIndexPublicCase } = require('./case-index-gate.service')

test('shouldIndexPublicCase requires image, fact text, freshness; blocks accident and hidden', () => {
  const now = new Date('2026-08-17T00:00:00.000Z')
  const base = {
    publishedAt: '2026-07-01T00:00:00.000Z',
    summary: '检查发现刹车片磨损超限，更换后路试正常。',
    storefrontHidden: false,
  }
  const snapshot = {
    publicView: { publicMediaCount: 2, media: [{}, {}] },
    nodes: [{ note: '更换前刹车片', images: [{}] }],
  }
  assert.equal(shouldIndexPublicCase(base, snapshot, now), true)
  assert.equal(shouldIndexPublicCase({ ...base, storefrontHidden: true }, snapshot, now), false)
  assert.equal(shouldIndexPublicCase({ ...base, serviceName: '事故钣金' }, snapshot, now), false)
  assert.equal(
    shouldIndexPublicCase(base, { publicView: { publicMediaCount: 0, media: [] }, nodes: [] }, now),
    false,
  )
  assert.equal(
    shouldIndexPublicCase({ ...base, publishedAt: '2024-01-01T00:00:00.000Z' }, snapshot, now),
    false,
  )
})
