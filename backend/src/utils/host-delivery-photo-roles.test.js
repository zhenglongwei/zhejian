const test = require('node:test')
const assert = require('node:assert/strict')
const {
  collectDeliveryEntryPhotos,
  deliveryPhotoRoleMap,
  normalizeDeliveryPhotoRoles,
  readHostDeliveryPhotoRoles,
} = require('./host-delivery-photo-roles')

test('交车入口图片只取外观行，施工行不收且同图去重；旧 deliveryPhotos 并入外观行', () => {
  const photos = collectDeliveryEntryPhotos([
    {
      kind: 'delivery_photos',
      content: {
        acceptanceItems: [
          { kind: 'exterior', images: [{ url: 'https://x/out.jpg?t=1' }, { url: 'https://x/out.jpg?t=2' }] },
          { kind: 'work', name: '换刹车片', images: [{ url: 'https://x/work.jpg' }] },
        ],
      },
    },
    {
      kind: 'delivery_photos',
      content: {
        deliveryPhotos: [{ url: 'https://x/legacy.jpg' }],
        acceptanceItems: [{ kind: 'exterior', images: [] }],
      },
    },
    { kind: 'work', content: { findings: [{ images: [{ url: 'https://x/other.jpg' }] }] } },
  ])
  // 同一张图不同签名参数按去查询串去重
  assert.deepEqual(photos.map((row) => row.url), [
    'https://x/out.jpg?t=1',
    'https://x/legacy.jpg',
  ])
})

test('模型输出按图号映射，项目名限定在施工项目里，非法归属丢弃', () => {
  const photos = [{ url: 'https://x/a.jpg' }, { url: 'https://x/b.jpg' }, { url: 'https://x/c.jpg' }]
  const roles = normalizeDeliveryPhotoRoles(
    [
      { 图: 1, 归属: '施工', 项目: '换刹车片' },
      { 图: 2, 归属: '外观', 项目: '' },
      { 图: 3, 归属: '施工', 项目: '编出来的项目' },
      { 图: 9, 归属: '施工', 项目: '换刹车片' },
      { 图: 1, 归属: '随便' },
    ],
    photos,
    ['换刹车片', '换机油'],
  )
  assert.deepEqual(roles, [
    { url: 'https://x/a.jpg', role: 'work', item: '换刹车片' },
    { url: 'https://x/b.jpg', role: 'exterior', item: '' },
    { url: 'https://x/c.jpg', role: 'work', item: '' },
  ])
  const map = deliveryPhotoRoleMap(roles)
  assert.equal(map.get('https://x/a.jpg').role, 'work')
})

test('hostMeta 读取：已公开层优先，其次托管草稿', () => {
  const album = {
    contentPackageJson: {
      hostMeta: {
        geoDraft: { deliveryPhotoRoles: [{ url: 'https://x/draft.jpg', role: 'work', item: '换机油' }] },
        geoLayer: { deliveryPhotoRoles: [{ url: 'https://x/pub.jpg', role: 'work', item: '换机油' }] },
      },
    },
  }
  assert.deepEqual(readHostDeliveryPhotoRoles(album).map((row) => row.url), ['https://x/pub.jpg'])
  assert.deepEqual(readHostDeliveryPhotoRoles({}), [])
})
