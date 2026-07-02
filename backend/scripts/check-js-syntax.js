/**
 * 发版前语法扫描：node --check 全部 src/ + scripts/（排除本脚本）
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const TARGETS = ['src', 'scripts']
const SKIP = new Set([path.normalize(__filename)])

const failures = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
      continue
    }
    if (!entry.name.endsWith('.js')) continue
    if (SKIP.has(path.normalize(full))) continue
    try {
      execSync(`node --check "${full}"`, { stdio: 'pipe' })
    } catch (err) {
      const msg = String(err.stderr || err.stdout || err.message)
      failures.push({ file: path.relative(ROOT, full), msg: msg.trim().split('\n').slice(0, 4).join('\n') })
    }
  }
}

for (const rel of TARGETS) {
  walk(path.join(ROOT, rel))
}

if (!failures.length) {
  console.log('[check-js-syntax] OK: all JS files pass node --check')
  process.exit(0)
}

console.error(`[check-js-syntax] FAIL: ${failures.length} file(s)`)
failures.forEach((item) => {
  console.error(`\n--- ${item.file} ---\n${item.msg}`)
})
process.exit(1)
