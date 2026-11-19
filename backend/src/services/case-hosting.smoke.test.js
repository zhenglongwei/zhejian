/**
 * HOST-ARCH · 原始档案托管冒烟（无 DB）
 */
const assert = require('assert')
const {
  buildHostedArchiveSnapshot,
  readHostMeta,
} = require('./case-hosting.service')
const {
  buildHostPreviewBackfillPatch,
  buildHostPreviewEdits,
  buildDeliveryPhotoFingerprint,
  readHostPreviewView,
} = require('./host-preview-cache.service')
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
          content: { items: [{ name: '前刹车片', amount: 680 }] },
          document: {
            status: 'confirmed',
            confirmedAt: '2026-09-01T00:00:00.000Z',
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

/** 生成走预览缓存表，不再从 hostMeta 里挑草稿 */
function testGenerateGeoReadsPreviewCache() {
  const src = require('fs').readFileSync(require('path').join(__dirname, 'case-hosting.service.js'), 'utf8')
  const start = src.indexOf('async function generateHostedGeoDraft')
  const end = src.indexOf('\nasync function ', start + 10)
  const fnSrc = src.slice(start, end > start ? end : undefined)
  assert.ok(start > 0, '未找到 generateHostedGeoDraft')
  assert.ok(/readHostPreviewCache\(albumId\)/.test(fnSrc), '生成须先读预览缓存')
  assert.ok(!/pickReusableHostedGeoDraft/.test(src), 'hostMeta 挑草稿的旧口径已删')
}

/** 交车图判过就直接复用判定，不再调视觉模型（实测 15s 的来源） */
function testDeliveryRolesSkipsModelWhenCacheJudged() {
  const src = require('fs').readFileSync(require('path').join(__dirname, 'case-hosting.service.js'), 'utf8')
  const start = src.indexOf('async function resolveDeliveryPhotoRoles')
  const end = src.indexOf('\nasync function ', start + 10)
  const fnSrc = src.slice(start, end > start ? end : undefined)
  assert.ok(start > 0, '未找到 resolveDeliveryPhotoRoles')
  const judgedAt = fnSrc.indexOf('if (judged && !forceRegen)')
  const chatAt = fnSrc.indexOf("require('../lib/dashscope-chat')")
  assert.ok(judgedAt > 0 && chatAt > 0 && judgedAt < chatAt, '判过就该短路，不能每次都看图')
  assert.ok(/patchHostPreviewCache\(album\.id/.test(fnSrc), '判定结果要落回预览缓存')
}

/** 缓存生命周期独立于托管开关：取消托管 / 收回私密都不碰它 */
function testUnhostKeepsPreviewCache() {
  const src = require('fs').readFileSync(require('path').join(__dirname, 'case-hosting.service.js'), 'utf8')
  const fnNames = ['cancelPublicHostIntent', 'unhostAlbum', 'unpublishHostedCase']
  fnNames.forEach((name) => {
    const start = src.indexOf(`async function ${name}`)
    assert.ok(start > 0, `未找到 ${name}`)
    const end = src.indexOf('\nasync function ', start + 10)
    const fnSrc = src.slice(start, end > start ? end : undefined)
    assert.ok(!/patchHostPreviewCache|hostPreviewCache\.delete/.test(fnSrc), `${name} 不应清预览缓存`)
  })
}

/** 已公开内容回填进缓存：模型层留草稿，公开稿记成人工覆盖，不重跑模型 */
function testPublishedLayerBackfillsIntoPreviewCache() {
  const patch = buildHostPreviewBackfillPatch(
    {
      geoLayer: {
        summary: '已上线摘要',
        faq: [{ q: '问', a: '答' }],
        confirmedAt: '2026-11-10T00:00:00.000Z',
      },
      geoDraft: { summary: '模型草稿', nodeStories: ['段一'], faq: [], factFingerprint: 'fp1' },
    },
    { copyFingerprint: 'fp1', photoFingerprint: 'ph1' },
  )
  assert.ok(patch, '已公开层须回填进缓存，不能空手重跑模型')
  assert.strictEqual(patch.copy.summary, '模型草稿')
  assert.strictEqual(patch.copyFingerprint, 'fp1')
  assert.strictEqual(patch.edits.summary, '已上线摘要')
  const row = {
    copyFingerprint: patch.copyFingerprint,
    copyJson: patch.copy,
    editsJson: patch.edits,
    photoFingerprint: '',
    photosJson: null,
  }
  const view = readHostPreviewView(row, { copyFingerprint: 'fp1', photoFingerprint: '' })
  assert.strictEqual(view.effective.summary, '已上线摘要')
  assert.strictEqual(view.effective.humanEdited, true)
  // 人工稿只覆盖摘要与问答，模型层的其余字段仍在
  assert.deepStrictEqual(view.effective.nodeStories, ['段一'])
  assert.deepStrictEqual(view.effective.faq, [{ q: '问', a: '答', needsAnswer: false }])
  // 没有产物可搬才返回 null，让调用方去跑模型
  assert.strictEqual(buildHostPreviewBackfillPatch({ geoDraft: {} }, {}), null)
  // 草稿自带旧事实指纹：如实记录，不把旧产物记成新事实
  const stale = buildHostPreviewBackfillPatch(
    { geoDraft: { summary: '旧草稿', factFingerprint: 'fp0' } },
    { copyFingerprint: 'fp1' },
  )
  assert.strictEqual(stale.copyFingerprint, 'fp0')
}

/** 上次草稿指纹一致才复用模型层；事实变了人工稿仍留在 */
function testHumanCopyWinsAfterFactChange() {
  const row = {
    copyFingerprint: 'fp1',
    copyJson: { summary: '模型摘要', faq: [], nodeStories: ['段一'] },
    editsJson: buildHostPreviewEdits({ summary: '商家改过的摘要', faq: [{ q: '问', a: '' }] }),
    photoFingerprint: '',
    photosJson: null,
  }
  const alive = readHostPreviewView(row, { copyFingerprint: 'fp1' })
  assert.strictEqual(alive.copy && alive.copy.summary, '模型摘要')
  assert.strictEqual(alive.effective.summary, '商家改过的摘要')
  // 单据链变了：模型层作废要重跑，人工稿不作废
  const stale = readHostPreviewView(row, { copyFingerprint: 'fp2' })
  assert.strictEqual(stale.copy, null)
  assert.strictEqual(stale.effective.summary, '商家改过的摘要')
  assert.strictEqual(stale.effective.humanEdited, true)
  // 空摘要不能把模型稿遮住
  assert.strictEqual(buildHostPreviewEdits({ summary: '  ', faq: [] }), null)
}

/** 交车补传图判过即复用（含「全判外观」的空结果），只有图换了才重判 */
function testDeliveryPhotoJudgementReusedIncludingEmpty() {
  const roles = [{ url: 'https://cdn/x.jpg', role: 'work', item: '更换刹车片' }]
  const row = {
    copyFingerprint: '',
    copyJson: null,
    editsJson: null,
    photoFingerprint: 'ph1',
    photosJson: { deliveryPhotoRoles: [] },
  }
  assert.strictEqual(readHostPreviewView(row, { photoFingerprint: 'ph1' }).photoJudged, true)
  assert.deepStrictEqual(readHostPreviewView(row, { photoFingerprint: 'ph1' }).deliveryPhotoRoles, [])
  assert.strictEqual(readHostPreviewView(row, { photoFingerprint: 'ph2' }).photoJudged, false)
  assert.strictEqual(readHostPreviewView(row, { photoFingerprint: '' }).photoJudged, false)
  const judged = readHostPreviewView(
    { ...row, photosJson: { deliveryPhotoRoles: roles } },
    { photoFingerprint: 'ph1' },
  )
  assert.deepStrictEqual(judged.deliveryPhotoRoles, roles)

  // 指纹只认图本身：签名参数、顺序变了都不重判
  const flowNodes = [
    {
      kind: 'delivery_photos',
      content: {
        acceptanceItems: [
          { kind: 'exterior', images: [{ url: 'https://cdn/a.jpg' }, { url: 'https://cdn/b.jpg' }] },
        ],
      },
    },
  ]
  const base = buildDeliveryPhotoFingerprint(flowNodes)
  assert.ok(base, '有交车图才应有指纹')
  assert.strictEqual(
    buildDeliveryPhotoFingerprint([
      {
        kind: 'delivery_photos',
        content: {
          acceptanceItems: [
            { kind: 'exterior', images: [{ url: 'https://cdn/b.jpg?sig=2' }, { url: 'https://cdn/a.jpg?sig=1' }] },
          ],
        },
      },
    ]),
    base,
  )
  assert.strictEqual(buildDeliveryPhotoFingerprint([]), '')
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
testGenerateGeoReadsPreviewCache()
testDeliveryRolesSkipsModelWhenCacheJudged()
testUnhostKeepsPreviewCache()
testPublishedLayerBackfillsIntoPreviewCache()
testHumanCopyWinsAfterFactChange()
testDeliveryPhotoJudgementReusedIncludingEmpty()

;(async () => {
  await testGenerateCaseBlockedForNewAlbum()
  await testGenerateCaseBlockedWhenHosted()
  console.log('case-hosting smoke ok')
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
