/** 打印指定平台结果节点的结构样本，用来校准选择器 */
const path = require('path')
const ROOT = path.resolve(__dirname, '..')
const { resolvePlatforms, buildSearchUrl } = require(path.join(ROOT, 'src/services/geo-browser-probe/platforms'))
const { launchPersistentContext } = require(path.join(ROOT, 'src/services/geo-browser-probe/session'))

async function main() {
  const keyword = process.argv[2] || '杭州中策汽修'
  const pid = process.argv[3] || 'so_web'
  const { platforms } = resolvePlatforms()
  const platform = platforms.find((p) => p.id === pid)
  const playwright = require('playwright-core')
  const { context } = await launchPersistentContext(playwright, { headless: false })
  const page = await context.newPage()
  await page.goto(buildSearchUrl(platform, keyword), { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2500)

  console.log('候选选择器命中数:')
  for (const sel of platform.resultSelectors) {
    const n = await page.locator(sel).count().catch(() => 0)
    console.log(`  ${sel} → ${n}`)
  }

  const info = await page.evaluate(() => {
    const out = []
    for (const sel of ['li.res-list-item', '.res-list li', '.result', '.res-list', '#main li', '.res-gap-r10']) {
      const nodes = [...document.querySelectorAll(sel)]
      out.push({
        sel,
        count: nodes.length,
        sample: nodes.slice(0, 3).map((n) => ({
          cls: String(n.className || '').slice(0, 70),
          tag: n.tagName,
          text: (n.innerText || '').replace(/\s+/g, ' ').slice(0, 90),
          h3: (n.querySelector('h3') ? (n.querySelector('h3').innerText || '').slice(0, 50) : null),
        })),
      })
    }
    return out
  })
  console.log(JSON.stringify(info, null, 2))
  await context.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
