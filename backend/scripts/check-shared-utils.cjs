/**
 * 共享层同步校验：根目录 utils/constants 与 backend/vendor/shared 必须一致
 * 防止「改了小程序端共享逻辑，忘了 npm run sync:shared-utils」导致前后端口径不一致
 * 运行：cd backend && npm run check:shared-utils
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const BACKEND_ROOT = path.join(__dirname, '..')
const REPO_ROOT = path.join(BACKEND_ROOT, '..')
const VENDOR_ROOT = path.join(BACKEND_ROOT, 'vendor/shared')

/** 与 sync-shared-utils.cjs 的 FILES 保持一致（该脚本为主源） */
function readSyncedFiles() {
  const syncScript = path.join(__dirname, 'sync-shared-utils.cjs')
  const source = fs.readFileSync(syncScript, 'utf8')
  const start = source.indexOf('const FILES = [')
  const end = source.indexOf(']', start)
  if (start < 0 || end < 0) throw new Error('无法从 sync-shared-utils.cjs 解析 FILES')
  return source
    .slice(start, end)
    .split('\n')
    .map((line) => (line.match(/'([^']+)'/) || [])[1])
    .filter(Boolean)
}

/** 与 sync 脚本一致的源内容变换（desensitize-url 的 config 指向后端 stub） */
function sourceContent(rel, absPath) {
  const content = fs.readFileSync(absPath, 'utf8')
  if (rel === 'utils/desensitize-url.js') {
    return content.replace("require('../services/config')", "require('../services/config-stub')")
  }
  return content
}

function hashOf(content) {
  return crypto.createHash('sha1').update(content).digest('hex')
}

const files = readSyncedFiles()
const drift = []

files.forEach((rel) => {
  const src = path.join(REPO_ROOT, rel)
  const dest = path.join(VENDOR_ROOT, rel)
  if (!fs.existsSync(src)) {
    drift.push(`${rel}: 源文件缺失（${src}）`)
    return
  }
  if (!fs.existsSync(dest)) {
    drift.push(`${rel}: vendor 缺失（先跑 npm run sync:shared-utils）`)
    return
  }
  if (hashOf(sourceContent(rel, src)) !== hashOf(fs.readFileSync(dest, 'utf8'))) {
    drift.push(`${rel}: 与 vendor 副本不一致（先跑 npm run sync:shared-utils）`)
  }
})

if (!drift.length) {
  console.log(`[check-shared-utils] OK: ${files.length} 个共享文件已同步`)
  process.exit(0)
}

console.error(`[check-shared-utils] FAIL: ${drift.length} 个共享文件未同步`)
drift.forEach((item) => console.error(`- ${item}`))
process.exit(1)
