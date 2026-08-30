/**
 *  diagnose-page.js — 体检页 / 榜单页的渲染冒烟
 *
 *  后端接口对了不代表页面对。这个脚本做最小验证：起一个静态服务，
 *  用巡检同款浏览器打开页面，等表格渲染出来，检查关键字段有没有真的落在 DOM 上。
 *
 *  注意：巡检在跑的时候不要执行——它和巡检共用同一个 Chrome profile，
 *  两个进程同时开同一个持久化目录会互相打架。
 *
 *  用法：node scripts/diagnose-page.js [rank|check] [--api http://127.0.0.1:3210/api/v1/public]
 *        默认 rank，默认打本机 :3000 上已经在跑的后端。
 *        后端改完但还没重启时，用 --api 指到一个临时实例，照样能验。
 */
const path = require('path')
const http = require('http')
const fs = require('fs')

const argv = process.argv.slice(2)
const positional = argv.filter((item) => !item.startsWith('--'))
const apiFlagIndex = argv.indexOf('--api')
const API_BASE = apiFlagIndex >= 0 ? argv[apiFlagIndex + 1] : ''
const BRAND_WEB = path.resolve(__dirname, '../../brand-web')
// 用 0 让系统分配空闲端口：本机可能已经跑着 Vite 之类的开发服务器，写死端口会撞
const PAGE = positional[0] === 'check' ? 'check.html' : 'rank.html'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0])
    const file = rel === '/' ? path.join(BRAND_WEB, PAGE) : path.join(BRAND_WEB, rel)
    if (!file.startsWith(BRAND_WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

async function main() {
  const server = await serve()
  const PORT = server.address().port
  const query = API_BASE ? `?api=${encodeURIComponent(API_BASE)}` : ''
  const url = `http://127.0.0.1:${PORT}/${PAGE}${query}`
  console.log(`静态服务已起：${url}${API_BASE ? `\n接口指向：${API_BASE}` : ''}`)

  const playwright = require(process.env.PLAYWRIGHT_PATH || 'playwright-core')
  const { launchPersistentContext } = require('../src/services/geo-browser-probe/session')
  const { context } = await launchPersistentContext(playwright)
  const page = await context.newPage()

  const errors = []
  const missing = []
  page.on('pageerror', (err) => errors.push(String(err.message)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
  })
  page.on('response', (res) => {
    if (res.status() >= 400) missing.push(`${res.status()} ${res.url()}`)
  })

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)

  if (PAGE === 'rank.html') {
    const stats = await page.locator('#stats').innerText().catch(() => '')
    const tableRows = await page.locator('#rank-box table.rank tbody tr').count()
    const firstRow = tableRows
      ? await page.locator('#rank-box table.rank tbody tr').first().innerText()
      : ''
    const contrast = await page.locator('#contrast').innerText().catch(() => '')
    console.log('\n--- 统计条 ---\n' + stats)
    console.log('\n--- 三分数对照 ---\n' + contrast)
    console.log(`\n--- 表格行数：${tableRows} ---`)
    console.log('首行：\n' + firstRow.replace(/\n+/g, ' | '))
    if (!tableRows) console.log('\n⚠ 表格没渲染出来，检查接口或 JS 报错')
  } else {
    const body = await page.locator('body').innerText()
    console.log('\n--- 页面文本前 600 字 ---\n' + body.slice(0, 600))
  }

  if (missing.length) {
    console.log('\n--- 加载失败的资源（favicon 之类的可忽略）---')
    ;[...new Set(missing)].slice(0, 10).forEach((item) => console.log('  ' + item))
  }
  if (errors.length) {
    console.log('\n--- JS 报错 ---')
    errors.slice(0, 10).forEach((item) => console.log('  ' + item))
  } else {
    console.log('\n无 JS 报错')
  }

  await context.close()
  server.close()
}

main().catch((err) => {
  console.error('渲染诊断失败：', err.message)
  process.exit(1)
})
