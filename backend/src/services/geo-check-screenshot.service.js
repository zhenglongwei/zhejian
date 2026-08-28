const { config } = require('../config')
const { chatCompletion } = require('../lib/dashscope-chat')
const { textMentionsName } = require('../utils/geo-check-classify')

function extractJsonObject(text) {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : raw
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    return null
  }
}

async function analyzeScreenshots(options) {
  const { companyName, city, images } = options
  const list = Array.isArray(images) ? images.filter(Boolean).slice(0, config.geoCheck.maxScreenshots) : []
  if (!list.length) {
    return { status: 'skipped', reason: 'no_screenshots', items: [] }
  }
  const apiKey = config.geoCheck.visionApiKey
  if (!apiKey) {
    return { status: 'unconfigured', reason: 'missing_vision_key', items: [] }
  }

  const content = [
    {
      type: 'text',
      text: [
        `企业名称：${companyName}`,
        city ? `城市：${city}` : '',
        '这些是用户从搜索引擎或大模型 App 截的图。请只根据图中可见文字判断，不要编造没出现的内容。',
        '返回 JSON 对象，字段：',
        'looksLike: search_results | chat_answer | wechat_search | map | profile | unknown',
        'platformGuess: 能看出的产品名，看不出写 unknown',
        'mentionedTarget: true/false 是否提到上述企业',
        'nameLooksCorrect: true/false/null 名称是否对得上',
        'competitors: 字符串数组，图中出现的其他店或品牌',
        'visibleSources: 字符串数组，如 公众号、网页、视频号、地图',
        'summary: 不超过80字的中文说明',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ]

  for (const image of list) {
    const url = String(image).trim()
    if (!url) continue
    content.push({ type: 'image_url', image_url: { url } })
  }

  try {
    const result = await chatCompletion({
      apiUrl: config.geoCheck.visionApiUrl,
      apiKey,
      model: config.geoCheck.visionModel,
      messages: [{ role: 'user', content }],
      temperature: 0.1,
      timeoutMs: config.geoCheck.timeoutMs,
    })
    const parsed = extractJsonObject(result.text) || {}
    const summary = String(parsed.summary || result.text || '').slice(0, 400)
    return {
      status: 'ok',
      items: [
        {
          looksLike: String(parsed.looksLike || 'unknown'),
          platformGuess: String(parsed.platformGuess || 'unknown'),
          mentionedTarget:
            parsed.mentionedTarget === true ||
            textMentionsName(`${summary} ${result.text}`, companyName, city),
          nameLooksCorrect: parsed.nameLooksCorrect === true ? true : parsed.nameLooksCorrect === false ? false : null,
          competitors: Array.isArray(parsed.competitors)
            ? parsed.competitors.map((item) => String(item)).filter(Boolean).slice(0, 8)
            : [],
          visibleSources: Array.isArray(parsed.visibleSources)
            ? parsed.visibleSources.map((item) => String(item)).filter(Boolean).slice(0, 8)
            : [],
          summary,
        },
      ],
    }
  } catch (error) {
    return { status: 'error', reason: error.message, items: [] }
  }
}

module.exports = { analyzeScreenshots, extractJsonObject }
