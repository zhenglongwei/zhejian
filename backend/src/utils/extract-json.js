/**
 * 从大模型回复里抠出 JSON 对象。
 *
 * 模型几乎从不老老实实只返回 JSON：前面加「以下是结果：」、外面裹 ```json 代码块、
 * 后面再补一段解释，都是常态。这个函数按「先剥代码块，再取首尾花括号」的顺序兜住这些情况，
 * 解析不出来一律返回 null，由调用方决定降级策略——绝不返回半截对象糊弄过去。
 */
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

module.exports = { extractJsonObject }
