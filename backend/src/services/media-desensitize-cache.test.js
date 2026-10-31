const test = require('node:test')
const assert = require('node:assert/strict')
const {
  DESENSITIZE_STATUS,
  isDesensitizeTerminal,
  shouldSkipRerunDesensitize,
} = require('./media.service')
const { desensitizedKeyForSource, isCollapsedMaskKey, usableMaskedProductUrl } = require('../lib/media-storage')

test('success need_manual and failed are terminal desensitize states', () => {
  assert.equal(isDesensitizeTerminal({ desensitizeStatus: DESENSITIZE_STATUS.SUCCESS }), true)
  assert.equal(isDesensitizeTerminal({ desensitizeStatus: DESENSITIZE_STATUS.NEED_MANUAL }), true)
  assert.equal(isDesensitizeTerminal({ desensitizeStatus: DESENSITIZE_STATUS.FAILED }), true)
  assert.equal(isDesensitizeTerminal({ desensitizeStatus: DESENSITIZE_STATUS.PENDING }), false)
})

test('need_manual is not rerun unless force or host retryFailed', () => {
  const media = { desensitizeStatus: DESENSITIZE_STATUS.NEED_MANUAL }
  assert.equal(shouldSkipRerunDesensitize(media, {}), true)
  assert.equal(shouldSkipRerunDesensitize(media, { force: true }), false)
  assert.equal(shouldSkipRerunDesensitize(media, { retryFailed: true }), false)
})

test('failed is not rerun unless force or host retryFailed', () => {
  const media = { desensitizeStatus: DESENSITIZE_STATUS.FAILED }
  assert.equal(shouldSkipRerunDesensitize(media, {}), true)
  assert.equal(shouldSkipRerunDesensitize(media, { force: true }), false)
  assert.equal(shouldSkipRerunDesensitize(media, { retryFailed: true }), false)
})

test('同一张原图无论第几次打码都是同一个文件名', () => {
  const door = desensitizedKeyForSource({ objectKey: 'uploads/2026/10/door.jpg', ext: '.jpg' })
  const doorAgain = desensitizedKeyForSource({
    objectKey: 'uploads/2026/10/door.jpg',
    albumId: 'alb1',
    nodeId: 'fid_a',
    idx: 2,
    ext: '.jpg',
  })
  const chassis = desensitizedKeyForSource({ objectKey: 'uploads/2026/10/chassis.jpg', ext: '.jpg' })
  assert.equal(door, doorAgain)
  assert.notEqual(door, chassis)
  assert.equal(isCollapsedMaskKey(door), false)
  assert.equal(isCollapsedMaskKey('uploads/desensitized/album/node_0.jpg'), true)
})

test('节点上的打码地址可用，共用默认文件不能当这张图的产物', () => {
  const own = usableMaskedProductUrl(
    'https://staging.example/api/v1/media/files/uploads/desensitized/alb1/fid_a_1.jpg',
  )
  assert.match(own, /fid_a_1\.jpg/)
  assert.equal(
    usableMaskedProductUrl(
      'https://staging.example/api/v1/media/files/uploads/desensitized/album/node_0.jpg',
    ),
    '',
  )
  assert.equal(
    usableMaskedProductUrl(
      'https://staging.example/api/v1/media/files/uploads/2026/10/door.jpg',
    ),
    '',
  )
})

test('共用的默认打码文件不算这张图自己的结果', () => {
  const media = {
    desensitizeStatus: DESENSITIZE_STATUS.SUCCESS,
    desensitizedUrl: 'https://x/media/files/uploads/desensitized/album/node_0.jpg',
    desensitizedKey: 'uploads/desensitized/album/node_0.jpg',
    objectKey: 'uploads/2026/10/door.jpg',
  }
  assert.equal(shouldSkipRerunDesensitize(media, {}), false)
})

test('host retryFailed still reuses success cache', () => {
  const media = {
    desensitizeStatus: DESENSITIZE_STATUS.SUCCESS,
    desensitizedUrl: 'https://x/desensitized/a.jpg',
    desensitizedKey: 'uploads/desensitized/a.jpg',
    objectKey: 'uploads/raw/a.jpg',
  }
  assert.equal(shouldSkipRerunDesensitize(media, { retryFailed: true }), true)
})
