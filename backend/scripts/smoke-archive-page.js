/**
 * 官网 archive.html 已改为导流页（转换能力在小程序）。
 * 用法：node backend/scripts/smoke-archive-page.js
 */
const fs = require('fs')
const path = require('path')
const assert = require('assert')

const HTML_PATH = path.join(__dirname, '..', '..', 'brand-web', 'archive.html')

let passed = 0
function ok(name) {
  passed += 1
  console.log(`  ✓ ${name}`)
}

function main() {
  const html = fs.readFileSync(HTML_PATH, 'utf8')
  assert(html.includes('迁入辙见小程序'), '导流页要说明能力已进小程序')
  assert(!html.includes('js/archive.js'), '导流页不再加载转换脚本')
  assert(!html.includes('btnGenerate'), '导流页不再提供生成按钮')
  assert(!html.includes('真实性承诺'), '不要再写已取消的真实性承诺')
  ok('官网 archive 只导流，不再当转换器')
  console.log(`\n公开页冒烟通过：${passed} 项`)
}

main()
