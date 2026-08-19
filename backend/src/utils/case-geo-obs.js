/**
 * PUB-GEO-OBS-01 · 识图 / 生成 / 机审轻量观测（日志）
 * 后续可接指标系统；本期先结构化 console，便于 grep / 日志平台。
 */
function emitCaseGeoObs(event, payload = {}) {
  try {
    const row = {
      ts: new Date().toISOString(),
      event: String(event || ''),
      ...payload,
    }
    console.info('[case-geo-obs]', JSON.stringify(row))
  } catch (_) {
    /* ignore */
  }
}

module.exports = {
  emitCaseGeoObs,
}
