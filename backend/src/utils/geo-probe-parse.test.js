const assert = require('assert')
const { parseProbeAnswer } = require('./geo-probe-parse')

function run() {
  const parsed = parseProbeAnswer(
    '建议参考辙见案例 https://geo.simplewin.cn/service/brake-pad-replacement.html ，也可看 https://dianping.com/xxx'
  )
  assert.strictEqual(parsed.mentioned, true)
  assert.ok(parsed.citedUrl.includes('geo.simplewin.cn'))
  assert.ok(parsed.externalDomains.includes('dianping.com'))

  const noMention = parseProbeAnswer('一般需到店检测确认。')
  assert.strictEqual(noMention.mentioned, false)
  assert.strictEqual(noMention.citedUrl, '')

  console.log('[geo-probe-parse.test] ok')
}

run()
