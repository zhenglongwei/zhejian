const test = require('node:test')
const assert = require('node:assert/strict')
const { parseSocialCardLlm } = require('./album-social-card-llm.service')

test('模型结果拆成三种写法，朋友圈没有正文', () => {
  const cards = parseSocialCardLlm(JSON.stringify({
    moments: '今天把前刹车片换了。\n拆开已经很薄。',
    xiaohongshuCover: '途观前刹车片｜拆开已经很薄',
    xiaohongshuBody: '这台途观刹车偏软。拆检前片到限，换了新片，试车正常。',
    douyinOverlay: '途观，前刹车片换完了',
    douyinBody: '杭州一台途观，刹车偏软。拆检前片到限，更换后试车正常。',
  }))
  const byId = Object.fromEntries(cards.map((card) => [card.id, card]))
  assert.equal(byId.moments.caption, '')
  assert.notEqual(byId.moments.text, byId.xiaohongshu.text)
  assert.notEqual(byId.xiaohongshu.text, byId.douyin.text)
  assert.match(byId.xiaohongshu.caption, /试车正常/)
  assert.match(byId.douyin.caption, /途观/)
  assert.ok(byId.douyin.text.length < byId.douyin.caption.length)
})

test('金额会被拿掉，缺字段则整份不用', () => {
  const cards = parseSocialCardLlm(JSON.stringify({
    moments: '今天换了刹车片。',
    xiaohongshuCover: '途观刹车片',
    xiaohongshuBody: '工时费 380 元，换完试车正常。',
    douyinOverlay: '途观刹车片换完了',
    douyinBody: '这台途观换了刹车片，试车正常。',
  }))
  const xhs = cards.find((card) => card.id === 'xiaohongshu')
  assert.doesNotMatch(xhs.caption, /380|元/)
  assert.equal(parseSocialCardLlm('不是 json'), null)
  assert.equal(parseSocialCardLlm('{"moments":"只有一句"}'), null)
})
