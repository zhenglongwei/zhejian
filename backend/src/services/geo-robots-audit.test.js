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

  const { getRobotsTxt } = require('./h5-sitemap.service')
  const staging = getRobotsTxt('https://staging.geo.simplewin.cn')
  assert.ok(staging.includes('Disallow: /'), 'staging robots 应禁止收录')
  assert.ok(!staging.includes('Sitemap:'), 'staging robots 不应声明 sitemap')
  assert.ok(!staging.includes('Allow: /'), 'staging robots 不应 Allow: /')

  const prod = getRobotsTxt('https://geo.simplewin.cn')
  if (!/staging\.geo\.simplewin\.cn/i.test(process.env.PUBLIC_BASE_URL || '')) {
    assert.ok(prod.includes('Sitemap:'), '正式站 robots 应声明 sitemap')
    assert.ok(prod.includes('Allow: /'), '正式站 robots 应允许公开页')
  }

  console.log('[geo-robots-audit.test] ok')
}

run()
