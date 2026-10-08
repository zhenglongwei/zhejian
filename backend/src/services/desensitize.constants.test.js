const test = require('node:test')
const assert = require('node:assert/strict')
const {
  ASSET_STATUS,
  shouldReuseMaskedAsset,
  listUnmaskedAlbumAssets,
  lookupAssetByRawUrl,
  indexAssetsByRawUrl,
  fingerprintCacheVersion,
} = require('./desensitize.constants')

test('fingerprintCacheVersion reads suffix after last @', () => {
  assert.equal(fingerprintCacheVersion('[{"id":"n"}]@aliyun-v7'), 'aliyun-v7')
  assert.equal(fingerprintCacheVersion(''), '')
})

test('already masked intake photo is reused when work photos are added', () => {
  const prev = {
    rawUrl: 'https://cdn.example/intake.jpg?sign=1',
    maskedUrl: 'https://cdn.example/masked/intake.jpg',
    status: ASSET_STATUS.MASKED_READY,
  }
  assert.equal(shouldReuseMaskedAsset(prev, {}), true)
  assert.equal(shouldReuseMaskedAsset(prev, { cacheVersionChanged: true }), true)
  assert.equal(shouldReuseMaskedAsset(prev, { albumForce: true }), false)
  assert.equal(shouldReuseMaskedAsset(prev, { stub: true }), false)
  assert.equal(shouldReuseMaskedAsset({ status: ASSET_STATUS.MASK_FAILED }, {}), false)
})

test('listUnmaskedAlbumAssets only returns photos without a reusable mask', () => {
  const current = [
    { rawUrl: 'https://cdn.example/intake.jpg', nodeId: 'intake' },
    { rawUrl: 'https://cdn.example/work.jpg', nodeId: 'work' },
  ]
  const taskAssets = [
    {
      rawUrl: 'https://cdn.example/intake.jpg?exp=1',
      maskedUrl: 'https://cdn.example/masked/intake.jpg',
      status: ASSET_STATUS.MASKED_READY,
    },
  ]
  const missing = listUnmaskedAlbumAssets(current, taskAssets)
  assert.equal(missing.length, 1)
  assert.equal(missing[0].rawUrl, 'https://cdn.example/work.jpg')
})

test('same original url on a later node still hits the intake mask', () => {
  const index = indexAssetsByRawUrl([
    {
      rawUrl: 'https://cdn.example/api/v1/media/files/uploads/a.jpg',
      maskedUrl: 'https://cdn.example/masked/a.jpg',
      status: ASSET_STATUS.MASKED_READY,
    },
  ])
  const hit = lookupAssetByRawUrl(
    index,
    'https://cdn.example/api/v1/media/files/uploads/a.jpg?token=x',
  )
  assert.equal(hit.maskedUrl, 'https://cdn.example/masked/a.jpg')
})
