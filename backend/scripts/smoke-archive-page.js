/**
 * 官网微信转案例：首页正文下放直达码；/archive 是同款扫码落地页。
 * 用法：node backend/scripts/smoke-archive-page.js
 */
const fs = require('fs')
const path = require('path')
const assert = require('assert')

const HTML_PATH = path.join(__dirname, '..', '..', 'brand-web', 'archive.html')
const INDEX_PATH = path.join(__dirname, '..', '..', 'brand-web', 'index.html')
const ROUTE_PATH = path.join(__dirname, '..', 'src', 'routes', 'public-h5.js')

let passed = 0
function ok(name) {
  passed += 1
  console.log(`  ✓ ${name}`)
}

function main() {
  const html = fs.readFileSync(HTML_PATH, 'utf8')
  const indexHtml = fs.readFileSync(INDEX_PATH, 'utf8')
  assert(html.includes('miniprogram-code?entry=wechat-archive'), '/archive 必须放直达码')
  assert(!html.includes('js/archive.js'), '不再加载转换脚本')
  assert(!html.includes('btnGenerate'), '不再提供生成按钮')
  assert(!html.includes('真实性承诺'), '不要再写已取消的真实性承诺')
  assert(!html.includes('分期上线'), '不要写入口分期')
  assert(!html.includes('已迁入'), '不要写成空说明页')
  assert(!html.includes("location.replace('/#tools')"), '不要只跳回首页锚点')
  ok('/archive 是扫码落地页，不是空说明')

  const toolsBlock = indexHtml.slice(indexHtml.indexOf('微信转案例'))
  assert(
    toolsBlock.includes('miniprogram-code?entry=wechat-archive'),
    '首页微信转案例要放直达码',
  )
  assert(toolsBlock.includes('mp-entry--stack'), '码放在卡片正文下方')
  assert(toolsBlock.includes('href="/archive.html"'), '首页卡片可点进扫码页')
  assert(!indexHtml.includes('查看说明'), '首页不要用「查看说明」当入口')
  assert(!indexHtml.includes('官网本页只作说明'), '不要写官网只作说明')
  ok('官网首页微信转案例正文下放直达码并可点进 /archive')

  const routeSrc = fs.readFileSync(ROUTE_PATH, 'utf8')
  assert(
    routeSrc.includes('getMiniprogramCodePng(req.query.entry)'),
    '小程序码接口必须把 entry 传进生成函数',
  )
  ok('公开接口按入口生成微信转案例码')
  console.log(`\n公开页冒烟通过：${passed} 项`)
}

main()
