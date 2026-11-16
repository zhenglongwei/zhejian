/**
 * HOST-ARCH · 原始档案托管冒烟（无 DB）
 */
const assert = require('assert')
const {
  buildHostedArchiveSnapshot,
  readHostMeta,
  pickReusableHostedGeoDraft,
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

/** 两步托管：预览步即可拉店页草稿，不再要求先过隐私校验 */
function testGenerateGeoNoLongerRequiresPrivacyGate() {
  const src = require('fs').readFileSync(require('path').join(__dirname, 'case-hosting.service.js'), 'utf8')
  assert.ok(
    !/code:\s*'PRIVACY_REQUIRED'/.test(src),
    'generateHostedGeoDraft 不应再抛 PRIVACY_REQUIRED（隐私在继续公开时校验）',
  )
}

/** 预览步即可生成草稿，不再要求先托管 */
function testGenerateGeoNoLongerRequiresHosted() {
  const src = require('fs').readFileSync(require('path').join(__dirname, 'case-hosting.service.js'), 'utf8')
  const start = src.indexOf('async function generateHostedGeoDraft')
  const end = src.indexOf('\nasync function ', start + 10)
  const fnSrc = src.slice(start, end > start ? end : undefined)
  assert.ok(start > 0, '未找到 generateHostedGeoDraft')
  assert.ok(
    !/请先托管到案例站/.test(fnSrc),
    'generateHostedGeoDraft 不应再要求先托管（预览步就要出草稿）',
  )
}

/** 已公开内容优先复用，不重跑模型 */
function testReusePublishedGeoLayer() {
  const draft = pickReusableHostedGeoDraft(
    {
      geoLayer: {
        summary: '已上线摘要',
        nodeStories: ['段一'],
        faq: [{ q: '问', a: '答' }],
        confirmedAt: '2026-11-10T00:00:00.000Z',
      },
      geoDraft: { summary: '旧草稿', factFingerprint: 'stale' },
    },
    'fp1',
  )
  assert.strictEqual(draft.source, 'published')
  assert.strictEqual(draft.summary, '已上线摘要')
  assert.deepStrictEqual(draft.nodeStories, ['段一'])
  assert.strictEqual(draft.factFingerprint, 'fp1')
}

/** 上次草稿指纹一致才复用；事实变了要重生成 */
function testReuseDraftByFingerprint() {
  const hostMeta = {
    geoDraft: { summary: '草稿摘要', nodeStories: ['段一'], faq: [], factFingerprint: 'fp1' },
  }
  assert.strictEqual(pickReusableHostedGeoDraft(hostMeta, 'fp1').summary, '草稿摘要')
  assert.strictEqual(pickReusableHostedGeoDraft(hostMeta, 'fp2'), null)
}

/** 历史草稿没有指纹：按可复用处理，避免一次性全量重跑 */
function testReuseLegacyDraftWithoutFingerprint() {
  const draft = pickReusableHostedGeoDraft({ geoDraft: { summary: '老草稿', faq: [] } }, 'fp9')
  assert.strictEqual(draft.summary, '老草稿')
  assert.strictEqual(draft.factFingerprint, 'fp9')
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

function testMapHostedCaseListVisibilityAndPath() {
  const { mapHostedCaseListItem } = require('./case-hosting.service')
  const live = mapHostedCaseListItem(
    sampleAlbum({
      contentPackageJson: { hostMeta: { hosted: true, visibility: 'private' } },
      publicCase: {
        id: 'case_live',
        title: '刹车',
        status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
        storefrontHidden: false,
        slug: 'hangzhou-brake-case_live',
        coverImage: 'https://x/c.jpg',
      },
    })
  )
  assert.strictEqual(live.visibility, 'public')
  assert.strictEqual(live.publicPath, '/case/hangzhou-brake-case_live.html')
  assert.strictEqual(live.caseId, 'case_live')
  assert.strictEqual(live.id, 'case_live')

  const metaPublic = mapHostedCaseListItem(
    sampleAlbum({
      contentPackageJson: { hostMeta: { hosted: true, visibility: 'public' } },
      publicCase: {
        id: 'case_meta',
        status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
        storefrontHidden: false,
        slug: '',
      },
    })
  )
  assert.strictEqual(metaPublic.visibility, 'public')
  assert.ok(String(metaPublic.publicPath).includes('/case/view.html?id=case_meta'))

  const privateOnly = mapHostedCaseListItem(
    sampleAlbum({
      contentPackageJson: { hostMeta: { hosted: true, visibility: 'private' } },
      publicCase: null,
    })
  )
  assert.strictEqual(privateOnly.visibility, 'private')
  assert.strictEqual(privateOnly.publicPath, '')

  const skip = mapHostedCaseListItem(sampleAlbum({ publicCase: null }))
  assert.strictEqual(skip, null)
}

testContentPackagePreservesHostMeta()
testMapHostedCaseListVisibilityAndPath()

testGenerateGeoNoLongerRequiresPrivacyGate()
testGenerateGeoNoLongerRequiresHosted()
testReusePublishedGeoLayer()
testReuseDraftByFingerprint()
testReuseLegacyDraftWithoutFingerprint()

;(async () => {
  await testGenerateCaseBlockedForNewAlbum()
  await testGenerateCaseBlockedWhenHosted()
  console.log('case-hosting smoke ok')
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
