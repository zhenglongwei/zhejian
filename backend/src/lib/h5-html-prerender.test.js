const assert = require('assert')
const { injectPrerenderHtml, resolveRobotsContent } = require('./h5-html-prerender')

const SHELL = `<!DOCTYPE html><html><head>
<meta name="description" content="x">
<meta name="robots" content="index,follow">
<title>加载中… · 辙见</title>
</head><body><div id="app">加载中…</div></body></html>`

function run() {
  const html = injectPrerenderHtml(SHELL, {
    title: '小保养 · 辙见',
    description: '小保养说明摘要',
    canonical: 'https://geo.simplewin.cn/service/car-maintenance.html',
    robots: 'index,follow',
    bodyHtml: '<h1>小保养</h1><section data-bot="faq"><h2>常见问题</h2><p>答</p></section>',
    prerenderAttr: 'service',
    jsonLdBlocks: [{ '@context': 'https://schema.org', '@type': 'FAQPage' }],
  })

  assert.ok(!html.includes('加载中… · 辙见'), 'title 不得停留在加载中')
  assert.ok(html.includes('<title>小保养 · 辙见</title>'))
  assert.ok(html.includes('小保养说明摘要'))
  assert.ok(html.includes('application/ld+json'))
  assert.ok(html.includes('常见问题'))
  assert.ok(html.includes('data-prerender="service"'))

  const robots = resolveRobotsContent('index,follow')
  assert.ok(robots.includes('index') || robots.includes('noindex'))

  console.log('[h5-html-prerender.test] ok')
}

run()
