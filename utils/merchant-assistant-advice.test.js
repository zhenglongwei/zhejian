const test = require('node:test')
const assert = require('node:assert/strict')
const { collectAssistantAdvice } = require('./merchant-assistant-advice')

const now = new Date('2026-10-11T06:00:00.000Z')

function album(nodes, extra = {}) {
  return {
    albumId: 'alb_1',
    vehicle: { plate: '粤B7K52M' },
    flowNodes: nodes,
    ...extra,
  }
}

test('没有意见时不编卡片', () => {
  const cards = collectAssistantAdvice(
    album([{ id: 'n1', kind: 'intake', intakeAdvice: { status: 'ready', diagnosis: '' } }]),
    now,
  )
  assert.deepEqual(cards, [])
})

test('接车意见在报价还能改时写入报价单', () => {
  const cards = collectAssistantAdvice(
    album([
      {
        id: 'in',
        kind: 'intake',
        intakeAdvice: {
          status: 'ready',
          diagnosis: '节温器座渗漏较多，建议先看冷却系统',
          updatedAt: '2026-10-11T05:40:00.000Z',
        },
      },
      { id: 'q1', kind: 'quote_confirm', document: { status: 'draft', payload: { lines: [] } } },
    ]),
    now,
  )
  assert.equal(cards.length, 1)
  assert.equal(cards[0].plate, '粤B·7K52M')
  assert.equal(cards[0].kindLabel, '接车意见')
  assert.equal(cards[0].action, 'quote')
  assert.equal(cards[0].actionLabel, '添加到报价单')
  assert.equal(cards[0].quoteNodeId, 'q1')
  assert.equal(cards[0].when, '20 分钟前')
})

test('报价已发给车主时只能打开那一步', () => {
  const cards = collectAssistantAdvice(
    album([
      {
        id: 'in',
        kind: 'intake',
        intakeAdvice: { status: 'ready', diagnosis: '冷却液痕迹' },
      },
      {
        id: 'q1',
        kind: 'quote_confirm',
        document: { status: 'pending_confirm', payload: { lines: [] } },
      },
    ]),
    now,
  )
  assert.equal(cards[0].action, 'open')
  assert.equal(cards[0].actionLabel, '查看并采纳')
  assert.equal(cards[0].quoteNodeId, '')
})

test('已采纳、已写进报价单、补拍不进报价', () => {
  const cards = collectAssistantAdvice(
    album([
      {
        id: 'rep',
        kind: 'inspection_report',
        aiReview: {
          status: 'ready',
          suggestions: [
            { id: 'a', type: 'text', field: 'quoteLineNote', title: '写清质保', suggestedText: '质保 12 个月', applied: true },
            { id: 'b', type: 'text', field: 'quoteLineName', title: '更换气门室盖垫', suggestedText: '更换气门室盖垫' },
            { id: 'c', type: 'photo', title: '补拍冷却液', how: '对着痕迹拍一张' },
          ],
        },
      },
      {
        id: 'q1',
        kind: 'quote_confirm',
        document: {
          status: 'draft',
          payload: { lines: [{ name: '更换气门室盖垫', note: '' }] },
        },
      },
    ]),
    now,
  )
  assert.equal(cards.length, 1)
  assert.equal(cards[0].kindLabel, '补拍')
  assert.equal(cards[0].action, 'open')
})
