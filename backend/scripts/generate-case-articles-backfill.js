/**
 * DS-B-02/03/04 · 存量 public_approved 案例补生成文章 + 发布态
 *
 * 用法：
 *   node scripts/generate-case-articles-backfill.js
 *   node scripts/generate-case-articles-backfill.js --force
 *   node scripts/generate-case-articles-backfill.js --case-id=case_xxx
 */
require('dotenv').config()
const { prisma } = require('../src/lib/prisma')
const { PUBLIC_CASE_STATUS } = require('../src/constants/v2')
const { generateAndSaveCaseArticle } = require('../src/services/case-article-generator.service')

function parseArg(name) {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length).trim() : ''
}

const FORCE = process.argv.includes('--force')
const CASE_ID = parseArg('case-id') || parseArg('caseId') || ''

async function main() {
  const where = { status: PUBLIC_CASE_STATUS.PUBLIC_APPROVED }
  if (CASE_ID) where.id = CASE_ID

  const rows = await prisma.publicCase.findMany({
    where,
    select: {
      id: true,
      articleBody: true,
      slug: true,
      articleStatus: true,
    },
    orderBy: { updatedAt: 'asc' },
  })

  if (!rows.length) {
    console.log('[generate-case-articles] no public_approved cases')
    return
  }

  let generated = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    const needs =
      FORCE ||
      !String(row.articleBody || '').trim() ||
      !String(row.slug || '').trim()
    if (!needs) {
      skipped += 1
      continue
    }
    try {
      const result = await generateAndSaveCaseArticle(row.id, {
        force: FORCE || !String(row.articleBody || '').trim(),
        persist: true,
      })
      if (result.generated) generated += 1
      else skipped += 1
      console.log(
        '[generate-case-articles]',
        row.id,
        result.generated ? 'generated' : 'skip',
        result.articleStatus || ''
      )
    } catch (e) {
      failed += 1
      console.error('[generate-case-articles]', row.id, 'failed', e.message)
    }
  }

  console.log(
    '[generate-case-articles] done',
    JSON.stringify({ total: rows.length, generated, skipped, failed })
  )
  if (failed > 0) process.exit(1)
}

main()
  .catch((e) => {
    console.error('[generate-case-articles] fatal', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
