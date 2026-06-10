/**
 * DS-C-08 · 生成 H5 静态 sitemap / robots（可选落盘，生产以 API 动态输出为准）
 *
 * 用法：
 *   npm run h5:sitemap
 *   PUBLIC_BASE_URL=https://geo.simplewin.cn npm run h5:sitemap
 */
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const {
  getSitemapIndexXml,
  getSitemapXmlByType,
  getRobotsTxt,
  getSitemapStats,
} = require('../src/services/h5-sitemap.service')

const H5_ROOT = path.join(__dirname, '..', '..', 'h5')

async function writeFile(relPath, body) {
  const fullPath = path.join(H5_ROOT, relPath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, body, 'utf8')
  console.log('[sitemap] wrote', relPath)
}

async function main() {
  const [indexXml, pagesXml, casesXml, storesXml, stats] = await Promise.all([
    getSitemapIndexXml(),
    getSitemapXmlByType('pages'),
    getSitemapXmlByType('cases'),
    getSitemapXmlByType('stores'),
    getSitemapStats(),
  ])

  await writeFile('sitemap.xml', indexXml)
  await writeFile('sitemap-pages.xml', pagesXml)
  await writeFile('sitemap-cases.xml', casesXml)
  await writeFile('sitemap-stores.xml', storesXml)
  await writeFile('robots.txt', getRobotsTxt())

  console.log(
    '[sitemap] stats pages=%d cases=%d stores=%d total=%d',
    stats.pages,
    stats.cases,
    stats.stores,
    stats.total
  )
}

main().catch((err) => {
  console.error('[sitemap] failed:', err.message || err)
  process.exit(1)
})
