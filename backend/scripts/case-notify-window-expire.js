/**
 * PUB-RIGHT · 到期将通知窗口内未阻止的案例写入快照并上线
 *
 * 建议 crontab（每 10 分钟）：
 *   */10 * * * * cd /path/to/backend && node scripts/case-notify-window-expire.js
 */
const { expireDueNotifyWindows } = require('../src/services/case-publish-window.service')

async function main() {
  const results = await expireDueNotifyWindows({ limit: 80 })
  const ok = results.filter((r) => r.ok).length
  const fail = results.length - ok
  console.log(`[case-notify-window] processed=${results.length} published=${ok} failed=${fail}`)
  results
    .filter((r) => !r.ok)
    .forEach((r) => console.warn('  fail', r.albumId, r.error))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
