/**
 *  diagnose-bing.js — 必应为什么间歇性 selector_broken
 *
 *  现象：同一轮巡检里，必应前 3~4 个查询正常，后面突然全部 selector_broken。
 *  猜测两类原因，这个脚本一次把它们分开：
 *    A. 风控 / 频控：必应在连续查询后换了一种页面（验证页、被重定向到 cn.bing.com 首页）
 *    B. 布局变化：页面正常，但结果节点不再是 li.b_algo（比如返回了「没有结果」的变体页）
 *
 *  用法：node scripts/diagnose-bing.js [店名]
 */
const path = require('path')
const { launchPersistentContext } = require('../src/services/geo-browser-probe/session')
const { resolvePlatforms } = require('../src/services/geo-browser-probe/platforms')
const { shortNameOf, renderTemplate } = require('../src/services/geo-browser-probe/questions')
const { sleep, cleanText } = require('../src/services/geo-browser-probe/driver')

const NAME = process.argv[2] || '杭州德艺行汽车服务有限公司'
const CITY = '杭州'

function buildQueries(name, city) {
  const shortName = shortNameOf(name, city)
  const templates = [
    '{name}',
    '{name} 怎么样',
    '{shortName} 地址 电话 营业时间',
    '{shortName} 修车贵不贵 价格',
    '{shortName} 口碑 评价 靠谱吗',
    '{shortName} 官网 案例',
  ]
  return templates.map((tpl) => renderTemplate(tpl, { city, name, shortName }))
}

async function inspect(page, platform) {
  const info = await page.evaluate((resultSelectors) => {
    const out = {}
    out.url = location.href
    out.title = document.title
    out.counts = {}
    for (const sel of resultSelectors) {
      out.counts[sel] = document.querySelectorAll(sel).length
    }
    // 页面上所有 li 的 class 前 20 种，用来判断是不是换了布局
    const classes = new Set()
    document.querySelectorAll('li').forEach((el) => {
      String(el.className || '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 1)
        .forEach((c) => classes.add(c))
    })
    out.liClasses = [...classes].slice(0, 20)
    out.bodyHead = (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 220)
    return out
  }, platform.resultSelectors)
  return info
}

async function main() {
  const playwright = require(process.env.PLAYWRIGHT_PATH || 'playwright-core')
  const platform = resolvePlatforms(['bing_web']).platforms[0]
  if (!platform) throw new Error('找不到 bing_web 平台配置')

  const { context } = await launchPersistentContext(playwright)
  const page = await context.newPage()
  const REPEAT = Number(process.argv[3] || 1)
  const queries = []
  for (let r = 0; r < REPEAT; r += 1) queries.push(...buildQueries(NAME, CITY))

  console.log(`店名：${NAME}`)
  console.log(`平台：${platform.label}  ${platform.url}`)
  console.log('')

  for (let i = 0; i < queries.length; i += 1) {
    const q = queries[i]
    const url = platform.url.replace('{q}', encodeURIComponent(q))
    console.log(`\n[${i + 1}/${queries.length}] ${q}`)
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(3500)
      const info = await inspect(page, platform)
      const hit = Object.entries(info.counts).filter(([, n]) => n > 0)
      console.log(`  落地 URL : ${info.url.slice(0, 110)}`)
      console.log(`  页面标题 : ${info.title.slice(0, 80)}`)
      console.log(`  结果节点 : ${hit.length ? hit.map(([s, n]) => `${s}=${n}`).join(', ') : '一个都没命中'}`)
      if (!hit.length) {
        console.log(`  li class : ${info.liClasses.join(' | ') || '(无)'}`)
        console.log(`  正文开头 : ${info.bodyHead}`)
      }
    } catch (err) {
      console.log(`  异常：${err.message}`)
    }
    await sleep(Number(platform.minIntervalMs || 4000))
  }

  await context.close()
  console.log('\n诊断结束')
}

main().catch((err) => {
  console.error('诊断失败：', err)
  process.exit(1)
})
