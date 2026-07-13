const assert = require('assert')
const { auditRobotsTxt, auditRobotsTxtFromService } = require('./geo-robots-audit.service')

function run() {
  const good = auditRobotsTxtFromService()
  assert.strictEqual(good.passed, true)

  const bad = auditRobotsTxt(
    ['User-agent: GPTBot', 'Disallow: /', '', 'Sitemap: https://example.com/sitemap.xml'].join('\n')
  )
  assert.strictEqual(bad.passed, false)
  assert.ok(bad.blockedBots.includes('GPTBot'))

  console.log('[geo-robots-audit.test] ok')
}

run()
