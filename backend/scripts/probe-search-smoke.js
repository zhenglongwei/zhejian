/**
 * 搜索抓取自测：只对 search 型平台跑一次真实查询，把抓到的行打印出来。
 * 用来验证三件事：
 *   1. 结果节点有没有被正确识别（不是把整个列表当成一条）
 *   2. 位次有没有保留
 *   3. 真实域名有没有解析出来（不能全是 baidu.com / so.com 的跳转链接）
 *
 * 用法：node scripts/probe-search-smoke.js [关键词]
 */
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const { resolvePlatforms, buildSearchUrl } = require(path.join(ROOT, 'src/services/geo-browser-probe/platforms'))
const { extractSearchRows } = require(path.join(ROOT, 'src/services/geo-browser-probe/driver'))
const { launchPersistentContext } = require(path.join(ROOT, 'src/services/geo-browser-probe/session'))

async function main() {
  const keyword = process.argv[2] || '杭州德艺行汽车服务有限公司'
  const only = process.argv[3] || ''
  const { platforms } = resolvePlatforms()
  const targets = platforms.filter((p) => p.type === 'search' && p.enabled !== false && (!only || p.id === only))

  let playwright
  try {
    playwright = require('playwright-core')
  } catch (e) {
    console.error('playwright-core 未安装:', e.message)
    process.exit(1)
  }

  const launched = await launchPersistentContext(playwright, { headless: false })
  const context = launched.context
  console.log(`浏览器来源: ${launched.browserSource}`)

  for (const platform of targets) {
    const page = await context.newPage()
    page.setDefaultTimeout(30000)
    const url = buildSearchUrl(platform, keyword)
    console.log(`\n${'='.repeat(70)}\n[${platform.id}] ${platform.label}\n${url}`)
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(1500)

      let rows = []
      let usedSelector = ''
      for (const selector of platform.resultSelectors) {
        const count = await page.locator(selector).count().catch(() => 0)
        if (!count) continue
        rows = await extractSearchRows(page, platform, selector, 20)
        if (rows.length) {
          usedSelector = selector
          break
        }
      }
      console.log(`命中选择器: ${usedSelector || '(无)'}  抓到 ${rows.length} 条`)
      rows.slice(0, 8).forEach((row) => {
        const t = (row.title || '').slice(0, 42)
        const s = (row.snippet || '').replace(/\s+/g, ' ').slice(0, 60)
        const src = row.domain || row.source || '无来源'
        console.log(`  #${String(row.rank).padStart(2)} [${src}] ${t}`)
        if (s) console.log(`      ${s}`)
      })
      const withDomain = rows.filter((r) => r.domain).length
      const withSource = rows.filter((r) => r.domain || r.source).length
      console.log(`  → 有真实域名 ${withDomain}/${rows.length}，有来源标识 ${withSource}/${rows.length}`)
    } catch (error) {
      console.log(`  失败: ${error.message}`)
    }
    await page.close().catch(() => {})
  }

  await context.close().catch(() => {})
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
