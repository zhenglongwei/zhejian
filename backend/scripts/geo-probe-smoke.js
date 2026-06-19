/**
 * 百炼千问 · GEO 探测单条冒烟（不写入 DB）
 *
 * 用法：
 *   GEO_PROBE_API_KEY=sk-xxx npm run geo:probe-smoke
 *   GEO_PROBE_MODEL=qwen-plus npm run geo:probe-smoke -- "杭州刹车片更换多少钱"
 */
require('dotenv').config()
const { chatCompletion, DEFAULT_API_URL } = require('../src/lib/dashscope-chat')

async function main() {
  const apiKey = process.env.GEO_PROBE_API_KEY || process.env.DASHSCOPE_API_KEY || ''
  const model = process.env.GEO_PROBE_MODEL || 'qwen-plus'
  const apiUrl = process.env.GEO_PROBE_API_URL || DEFAULT_API_URL
  const prompt = process.argv.slice(2).join(' ') || '杭州刹车片更换大概多少钱？'

  if (!apiKey) {
    console.error('[geo-probe-smoke] 请设置 GEO_PROBE_API_KEY 或 DASHSCOPE_API_KEY')
    process.exit(1)
  }

  console.log('[geo-probe-smoke]', { model, apiUrl, prompt })

  const result = await chatCompletion({
    apiUrl,
    apiKey,
    model,
    messages: [{ role: 'user', content: prompt }],
    enableThinking: process.env.GEO_PROBE_ENABLE_THINKING === 'true',
    timeoutMs: Number(process.env.GEO_PROBE_TIMEOUT_MS || 60000),
  })

  console.log('[geo-probe-smoke] answer:\n', result.text)
  if (result.reasoning) {
    console.log('[geo-probe-smoke] reasoning (truncated):\n', result.reasoning.slice(0, 200))
  }
}

main().catch((err) => {
  console.error('[geo-probe-smoke] failed:', err.message)
  process.exit(1)
})
