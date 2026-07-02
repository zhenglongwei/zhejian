/**
 * 发版前声明冲突扫描（仅文件顶层）：
 * - 重复 const require 绑定
 * - 重复 function 声明
 * - const 与 function 同名
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', 'src')
const failures = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
      continue
    }
    if (!entry.name.endsWith('.js')) continue
    scanFile(full)
  }
}

function scanFile(filePath) {
  const rel = path.relative(path.join(__dirname, '..'), filePath)
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  const constBindings = new Map()
  const funcDecls = new Map()
  let depth = 0

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    const atTopLevel = depth === 0

    if (atTopLevel && trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('*')) {
      const constMatch = trimmed.match(/^const\s+\{([^}]+)\}\s*=\s*require\(/)
      if (constMatch) {
        constMatch[1].split(',').forEach((part) => {
          const name = part.split(':')[0].trim().split('=')[0].trim()
          if (!name) return
          if (constBindings.has(name)) {
            failures.push(`${rel}:${index + 1} duplicate const "${name}" (first at ${constBindings.get(name)})`)
          } else {
            constBindings.set(name, index + 1)
          }
        })
      }

      const funcMatch = trimmed.match(/^function\s+([A-Za-z_$][\w$]*)\s*\(/)
      if (funcMatch) {
        const name = funcMatch[1]
        if (funcDecls.has(name)) {
          failures.push(`${rel}:${index + 1} duplicate function "${name}" (first at ${funcDecls.get(name)})`)
        } else {
          funcDecls.set(name, index + 1)
        }
      }
    }

    const open = (line.match(/\{/g) || []).length
    const close = (line.match(/\}/g) || []).length
    depth += open - close
    if (depth < 0) depth = 0
  })

  for (const name of constBindings.keys()) {
    if (funcDecls.has(name)) {
      failures.push(
        `${rel}: const "${name}" (line ${constBindings.get(name)}) conflicts with function (line ${funcDecls.get(name)})`
      )
    }
  }
}

walk(ROOT)

if (!failures.length) {
  console.log('[check-release-syntax] OK')
  process.exit(0)
}

console.error(`[check-release-syntax] FAIL: ${failures.length} issue(s)`)
failures.forEach((item) => console.error(item))
process.exit(1)
