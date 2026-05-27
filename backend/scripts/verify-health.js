#!/usr/bin/env node
/**
 * B-INF-04 · 部署健康检查
 * 用法：
 *   node scripts/verify-health.js
 *   node scripts/verify-health.js https://geo.simplewin.cn
 *   npm run deploy:verify -- https://geo.simplewin.cn
 */
const base = (process.argv[2] || process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:3000').replace(
  /\/$/,
  ''
)
const url = `${base}/api/v1/health`

async function main() {
  console.log(`GET ${url}`)
  let res
  let text
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
    text = await res.text()
  } catch (err) {
    console.error('FAIL: 无法连接', err.message)
    process.exit(1)
  }

  let body
  try {
    body = JSON.parse(text)
  } catch (e) {
    console.error('FAIL: 响应不是 JSON（可能 Nginx 未反代 /api/ 到 Node）')
    console.error('HTTP', res.status, text.slice(0, 200))
    process.exit(1)
  }

  const data = body.data || body
  const ok = res.ok && data.ok === true && data.db === 'up'
  console.log(JSON.stringify(body, null, 2))

  if (!ok) {
    console.error('FAIL: health 未通过（检查 API 进程与 DATABASE_URL）')
    process.exit(1)
  }
  console.log('OK: zhejian-api health + db up')
}

main()
