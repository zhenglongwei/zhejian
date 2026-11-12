/**
 * 发版前语法扫描：node --check 后端 src/scripts + 小程序端共享 JS（packageMerchant/utils/constants/services）
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const REPO_ROOT = path.join(ROOT, '..')
const TARGETS = [
  path.join(ROOT, 'src'),
  path.join(ROOT, 'scripts'),
  ...['packageMerchant', 'utils', 'constants', 'services'].map((dir) => path.join(REPO_ROOT, dir)),
]
const SKIP = new Set([path.normalize(__filename)])

const failures = []

function walk(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'miniprogram_npm', 'vendor'].includes(entry.name)) continue
      walk(full)
      continue
    }
    if (!entry.name.endsWith('.js')) continue
    if (SKIP.has(path.normalize(full))) continue
    try {
      execSync(`node --check "${full}"`, { stdio: 'pipe' })
    } catch (err) {
      const msg = String(err.stderr || err.stdout || err.message)
      failures.push({ file: path.relative(REPO_ROOT, full), msg: msg.trim().split('\n').slice(0, 4).join('\n') })
    }
  }
}

TARGETS.forEach(walk)

if (!failures.length) {
  console.log('[check-js-syntax] OK: all JS files pass node --check')
  process.exit(0)
}

console.error(`[check-js-syntax] FAIL: ${failures.length} file(s)`)
failures.forEach((item) => {
  console.error(`\n--- ${item.file} ---\n${item.msg}`)
})
process.exit(1)
