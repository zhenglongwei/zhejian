const test = require('node:test')
const assert = require('node:assert/strict')
const {
  ALBUM_VISION_PROMPT_VERSION,
  ALBUM_VISION_AUDIENCE,
  buildImageDescribeUserPrompt,
  buildCardSynthesisUserPrompt,
  IMAGE_DESCRIBE_SYSTEM,
  CARD_SYNTHESIS_SYSTEM,
} = require('../constants/album-vision-prompts')
const { fingerprintVisionSource } = require('./album-vision-ondemand.service')

test('VIS-03 prompt version is stable for cache keying', () => {
  assert.equal(ALBUM_VISION_PROMPT_VERSION, 'album-vision-v1-2026-08-18')
  assert.match(IMAGE_DESCRIBE_SYSTEM, /禁止编造/)
  assert.match(CARD_SYNTHESIS_SYSTEM, /禁止为保护门店编造/)
})

test('fingerprint changes when masked url changes', () => {
  const a = fingerprintVisionSource('https://cdn.example/a.jpg?x=1', 'key-a')
  const b = fingerprintVisionSource('https://cdn.example/a.jpg?x=2', 'key-a')
  const c = fingerprintVisionSource('https://cdn.example/b.jpg', 'key-a')
  assert.equal(a, b, 'query string should be stripped')
  assert.notEqual(a, c)
})

test('merchant vs owner synthesis prompts differ by audience', () => {
  const merchant = buildCardSynthesisUserPrompt({
    audience: ALBUM_VISION_AUDIENCE.MERCHANT,
    cardTitle: '刹车片',
    merchantOutcome: '建议更换',
    imageNotes: ['旧片已到极限'],
  })
  const owner = buildCardSynthesisUserPrompt({
    audience: ALBUM_VISION_AUDIENCE.OWNER,
    cardTitle: '刹车片',
    merchantOutcome: '建议更换',
    imageNotes: ['旧片已到极限'],
  })
  assert.match(merchant, /修理厂/)
  assert.match(owner, /车主/)
  assert.match(buildImageDescribeUserPrompt({ itemLabel: '机油尺' }), /机油尺/)
})

test('VIS-04 media finalize must not import album vision', () => {
  const fs = require('fs')
  const path = require('path')
  const mediaSrc = fs.readFileSync(
    path.join(__dirname, '../routes/media.js'),
    'utf8',
  )
  assert.doesNotMatch(mediaSrc, /album-vision-ondemand/)
  assert.doesNotMatch(mediaSrc, /interpretAlbumThemeCard/)
  assert.doesNotMatch(mediaSrc, /chatCompletion/)
  assert.match(mediaSrc, /VIS-04/)
})
