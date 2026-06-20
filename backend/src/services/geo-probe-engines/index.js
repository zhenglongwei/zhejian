/**
 * GEO-OBS-D01 · 多引擎探测适配器入口
 */
const registry = require('./registry')
const probeEngine = require('./probe-engine')

module.exports = {
  ...registry,
  ...probeEngine,
}
