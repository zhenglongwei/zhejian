const test = require('node:test')
const assert = require('node:assert/strict')
const { parseSocialCardLlm, parseThemeJudge, writePlatformCards } = require('./album-social-card-llm.service')

const fakeModel = {
  enabled: true,
  apiKey: 'test',
  apiUrl: 'http://example.test/v1',
  model: 'fake',
  timeoutMs: 1000,
  enableThinking: false,
}

function scripted(steps) {
  const calls = []
  const complete = async ({ messages }) => {
    calls.push({ system: messages[0].content, user: messages[1].content })
    return { text: steps[calls.length - 1] }
  }
  complete.calls = calls
  return complete
}

test('模型先有主题，短字跟着照片 id', () => {
  const images = [{ id: 'img_pad' }, { id: 'img_disc' }]
  const cards = parseSocialCardLlm(JSON.stringify({
    concerns: ['前片是不是到限了'],
    theme: '前片到限，盘还不用换',
    slides: [
      { imageId: 'img_pad', line: '前片已经很薄' },
      { imageId: 'img_unknown', line: '不该留下' },
      { imageId: 'img_disc', line: '盘面没有槽' },
    ],
    moments: '这台途观前片到限了。\n盘还不用一起换。',
    xiaohongshuBody: '这台途观刹车偏软。拆开前片到限，盘没有槽，试车正常。',
    douyinBody: '途观前片到限，盘这次没一起换。试车正常。',
  }), images)
  const byId = Object.fromEntries(cards.map((card) => [card.id, card]))
  assert.equal(byId.moments.caption, '')
  assert.deepEqual(byId.moments.slides.map((slide) => slide.line), ['', ''])
  assert.deepEqual(byId.xiaohongshu.slides.map((slide) => slide.id), ['img_pad', 'img_disc'])
  assert.equal(byId.xiaohongshu.slides[0].line, '前片已经很薄')
  assert.match(byId.xiaohongshu.caption, /试车正常/)
  assert.match(byId.douyin.caption, /途观/)
  assert.notEqual(byId.moments.text, byId.xiaohongshu.caption)
})

test('金额会被拿掉，没有主题则整份不用', () => {
  const cards = parseSocialCardLlm(JSON.stringify({
    theme: '前片到限',
    moments: '今天换了刹车片。',
    xiaohongshuBody: '工时费 380 元，换完试车正常。',
    douyinBody: '这台途观换了刹车片，试车正常。',
    slides: [],
  }), [])
  const xhs = cards.find((card) => card.id === 'xiaohongshu')
  assert.doesNotMatch(xhs.caption, /380|元/)
  assert.equal(parseSocialCardLlm('不是 json'), null)
  assert.equal(parseSocialCardLlm('{"moments":"只有一句","theme":"前片"}'), null)
})

test('差得不多就直接按定下的主题写，不再改题', async () => {
  const complete = scripted([
    JSON.stringify({ highlight: '前片磨到线了，盘还平', because: '拆开的照片' }),
    JSON.stringify({ gap: 'close', theme: '前片到限，盘不用一起换', because: '和刹车那一眼是同一件事' }),
    JSON.stringify({
      theme: '前片到限，盘不用一起换',
      slides: [{ imageId: 'img_pad', line: '前片到限' }],
      moments: '这台途观前片到限了。\n盘没有一起换。',
      xiaohongshuBody: '这台途观前片到限，盘面没有槽。',
      douyinBody: '途观前片到限，盘这次没换。',
    }),
  ])
  const written = await writePlatformCards({
    audience: 'merchant',
    facts: { vehicleLabel: '途观', serviceName: '刹车片' },
    images: [{ id: 'img_pad', url: 'https://cdn.example/a.jpg' }],
    complete,
    model: fakeModel,
  })
  assert.equal(complete.calls.length, 3)
  assert.match(complete.calls[0].system, /最出彩/)
  assert.doesNotMatch(complete.calls[0].system, /类目规矩/)
  assert.match(complete.calls[1].system, /类目规矩/)
  assert.match(complete.calls[1].user, /事实/)
  assert.equal(typeof complete.calls[1].user, 'string')
  assert.match(complete.calls[2].system, /主题已经定了/)
  assert.equal(typeof complete.calls[2].user, 'string')
  assert.match(written.cards.find((card) => card.id === 'moments').text, /前片到限/)
})

test('差得远时在已有内容上决定主题，然后才写', async () => {
  const complete = scripted([
    JSON.stringify({ highlight: '车间摆放整齐', because: '工具车入镜' }),
    JSON.stringify({ gap: 'far', theme: '', because: '出彩处不是这台车的刹车' }),
    JSON.stringify({ choice: 'fuse', theme: '前片到限，盘不用一起换', because: '车主能用来判断要不要连盘换' }),
    JSON.stringify({
      theme: '前片到限，盘不用一起换',
      slides: [],
      moments: '这台途观前片到限了。',
      xiaohongshuBody: '这台途观前片到限，盘没有槽。',
      douyinBody: '途观前片到限。',
    }),
  ])
  const written = await writePlatformCards({
    audience: 'merchant',
    facts: { vehicleLabel: '途观' },
    images: [{ id: 'img_pad', url: 'https://cdn.example/a.jpg' }],
    complete,
    model: fakeModel,
  })
  assert.equal(complete.calls.length, 4)
  assert.match(complete.calls[2].system, /融合/)
  assert.match(complete.calls[2].system, /消费者/)
  assert.doesNotMatch(complete.calls[2].system, /再看/)
  assert.equal(typeof complete.calls[2].user, 'string')
  assert.match(complete.calls[2].user, /出彩处/)
  assert.match(complete.calls[2].user, /事实/)
  assert.equal(typeof complete.calls[3].user, 'string')
  assert.doesNotMatch(JSON.stringify(complete.calls[3].user), /image_url/)
  assert.ok(written.cards)
  const kept = parseThemeJudge('{"choice":"keep","theme":"手艺在板面"}')
  assert.equal(kept.choice, 'keep')
  assert.equal(kept.theme, '手艺在板面')
  assert.equal(parseThemeJudge('{"gap":"far","theme":"不该留下"}').theme, '')
})

test('已有分析的图不再附图，只留下挑中的', async () => {
  const remembered = []
  const complete = scripted([
    JSON.stringify({
      highlight: '前片到限',
      because: '拆开的片',
      picks: ['img_pad'],
      seen: [{ id: 'img_pad', note: '不该覆盖已有分析' }, { id: 'img_new', note: '机滤很黑' }],
    }),
    JSON.stringify({ gap: 'close', theme: '前片到限', because: '刹车' }),
    JSON.stringify({
      theme: '前片到限',
      slides: [
        { imageId: 'img_pad', line: '前片到限' },
        { imageId: 'img_disc', line: '不该留下' },
      ],
      moments: '这台途观前片到限了。',
      xiaohongshuBody: '这台途观前片到限。',
      douyinBody: '途观前片到限。',
    }),
  ])
  const written = await writePlatformCards({
    audience: 'merchant',
    facts: { vehicleLabel: '途观' },
    images: [
      { id: 'img_pad', url: 'https://cdn.example/a.jpg', prior: '前片磨到线' },
      { id: 'img_disc', url: 'https://cdn.example/b.jpg', prior: '盘面平整' },
      { id: 'img_new', url: 'https://cdn.example/c.jpg' },
    ],
    complete,
    model: fakeModel,
    rememberLook: async (rows) => { remembered.push(...rows) },
  })
  const first = complete.calls[0].user
  assert.equal(Array.isArray(first), true)
  const brief = first.find((part) => part.type === 'text').text
  assert.match(brief, /已有分析：前片磨到线/)
  assert.deepEqual(
    first.filter((part) => part.type === 'image_url').map((part) => part.image_url.url),
    ['https://cdn.example/c.jpg'],
  )
  assert.match(complete.calls[0].system, /不要再看图/)
  assert.deepEqual(written.images.map((item) => item.id), ['img_pad'])
  assert.deepEqual(
    written.cards.find((card) => card.id === 'xiaohongshu').slides.map((slide) => slide.id),
    ['img_pad'],
  )
  assert.deepEqual(remembered.map((row) => row.id), ['img_new'])
})
