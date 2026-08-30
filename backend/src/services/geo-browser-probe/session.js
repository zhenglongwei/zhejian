/**
 * GEO-OBS-C06 · 浏览器会话与登录态管理
 *
 * 登录态策略（老板拍板：手动登录一次 + 持久化）
 *   1. 用 launchPersistentContext 打开一个专用 profile 目录，cookie / localStorage 落盘。
 *   2. 首次使用跑 `npm run geo:probe:login`，非无头打开页面，人肉扫码登录一次，
 *      关掉浏览器即完成持久化。之后所有巡检复用这个 profile。
 *   3. 巡检时每个平台先探测登录态。命中登录墙 → 该平台整体标记 login_required 并跳过，
 *      绝不带着未登录状态继续提问（未登录抓到的东西不是用户看到的画面）。
 *   4. 登录态过期不做自动重登。自动重登意味着要存账号密码或接打码平台，
 *      成本和风险都远超收益。过期就停下来，等人重新跑一次登录脚本。
 *
 * 验证码策略
 *   1. 每个平台有限速（minIntervalMs）和单场次题量上限（maxQuestionsPerSession），
 *      目的是尽量不触发风控，而不是触发了再去破。
 *   2. 页面出现验证码特征 → 立即停掉这个平台本轮剩余问题，标记 captcha，
 *      并进入冷却。等下个批次再试。
 *   3. 不接任何打码平台、不尝试绕过验证码。
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

// sleep 本地定义，不要从 ./driver import——driver.js 也 require 本文件，
// 互相 require 构成循环依赖，本文件先加载时拿到的 sleep 是 undefined，
// 运行到 waitForHumanToPass 才炸出 "sleep is not defined"（2026-08-30 实测）。
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const DEFAULT_PROFILE_DIR_NAME = 'geo-probe-profile'

function backendRoot() {
  return path.resolve(__dirname, '../../..')
}

function resolveProfileDir() {
  const fromEnv = String(process.env.GEO_BROWSER_PROFILE_DIR || '').trim()
  return fromEnv || path.join(backendRoot(), 'data', DEFAULT_PROFILE_DIR_NAME)
}

function ensureProfileDir() {
  const dir = resolveProfileDir()
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function resolveDataDir() {
  const dir = path.join(backendRoot(), 'data', 'geo-probe-artifacts')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function candidateExecutables() {
  const list = []
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || ''
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    // Edge 优先：实测 geo-probe-profile 下的 Chrome 渲染不出豆包/元宝的
    // 聊天输入框（前端版本嗅探），同一 profile 换 Edge 全部正常（2026-08-30）。
    list.push(
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    )
  } else if (process.platform === 'darwin') {
    list.push(
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    )
  } else {
    list.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
    )
  }
  return list.filter(Boolean)
}

/**
 * 定位本机浏览器。playwright-core 不自带浏览器，必须指到本机 Chrome / Edge，
 * 这样不用下载一百多兆的 Chromium。
 */
function resolveExecutablePath() {
  const fromEnv = String(process.env.GEO_BROWSER_EXECUTABLE_PATH || '').trim()
  if (fromEnv) {
    if (!fs.existsSync(fromEnv)) {
      throw new Error(`GEO_BROWSER_EXECUTABLE_PATH 指向的浏览器不存在: ${fromEnv}`)
    }
    return { executablePath: fromEnv, source: 'env' }
  }

  const channel = String(process.env.GEO_BROWSER_CHANNEL || '').trim()
  if (channel) return { channel, source: 'env_channel' }

  for (const candidate of candidateExecutables()) {
    if (fs.existsSync(candidate)) {
      return { executablePath: candidate, source: 'auto' }
    }
  }

  throw new Error(
    '没找到本机浏览器。请设置 GEO_BROWSER_EXECUTABLE_PATH 指向 Chrome/Edge，或设置 GEO_BROWSER_CHANNEL=chrome',
  )
}

function launchOptions() {
  const { executablePath, channel, source } = resolveExecutablePath()
  const headlessEnv = String(process.env.GEO_BROWSER_HEADLESS || '').trim()
  // 默认无头。但带登录态的巡检建议关掉无头（无头更容易被风控）
  const headless = headlessEnv === 'true' ? true : headlessEnv === 'false' ? false : true
  return {
    headless,
    executablePath,
    channel,
    source,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-dev-shm-usage',
    ],
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    // 不写死 userAgent。2025 年为了隐藏 headless 伪装过 Chrome/131，
    // 结果 UA 过期后豆包/元宝的前端版本嗅探直接拒绝渲染输入框——
    // 伪装本身暴露了伪装。反爬要靠行为像人（限速、冷却、遇验证停手），
    // 真实浏览器报真实版本就好。
  }
}

async function launchPersistentContext(playwright, overrides = {}) {
  const options = { ...launchOptions(), ...overrides }
  const profileDir = ensureProfileDir()
  const { executablePath, channel, ...rest } = options
  const launchArgs = { ...rest }
  if (executablePath) launchArgs.executablePath = executablePath
  if (channel) launchArgs.channel = channel

  const context = await playwright.chromium.launchPersistentContext(profileDir, launchArgs)
  return { context, profileDir, browserSource: options.source }
}

function textOf(page) {
  return page.evaluate(() => document.body.innerText || '')
}

/**
 * 检测页面是否命中某组关键词。命中即认为触发了对应的墙。
 * 关键词取自平台配置，可外部覆盖。
 */
function matchIndicators(text, indicators) {
  const blob = String(text || '')
  if (!blob.trim()) return null
  for (const raw of indicators || []) {
    const keyword = String(raw || '').trim()
    if (keyword && blob.includes(keyword)) return keyword
  }
  return null
}

async function detectLoginWall(page, platform) {
  if (!platform.needsLogin) return null
  const text = await textOf(page).catch(() => '')
  return matchIndicators(text, platform.loginIndicators)
}

async function detectCaptcha(page, platform) {
  const text = await textOf(page).catch(() => '')
  const hit = matchIndicators(text, platform.captchaIndicators)
  if (hit) return hit
  // 部分风控是 iframe 弹层，正文里搜不到，再看 URL
  const url = String(page.url() || '')
  if (/captcha|wappass|security|verify/i.test(url)) return url
  return null
}

async function saveScreenshot(page, filename) {
  const dir = path.join(resolveDataDir(), 'screenshots')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, filename)
  await page.screenshot({ path: file, fullPage: false })
  return path.relative(backendRoot(), file).replace(/\\/g, '/')
}

function profileStatus() {
  const dir = resolveProfileDir()
  const exists = fs.existsSync(dir)
  let size = 0
  let files = 0
  if (exists) {
    try {
      const walk = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const full = path.join(current, entry.name)
          if (entry.isDirectory()) walk(full)
          else {
            files += 1
            try {
              size += fs.statSync(full).size
            } catch {
              /* ignore */
            }
          }
        }
      }
      walk(dir)
    } catch {
      /* ignore */
    }
  }
  // 新版 Chrome/Edge 的 cookie 库在 Default/Network/Cookies，旧版在 Default/Cookies
  const cookiesFile = [path.join(dir, 'Default', 'Network', 'Cookies'), path.join(dir, 'Default', 'Cookies')]
    .find((p) => fs.existsSync(p))
  return {
    dir,
    exists,
    fileCount: files,
    sizeKb: Math.round(size / 1024),
    hasCookieDb: Boolean(cookiesFile),
    homedir: os.homedir(),
  }
}

/**
 * 验证码/登录墙被检测到时，给老板一个明确的提示并暂停等人处理。
 * 老板 2026-08-30 定的铁律：「登录和验证由人处理，脚本只负责提示和等待」
 * ——不自动判死、不跳过、不打码平台。
 *
 * @param {Page} page
 * @param {object} platform
 * @param {'captcha'|'login_required'} kind
 * @param {string} detail 检测到的具体文案
 * @returns {Promise<boolean>} true=已解除，false=超时或无头模式（由调用方决定是否 abort）
 */
async function waitForHumanToPass(page, platform, kind, detail) {
  // 无头模式：人看不到屏幕，提示无意义——直接返回 false 让调用方判死
  const headlessEnv = String(process.env.GEO_BROWSER_HEADLESS || '').trim()
  const isHeadless = headlessEnv === 'true' || (headlessEnv !== 'false' && page.context()?.browser()?._isHeadless)
  if (isHeadless) return false
  if (page.isClosed?.()) return false

  const waitMs = Number(process.env.GEO_BROWSER_HUMAN_WAIT_MS || 5 * 60 * 1000)
  const label = kind === 'captcha' ? '🛑 验证码' : '🛑 登录墙'
  console.log(
    `\n${label} [${platform.label}] ${detail}\n` +
      `   请在浏览器窗口里手动处理（拖动滑块 / 扫码 / 输入手机号 / 完成验证），\n` +
      `   脚本每 3 秒检测一次，最长等 ${Math.round(waitMs / 60000)} 分钟。\n`,
  )
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    await sleep(3000)
    if (page.isClosed?.()) return false
    const captcha = await detectCaptcha(page, platform).catch(() => null)
    const wall = await detectLoginWall(page, platform).catch(() => null)
    if (!captcha && !wall) {
      console.log(`  ✓ [${platform.label}] 已解除，继续\n`)
      return true
    }
    const left = Math.round((deadline - Date.now()) / 1000)
    process.stdout.write(`  … 等待处理（剩余 ${left}s）\r`)
  }
  return false
}

module.exports = {
  ensureProfileDir,
  resolveProfileDir,
  resolveDataDir,
  resolveExecutablePath,
  launchOptions,
  launchPersistentContext,
  detectLoginWall,
  detectCaptcha,
  saveScreenshot,
  matchIndicators,
  profileStatus,
  waitForHumanToPass,
}
