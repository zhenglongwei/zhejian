const assert = require('assert')
const { assertCaseBotSchemaGraph } = require('./bot-schema-assert')

function run() {
  const html = [
    '<html><head>',
    '<script type="application/ld+json">',
    JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': 'https://geo.example.com/#organization',
          name: '辙见',
        },
        {
          '@type': 'Article',
          '@id': 'https://geo.example.com/case/demo#article',
          headline: '测试案例',
          publisher: { '@id': 'https://geo.example.com/#organization' },
        },
      ],
    }),
    '</script>',
    '<script type="application/ld+json">',
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      step: [{ '@type': 'HowToStep', position: 1, name: '步骤1', text: '说明' }],
    }),
    '</script>',
    '</head><body><div data-prerender="geo-cite-e">摘要前缀测试内容</div></body></html>',
  ].join('\n')

  const result = assertCaseBotSchemaGraph(html, {
    requireSummaryInHtml: true,
    summarySnippet: '摘要前缀测试内容',
  })
  assert.strictEqual(result.graphBlock['@graph'].length, 2)
  console.log('[bot-schema-assert.test] ok')
}

run()
