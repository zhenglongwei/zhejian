function snapshotJsonFingerprint(contentJson) {
  const { extractSnapshotFromContentJson } = require('../src/schemas/case-snapshot.schema')
  const snap = extractSnapshotFromContentJson(contentJson)
  return snap ? JSON.stringify(snap) : ''
}

function isLocalSmokeBase(url) {
  return /localhost|127\.0\.0\.1/i.test(String(url || ''))
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/**
 * CASE-ENR-06 · snapshot 不变时 enrichment 变更应反映于 Feed / 案例 API
 * @param {{ prisma: object, caseId: string, baseUrl?: string }} ctx
 */
async function verifyCaseEnrichmentFeedSegment(ctx) {
  const { prisma, caseId, baseUrl = '' } = ctx
  const { extractSnapshotFromContentJson } = require('../src/schemas/case-snapshot.schema')
  const { persistCaseEnrichmentForRow } = require('../src/services/case-enrichment.service')
  const { getCaseFeedJson } = require('../src/services/public-feed.service')
  const { getCaseDetail } = require('../src/services/content.service')

  const row = await prisma.publicCase.findUnique({ where: { id: caseId } })
  if (!row) {
    console.warn('[enr-smoke] skip: 案例不在本地 DB')
    return { skipped: true, reason: 'not_in_db' }
  }
  if (row.status !== 'public_approved') {
    console.warn('[enr-smoke] skip: 案例未 public_approved')
    return { skipped: true, reason: 'not_approved' }
  }

  const snapshotFp = snapshotJsonFingerprint(row.contentJson)
  if (!snapshotFp) {
    console.warn('[enr-smoke] skip: 案例无 snapshot')
    return { skipped: true, reason: 'no_snapshot' }
  }

  const beforeDetail = await getCaseDetail(caseId)
  const beforeFeed = await getCaseFeedJson(caseId).catch(() => null)
  if (!beforeFeed) {
    console.warn('[enr-smoke] Feed 404/noindex，仅验 API + snapshot 不变（演示店预期）')
  }

  const backup = {
    enrichmentJson: row.enrichmentJson,
    enrichmentVersion: row.enrichmentVersion,
    aiSummary: row.aiSummary,
    summary: row.summary,
    contentJson: row.contentJson,
  }

  const marker = `ENR_SMOKE_${Date.now()}`
  const testSummary = `${marker} 提炼层冒烟摘要，含样本统计语境与合规提示。`
  const testFaq = {
    q: `${marker} 参考价如何理解？`,
    a: `${marker} 页面价格为参考区间，实际费用以到店检测与方案确认为准。`,
  }

  try {
    await persistCaseEnrichmentForRow(
      row,
      {
        aiSummary: testSummary,
        faq: [testFaq],
      },
      { bumpVersion: true, syncContentJsonGeo: true }
    )

    const afterRow = await prisma.publicCase.findUnique({ where: { id: caseId } })
    assert(
      snapshotJsonFingerprint(afterRow.contentJson) === snapshotFp,
      'enrichment 写入后 snapshot 指纹变化'
    )
    assert(
      (afterRow.enrichmentVersion || 0) > (backup.enrichmentVersion || 0),
      'enrichmentVersion 应递增'
    )

    const afterFeed = beforeFeed ? await getCaseFeedJson(caseId).catch(() => null) : null
    if (afterFeed) {
      assert(afterFeed.aiSummary === testSummary, 'Feed aiSummary 未随 enrichment 更新')
      assert(
        (afterFeed.faq || []).some((item) => String(item.q || '').includes(marker)),
        'Feed faq 未含测试条目'
      )
    }

    const afterDetail = await getCaseDetail(caseId)
    assert(afterDetail.aiSummary === testSummary, '案例 API aiSummary 未更新')
    assert(
      JSON.stringify(afterDetail.nodes || []) === JSON.stringify(beforeDetail.nodes || []),
      '案例 API nodes 漂移（应仍读 snapshot）'
    )
    const beforeBody = String(beforeDetail.article?.body || beforeDetail.articleBody || '').trim()
    const afterBody = String(afterDetail.article?.body || afterDetail.articleBody || '').trim()
    assert(beforeBody === afterBody, '案例正文 article.body 漂移')

    if (isLocalSmokeBase(baseUrl) && afterDetail.slug && afterFeed) {
      const feedRes = await fetch(
        `${baseUrl}/api/v1/public/v1/cases/${encodeURIComponent(afterDetail.slug)}.json`
      )
      if (feedRes.ok) {
        const feedHttp = await feedRes.json()
        assert(feedHttp.aiSummary === testSummary, 'HTTP Feed 与 enrichment 不一致')
      } else {
        console.warn('[enr-smoke] HTTP Feed 跳过（noindex 或未收录）')
      }
    }

    return { skipped: false, caseId, marker }
  } finally {
    await prisma.publicCase.update({
      where: { id: caseId },
      data: {
        enrichmentJson: backup.enrichmentJson,
        enrichmentVersion: backup.enrichmentVersion,
        aiSummary: backup.aiSummary,
        summary: backup.summary,
        contentJson: backup.contentJson,
      },
    })
  }
}

module.exports = {
  verifyCaseEnrichmentFeedSegment,
  snapshotJsonFingerprint,
  isLocalSmokeBase,
}
