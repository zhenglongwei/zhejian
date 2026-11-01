const test = require('node:test')
const assert = require('node:assert/strict')
const { lookText, reuseExistingLook, noteForUrl } = require('./image-look-cache')

test('短图文留下的观察摘要可以给别的步骤复用', () => {
  const social = {
    promptVersion: 'social-look-v1',
    contentFingerprint: 'abc',
    resultJson: { observation: '前片磨到线' },
  }
  const decision = reuseExistingLook([social], {
    version: 'flow-organize-v10',
    fingerprint: 'other',
  })
  assert.equal(decision.reuse, true)
  assert.equal(lookText(decision.row.resultJson), '前片磨到线')
})

test('本步骤的记录指纹变了，才允许再看这张图', () => {
  const own = {
    promptVersion: 'flow-organize-v10',
    contentFingerprint: 'old',
    resultJson: { observation: '旧观察' },
  }
  const social = {
    promptVersion: 'social-look-v1',
    contentFingerprint: 'new',
    resultJson: { observation: '新观察' },
  }
  const stale = reuseExistingLook([own, social], {
    version: 'flow-organize-v10',
    fingerprint: 'new',
  })
  assert.equal(stale.reuse, false)
  assert.equal(stale.stale, true)
})

test('同一张图的短地址也能对上观察摘要', () => {
  const notes = { 'a.jpg': '机滤很黑' }
  assert.equal(noteForUrl('https://cdn.example/uploads/a.jpg?v=1', notes), '机滤很黑')
  assert.equal(noteForUrl('https://cdn.example/uploads/b.jpg', notes), '')
})
