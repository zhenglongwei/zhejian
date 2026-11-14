/**
 * HOST-ARCH · 原始档案托管冒烟（无 DB）
 */
const assert = require('assert')
const {
  buildHostedArchiveSnapshot,
  readHostMeta,
  collectNodeAiContext,
  collectAnalyzableImageDescriptions,
  collectImageDescriptions,
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

/** 收全部公开图描述；接车与首次报价排除，完工照和补充报价图保留 */
function testCollectAnalyzableImageDescriptions() {
  const list = collectAnalyzableImageDescriptions([
    {
      id: 'n1',
      kind: 'inspection',
      content: { photos: [{ url: 'https://x/i1.jpg', contentDescription: '左前减震器渗油' }] },
    },
    {
      id: 'n2',
      kind: 'work',
      content: { findings: [{ url: 'https://x/w1.jpg', contentDescription: '更换前刹车片' }] },
    },
    {
      id: 'n3',
      kind: 'intake',
      content: { photos: [{ url: 'https://x/a.jpg', contentDescription: '进场前杠划痕' }] },
    },
    {
      id: 'n4',
      kind: 'delivery_photos',
      content: { photos: [{ url: 'https://x/d.jpg', contentDescription: '完工全车照' }] },
    },
    {
      id: 'n5',
      kind: 'quote_confirm',
      document: { payload: { photos: [{ url: 'https://x/q.jpg', contentDescription: '首次报价单' }] } },
    },
    {
      id: 'n6',
      kind: 'quote_confirm',
      subKind: 'add_on_quote',
      document: { payload: { items: [{ evidenceUrl: 'https://x/aq.jpg', evidenceContentDescription: '补充报价证据图' }] } },
    },
  ])
  assert.deepStrictEqual(list, ['左前减震器渗油', '更换前刹车片', '完工全车照', '补充报价证据图'])
  assert.deepStrictEqual(collectAnalyzableImageDescriptions([]), [])
}

async function testDescribeOnlyPreservesMaskResult() {
  const { applyModelMasks } = require('./model-mask.service')
  const { rowsFromUrls } = require('./host-privacy-llm.service')
  const rows = rowsFromUrls(
    ['https://x/d1.jpg'],
    new Set(['https://x/d1.jpg']),
    new Set(['https://x/d1.jpg']),
  )
  assert.strictEqual(rows[0].wantDescription, true)
  assert.strictEqual(rows[0].descriptionOnly, true)
  const pairs = await applyModelMasks(
    rows,
    [{ imageSlot: 1, regions: [{ kind: 'plate', left: 0, top: 0, width: 1, height: 1 }], description: '完工后清洗并检查整车外观' }],
  )
  assert.strictEqual(pairs.length, 1)
  assert.strictEqual(pairs[0].contentDescription, '完工后清洗并检查整车外观')
  assert.strictEqual(pairs[0].maskOutcome, undefined)
  assert.strictEqual(pairs[0].maskedUrl, undefined)
  assert.strictEqual(pairs[0].maskRegions, undefined)
}

async function testLoadHostDescribeUrlKeys() {
  const { prisma } = require('../lib/prisma')
  const { loadHostDescribeUrlKeys } = require('./hosted-public-mask.service')
  const original = prisma.album.findUnique
  prisma.album.findUnique = async () => ({
    contentPackageJson: {
      flowNodes: [
        {
          kind: 'delivery_photos',
          content: {
            acceptanceItems: [
              { images: [{ url: 'https://x/d1.jpg' }, { url: 'https://x/d2.jpg', contentDescription: '已有描述' }] },
            ],
          },
        },
        {
          kind: 'quote_confirm',
          subKind: 'add_on_quote',
          document: { payload: { items: [{ evidenceUrl: 'https://x/aq.jpg' }] } },
        },
        { kind: 'quote_confirm', document: { payload: { photos: ['https://x/first-quote.jpg'] } } },
        { kind: 'intake', photoDraft: { photos: ['https://x/intake.jpg'] } },
        { kind: 'work', workAdvice: { items: [] }, content: { photos: ['https://x/advised.jpg'] } },
      ],
    },
  })
  try {
    const keys = await loadHostDescribeUrlKeys('alb_host_smoke')
    assert.ok(keys.has('https://x/d1.jpg'), '完工照缺描述时应补分析')
    assert.ok(keys.has('https://x/aq.jpg'), '补充报价证据图缺描述时应补分析')
    assert.strictEqual(keys.has('https://x/d2.jpg'), false, '已有描述不重复分析')
    assert.strictEqual(keys.has('https://x/first-quote.jpg'), false, '首次报价不公开')
    assert.strictEqual(keys.has('https://x/intake.jpg'), false, '接车图不公开')
    assert.strictEqual(keys.has('https://x/advised.jpg'), false, '已有节点 AI 结论不重复分析')
  } finally {
    prisma.album.findUnique = original
  }
}

function testCollectNodeAiContext() {
  const text = collectNodeAiContext([
    { id: 'n1', kind: 'work', title: '施工', workAdvice: { items: [{ name: '更换前刹车片', note: '拆下发现磨损到极限' }] } },
    { id: 'n2', kind: 'work', title: '未分析' },
  ])
  assert.ok(text.includes('更换前刹车片'))
  assert.ok(text.includes('拆下发现磨损到极限'))
  assert.strictEqual(collectNodeAiContext([]), '')
  assert.strictEqual(collectNodeAiContext(null), '')
}

function testCollectImageDescriptions() {
  const list = collectImageDescriptions(
    ['左前轮刹车片磨损到报警线', '左前轮刹车片磨损到报警线'],
    [
      {
        id: 'n1',
        kind: 'work',
        workAdvice: { items: [] },
        photoDraft: { publicCaptions: [{ note: '拆下的旧片有明显沟槽' }] },
      },
    ],
  )
  assert.strictEqual(list.length, 2)
  assert.ok(list.includes('左前轮刹车片磨损到报警线'))
  assert.ok(list.includes('拆下的旧片有明显沟槽'))
  assert.deepStrictEqual(collectImageDescriptions([], []), [])

  // 描述不再限 12 条
  const many = Array.from({ length: 15 }, (_, i) => `第${i + 1}张过程图说明文字`)
  assert.strictEqual(collectImageDescriptions(many, []).length, 15)
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
testCollectAnalyzableImageDescriptions()
testCollectNodeAiContext()
testCollectImageDescriptions()

;(async () => {
  await testDescribeOnlyPreservesMaskResult()
  await testLoadHostDescribeUrlKeys()
  await testGenerateCaseBlockedForNewAlbum()
  await testGenerateCaseBlockedWhenHosted()
  console.log('case-hosting smoke ok')
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
