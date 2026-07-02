/**
 * GEO-CITE-E04 · Bot 预渲染冒烟
 */
require('dotenv').config()
const { prisma } = require('../src/lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../src/constants/v2')
const { CASE_ARTICLE_H5_PUBLISHED_STATUSES } = require('../src/constants/case-article-status')
const { renderCaseBotHtml } = require('../src/services/h5-case-prerender.service')

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
  if (summary && !html.includes(summary.slice(0, 20))) {
    throw new Error('aiSummary not in prerender html')
  }
  if (!html.includes('application/ld+json')) {
    throw new Error('missing JSON-LD')
  }
  if (!html.includes('"@graph"') && !html.includes('#organization')) {
    throw new Error('missing schema @graph or organization @id')
  }
  if (!html.includes('HowTo')) {
    throw new Error('missing HowTo schema')
  }

  console.log('[case-bot-prerender-smoke] ok', { caseId: row.id, bytes: html.length })
}

main()
  .catch((error) => {
    console.error('[case-bot-prerender-smoke] failed', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
