const { runBrowserProbe, ensureTarget } = require('./runner')
const {
  resolvePlatforms,
  loadPlatformConfig,
  getPlatform,
  resolveConfigFile,
} = require('./platforms')
const {
  resolveExecutablePath,
  resolveProfileDir,
  profileStatus,
  launchOptions,
} = require('./session')

/**
 * 环境自检。官网体检页会先打这个接口，决定要不要把「网页版实测」入口露出来。
 * 浏览器不可用时必须优雅降级：接口联网通道照常，不能整个体检挂掉。
 */
function browserProbeStatus() {
  const result = {
    installed: false,
    browser: null,
    browserSource: '',
    profile: profileStatus(),
    platforms: [],
    configFile: '',
    configSource: '',
    ready: false,
    reason: '',
  }

  try {
    require.resolve('playwright-core')
    result.installed = true
  } catch {
    result.reason = 'playwright-core 未安装'
    return result
  }

  try {
    const resolved = resolveExecutablePath()
    result.browser = resolved.executablePath || resolved.channel
    result.browserSource = resolved.source
  } catch (error) {
    result.reason = error.message
    return result
  }

  try {
    const { platforms, source, file } = resolvePlatforms()
    result.platforms = platforms.map((item) => ({
      id: item.id,
      label: item.label,
      type: item.type,
      ecosystem: item.ecosystem,
      needsLogin: Boolean(item.needsLogin),
      enabled: item.enabled !== false,
    }))
    result.configSource = source
    result.configFile = file
  } catch (error) {
    result.reason = `平台配置加载失败：${error.message}`
    return result
  }

  result.ready = true
  return result
}

module.exports = {
  runBrowserProbe,
  ensureTarget,
  browserProbeStatus,
  resolvePlatforms,
  loadPlatformConfig,
  getPlatform,
  resolveConfigFile,
  resolveExecutablePath,
  resolveProfileDir,
  launchOptions,
  profileStatus,
}
