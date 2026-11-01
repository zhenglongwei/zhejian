const test = require('node:test')
const assert = require('node:assert/strict')
const { buildSocialCardSet, stripSocialText } = require('../../../utils/album-social-card')
const { planFrame, momentsKeep } = require('../../../utils/social-poster')
const { attachImageIds, priorsFromAlbum, rehydrateSocialPack } = require('./album-social-card.service')

test('短图文去掉金额和手机号', () => {
  assert.equal(stripSocialText('刹车片 1280元，电话13800138000'), '刹车片')
  assert.equal(stripSocialText('参考 ¥899'), '参考')
})

test('三个平台都有短句，且不写金额', () => {
  const pack = buildSocialCardSet({
    audience: 'owner',
    facts: {
      serviceName: '刹车片更换',
      storeName: '示例店',
      city: '杭州',
      vehicleLabel: '途观',
      notes: ['检测时片已经很薄，工时费 380 元'],
    },
    images: [
      { id: 'img_a', url: 'https://cdn.example/a.jpg' },
      { id: 'img_a', url: 'https://cdn.example/a-again.jpg' },
      { id: '', url: 'https://cdn.example/no-id.jpg' },
    ],
  })
  assert.deepEqual(pack.cards.map((card) => card.id), ['moments', 'xiaohongshu', 'douyin'])
  const byId = Object.fromEntries(pack.cards.map((card) => [card.id, card]))
  assert.match(byId.moments.text, /我这台途观/)
  assert.match(byId.moments.text, /刹车片更换/)
  assert.equal(byId.moments.caption, '')
  assert.match(byId.xiaohongshu.caption, /刹车片更换/)
  assert.match(byId.douyin.caption, /刹车片更换/)
  assert.notEqual(byId.moments.text, byId.xiaohongshu.caption)
  assert.notEqual(byId.xiaohongshu.caption, byId.douyin.caption)
  pack.cards.forEach((card) => {
    assert.doesNotMatch(`${card.text}\n${card.caption}`, /元|380|http|过程记一下/)
  })
  assert.equal(pack.images.length, 1)
  assert.equal(pack.images[0].id, 'img_a')
  assert.equal(byId.xiaohongshu.slides[0].id, 'img_a')
  assert.equal(byId.moments.slides[0].line, '')
})

test('商家口吻不写成车主第一人称开头', () => {
  const pack = buildSocialCardSet({
    audience: 'merchant',
    facts: {
      title: '杭州｜途观｜刹车片更换',
      summary: '检测确认片已到限，更换后试车正常。',
      storeName: '示例店',
      city: '杭州',
    },
    images: [],
  })
  const moments = pack.cards.find((card) => card.id === 'moments')
  const xhs = pack.cards.find((card) => card.id === 'xiaohongshu')
  const douyin = pack.cards.find((card) => card.id === 'douyin')
  assert.match(moments.text, /刹车片更换/)
  assert.doesNotMatch(moments.text, /^我/)
  assert.notEqual(moments.text, xhs.caption)
  assert.ok(xhs.caption.length > 0)
  assert.notEqual(douyin.caption, xhs.caption)
})

function fakeCtx() {
  return {
    font: '',
    measureText(text) {
      return { width: String(text || '').length * 40 }
    },
  }
}

test('每个平台一张图一个画面，朋友圈是方图且不印字', () => {
  const ctx = fakeCtx()
  const image = { img: { width: 800, height: 1200 }, width: 800, height: 1200 }
  const moments = planFrame(ctx, { platform: 'moments', image, line: '不该印上去' })
  const xhs = planFrame(ctx, { platform: 'xiaohongshu', image, line: '前片已经很薄' })
  const douyin = planFrame(ctx, { platform: 'douyin', image, line: '前片到限' })
  const countImages = (plan) => plan.ops.filter((op) => op.type === 'image').length
  const countText = (plan) => plan.ops.filter((op) => op.type === 'text').length
  assert.equal(countImages(moments), 1)
  assert.equal(countText(moments), 0)
  assert.equal(moments.height, 1080)
  assert.equal(countImages(xhs), 1)
  assert.equal(xhs.height, 1440)
  assert.ok(countText(xhs) > 0)
  assert.equal(douyin.height, 1920)
  assert.equal(momentsKeep(8), 6)
  assert.equal(momentsKeep(9), 9)
  assert.equal(momentsKeep(2), 1)
})

test('图按相册图片 id 挂上，不按下标重排身份', () => {
  const images = attachImageIds(
    [
      { nodeId: 'stage_4', idx: 1, maskedUrl: 'https://cdn.example/m1.jpg' },
      { nodeId: 'stage_4', idx: 0, maskedUrl: 'https://cdn.example/m0.jpg' },
      { nodeId: 'stage_2', idx: 0, maskedUrl: '' },
    ],
    [
      { id: 'img_late', nodeId: 'stage_4', idx: 1 },
      { id: 'img_early', nodeId: 'stage_4', idx: 0 },
    ],
  )
  assert.deepEqual(images.map((item) => item.id), ['img_late', 'img_early'])
  assert.equal(images[0].url, 'https://cdn.example/m1.jpg')
})

test('已有分析跟图片身份走，同一张图的两种地址算同一份', () => {
  const map = priorsFromAlbum({
    id: 'alb',
    images: [{ id: 'img_pad', nodeId: 'fn_1', idx: 0, rawUrl: 'https://cdn.example/uploads/a.jpg?v=1' }],
    contentPackageJson: {
      flowNodes: [{
        content: { imageNotes: { 'https://cdn.example/media/files/uploads/a.jpg': '前片磨到线' } },
      }],
    },
  }, [{
    albumImageId: 'img_pad',
    resultJson: { observation: '盘面没有槽' },
  }])
  assert.match(map.img_pad, /前片磨到线/)
  assert.match(map.img_pad, /盘面没有槽/)
  assert.match(map['fn_1:0'], /前片磨到线/)
})

test('上次成稿按图片 id 接回当前打码图，已经不在相册里的丢掉', () => {
  const pack = rehydrateSocialPack({
    cards: [{
      id: 'moments',
      text: '这台侧裙还在补',
      slides: [{ id: 'gone', line: '' }, { id: 'a', line: '' }],
    }],
    imageIds: ['gone', 'a'],
    source: 'llm_text',
  }, [
    { id: 'a', url: 'https://cdn.example/a.jpg?v=2' },
    { id: 'b', url: 'https://cdn.example/b.jpg' },
  ], 'merchant')
  assert.deepEqual(pack.images.map((item) => item.id), ['a'])
  assert.equal(pack.images[0].url, 'https://cdn.example/a.jpg?v=2')
  assert.deepEqual(pack.cards[0].slides.map((slide) => slide.id), ['a'])
  assert.equal(pack.source, 'llm_text')
})

test('成稿里的图都对不上时，不当作可以打开的结果', () => {
  assert.equal(rehydrateSocialPack({
    cards: [{ id: 'moments', text: 'x', slides: [{ id: 'gone', line: '' }] }],
    imageIds: ['gone'],
  }, [{ id: 'a', url: 'https://cdn.example/a.jpg' }], 'owner'), null)
})
