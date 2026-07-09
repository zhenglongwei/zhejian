const test = require('node:test')
const assert = require('node:assert/strict')

const {
  resolveSnapshotArticleBody,
  applySnapshotLayerToPublicCase,
  buildCasePublicLayerMeta,
} = require('./case-public-layers')
const { mapCaseArticleForApi } = require('../schemas/case-geo-content.schema')
const { applyCasePublicDisplay } = require('./case-geo-display')

test('resolveSnapshotArticleBody prefers snapshot.articleBody', () => {
  const row = {
    articleBody: '列正文',
    contentJson: {
      snapshot: {
        version: 2,
        articleBody: '快照正文',
        nodes: [],
      },
    },
  }
  assert.equal(resolveSnapshotArticleBody(row), '快照正文')
})

test('mapCaseArticleForApi uses snapshot body when frozen', () => {
  const row = {
    articleBody: '列正文',
    articleStatus: 'published_h5',
    contentJson: {
      snapshot: {
        version: 1,
        articleBody: '授权快照正文',
        nodes: [{ id: 'stage_1', title: '接车', note: '快照节点说明', images: [] }],
      },
      geo: {
        sections: [{ key: 'overview', title: '概况', content: '提炼层段落' }],
        nodeNarratives: [{ nodeId: 'stage_1', description: '提炼层叙事' }],
      },
    },
    enrichmentJson: {
      version: 1,
      aiSummary: '提炼层摘要',
      geo: {
        sections: [{ key: 'overview', title: '概况', content: '提炼层段落' }],
        nodeNarratives: [{ nodeId: 'stage_1', description: '提炼层叙事' }],
      },
    },
  }
  const article = mapCaseArticleForApi(row)
  assert.equal(article.body, '授权快照正文')
  assert.equal(article.sections.length, 1)
  assert.equal(article.nodeNarratives[0].description, '提炼层叙事')
})

test('applyCasePublicDisplay keeps snapshot node note when frozen', () => {
  const item = applyCasePublicDisplay({
    snapshotVersion: 1,
    serviceName: '刹车维修',
    aiSummary: '提炼层顶栏摘要，展示故障现象与维修方案',
    nodes: [{ id: 'stage_1', title: '接车', note: '快照说明', images: ['https://x/files/uploads/desensitized/a.jpg'] }],
    article: {
      nodeNarratives: [{ nodeId: 'stage_1', description: '提炼层覆盖说明' }],
    },
    faultDesc: '提炼层故障',
    authorizationTier: 'named',
  })
  assert.equal(item.displayAiSummary, '提炼层顶栏摘要，展示故障现象与维修方案')
  assert.equal(item.displayNodes[0].note, '快照说明')
})

test('applySnapshotLayerToPublicCase exposes layer meta and snapshot price', () => {
  const row = {
    contentJson: {
      snapshot: {
        version: 3,
        frozenAt: '2026-07-09T00:00:00.000Z',
        title: '快照标题',
        price: {
          priceMode: 'fixed',
          amount: 880,
          minAmount: 880,
          maxAmount: 880,
          planAmount: 880,
        },
        nodes: [],
      },
    },
    enrichmentVersion: 2,
  }
  const next = applySnapshotLayerToPublicCase(row, { title: '旧标题', amount: 100 })
  assert.equal(next.snapshotVersion, 3)
  assert.equal(next.enrichmentVersion, 2)
  assert.equal(next.contentSource, 'snapshot')
  assert.equal(next.title, '快照标题')
  assert.equal(next.amount, 880)
})

test('buildCasePublicLayerMeta marks legacy when no snapshot', () => {
  const meta = buildCasePublicLayerMeta({ contentJson: { nodes: [] } })
  assert.equal(meta.snapshotVersion, 0)
  assert.equal(meta.contentSource, 'legacy')
})
