const test = require('node:test')
const assert = require('node:assert/strict')
const { buildSocialCardSet, stripSocialText } = require('../../../utils/album-social-card')
const { planPoster } = require('../../../utils/social-poster')
const { attachImageIds } = require('./album-social-card.service')

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
  assert.notEqual(byId.moments.text, byId.xiaohongshu.text)
  assert.notEqual(byId.xiaohongshu.text, byId.douyin.text)
  assert.match(byId.xiaohongshu.text, /过程记一下/)
  assert.doesNotMatch(byId.moments.text, /过程记一下/)
  assert.doesNotMatch(byId.douyin.text, /过程记一下|车牌已打码/)
  assert.ok(byId.xiaohongshu.caption.length > byId.xiaohongshu.text.length)
  pack.cards.forEach((card) => {
    assert.match(card.text, /刹车片更换/)
    assert.doesNotMatch(card.text, /元|380|http/)
  })
  assert.equal(byId.moments.caption, '')
  assert.match(byId.xiaohongshu.caption, /实拍/)
  assert.equal(pack.images.length, 1)
  assert.equal(pack.images[0].id, 'img_a')
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
  assert.notEqual(moments.text, xhs.text)
  assert.match(xhs.text, /｜/)
  assert.ok(xhs.caption.length > 0)
  assert.notEqual(douyin.text, xhs.text)
})

function fakeCtx() {
  return {
    font: '',
    measureText(text) {
      return { width: String(text || '').length * 40 }
    },
  }
}

test('三个平台合成图的排法不同，照片都进同一张', () => {
  const ctx = fakeCtx()
  const images = [
    { img: { width: 800, height: 600 }, width: 800, height: 600 },
    { img: { width: 800, height: 800 }, width: 800, height: 800 },
    { img: { width: 400, height: 800 }, width: 400, height: 800 },
  ]
  const text = '途观刹车片更换，过程记一下\n\n片已经很薄'
  const moments = planPoster(ctx, { platform: 'moments', text, images })
  const xhs = planPoster(ctx, { platform: 'xiaohongshu', text, images })
  const douyin = planPoster(ctx, { platform: 'douyin', text, images })
  const countImages = (plan) => plan.ops.filter((op) => op.type === 'image').length
  assert.equal(countImages(moments), 3)
  assert.equal(countImages(xhs), 3)
  assert.equal(countImages(douyin), 3)
  assert.notEqual(moments.height, douyin.height)
  assert.equal(douyin.height, 1920)
  assert.ok(xhs.height > 1440)
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
