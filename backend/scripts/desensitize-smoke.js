#!/usr/bin/env node
/**
 * B-MASK-03 脱敏引擎冒烟：DESENSITIZE_ENGINE=dev 无需阿里云密钥
 * 用法：node scripts/desensitize-smoke.js [图片路径]
 */
require('dotenv').config()

const fs = require('fs')
const path = require('path')
const { processImage } = require('../src/services/desensitize-engine')

async function main() {
  const input = process.argv[2]
  if (!input) {
    console.error('用法: node scripts/desensitize-smoke.js <图片路径>')
    process.exit(1)
  }
  const sourcePath = path.resolve(input)
  if (!fs.existsSync(sourcePath)) {
    console.error('文件不存在:', sourcePath)
    process.exit(1)
  }

  const outDir = path.join(__dirname, '../data/media/uploads/desensitized/_smoke')
  fs.mkdirSync(outDir, { recursive: true })
  const destPath = path.join(outDir, `out_${Date.now()}${path.extname(sourcePath) || '.jpg'}`)

  const engine = process.env.DESENSITIZE_ENGINE || 'aliyun'
  console.log('[smoke] engine =', engine)
  console.log('[smoke] input  =', sourcePath)

  const result = await processImage(sourcePath, destPath)
  console.log('[smoke] result =', JSON.stringify(result, null, 2))
  console.log('[smoke] output =', destPath)
  console.log('[smoke] OK')
}

main().catch((e) => {
  console.error('[smoke] FAIL', e.message)
  process.exit(1)
})
