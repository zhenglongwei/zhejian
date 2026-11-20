const assert = require('assert')
const {
  injectPrerenderHtml,
  resolveRobotsContent,
  omitScriptsForCrawler,
} = require('./h5-html-prerender')

const SHELL = `<!DOCTYPE html><html><head>
<meta name="description" content="x">
<meta name="robots" content="index,follow">
<title>加载中… · 辙见</title>
</head><body><div id="app">加载中…</div></body></html>`

const SHELL_WITH_SCRIPTS = `<!DOCTYPE html><html><head>
<title>加载中… · 辙见</title>
<script type="application/ld+json">{"@type":"WebPage","note":"正文里出现 src= 也不算外链"}</script>
</head><body><div id="app">加载中…</div>
<script src="../shared/h5-ui.js"></script>
<script>window.__H5_BOOT__ = 1</script>
<script src="../shared/case-render.js"></script>
</body></html>`

function run() {
  const html = injectPrerenderHtml(SHELL, {
    title: '小保养 · 辙见',
    description: '小保养说明摘要',
    canonical: 'https://zhejian.simplewin.cn/topic/car-maintenance',
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

  const browserUa =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'
  assert.strictEqual(
    omitScriptsForCrawler(SHELL_WITH_SCRIPTS, browserUa),
    SHELL_WITH_SCRIPTS,
    '真人必须拿到完整外链脚本'
  )
  assert.strictEqual(omitScriptsForCrawler(SHELL_WITH_SCRIPTS, ''), SHELL_WITH_SCRIPTS, '无 UA 不动')

  const botHtml = omitScriptsForCrawler(
    SHELL_WITH_SCRIPTS,
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)'
  )
  assert.ok(!botHtml.includes('h5-ui.js') && !botHtml.includes('case-render.js'), '爬虫不得拿到外链脚本')
  assert.ok(!botHtml.includes('__H5_BOOT__'), '内联脚本也摘掉：源码里的字符串拼接就是假链接来源')
  assert.ok(botHtml.includes('正文里出现 src='), 'JSON-LD 文本里的 src= 不该被误伤')

  const botFull = omitScriptsForCrawler(
    injectPrerenderHtml(SHELL_WITH_SCRIPTS, {
      title: '事故修复 · 辙见',
      bodyHtml: '<h1>事故修复</h1>',
      jsonLdBlocks: [{ '@context': 'https://schema.org', '@type': 'Article' }],
    }),
    'Mozilla/5.0 (compatible; anthropic-ai/1.0; +https://www.anthropic.com/web)'
  )
  assert.ok(!botFull.includes('<script src='), '拼好 JSON-LD 后仍不能残留外链脚本')
  assert.ok(!botFull.includes('__H5_BOOT__'), '拼好 JSON-LD 后仍不能残留内联脚本')
  assert.ok(botFull.includes('application/ld+json'), 'JSON-LD 是爬虫正文，不能一起摘掉')
  assert.ok(botFull.includes('data-prerender="geo-html"'))

  console.log('[h5-html-prerender.test] ok')
}

run()
