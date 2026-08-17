const assert = require('assert')
const { extractJobFaqs, normalizeFaqItems } = require('./merchant-case-job-faq')

const sections = [
  { key: 'symptom', body: '过减速带异响' },
  { key: 'diagnosis', body: '胶套开裂，球头无旷量' },
  { key: 'plan', body: '无需换总成，压套即可，参考 1280 元' },
  { key: 'process', body: '扭矩打卡' },
  { key: 'handover', body: '旧件已交还，当天开走' },
]

const faqs = extractJobFaqs({ sections })
assert.ok(faqs.some((item) => item.q.includes('做了什么')))
assert.ok(faqs.some((item) => item.q.includes('总成')))
assert.ok(faqs.some((item) => item.q.includes('旧件')))
assert.ok(faqs.some((item) => item.q.includes('开走')))
assert.ok(faqs.every((item) => !/1280|元/.test(item.a)))

const empty = extractJobFaqs({
  sections: [{ key: 'handover', body: '旧件与交车确认以门店留档为准；质保以门店承诺为准。' }],
})
assert.strictEqual(empty.length, 0)

const maintenance = extractJobFaqs({
  sections: [
    { key: 'process', body: '本单已处理：雨刮、机油规格、机油滤芯、机油液位检查' },
    { key: 'handover', body: '配件 1 年；非事故二次损伤。其余建议项已与车主约定择期处理。' },
  ],
  serviceName: '大保养',
})
assert.ok(maintenance.some((item) => item.q.includes('哪些项目')))
assert.ok(maintenance.some((item) => item.q.includes('质保')))
assert.ok(maintenance.some((item) => item.q.includes('没做')))
assert.ok(maintenance.every((item) => !GENERIC_PLACEHOLDER(item.a)))
assert.ok(!maintenance.some((item) => item.q.includes('查出了什么')))

function GENERIC_PLACEHOLDER(text) {
  return /以门店留档为准|以门店承诺为准/.test(String(text || ''))
}

const kept = normalizeFaqItems([
  { q: '这次做了什么？', a: '压套' },
  { q: '这次做了什么？', a: '重复' },
  { q: '', a: '空' },
])
assert.strictEqual(kept.length, 1)

console.log('merchant-case-job-faq.test.js OK')
