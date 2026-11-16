#!/usr/bin/env node
/**
 * 文档体检：node scripts/check-docs.js [--strict]
 *
 * 硬错误（默认失败）：
 * - 文档里的相对链接指向不存在的文件（含被移入 _归档 的旧路径）
 * - 状态头写「已废止」但文件不在 docs/_归档/ 下
 * - docs/changes/*.md 命名不是 YYYYMMDD-短标题.md
 *
 * 提醒（--strict 时才失败）：
 * - 文档缺少状态头（> 状态： / > 生效：）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = path.join(ROOT, 'docs')
const ARCHIVE = path.join(DOCS, '_归档')
const SKIP_DIRS = new Set(['_归档', '测试素材库', 'node_modules', '.git'])
const STRICT = process.argv.includes('--strict')

const errors = []
const warnings = []

function walk(dir, out = []) {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (_) {
    return out
  }
  entries.forEach((entry) => {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) return
      walk(path.join(dir, entry.name), out)
      return
    }
    if (/\.md$/i.test(entry.name)) out.push(path.join(dir, entry.name))
  })
  return out
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/')
}

/** 去掉代码块，避免把示例当链接 */
function stripFences(text) {
  const lines = text.split(/\r?\n/)
  let inFence = false
  return lines
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence
        return ''
      }
      return inFence ? '' : line
    })
    .join('\n')
}

function readDoc(file) {
  const buf = fs.readFileSync(file)
  const text = buf.toString('utf8')
  if (text.includes('\uFFFD')) {
    errors.push(`${rel(file)} → 非 UTF-8 编码（中文已损坏，AI 会读到乱码）`)
    return ''
  }
  return text
}

function checkLinks(file) {
  const text = stripFences(readDoc(file))
  if (!text) return
  const dir = path.dirname(file)
  const re = /!?\[[^\]]*\]\(([^)]+)\)/g
  let m = null
  while ((m = re.exec(text))) {
    let target = m[1].trim()
    if (target.startsWith('<')) {
      const end = target.indexOf('>')
      if (end > 0) target = target.slice(1, end)
    } else {
      target = target.replace(/\s+"[^"]*"\s*$/, '').trim()
    }
    if (!target || /^(https?:|mailto:|tel:|#|wx:|data:)/i.test(target)) continue
    target = target.split('#')[0].split('?')[0]
    if (!target) continue
    let decoded = target
    try {
      decoded = decodeURIComponent(target)
    } catch (_) {
      /* 保留原样 */
    }
    const abs = path.resolve(dir, decoded)
    if (!fs.existsSync(abs)) {
      errors.push(`${rel(file)} → 链接目标不存在：${target}`)
    } else if (abs.startsWith(ARCHIVE + path.sep)) {
      errors.push(`${rel(file)} → 引用归档文档：${target}（不得作为口径依据）`)
    }
  }
}

function checkStatus(file) {
  const text = readDoc(file)
  if (!text) return
  const head = text.split(/\r?\n/).slice(0, 25).join('\n')
  const status = (head.match(/^>\s*(?:\*\*)?状态(?:\*\*)?\s*[:：]\s*(.+)$/m) || [])[1] || ''
  const effective = /^>\s*(?:\*\*)?生效(?:\*\*)?\s*[:：]/m.test(head)
  if (!status) {
    warnings.push(`${rel(file)} → 缺少状态头（> 状态：生效 | 已废止）`)
    return
  }
  if (/已废止/.test(status) && !file.startsWith(ARCHIVE + path.sep)) {
    errors.push(`${rel(file)} → 状态已废止但未移入 docs/_归档/`)
  }
  if (!effective) {
    warnings.push(`${rel(file)} → 有状态但缺「> 生效：YYYY-MM-DD」`)
  }
}

function checkChangeNaming(files) {
  files
    .filter((f) => path.dirname(f) === path.join(DOCS, 'changes'))
    .forEach((f) => {
      const name = path.basename(f)
      if (!/^\d{8}-.+\.md$/.test(name)) {
        errors.push(`${rel(f)} → 变更单命名应为 YYYYMMDD-短标题.md`)
      }
    })
}

const files = walk(DOCS)
files.forEach((file) => {
  checkLinks(file)
  checkStatus(file)
})
checkChangeNaming(files)

const report = []
const uniqErrors = [...new Set(errors)]
const uniqWarnings = [...new Set(warnings)]
report.push(`扫描 ${files.length} 篇文档`)
if (uniqErrors.length) {
  report.push(`\n硬错误 ${uniqErrors.length}：`)
  uniqErrors.slice(0, 80).forEach((line) => report.push(`  ✗ ${line}`))
  if (uniqErrors.length > 80) report.push(`  … 另有 ${uniqErrors.length - 80} 条`)
}
if (uniqWarnings.length) {
  report.push(`\n提醒 ${uniqWarnings.length}：`)
  uniqWarnings.slice(0, 80).forEach((line) => report.push(`  ! ${line}`))
  if (uniqWarnings.length > 80) report.push(`  … 另有 ${uniqWarnings.length - 80} 条`)
}
if (!uniqErrors.length && !uniqWarnings.length) report.push('\n文档体检通过。')
console.log(report.join('\n'))

process.exit(uniqErrors.length || (STRICT && uniqWarnings.length) ? 1 : 0)
