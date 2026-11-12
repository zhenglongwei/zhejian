/**
 * 全仓 JS 静态检查（防「一处改名、另一处没同步」的运行时 ReferenceError）
 * 覆盖：小程序端（packageMerchant/utils/constants/services）+ 后端 src
 * 规则：未定义标识符、重复键、重复声明、不可达代码、给常量赋值等
 * 运行：cd backend && npm run check:lint
 */
const path = require('path')
const { ESLint } = require('eslint')

const BACKEND_ROOT = path.join(__dirname, '..')
const REPO_ROOT = path.join(BACKEND_ROOT, '..')

const COMMON_GLOBALS = {
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  clearImmediate: 'readonly',
  queueMicrotask: 'readonly',
  Promise: 'readonly',
  Buffer: 'readonly',
  process: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  global: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  fetch: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  structuredClone: 'readonly',
  WeakRef: 'readonly',
}

/** page.evaluate 里执行的浏览器上下文代码 */
const BROWSER_GLOBALS = {
  ...COMMON_GLOBALS,
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  HTMLElement: 'readonly',
  MutationObserver: 'readonly',
  XMLHttpRequest: 'readonly',
  Image: 'readonly',
}

/** 微信小程序运行时全局 */
const MINI_PROGRAM_GLOBALS = {
  ...COMMON_GLOBALS,
  wx: 'readonly',
  Page: 'readonly',
  Component: 'readonly',
  Behavior: 'readonly',
  App: 'readonly',
  getApp: 'readonly',
  getCurrentPages: 'readonly',
  requirePlugin: 'readonly',
  __wxConfig: 'readonly',
  __webview_engine_version__: 'readonly',
  WeixinJSBridge: 'readonly',
}

const RULES = {
  'no-undef': 'error',
  'no-redeclare': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-dupe-class-members': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'warn',
  'no-const-assign': 'error',
  'no-func-assign': 'error',
  'no-self-assign': 'error',
  'no-unsafe-negation': 'error',
  'no-cond-assign': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  // 代码里存在该插件规则的 eslint-disable 注释，但本仓库未装该插件；登记为 off 避免“规则不存在”报错
  'import/no-extraneous-dependencies': 'off',
}

function group(files, globals) {
  return {
    files,
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals },
    rules: RULES,
  }
}

async function main() {
  const eslint = new ESLint({
    cwd: REPO_ROOT,
    overrideConfigFile: true,
    overrideConfig: [
      // 本检查只看未定义标识符等硬错误，忽略业务代码里的 eslint-disable 注释（含未安装插件的规则名）
      { linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' } },
      group(['packageMerchant/**/*.js', 'utils/**/*.js', 'constants/**/*.js', 'services/**/*.js'], MINI_PROGRAM_GLOBALS),
      group(['backend/src/**/*.js'], COMMON_GLOBALS),
      group(['backend/src/services/geo-browser-probe/**/*.js'], BROWSER_GLOBALS),
      { ignores: ['**/node_modules/**', '**/miniprogram_npm/**', 'backend/vendor/**'] },
    ],
  })
  const results = await eslint.lintFiles([
    'packageMerchant/**/*.js',
    'utils/**/*.js',
    'constants/**/*.js',
    'services/**/*.js',
    'backend/src/**/*.js',
  ])
  let errorCount = 0
  let warnCount = 0
  results.forEach((result) => {
    if (!result.messages.length) return
    const rel = path.relative(REPO_ROOT, result.filePath)
    result.messages.forEach((msg) => {
      // noInlineConfig 会让已有的 eslint-disable 注释提示"无效"，与代码正确性无关，忽略
      if (String(msg.message).includes('has no effect because you have')) return
      if (msg.severity === 1) {
        warnCount += 1
        console.warn(`${rel}:${msg.line}:${msg.column}  [warn] ${msg.message}  (${msg.ruleId})`)
        return
      }
      if (msg.severity !== 2) return
      errorCount += 1
      console.error(`${rel}:${msg.line}:${msg.column}  ${msg.message}  (${msg.ruleId})`)
    })
  })
  if (errorCount) {
    console.error(`\n[check-lint] FAIL: ${errorCount} error(s), ${warnCount} warning(s)`)
    process.exit(1)
  }
  console.log(`[check-lint] OK${warnCount ? ` (${warnCount} warning(s))` : ''}`)
}

main().catch((err) => {
  console.error('[check-lint] crashed:', err)
  process.exit(1)
})
