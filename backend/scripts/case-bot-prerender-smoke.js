/**
 * GEO-CITE-E04 / GEO-IGAIN-C05 · Bot 预渲染冒烟
 */
require('dotenv').config()
const { prisma } = require('../src/lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../src/constants/v2')
const { CASE_ARTICLE_H5_PUBLISHED_STATUSES } = require('../src/constants/case-article-status')
const { renderCaseBotHtml } = require('../src/services/h5-case-prerender.service')
const { assertCaseBotSchemaGraph } = require('../src/lib/bot-schema-assert')

async function main() {
  const row = await prisma.publicCase.findFirst({
    where: {
      status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED,
      articleStatus: { in: CASE_ARTICLE_H5_PUBLISHED_STATUSES },
    },
    select: { id: true, aiSummary: true },
  })
  if (!row) {
    console.log('[case-bot-prerender-smoke] skip: no published case')
    return
  }

  const html = await renderCaseBotHtml(row.id)
  if (!html.includes('data-prerender="geo-cite-e"')) {
    throw new Error('missing bot prerender marker')
  }

  const summary = String(row.aiSummary || '').trim()
  const schema = assertCaseBotSchemaGraph(html, {
    requireSummaryInHtml: Boolean(summary),
    summarySnippet: summary,
  })

  console.log('[case-bot-prerender-smoke] ok', {
    caseId: row.id,
    bytes: html.length,
    graphNodes: schema.nodes.length,
    howToSteps: schema.howToBlock.step.length,
  })
}

main()
  .catch((error) => {
    console.error('[case-bot-prerender-smoke] failed', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
