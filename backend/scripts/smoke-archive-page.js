/**
 * 官网微信转案例：只在首页工具卡正文下放直达码，不单开 /archive。
 * 用法：node backend/scripts/smoke-archive-page.js
 */
const fs = require('fs')
const path = require('path')
const assert = require('assert')

const ARCHIVE_PATH = path.join(__dirname, '..', '..', 'brand-web', 'archive.html')
const INDEX_PATH = path.join(__dirname, '..', '..', 'brand-web', 'index.html')
const ROUTE_PATH = path.join(__dirname, '..', 'src', 'routes', 'public-h5.js')

let passed = 0
function ok(name) {
  passed += 1
  console.log(`  ✓ ${name}`)
}

function main() {
  assert(!fs.existsSync(ARCHIVE_PATH), '不要再保留 /archive 落地页')
  ok('已删除 archive.html')

  const indexHtml = fs.readFileSync(INDEX_PATH, 'utf8')
  const toolsBlock = indexHtml.slice(indexHtml.indexOf('微信转案例'))
  assert(
    toolsBlock.includes('miniprogram-code?entry=wechat-archive'),
    '首页微信转案例要放直达码',
  )
  assert(toolsBlock.includes('mp-entry--stack'), '码放在卡片正文下方')
  assert(!toolsBlock.includes('href="/archive.html"'), '首页不要链到 /archive')
  assert(!indexHtml.includes('打开小程序码'), '首页不要「打开小程序码」')
  assert(!indexHtml.includes('查看说明'), '首页不要用「查看说明」当入口')
  assert(!indexHtml.includes('官网本页只作说明'), '不要写官网只作说明')
  ok('官网首页微信转案例只放直达码，无跳转页')

  const routeSrc = fs.readFileSync(ROUTE_PATH, 'utf8')
  assert(
    routeSrc.includes('getMiniprogramCodePng(req.query.entry)'),
    '小程序码接口必须把 entry 传进生成函数',
  )
  ok('公开接口按入口生成微信转案例码')
  console.log(`\n公开页冒烟通过：${passed} 项`)
}

main()
