/**
 * GEO-IGAIN-H08 · robots.txt 冒烟
 */
require('dotenv').config()
const { auditRobotsTxtFromService } = require('../src/services/geo-robots-audit.service')

function main() {
  const result = auditRobotsTxtFromService()
  if (!result.passed) {
    const parts = []
    if (result.missing.length) parts.push(`缺少 ${result.missing.join(', ')}`)
    if (result.blockedBots.length) parts.push(`误拦 ${result.blockedBots.join(', ')}`)
    throw new Error(parts.join('；'))
  }
  console.log('[geo-robots-audit-smoke] ok', result)
}

main()
