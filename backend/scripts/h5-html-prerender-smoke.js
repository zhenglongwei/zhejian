/**
 * 关键页服务端 HTML 冒烟：无脚本可见真实标题 / 摘要 / FAQ / JSON-LD
 *
 *   node scripts/h5-html-prerender-smoke.js
 */
require('dotenv').config()
const { H5_SERVICE_ITEMS } = require('../src/constants/h5-service-items')
const { renderHomeHtml, renderServiceHtml, renderCityHtml } = require('../src/services/h5-page-prerender.service')

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function assertReadableHtml(html, label) {
  assert(html && html.includes('<title>'), `${label} 缺少 title`)
  assert(!html.includes('加载中… · 辙见'), `${label} 标题仍是加载中`)
  assert(html.includes('application/ld+json'), `${label} 缺少 JSON-LD`)
  assert(html.includes('data-prerender='), `${label} 缺少预渲染标记`)
}

async function main() {
  const home = await renderHomeHtml()
  assertReadableHtml(home, '首页')
  assert(home.includes('辙见案例站'), '首页应含站点名')

  const service = await renderServiceHtml('car-maintenance')
  assertReadableHtml(service, '服务页')
  assert(service.includes('常见问题') || service.includes('FAQPage'), '服务页应含 FAQ')
  const maint = H5_SERVICE_ITEMS.find((item) => item.slug === 'car-maintenance')
  assert(maint.faq.length >= 5, '小保养 FAQ 应 ≥5')

  const city = await renderCityHtml('hangzhou')
  assertReadableHtml(city, '城市页')
  assert(city.includes('杭州'), '城市页应含杭州')

  H5_SERVICE_ITEMS.forEach((item) => {
    assert(Array.isArray(item.faq) && item.faq.length >= 5, `${item.slug} FAQ 应 ≥5`)
  })

  console.log('[h5-html-prerender-smoke] ok', {
    homeBytes: home.length,
    serviceBytes: service.length,
    cityBytes: city.length,
  })
}

main().catch((error) => {
  console.error('[h5-html-prerender-smoke] failed', error.message)
  process.exit(1)
})
