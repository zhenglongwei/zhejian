/**
 * HOST-ARCH · 原始档案托管冒烟（无 DB）
 */
const assert = require('assert')
const {
  buildHostedArchiveSnapshot,
  readHostMeta,
  generateHostedGeoDraft,
} = require('./case-hosting.service')
const { PUBLIC_CASE_STATUS } = require('../constants/v2')

function sampleAlbum(extra = {}) {
  return {
    id: 'alb_host_smoke',
    status: 'completed',
    serviceName: '刹车保养',
    storeId: 'store1',
    storeName: '测试门店',
    merchantId: 'm1',
    vehicleJson: { brand: '大众' },
    nodes: [
      {
        id: 'stage_1',
        title: '检测',
        status: 'completed',
        note: '前片磨损',
        images: [{ url: 'https://x/a.jpg', caption: '检测图' }],
      },
    ],
    contentPackageJson: {
      flowNodes: [
        {
          id: 'fn1',
          kind: 'quote_confirm',
          title: '方案确认',
          status: 'completed',
          document: {
            status: 'confirmed',
            confirmedAt: '2026-09-01T00:00:00.000Z',
            payload: { items: [{ name: '前刹车片', amount: 680 }] },
          },
        },
      ],
      hostMeta: {},
    },
    publicCase: null,
    ...extra,
  }
}

function testArchiveSnapshotExcludesDraft() {
  const snap = buildHostedArchiveSnapshot(sampleAlbum())
  assert.ok(snap.frozenAt, 'frozenAt required')
  assert.strictEqual(snap.albumId, 'alb_host_smoke')
  assert.ok(Array.isArray(snap.flowNodes) && snap.flowNodes.length === 1)
  assert.ok(Array.isArray(snap.confirmedDocs) && snap.confirmedDocs.length === 1)
  assert.strictEqual(snap.merchantCaseDraft, undefined, 'must not include merchantCaseDraft')
  assert.strictEqual(JSON.stringify(snap).includes('不应进快照'), false)
  assert.ok(snap.storeSnapshot && snap.storeSnapshot.storeId === 'store1')
  assert.ok(snap.storeSnapshot.name === '测试门店' || snap.storeSnapshot.name === '')
}

function testArchiveSnapshotStoreFallback() {
  const snap = buildHostedArchiveSnapshot(
    sampleAlbum({ storeName: '城北店', storeId: 's2' }),
    { storeId: 's2', name: '城北店', city: '上海', address: 'xx路', snapshotAt: '2026-09-09' },
  )
  assert.strictEqual(snap.storeSnapshot.name, '城北店')
  assert.strictEqual(snap.storeSnapshot.city, '上海')
}

function testReadHostMetaPublished() {
  const album = sampleAlbum({
    contentPackageJson: {
      hostMeta: { hosted: true, visibility: 'private', sourceLabel: '商家上传' },
    },
    publicCase: {
      status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
      storefrontHidden: false,
      ownerBlockedAt: null,
    },
  })
  const meta = readHostMeta(album)
  assert.strictEqual(meta.hosted, true)
  assert.strictEqual(meta.visibility, 'public')
}

function testReadHostMetaPrivateHosted() {
  const album = sampleAlbum({
    contentPackageJson: {
      hostMeta: {
        hosted: true,
        visibility: 'private',
        factLayerLocked: true,
        publicPublishStage: 'awaiting_privacy',
      },
    },
  })
  const meta = readHostMeta(album)
  assert.strictEqual(meta.visibility, 'private')
  assert.strictEqual(meta.publicPublishStage, 'awaiting_privacy')
  assert.strictEqual(meta.factLayerLocked, true)
}

async function testGenerateCaseBlockedForNewAlbum() {
  const { generateMerchantPublicCase } = require('./public-case.service')
  const albumMod = require('./service-album.service')
  const origLoad = albumMod.loadAlbum
  const origAssert = albumMod.assertMerchantAlbum
  albumMod.loadAlbum = async () => sampleAlbum()
  albumMod.assertMerchantAlbum = () => {}
  try {
    await generateMerchantPublicCase('alb_host_smoke', { storeId: 'store1', merchantId: 'm1' })
    throw new Error('expected HOSTING_REQUIRED')
  } catch (err) {
    assert.strictEqual(err.code, 'HOSTING_REQUIRED')
  } finally {
    albumMod.loadAlbum = origLoad
    albumMod.assertMerchantAlbum = origAssert
  }
}

async function testGenerateCaseBlockedWhenHosted() {
  const { generateMerchantPublicCase } = require('./public-case.service')
  const albumMod = require('./service-album.service')
  const origLoad = albumMod.loadAlbum
  const origAssert = albumMod.assertMerchantAlbum
  albumMod.loadAlbum = async () =>
    sampleAlbum({
      contentPackageJson: {
        hostMeta: { hosted: true, visibility: 'private', factLayerLocked: true },
        merchantCaseDraft: { title: 'legacy', confirmedAt: '2026-01-01' },
      },
    })
  albumMod.assertMerchantAlbum = () => {}
  try {
    await generateMerchantPublicCase('alb_host_smoke', { storeId: 'store1', merchantId: 'm1' })
    throw new Error('expected ALREADY_HOSTED')
  } catch (err) {
    assert.strictEqual(err.code, 'ALREADY_HOSTED')
  } finally {
    albumMod.loadAlbum = origLoad
    albumMod.assertMerchantAlbum = origAssert
  }
}

function testContentLockedWhenFactLayerLocked() {
  const { isAlbumContentLocked } = require('./service-album.service')
  const album = sampleAlbum({
    status: 'in_progress',
    contentPackageJson: {
      hostMeta: { hosted: true, factLayerLocked: true },
    },
  })
  assert.strictEqual(isAlbumContentLocked(album), true)
}

async function testGenerateGeoRequiresPrivacy() {
  const albumMod = require('./service-album.service')
  const origLoad = albumMod.loadAlbum
  const origAssert = albumMod.assertMerchantAlbum
  albumMod.loadAlbum = async () =>
    sampleAlbum({
      contentPackageJson: {
        hostMeta: { hosted: true, factLayerLocked: true },
      },
    })
  albumMod.assertMerchantAlbum = () => {}
  try {
    await generateHostedGeoDraft('alb_host_smoke', { storeId: 'store1', merchantId: 'm1' })
    throw new Error('expected PRIVACY_REQUIRED')
  } catch (err) {
    assert.strictEqual(err.code, 'PRIVACY_REQUIRED')
  } finally {
    albumMod.loadAlbum = origLoad
    albumMod.assertMerchantAlbum = origAssert
  }
}

testArchiveSnapshotExcludesDraft()
testArchiveSnapshotStoreFallback()
testReadHostMetaPublished()
testReadHostMetaPrivateHosted()
testContentLockedWhenFactLayerLocked()

function testContentPackagePreservesHostMeta() {
  const { normalizeAlbumContentPackage } = require('../schemas/album-content-package.schema')
  const pkg = normalizeAlbumContentPackage({
    status: 'ready',
    hostMeta: { hosted: true, geoLayer: { summary: 's', confirmedAt: '2026-01-01' } },
  })
  assert.ok(pkg && pkg.hostMeta && pkg.hostMeta.geoLayer, 'normalize 须保留 hostMeta')
}

testContentPackagePreservesHostMeta()

;(async () => {
  await testGenerateCaseBlockedForNewAlbum()
  await testGenerateCaseBlockedWhenHosted()
  await testGenerateGeoRequiresPrivacy()
  console.log('case-hosting smoke ok')
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
